import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { db } from '@/utils/database'
import redis from '@/utils/redis'
import { addContext, createRequest } from '@/utils/archiveRequests'
import { addColdContext } from '@/utils/coldRequests'
import { extractBareIds, extractUrlIds } from '@/utils/youtubeIds'
import type { ArchiveRequest, ColdRequest } from '@/types'

const POLL_INTERVAL_MS = 2 * 60000
const INGESTED_FOLDER = 'ingested'
// bump the suffix to run the catch-up scan again
const BACKFILL_KEY = 'inbox:backfill:cold:v1'
let running = false

function bodyOf(mail: ParsedMail): string {
  const body = mail.text || (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
  // postgres text columns reject NUL bytes
  return body.replaceAll('\u0000', '')
}

// bounces, out-of-office, newsletters: never turn these into requests or replies
function isAutomated(mail: ParsedMail, address: string): boolean {
  const autoSubmitted = String(mail.headers.get('auto-submitted') || '').toLowerCase()
  const precedence = String(mail.headers.get('precedence') || '').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (['bulk', 'junk', 'list'].includes(precedence)) return true
  return /^(mailer-daemon|postmaster|no-?reply|donotreply)@/i.test(address)
}

function referencedIds(mail: ParsedMail): string[] {
  const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : []
  return [...refs, ...(mail.inReplyTo ? [mail.inReplyTo] : [])]
}

// ingested: became (or already is) a request or answered one, moves to the ingested folder
// seen: nothing to do with it, just flag it read
// skip: leave it in the inbox for a human
type MailResult = 'ingested' | 'seen' | 'skip'

async function processMail(mail: ParsedMail, fallbackId: string, backfill: boolean): Promise<MailResult> {
  const from = mail.from?.value[0]
  if (!from?.address) return 'seen'

  const address = from.address.toLowerCase()
  const own = [process.env.IMAP_USER, process.env.SMTP_FROM]
    .map(v => v?.match(/[^<\s]+@[^>\s]+/)?.[0]?.toLowerCase())
    .filter(Boolean)
  if (own.includes(address)) return 'seen'
  // leave automated mail unread for a human to glance at
  if (isAutomated(mail, address)) return 'skip'

  const body = bodyOf(mail)
  const raw = `${mail.text || ''}\n${typeof mail.html === 'string' ? mail.html : ''}`
  const videoIds = extractUrlIds(raw)
  const bareIds = extractBareIds(mail.text || body, new Set(videoIds))

  // answer to our "need more context" mail: match by thread headers, else by sender
  // (some smtp providers rewrite Message-ID, which breaks header matching)
  const refs = referencedIds(mail)
  const isReply = Boolean(mail.inReplyTo) || /^(re|aw|sv|fw):/i.test(mail.subject || '')

  const awaitingArchive = await findAwaiting('archive_requests', address, refs, isReply)
  if (awaitingArchive) {
    await addContext(awaitingArchive, body, videoIds)
    return 'ingested'
  }

  const awaitingCold = await findAwaiting('cold_requests', address, refs, isReply)
  if (awaitingCold) {
    await addColdContext(awaitingCold, body, videoIds)
    return 'ingested'
  }

  // no youtube id at all = not something we can act on, leave it in the inbox for a human
  if (videoIds.length === 0 && bareIds.length === 0) return 'skip'

  const result = await createRequest({
    messageId: mail.messageId || fallbackId,
    fromEmail: from.address,
    fromName: from.name || null,
    subject: mail.subject || '(no subject)',
    body,
    videoIds,
    bareIds,
    backfill
  })
  // not a request (removal, abuse, spam...): leave in the inbox for a human, redis remembers it
  return result === 'ignored' ? 'skip' : 'ingested'
}

async function findAwaiting(table: 'archive_requests', address: string, refs: string[], isReply: boolean): Promise<ArchiveRequest | undefined>
async function findAwaiting(table: 'cold_requests', address: string, refs: string[], isReply: boolean): Promise<ColdRequest | undefined>
async function findAwaiting(table: 'archive_requests' | 'cold_requests', address: string, refs: string[], isReply: boolean): Promise<any> {
  const byRefs = refs.length
    ? await db.selectFrom(table)
      .selectAll()
      .where('status', '=', 'awaiting_context')
      .where('context_message_id', 'in', refs)
      .executeTakeFirst()
    : undefined
  if (byRefs) return byRefs

  const bySender = await db.selectFrom(table)
    .selectAll()
    .where('status', '=', 'awaiting_context')
    .where('from_email', '=', address)
    .orderBy('updated_at', 'desc')
    .execute()
  // only when unambiguous, otherwise it is a new request from the same person
  return bySender.length === 1 && isReply ? bySender[0] : undefined
}

async function pollInbox(backfill = false) {
  if (running) return
  running = true

  const port = Number(process.env.IMAP_PORT || 993)
  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port,
    secure: port === 993,
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
    logger: false
  })

  // socket errors are emitted as events, an unhandled one would crash the process
  client.on('error', (error: Error) => console.log(`[inbox] connection error: ${error.message}`))

  try {
    await client.connect()
    // fails when it already exists, which is fine
    await client.mailboxCreate(INGESTED_FOLDER).catch(() => {})
    const lock = await client.getMailboxLock('INBOX')

    try {
      // the catch-up scan looks at everything: old mail may already be read or was ignored earlier
      const uids = await client.search(backfill ? { all: true } : { seen: false }, { uid: true }) || []
      if (backfill) console.log(`[inbox] catch-up scan over ${uids.length} mails`)
      let failures = 0

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
          if (!msg || !msg.source) continue

          const mail = await simpleParser(msg.source)
          const result = await processMail(mail, `<uid-${uid}@${process.env.IMAP_HOST}>`, backfill)
          if (result === 'skip') continue

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          if (result === 'ingested') {
            try {
              await client.messageMove(String(uid), INGESTED_FOLDER, { uid: true })
            } catch (error: unknown) {
              // unread again so the next poll retries the move (the request itself is deduped)
              console.log(`[inbox] failed to move uid ${uid}: ${(error as Error).message}`)
              if (!backfill) await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
            }
          }
        } catch (error: unknown) {
          // leave unseen so the next poll retries it
          console.log(`[inbox] failed to process uid ${uid}: ${(error as Error).message}`)
          failures++
        }
      }

      // any failure (e.g. AI down) means the scan reruns on next start; finished mails dedupe
      if (backfill && failures === 0) {
        await redis.set(BACKFILL_KEY, '1')
        console.log('[inbox] catch-up scan done')
      } else if (backfill) {
        console.log(`[inbox] catch-up scan had ${failures} failures, will rerun on next start`)
      }
    } finally {
      lock.release()
    }
  } catch (error: unknown) {
    console.log(`[inbox] poll failed: ${(error as Error).message}`)
  } finally {
    running = false
    await client.logout().catch(() => {})
  }
}

async function startInboxPoller() {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
    console.log('inbox poller disabled (IMAP_HOST / IMAP_USER / IMAP_PASS not set)')
    return
  }

  // an archive job dies with the process, don't leave it stuck as "archiving" forever
  await db.updateTable('archive_requests')
    .set({ status: 'failed', error_message: 'Interrupted by server restart, retry.', updated_at: new Date() })
    .where('status', 'in', ['archiving'])
    .execute()

  await db.updateTable('cold_requests')
    .set({ status: 'failed', error_message: 'Interrupted by server restart, retry.', updated_at: new Date() })
    .where('status', '=', 'approved')
    .execute()

  // first run after this feature shipped: catch up old mail once
  pollInbox(!(await redis.get(BACKFILL_KEY)))
  setInterval(() => pollInbox(), POLL_INTERVAL_MS).unref()
  console.log('inbox poller started (this server is primary)')
}

export { startInboxPoller, pollInbox }
