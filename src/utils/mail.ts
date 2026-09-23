import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

async function sendRestoreCompleteEmail(to: string, videoId: string, title?: string | null) {
  const watchUrl = `https://preservetube.com/watch?v=${videoId}`

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Your PreserveTube video has been restored',
    text: `The video you requested${title ? ` ("${title}")` : ''} has been restored from cold storage and is available again:\n\n${watchUrl}`
  })
}

async function sendArchiveReplyEmail(to: string, subject: string, text: string, inReplyTo?: string) {
  const domain = (process.env.SMTP_FROM || '').match(/@([^>\s]+)/)?.[1] || 'preservetube.com'
  const messageId = `<${crypto.randomUUID()}@${domain}>`

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
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
