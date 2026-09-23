import { sql } from 'kysely'
import { db } from '@/utils/database'

const jsonb = (value: unknown) => sql<any>`${JSON.stringify(value)}::jsonb`
const watchUrl = (id: string) => `https://preservetube.com/watch?v=${id}`
const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

async function isAutoApprovedSender(email: string): Promise<boolean> {
  const row = await db.selectFrom('auto_approve_senders')
    .select('email')
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst()
  return Boolean(row)
}

export { jsonb, watchUrl, youtubeUrl, isAutoApprovedSender }
