import { db } from '@/utils/database'
import { initiateRestore } from '@/utils/glacier'

class RestoreError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

// queues a glacier restore for a cold storage video. glacierPoller takes over from `restoring`
async function startRestore(videoId: string, requesterEmail: string): Promise<string> {
  const video = await db.selectFrom('videos')
    .select(['id', 'deletion_stage'])
    .where('id', '=', videoId)
    .executeTakeFirst()

  if (!video) throw new RestoreError('No archived video found with that ID.', 404)
  if (video.deletion_stage !== 'cold_storage') throw new RestoreError('That video is not currently in cold storage.', 400)

  const inserted = await db.insertInto('restore_requests')
    .values({
      videoId,
      requester_email: requesterEmail,
      status: 'requested'
    })
    .returning('uuid')
    .executeTakeFirstOrThrow()

  try {
    await initiateRestore(videoId)
  } catch (error: unknown) {
    // the poller only looks at `restoring`, don't leave the row stuck in `requested`
    await db.updateTable('restore_requests')
      .set({ status: 'failed', error_message: (error as Error).message, updated_at: new Date() })
      .where('uuid', '=', inserted.uuid)
      .execute()
    throw error
  }

  await db.updateTable('restore_requests')
    .set({ status: 'restoring', aws_restore_requested_at: new Date(), updated_at: new Date() })
    .where('uuid', '=', inserted.uuid)
    .execute()

  return inserted.uuid
}

export { startRestore, RestoreError }
