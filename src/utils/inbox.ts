import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { db } from '@/utils/database'
import { addContext, createRequest } from '@/utils/archiveRequests'
import { extractBareIds, extractUrlIds } from '@/utils/youtubeIds'

const POLL_INTERVAL_MS = 2 * 60000
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

// returns true when the mail was handled and should be flagged seen
async function processMail(mail: ParsedMail, fallbackId: string): Promise<boolean> {
  const from = mail.from?.value[0]
  if (!from?.address) return true

  const address = from.address.toLowerCase()
  const own = [process.env.IMAP_USER, process.env.SMTP_FROM]
    .map(v => v?.match(/[^<\s]+@[^>\s]+/)?.[0]?.toLowerCase())
    .filter(Boolean)
  if (own.includes(address)) return true
  // leave automated mail unread for a human to glance at
  if (isAutomated(mail, address)) return false

  const body = bodyOf(mail)
  const raw = `${mail.text || ''}\n${typeof mail.html === 'string' ? mail.html : ''}`
  const videoIds = extractUrlIds(raw)
  const bareIds = extractBareIds(mail.text || body, new Set(videoIds))

  // answer to our "need more context" mail: match by thread headers, else by sender
  // (some smtp providers rewrite Message-ID, which breaks header matching)
  const refs = referencedIds(mail)
  let awaiting = refs.length
    ? await db.selectFrom('archive_requests')
      .selectAll()
      .where('status', '=', 'awaiting_context')
      .where('context_message_id', 'in', refs)
      .executeTakeFirst()
    : undefined

  if (!awaiting) {
    const bySender = await db.selectFrom('archive_requests')
      .selectAll()
      .where('status', '=', 'awaiting_context')
      .where('from_email', '=', address)
      .orderBy('updated_at', 'desc')
      .execute()
    // only when unambiguous, otherwise it is a new request from the same person
    if (bySender.length === 1 && (mail.inReplyTo || /^(re|aw|sv|fw):/i.test(mail.subject || ''))) awaiting = bySender[0]
  }

  if (awaiting) {
    await addContext(awaiting, body, videoIds)
    return true
  }

  // no youtube id at all = not something we can archive, leave it in the inbox for a human
  if (videoIds.length === 0 && bareIds.length === 0) return false

  const result = await createRequest({
    messageId: mail.messageId || fallbackId,
    fromEmail: from.address,
    fromName: from.name || null,
    subject: mail.subject || '(no subject)',
    body,
    videoIds,
    bareIds
  })
  // not an archive request (removal, abuse, spam...): leave unread for a human, redis remembers it
  return result !== 'ignored'
}

async function pollInbox() {
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
    const lock = await client.getMailboxLock('INBOX')

    try {
      const uids = await client.search({ seen: false }, { uid: true }) || []

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
          if (!msg || !msg.source) continue

          const mail = await simpleParser(msg.source)
          if (await processMail(mail, `<uid-${uid}@${process.env.IMAP_HOST}>`)) {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          }
        } catch (error: unknown) {
          // leave unseen so the next poll retries it
          console.log(`[inbox] failed to process uid ${uid}: ${(error as Error).message}`)
        }
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

  pollInbox()
  setInterval(pollInbox, POLL_INTERVAL_MS).unref()
  console.log('inbox poller started (this server is primary)')
}

export { startInboxPoller, pollInbox }
