import * as fs from 'node:fs'
import { db } from '@/utils/database'
import redis from '@/utils/redis'
import { uploadVideo } from '@/utils/upload'
import { resolveObjectKey, checkRestoreStatus, downloadRestoredObjectToFile } from '@/utils/glacier'
import { sendRestoreCompleteEmail } from '@/utils/mail'

const POLL_INTERVAL_MS = 10 * 60000

async function processRestoringRow(row: { uuid: string, videoId: string, requester_email: string }) {
  const { ongoing, expiry } = await checkRestoreStatus(row.videoId)
  if (ongoing) return

  await db.updateTable('restore_requests')
    .set({ status: 'reuploading', aws_restore_expiry: expiry, updated_at: new Date() })
    .where('uuid', '=', row.uuid)
    .execute()

  const filePath = `./videos/${await resolveObjectKey(row.videoId)}`
  try {
    await downloadRestoredObjectToFile(row.videoId, filePath)
    const videoUrl = await uploadVideo(filePath)

    await db.updateTable('videos')
      .set({ deletion_stage: null, source: videoUrl })
      .where('id', '=', row.videoId)
      .execute()

    await redis.del(`watch:${row.videoId}:html`)
    await redis.del('deletion:html')

    await db.updateTable('restore_requests')
      .set({ status: 'reuploaded', updated_at: new Date() })
      .where('uuid', '=', row.uuid)
      .execute()

    const video = await db.selectFrom('videos')
      .select(['title'])
      .where('id', '=', row.videoId)
      .executeTakeFirst()

    await sendRestoreCompleteEmail(row.requester_email, row.videoId, video?.title)
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
}

async function pollRestores() {
  const restoringRows = await db.selectFrom('restore_requests')
    .select(['uuid', 'videoId', 'requester_email'])
    .where('status', '=', 'restoring')
    .execute()

  for (const row of restoringRows) {
    try {
      await processRestoringRow(row)
    } catch (error: unknown) {
      const err = error as Error
      console.log(`[glacier-poller] failed to process restore ${row.uuid} (${row.videoId}): ${err.message}`)
      await db.updateTable('restore_requests')
        .set({ status: 'failed', error_message: err.message, updated_at: new Date() })
        .where('uuid', '=', row.uuid)
        .execute()
    }
  }
}

function startRestorePoller() {
  pollRestores()
  setInterval(pollRestores, POLL_INTERVAL_MS).unref()
  console.log('glacier restore poller started (this server is primary)')
}

export { startRestorePoller, pollRestores }
