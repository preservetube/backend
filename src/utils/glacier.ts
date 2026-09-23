import * as fs from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { S3Client, RestoreObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: process.env.AWS_REGION })

function objectKey(videoId: string) {
  return `${videoId}.mp4`
}

async function initiateRestore(videoId: string, days = 5) {
  try {
    await s3.send(new RestoreObjectCommand({
      Bucket: process.env.GLACIER_BUCKET,
      Key: objectKey(videoId),
      RestoreRequest: {
        Days: days,
        GlacierJobParameters: { Tier: 'Standard' }
      }
    }))
  } catch (error: unknown) {
    const err = error as { name?: string }
    if (err.name === 'RestoreAlreadyInProgress') return
    throw error
  }
}

async function checkRestoreStatus(videoId: string): Promise<{ ongoing: boolean, expiry: Date | null }> {
  const head = await s3.send(new HeadObjectCommand({
    Bucket: process.env.GLACIER_BUCKET,
    Key: objectKey(videoId)
  }))

  const restoreHeader = head.Restore
  if (!restoreHeader) return { ongoing: true, expiry: null }

  const ongoing = /ongoing-request="true"/.test(restoreHeader)
  const expiryMatch = restoreHeader.match(/expiry-date="([^"]+)"/)
  const expiry = expiryMatch ? new Date(expiryMatch[1]) : null

  return { ongoing, expiry }
}

async function downloadRestoredObjectToFile(videoId: string, destPath: string) {
  const object = await s3.send(new GetObjectCommand({
    Bucket: process.env.GLACIER_BUCKET,
    Key: objectKey(videoId)
  }))

  if (!object.Body) throw new Error(`No body returned for restored object ${objectKey(videoId)}`)

  const nodeStream = object.Body instanceof Readable
    ? object.Body
    : Readable.fromWeb(object.Body as any)

  await pipeline(nodeStream, fs.createWriteStream(destPath))
}

export { initiateRestore, checkRestoreStatus, downloadRestoredObjectToFile }
