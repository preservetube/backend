import type { Database } from '@/types.ts'
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  })
})

export const db = new Kysely<Database>({
  dialect,
})