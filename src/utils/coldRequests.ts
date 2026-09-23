import { db } from '@/utils/database'
import { classifyEmail, draftEmail } from '@/utils/emailAi'
import { getVideoMetadata } from '@/utils/archive'
import { sendArchiveReplyEmail } from '@/utils/mail'
import { startRestore } from '@/utils/restore'
import { jsonb, youtubeUrl, isAutoApprovedSender } from '@/utils/requestCommon'
import type { ColdRequest, ColdRequestVideo } from '@/types'

// only videos that really are in cold storage count, anything else in the mail is noise
async function fetchColdVideos(ids: string[]): Promise<ColdRequestVideo[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []

  const rows = await db.selectFrom('videos')
    .select(['id', 'title', 'channel', 'channelId'])
    .where('id', 'in', unique)
    .where('deletion_stage', '=', 'cold_storage')
    .execute()
  if (rows.length === 0) return []

  const files = await db.selectFrom('files')
    .select(['videoId', 'size_bytes', 'duration_seconds'])
    .where('videoId', 'in', rows.map(r => r.id))
    .execute()

  return await Promise.all(rows.map(async (row) => {
    const file = files.find(f => f.videoId === row.id)

    let yt = null
    try {
      const meta = await getVideoMetadata(row.id)
      if ('isArchived' in meta) yt = meta.youtubeMetadata
    } catch {
      // a failed lookup counts as "not live": worst case the admin reviews a video that is still up
    }

    return {
      id: row.id,
      title: yt?.title || row.title || null,
      channel: yt?.channel || row.channel || null,
      channelId: yt?.channelId || row.channelId || null,
      lengthSeconds: yt?.lengthSeconds ?? (file ? Number(file.duration_seconds) : null),
      sizeBytes: file ? Number(file.size_bytes) : null,
      alive: Boolean(yt)
    }
  }))
}

async function createColdRequest(input: {
  messageId: string
  fromEmail: string
  fromName: string | null
  subject: string
  body: string
  videoIds: string[]
  bareIds?: string[]
  summary: string
  backfill?: boolean
}): Promise<'created' | 'ignored'> {
  const videos = await fetchColdVideos([...input.videoIds, ...(input.bareIds || [])])
  if (videos.length === 0) return 'ignored'

  const autoApproved = !input.backfill && await isAutoApprovedSender(input.fromEmail)
  // live videos: ask why first. old mail (backfill) never triggers outbound mail, the admin decides
  const askWhy = !input.backfill && !autoApproved && videos.some(v => v.alive)

  const inserted = await db.insertInto('cold_requests')
    .values({
      message_id: input.messageId,
      from_email: input.fromEmail.toLowerCase(),
      from_name: input.fromName,
      subject: input.subject,
      body: input.body,
      videos: jsonb(videos),
      ai_summary: input.summary,
      status: askWhy ? 'awaiting_context' : 'pending',
      auto_approved: autoApproved,
      context_message_id: null,
      error_message: null,
      reply_text: null
    })
    .onConflict(oc => oc.column('message_id').doNothing())
    .returning('uuid')
    .executeTakeFirst()
  if (!inserted) return 'created'

  if (askWhy) {
    try {
      await askWhyMail(inserted.uuid, input, videos)
    } catch (error: unknown) {
      // no mail went out: put it in the admin queue instead of leaving it waiting for a reply
      const message = (error as Error).message
      console.log(`[cold-requests] ${inserted.uuid} could not send question: ${message}`)
      await db.updateTable('cold_requests')
        .set({ status: 'pending', error_message: `Could not email the requester: ${message}`, updated_at: new Date() })
        .where('uuid', '=', inserted.uuid)
        .execute()
    }
  } else if (autoApproved) {
    await approveColdRequest(inserted.uuid)
  }

  return 'created'
}

async function askWhyMail(
  uuid: string,
  input: { messageId: string, fromEmail: string, fromName: string | null, subject: string, body: string },
  videos: ColdRequestVideo[]
) {
  const live = videos.filter(v => v.alive)

  const task = [
    'You have NOT restored anything yet. The video(s) below are still available on YouTube, so they can be watched there right now. Give the sender each YouTube link exactly as written, one per line as "<title> - <url>":',
    ...live.map(v => `- ${v.title || v.id} - ${youtubeUrl(v.id)}`),
    'Then ask why they still want it restored from cold storage. Explain that restoring costs money, so you only do it when the video is gone from YouTube or there is a good reason.',
    'Do not promise the video will be restored. 2-4 sentences.'
  ].join('\n')

  const fallback = [
    'Hi,',
    '',
    live.length === 1 ? 'That video is still available on YouTube:' : 'Those videos are still available on YouTube:',
    '',
    ...live.map(v => `${v.title || v.id} - ${youtubeUrl(v.id)}`),
    '',
    'Could you tell me why you still need it restored from cold storage?',
    '',
    '- admin'
  ].join('\n')

  const text = await draftEmail(
    { from_email: input.fromEmail, from_name: input.fromName, subject: input.subject, body: input.body },
    task,
    { mustInclude: live.map(v => youtubeUrl(v.id)), fallback }
  )

  const messageId = await sendArchiveReplyEmail(input.fromEmail, input.subject || 'Your cold storage request', text, input.messageId)

  await db.updateTable('cold_requests')
    .set({ context_message_id: messageId, reply_text: text, updated_at: new Date() })
    .where('uuid', '=', uuid)
    .execute()
}

