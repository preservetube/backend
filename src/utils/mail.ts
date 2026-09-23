import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type Mail from 'nodemailer/lib/mailer'
import { ImapFlow } from 'imapflow'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const domain = () => (process.env.SMTP_FROM || '').match(/@([^>\s]+)/)?.[1] || 'preservetube.com'

// smtp does not file a copy anywhere, so put it in the imap Sent folder ourselves
async function saveToSent(options: Mail.Options) {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) return

  const port = Number(process.env.IMAP_PORT || 993)
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port,
    secure: port === 993,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false
  })
  client.on('error', (error: Error) => console.log(`[mail] imap connection error: ${error.message}`))

  try {
    const raw = await new MailComposer(options).compile().build()
    await client.connect()

    const boxes = await client.list()
    const sent = boxes.find(box => box.specialUse === '\\Sent')?.path
      || boxes.find(box => /^(inbox[./])?sent( items| messages)?$/i.test(box.path))?.path
    let path = sent
    if (!path) {
      path = 'Sent'
      await client.mailboxCreate(path).catch(() => {})
    }

    await client.append(path, raw, ['\\Seen'], options.date instanceof Date ? options.date : new Date())
  } catch (error: unknown) {
    // the mail itself already went out, a missing copy must never fail the caller
    console.log(`[mail] could not save copy to Sent: ${(error as Error).message}`)
  } finally {
    await client.logout().catch(() => {})
  }
}

async function sendMail(options: Mail.Options) {
  const full: Mail.Options = { ...options, from: process.env.SMTP_FROM, date: new Date() }
  await transporter.sendMail(full)
  await saveToSent(full)
}

async function sendRestoreCompleteEmail(to: string, videoId: string, title?: string | null) {
  const watchUrl = `https://preservetube.com/watch?v=${videoId}`

  await sendMail({
    to,
    subject: 'Your PreserveTube video has been restored',
    messageId: `<${crypto.randomUUID()}@${domain()}>`,
    text: `The video you requested${title ? ` ("${title}")` : ''} has been restored from cold storage and is available again:\n\n${watchUrl}`
  })
}

async function sendArchiveReplyEmail(to: string, subject: string, text: string, inReplyTo?: string) {
  const messageId = `<${crypto.randomUUID()}@${domain()}>`

  await sendMail({
    to,
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    text,
    messageId,
    inReplyTo,
    references: inReplyTo
  })

  return messageId
}

export { sendRestoreCompleteEmail, sendArchiveReplyEmail }
