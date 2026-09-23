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

export { sendRestoreCompleteEmail }
