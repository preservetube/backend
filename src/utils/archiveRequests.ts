import { db } from '@/utils/database'
import { classifyEmail, draftEmail } from '@/utils/emailAi'
import redis from '@/utils/redis'
import { addToSizeWhitelist, archiveVideo, getVideoMetadata } from '@/utils/archive'
import { sendArchiveReplyEmail } from '@/utils/mail'
import { jsonb, watchUrl, isAutoApprovedSender } from '@/utils/requestCommon'
import { createColdRequest } from '@/utils/coldRequests'
import type { ArchiveRequest, ArchiveRequestVideo } from '@/types'

const RETRY_DELAYS_MS = [0, 0, 45_000, 60_000, 60_000]

async function fetchVideos(ids: string[]): Promise<ArchiveRequestVideo[]> {
  return await Promise.all(ids.map(async (id) => {
    try {
      const meta = await getVideoMetadata(id)
      if (!('isArchived' in meta)) throw new Error('metadata lookup failed')
      const yt = meta.youtubeMetadata
      const record = meta.databaseRecord
      return {
        id,
        title: yt?.title || record?.title || null,
        channel: yt?.channel || record?.channel || null,
        channelId: yt?.channelId || record?.channelId || null,
        lengthSeconds: yt?.lengthSeconds ?? null,
        isArchived: Boolean(meta.isArchived),
        alive: Boolean(yt)
      }
    } catch {
      return { id, title: null, channel: null, channelId: null, lengthSeconds: null, isArchived: false, alive: false }
    }
  }))
}

async function createRequest(input: {
  messageId: string
  fromEmail: string
  fromName: string | null
  subject: string
  body: string
  videoIds: string[]
  bareIds?: string[]
  // one-time catch-up of old mail: re-classify ignored mail, only cold storage requests count
  backfill?: boolean
}): Promise<'created' | 'ignored' | 'duplicate'> {
  const [existingArchive, existingCold] = await Promise.all([
    db.selectFrom('archive_requests').select('uuid').where('message_id', '=', input.messageId).executeTakeFirst(),
    db.selectFrom('cold_requests').select('uuid').where('message_id', '=', input.messageId).executeTakeFirst()
  ])
  if (existingArchive || existingCold) return 'duplicate'

  // classified as "not a request" before: skip without paying for another llm call
  const ignoredKey = `inbox:ignored:${input.messageId}`
  if (!input.backfill && await redis.get(ignoredKey)) return 'ignored'

  const verdict = await classifyEmail(input.subject, input.body)
  // the catch-up scan can't tell what an unclassified mail is: fail so it is retried, not skipped
  if (input.backfill && verdict.failed) throw new Error('AI classification failed')
  if (verdict.category === 'cold_storage') {
    const result = await createColdRequest({ ...input, summary: verdict.summary })
    if (result === 'ignored') await redis.set(ignoredKey, '1', 'EX', 30 * 24 * 3600)
    return result
  }
  if (verdict.category !== 'archive' || input.backfill) {
    if (!input.backfill) await redis.set(ignoredKey, '1', 'EX', 30 * 24 * 3600)
    return 'ignored'
  }

  const videos = await fetchVideos(input.videoIds)
  // bare 11-char tokens only count if youtube (or our archive) actually knows them
  const bare = (await fetchVideos((input.bareIds || []).filter(id => !input.videoIds.includes(id))))
    .filter(v => v.alive || v.isArchived)
  videos.push(...bare)
  if (videos.length === 0) {
    await redis.set(ignoredKey, '1', 'EX', 30 * 24 * 3600)
    return 'ignored'
  }

  const autoApproved = await isAutoApprovedSender(input.fromEmail)

  const inserted = await db.insertInto('archive_requests')
    .values({
      message_id: input.messageId,
      from_email: input.fromEmail.toLowerCase(),
      from_name: input.fromName,
      subject: input.subject,
      body: input.body,
      videos: jsonb(videos),
      ai_summary: verdict.summary,
      auto_approved: autoApproved,
      context_message_id: null,
      error_message: null,
      reply_text: null
    })
    .onConflict(oc => oc.column('message_id').doNothing())
    .returning('uuid')
    .executeTakeFirst()

  if (inserted && autoApproved) await approveRequest(inserted.uuid)
  return 'created'
}

// requester answered our "need more context" mail: merge into the original request
async function addContext(row: ArchiveRequest, replyBody: string, newVideoIds: string[]) {
  const body = `${row.body || ''}\n\n--- reply from requester ---\n${replyBody}`
  const known = new Set(row.videos.map(v => v.id))
  const added = await fetchVideos(newVideoIds.filter(id => !known.has(id)))
  const videos = [...row.videos, ...added]

  const verdict = await classifyEmail(row.subject || '', body)
  const autoApproved = await isAutoApprovedSender(row.from_email)

  await db.updateTable('archive_requests')
    .set({
      body,
      videos: jsonb(videos),
      ai_summary: verdict.summary,
      status: 'pending',
      context_message_id: null,
      auto_approved: autoApproved,
      updated_at: new Date()
    })
    .where('uuid', '=', row.uuid)
    .execute()

  if (autoApproved) await approveRequest(row.uuid)
}

async function approveRequest(uuid: string): Promise<boolean> {
  const row = await db.updateTable('archive_requests')
    .set({ status: 'archiving', error_message: null, updated_at: new Date() })
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'failed'])
    .returningAll()
    .executeTakeFirst()
  if (!row) return false

  // archiving takes minutes, never block the HTTP handler on it
  runArchive(row).catch(async (error: unknown) => {
    const message = (error as Error).message
    console.log(`[archive-requests] ${uuid} crashed: ${message}`)
    await db.updateTable('archive_requests')
      .set({ status: 'failed', error_message: message, updated_at: new Date() })
      .where('uuid', '=', uuid)
      .execute()
  })
  return true
}