// requester answered our question: merge into the original request and queue it for review
async function addColdContext(row: ColdRequest, replyBody: string, newVideoIds: string[]) {
  const body = `${row.body || ''}\n\n--- reply from requester ---\n${replyBody}`
  const known = new Set(row.videos.map(v => v.id))
  const videos = [...row.videos, ...await fetchColdVideos(newVideoIds.filter(id => !known.has(id)))]

  const verdict = await classifyEmail(row.subject || '', body)
  const autoApproved = await isAutoApprovedSender(row.from_email)

  await db.updateTable('cold_requests')
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

  if (autoApproved) await approveColdRequest(row.uuid)
}

async function approveColdRequest(uuid: string): Promise<boolean> {
  const row = await db.updateTable('cold_requests')
    .set({ status: 'approved', error_message: null, updated_at: new Date() })
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'failed'])
    .returningAll()
    .executeTakeFirst()
  if (!row) return false

  runRestores(row).catch(async (error: unknown) => {
    const message = (error as Error).message
    console.log(`[cold-requests] ${uuid} crashed: ${message}`)
    await db.updateTable('cold_requests')
      .set({ status: 'failed', error_message: message, updated_at: new Date() })
      .where('uuid', '=', uuid)
      .execute()
  })
  return true
}

async function runRestores(row: ColdRequest) {
  const videos: ColdRequestVideo[] = []

  for (const stored of row.videos) {
    const video: ColdRequestVideo = { ...stored }

    // a retry must not restore (and re-upload) what already started
    if (!stored.result?.success) {
      try {
        await startRestore(video.id, row.from_email)
        video.result = { success: true, message: 'Restore started.' }
      } catch (error: unknown) {
        video.result = { success: false, message: (error as Error).message }
      }
    }
    videos.push(video)

    await db.updateTable('cold_requests')
      .set({ videos: jsonb([...videos, ...row.videos.slice(videos.length)]), updated_at: new Date() })
      .where('uuid', '=', row.uuid)
      .execute()
  }

  const started = videos.filter(v => v.result?.success)
  if (started.length === 0) {
    await db.updateTable('cold_requests')
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

  const failed = videos.filter(v => !v.result?.success)
  const task = [
    `Reply that you queued the retrieval from cold storage of these video(s):\n${started.map(v => `- ${v.title || v.id}`).join('\n')}`,
    'Say that an automated email will get back to them within 48 hours, once the video is available again.',
    failed.length
      ? `These could NOT be queued, say so briefly and honestly, using only the reason given:\n${failed.map(v => `- ${v.title || v.id} (${v.id}): ${v.result?.message}`).join('\n')}`
      : 'Everything they asked for was queued.',
    'Do not promise anything else. Do not include any links. 1-3 sentences.'
  ].join('\n')

  const fallback = [
    'Hi,',
    '',
    started.length === 1
      ? "I've queued your video for retrieval from cold storage."
      : "I've queued your videos for retrieval from cold storage.",
    'An automated email will get back to you within 48 hours.',
    ...(failed.length ? ['', "I couldn't queue:", ...failed.map(v => `${v.title || v.id} (${v.id})`)] : []),
    '',
    '- admin'
  ].join('\n')

  const replyText = await draftEmail(row, task, { mustInclude: ['48 hours'], fallback })

  try {
    await sendArchiveReplyEmail(row.from_email, row.subject || 'Your cold storage request', replyText, row.message_id)
  } catch (error: unknown) {
    // restores are already running (stored results make a retry skip them), only the mail is missing
    await db.updateTable('cold_requests')
      .set({
        status: 'failed',
        videos: jsonb(videos),
        error_message: `Restores started but the reply email failed: ${(error as Error).message}`,
        updated_at: new Date()
      })
      .where('uuid', '=', row.uuid)
      .execute()
    return
  }

  await db.updateTable('cold_requests')
    .set({ status: 'solved', videos: jsonb(videos), reply_text: replyText, error_message: null, updated_at: new Date() })
    .where('uuid', '=', row.uuid)
    .execute()
}

// reject = ask the requester for more context instead of silently refusing
async function rejectColdRequest(uuid: string, note?: string): Promise<boolean> {
  const row = await db.selectFrom('cold_requests')
    .selectAll()
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'failed'])
    .executeTakeFirst()
  if (!row) return false

  const task = [
    'You have NOT restored anything yet. Ask the sender for more context about why they want the video(s) restored from cold storage, so you can decide.',
    note?.trim()
      ? `The operator wants the question to be about this (rephrase it politely in your own words, keep its meaning): ${note.trim()}`
      : 'Keep it generic: ask what the video(s) are and why they need them back.',
    'Do not promise the videos will be restored. 1-3 sentences.'
  ].join('\n')

  const fallback = ['Hi,', '', note?.trim() || "Before I restore this from cold storage, could you tell me a bit more about why you need it?", '', '- admin'].join('\n')
  const text = await draftEmail(row, task, { fallback })

  const messageId = await sendArchiveReplyEmail(row.from_email, row.subject || 'Your cold storage request', text, row.message_id)

  await db.updateTable('cold_requests')
    .set({ status: 'awaiting_context', context_message_id: messageId, updated_at: new Date() })
    .where('uuid', '=', uuid)
    .execute()
  return true
}

async function dismissColdRequest(uuid: string): Promise<void> {
  await db.updateTable('cold_requests')
    .set({ status: 'dismissed', updated_at: new Date() })
    .where('uuid', '=', uuid)
    .where('status', 'in', ['pending', 'awaiting_context', 'failed'])
    .execute()
}

export { createColdRequest, addColdContext, approveColdRequest, rejectColdRequest, dismissColdRequest }
