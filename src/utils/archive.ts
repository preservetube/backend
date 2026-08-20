import * as fs from 'node:fs'
import { db } from '@/utils/database'
import { validateVideo } from '@/utils/regex'
import { createDatabaseVideo } from '@/utils/common'
import { downloadVideo } from '@/utils/download'
import { uploadVideo } from '@/utils/upload'
import { getChannel, getVideo } from '@/utils/metadata'
import redis from '@/utils/redis'

function extractVideoId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (/^[\w\-_]{11}$/.test(trimmed)) return trimmed
  const validated = validateVideo(trimmed)
  if (validated && /^[\w\-_]{11}$/.test(validated)) return validated
  const match = trimmed.match(/[\w\-_]{11}/)
  return match ? match[0] : null
}

async function archiveVideo(input: string) {
  const videoId = extractVideoId(input)
  if (!videoId) {
    return { success: false, message: 'Invalid video URL or ID.' }
  }

  const existing = await db.selectFrom('videos')
    .select(['id', 'deletion_stage', 'title'])
    .where('id', '=', videoId)
    .executeTakeFirst()

  if (existing) {
    if (existing.deletion_stage !== null) {
      await db.updateTable('videos')
        .set({ deletion_stage: null })
        .where('id', '=', videoId)
        .execute()

      await redis.del(`watch:${videoId}:html`)
      await redis.del('deletion:html')

      return {
        success: true,
        message: `Video '${existing.title || videoId}' (${videoId}) restored from deletion stage '${existing.deletion_stage}'.`,
        videoId
      }
    }

    return {
      success: true,
      message: `Video '${existing.title || videoId}' (${videoId}) is already archived.`,
      videoId
    }
  }

  if (await redis.get(`blacklist:${videoId}`)) {
    return { success: false, message: 'This video is blacklisted.' }
  }

  if (await redis.get(`save:${videoId}`)) {
    return { success: false, message: 'Someone is currently archiving or downloading this video.' }
  }

  await redis.set(`save:${videoId}`, 'downloading', 'EX', 300)

  try {
    const data = await getVideo(videoId)
    if (data.error) {
      return { success: false, message: `Unable to retrieve video info from YouTube: ${data.error}` }
    }

    const channelData = await getChannel(data.videoDetails.channelId)
    if (channelData.error) {
      return { success: false, message: `Unable to retrieve channel info from YouTube: ${channelData.error}` }
    }

    const wsMock = {
      send: (msg: string) => console.log(`[Archive ${videoId}] ${msg}`)
    }

    const downloadResult = await downloadVideo(wsMock, videoId)
    if (downloadResult.fail) {
      return { success: false, message: `Download failed: ${downloadResult.message}` }
    }

    let filePath = fs.readdirSync('./videos/').find(f => f.includes(`${videoId}.`))
    if (!filePath) {
      return { success: false, message: `Downloaded video file for ${videoId} not found.` }
    }

    filePath = './videos/' + filePath
    const videoUrl = await uploadVideo(filePath)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    const uploaded = await createDatabaseVideo(videoId, videoUrl, { data, channelData })
    if (uploaded !== 'success') {
      return { success: false, message: `Failed to create database record: ${JSON.stringify(uploaded)}` }
    }

    return {
      success: true,
      message: `Successfully archived video '${data.videoDetails.title}' (${videoId}).`,
      videoId,
      title: data.videoDetails.title,
      watchUrl: `https://preservetube.com/watch?v=${videoId}`
    }
  } catch (error: unknown) {
    const err = error as Error
    return { success: false, message: `Archiving failed: ${err.message}` }
  } finally {
    await redis.del(`save:${videoId}`)
  }
}

async function addToSizeWhitelist(input: string) {
  const videoId = extractVideoId(input)
  if (!videoId) {
    return { success: false, message: 'Invalid video URL or ID.' }
  }

  const servers = [process.env.METADATA, process.env.ALTERNATIVE_METADATA].filter(Boolean) as string[]

  const results = await Promise.all(servers.map(async (serverHost) => {
    try {
      const res = await fetch(`${serverHost}/whitelist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: videoId })
      })

      if (!res.ok) {
        return { server: serverHost, success: false, message: `Metadata service returned status ${res.status}: ${await res.text()}` }
      }

      const data = await res.json() as { success: boolean, message: string, whitelist?: string[] }
      return { server: serverHost, ...data }
    } catch (error: unknown) {
      const err = error as Error
      return { server: serverHost, success: false, message: `Failed to connect: ${err.message}` }
    }
  }))

  const allSuccessful = results.length > 0 && results.every(r => r.success)
  return {
    success: allSuccessful,
    message: allSuccessful
      ? `Successfully added video ${videoId} to size whitelist on all metadata servers (${results.map(r => r.server).join(', ')}).`
      : `Whitelisting video ${videoId} completed with issues on some servers: ${JSON.stringify(results)}`,
    results
  }
}

async function getVideoMetadata(input: string) {
  const videoId = extractVideoId(input)
  if (!videoId) {
    return { success: false, message: 'Invalid video URL or ID.' }
  }

  const dbVideo = await db.selectFrom('videos')
    .selectAll()
    .where('id', '=', videoId)
    .executeTakeFirst()

  let fileInfo = null
  if (dbVideo && dbVideo.deletion_stage === 'cold_storage') {
    fileInfo = await db.selectFrom('files')
      .selectAll()
      .where('videoId', '=', videoId)
      .executeTakeFirst() || null
  }

  const metadata = await getVideo(videoId)
  const ytDetails = metadata && !metadata.error ? {
    title: metadata.videoDetails?.title,
    lengthSeconds: metadata.videoDetails?.lengthSeconds ? parseInt(metadata.videoDetails.lengthSeconds, 10) : null,
    channel: metadata.videoDetails?.author,
    channelId: metadata.videoDetails?.channelId,
    viewCount: metadata.videoDetails?.viewCount,
    isLive: metadata.videoDetails?.isLive || false,
    published: metadata.microformat?.playerMicroformatRenderer?.publishDate?.slice(0, 10) || null,
    description: metadata.microformat?.playerMicroformatRenderer?.description?.simpleText || null
  } : null

  return {
    success: true,
    videoId,
    isArchived: Boolean(dbVideo),
    watchUrl: `https://preservetube.com/watch?v=${videoId}`,
    databaseRecord: dbVideo ? {
      ...dbVideo,
      coldStorageFile: fileInfo
    } : null,
    youtubeMetadata: ytDetails
  }
}

export { archiveVideo, addToSizeWhitelist, getVideoMetadata, extractVideoId }