async function archiveWithRetry(id: string): Promise<{ success: boolean, message: string }> {
  let last = 'unknown error'

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await Bun.sleep(delay)

    const whitelist = await addToSizeWhitelist(id)
    if (!whitelist.success) last = whitelist.message

    const result = await archiveVideo(id)
    if (result.success) return { success: true, message: result.message }
    last = result.message
    if (/blacklisted|invalid video/i.test(last)) break
  }

  // archiving is queued/async: a failed call may still have landed, trust the requery
  const check = await getVideoMetadata(id)
  if ('isArchived' in check && check.isArchived) return { success: true, message: 'Archived.' }
  return { success: false, message: last }
}

async function runArchive(row: ArchiveRequest) {
  const videos: ArchiveRequestVideo[] = []

  for (const stored of row.videos) {
    // re-check: state may have changed since the email arrived. a lookup that blips now but
    // worked when the email arrived (stored.alive) still gets a real archive attempt below
    const [fresh] = await fetchVideos([stored.id])
    const video: ArchiveRequestVideo = { ...stored, ...fresh, title: fresh!.title || stored.title, channel: fresh!.channel || stored.channel, channelId: fresh!.channelId || stored.channelId }

    if (video.isArchived) {
      video.result = { success: true, message: 'Already archived.' }
    } else if (!video.alive && !stored.alive) {
      video.result = { success: false, message: 'No metadata from YouTube (private, deleted or age-restricted), skipped.' }
    } else {
      video.result = await archiveWithRetry(video.id)
      if (video.result.success) video.isArchived = true
    }
    videos.push(video)

    await db.updateTable('archive_requests')
      .set({ videos: jsonb([...videos, ...row.videos.slice(videos.length)]), updated_at: new Date() })
      .where('uuid', '=', row.uuid)
      .execute()
  }

  const done = videos.filter(v => v.isArchived)
  if (done.length === 0) {
    await db.updateTable('archive_requests')
      .set({
        status: 'failed',
        videos: jsonb(videos),
        error_message: videos.map(v => `${v.id}: ${v.result?.message}`).join('\n'),
        updated_at: new Date()
      })
      .where('uuid', '=', row.uuid)
      .execute()
    return
  }

  const replyText = await draftArchiveReply(row, videos)
  await sendArchiveReplyEmail(row.from_email, row.subject || 'Your archive request', replyText, row.message_id)

  await db.updateTable('archive_requests')
    .set({ status: 'solved', videos: jsonb(videos), reply_text: replyText, error_message: null, updated_at: new Date() })
    .where('uuid', '=', row.uuid)
    .execute()
}

async function draftArchiveReply(row: ArchiveRequest, videos: ArchiveRequestVideo[]): Promise<string> {
  const done = videos.filter(v => v.isArchived)
  const failed = videos.filter(v => !v.isArchived)

  const task = [
    'Reply that you archived the sender\'s requested video(s). List every archived video on its own line as "<title> - <url>":',
    ...done.map(v => `- ${v.title || v.id} - ${watchUrl(v.id)}`),
    failed.length
      ? `These could NOT be archived, say so briefly and honestly, using only the reason given:\n${failed.map(v => `- ${v.title || v.id} (${v.id}): ${v.result?.message}`).join('\n')}`
      : 'Everything they asked for was archived.'
  ].join('\n')

  const fallback = [
    'Hi,',
    '',
    done.length === 1 ? 'Archived your video:' : 'Archived your videos:',
    '',
    ...done.map(v => `${v.title || v.id} - ${watchUrl(v.id)}`),
    ...(failed.length ? ['', "I couldn't archive:", ...failed.map(v => `${v.title || v.id} (${v.id})`)] : []),
    '',
    '- admin'
  ].join('\n')

  return await draftEmail(row, task, { mustInclude: done.map(v => watchUrl(v.id)), fallback })
}

// reject = ask the requester for more context instead of silently refusing
async function rejectRequest(uuid: string, note?: string): Promise<boolean> {
  const row = await db.selectFrom('archive_requests')
    .selectAll()
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'failed'])
    .executeTakeFirst()
  if (!row) return false

  const task = [
    'You have NOT archived anything yet. Ask the sender for more context about why they want the video(s) archived, so you can decide.',
    note?.trim()
      ? `The operator wants the question to be about this (rephrase it politely in your own words, keep its meaning): ${note.trim()}`
      : 'Keep it generic: ask what the video(s) are and why they should be preserved.',
    'Do not promise the videos will be archived. 1-3 sentences.'
  ].join('\n')

  const fallback = ['Hi,', '', note?.trim() || "Before I archive this, could you tell me a bit more about why you'd like it preserved?", '', '- admin'].join('\n')
  const text = await draftEmail(row, task, { fallback })

  const messageId = await sendArchiveReplyEmail(row.from_email, row.subject || 'Your archive request', text, row.message_id)

  await db.updateTable('archive_requests')
    .set({ status: 'awaiting_context', context_message_id: messageId, updated_at: new Date() })
    .where('uuid', '=', uuid)
    .execute()
  return true
}

async function dismissRequest(uuid: string): Promise<void> {
  await db.updateTable('archive_requests')
    .set({ status: 'dismissed', updated_at: new Date() })
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'awaiting_context', 'failed'])
    .execute()
}

export { createRequest, addContext, approveRequest, rejectRequest, dismissRequest, classifyEmail }
