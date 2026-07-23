import { readFile } from 'fs/promises'
import { db } from '@/utils/database'

async function main() {
  const raw = await readFile('bucket.txt', 'utf-8')

  const bucketFiles = new Set(
    raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/).pop()!)
  )

  const dbRows = await db
    .selectFrom('files')
    .select('filename')
    .execute()

  const dbFiles = new Set(dbRows.map((r) => r.filename))

  const missingInDb = [...bucketFiles].filter((f) => !dbFiles.has(f))

  for (const m of missingInDb) {
    const video = await db.selectFrom('videos')
      .selectAll()
      .where('id', '=', m.split('.')[0])
      .executeTakeFirstOrThrow()

    console.log((new URL(video.source)).hostname, m)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})