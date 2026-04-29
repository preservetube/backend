import { Elysia, t } from 'elysia';
import * as fs from 'node:fs'
import yaml from 'js-yaml'

import { db } from '@/utils/database'
import { validateVideo, validateChannel } from '@/utils/regex'
import { checkCaptcha, createDatabaseVideo } from '@/utils/common';
import { downloadVideo } from '@/utils/download';
import { uploadVideo } from '@/utils/upload';
import { getChannelVideos, getVideo } from '@/utils/metadata';
import { error } from '@/utils/html'
import redis from '@/utils/redis';
import { parseSlop } from '@/utils/slop';
import { checkIpRanges } from '@/utils/ranges';
import { getRateLimitState, getRateLimitSubjects } from '@/utils/rate-limit';

const app = new Elysia()
const videoIds: Record<string, string> = {}

const saveKey = (videoId: string) => `save:${videoId}`

const DEFAULT_STORAGE_LIMIT_MESSAGE = 'Daily storage limit reached. Is this an urgent archive? Please email me: admin@preservetube.com'
const NEW_VISITOR_STORAGE_LIMIT_MESSAGE = 'You are a new visitor, so your storage limit is lower for the first few hours. Please come back later. </br>Is this an urgent archive? Please email me: admin@preservetube.com'
const bKeys = yaml.load(await Bun.file('keys.yaml').text()) as { keys: string[] }

const checkMbLimit = async (subjects: string[], mb?: number): Promise<{ isLimited: boolean, isNewVisitorLimited: boolean }> => {
  const keys = subjects.map(subject => `save-mb:${Bun.hash(subject).toString()}`)
  const [currentValues, states] = await Promise.all([
    Promise.all(keys.map(key => redis.get(key))),
    Promise.all(subjects.map(subject => getRateLimitState(subject)))
  ])
  const currents = currentValues.map(value => parseInt(value || '0'))
  const limitedIndexes = currents
    .map((current, index) => {
      const limit = states[index]!.limit
      if (mb === undefined) return current >= limit ? index : -1
      return current + mb > limit ? index : -1
    })
    .filter(index => index !== -1)

  if (limitedIndexes.length > 0) {
    return {
      isLimited: true,
      isNewVisitorLimited: limitedIndexes.some(index => states[index]!.isNewVisitor)
    }
  }
  if (mb === undefined) {
    return { isLimited: false, isNewVisitorLimited: false }
  }

  const pipeline = redis.pipeline()
  for (const key of keys) {
    pipeline.incrby(key, mb)
    pipeline.expire(key, 24 * 60 * 60)
  }
  await pipeline.exec()
  return { isLimited: false, isNewVisitorLimited: false }
}

const sendError = (ws: any, message: string, close: boolean = true) => {
  ws.send(`ERROR - ${message}`);
  if (close) ws.close();
};

const cleanup = async (ws: any, videoId: string) => {
  delete videoIds[ws.id];
  if (videoId) await redis.del(saveKey(videoId));
  await redis.del(ws.id);
};

const handleUpload = async (ws: any, videoId: string, isChannel: boolean = false) => {
  // the pattern of files that have finished downloading is [videoid].mp4, but some extensions are also possible due to
  // current youtube changes, so we need to make sure the other extensions are also covered
  let filePath = fs.readdirSync('./videos/').find(f => f.includes(`${videoId}.`))
  if (!filePath) {
    ws.send(`DATA - Video file for ${videoId} not found. Skipping.`);
    return false;
  }

  filePath = './videos/' + filePath

  try {
    ws.send('DATA - Uploading file...');
    const videoUrl = await uploadVideo(filePath);
    fs.unlinkSync(filePath);

    const uploaded = await createDatabaseVideo(videoId, videoUrl);
    if (uploaded !== 'success') {
      ws.send(`DATA - Error while uploading - ${JSON.stringify(uploaded)}`);
      return false;
    }

    if (!isChannel) ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${videoId}`);
    return true;
  } catch (error: any) {
    ws.send(`ERROR - Upload failed for ${videoId}: ${error.message}`);
    console.log(`upload failed for ${videoId}: ${error.message}`)

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return false;
  }
};

const getRateLimitKey = (ip: string): string => {
  if (!ip || ip === '0.0.0.0') return ip;
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}`;
    }
    return ip;
  }
  return ip;
};

app.ws('/save', {
  query: t.Object({
    url: t.String(),
    rlid: t.Optional(t.String()),
    bKey: t.Optional(t.String())
  }),
  body: t.String(),
  open: async (ws) => {
    const range = await checkIpRanges(ws.data.headers['x-forwarded-for'] || '')
    if (range.list != 'cloudflare') return sendError(ws, 'There\'s something wrong with your connection.')

    const blacklistCheck = await checkIpRanges(ws.data.headers['cf-connecting-ip']!)
    if (blacklistCheck.blocked || ws.data.headers['cf-ipcountry'] == 'T1') return sendError(ws, `Your network is flagged as malicious.`)

    console.log(`${ws.id} - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)

    const videoId = validateVideo(ws.data.query.url)
    if (!videoId) return sendError(ws, 'Invalid video URL.');
    if (await redis.get(saveKey(videoId))) return sendError(ws, 'Someone is already downloading this video...');
    if (await redis.get(`blacklist:${videoId}`)) return sendError(ws, 'This video is blacklisted.');

    const already = await db.selectFrom('videos')
      .select('id')
      .where('id', '=', videoId)
      .executeTakeFirst()

    if (already) {
      ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${videoId}`)
      ws.close()
    } else {
      if (!(ws.data.query.bKey && bKeys.keys.includes(ws.data.query.bKey))) {
        const subjects = getRateLimitSubjects(
          getRateLimitKey(ws.data.headers['cf-connecting-ip'] || '0.0.0.0'),
          ws.data.query.rlid
        )
        const limitStatus = await checkMbLimit(subjects)
        if (limitStatus.isLimited) {
          return sendError(ws, limitStatus.isNewVisitorLimited ? NEW_VISITOR_STORAGE_LIMIT_MESSAGE : DEFAULT_STORAGE_LIMIT_MESSAGE);
        }

        console.log(`saving (${subjects.map(subject => Bun.hash(subject).toString()).join(',')}) - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)
      }

      ws.send('DATA - This process is automatic. Your video will start archiving shortly.')
      ws.send('CAPTCHA - Solving a cryptographic challenge before downloading.')
      videoIds[ws.id] = videoId
    }
  },
  message: async (ws, message) => {
    if (message == 'alive') return

    const videoId = videoIds[ws.id];
    if (!videoId) return sendError(ws, 'No video ID associated with this session.');

    if (await redis.get(saveKey(videoId)) !== 'downloading') {
      await redis.set(saveKey(videoId), 'downloading', 'EX', 300)

      if (!(ws.data.query.bKey && bKeys.keys.includes(ws.data.query.bKey))) {
        const captchaCheck = await checkCaptcha(message, ws.data.headers['cf-connecting-ip'] || '0.0.0.0')
        if (!captchaCheck.success) {
          await cleanup(ws, videoId);
          console.log(`captcha failed for ${videoId} - ${JSON.stringify(captchaCheck)}`)
          return sendError(ws, 'Captcha validation failed.');
        } else {
          ws.send('DATA - Captcha validated. Starting download...');
        }
      }

      const data = await getVideo(videoId)
      if (data.error) {
        return sendError(ws, 'Unable to retrieve video info from YouTube. Please try again later.')
      }

      const isSlop = await parseSlop(videoId, data.videoDetails.title,
        (data.microformat.playerMicroformatRenderer.description?.simpleText || '').replaceAll('\n', '<br>'),
        data.videoDetails.channelId)

      if (isSlop) {
        sendError(ws, 'Filters can always be wrong. Is the rating wrong? Email me at admin@preservetube.com<br>', false);
        sendError(ws, '<br>Read more about which videos aren\'t suitable on our <a href="/about">FAQ</a> page.', false)
        return sendError(ws, 'This video was identified as not suitable for our platform.');
      }

      const downloadResult = await downloadVideo(ws, videoId);
      if (downloadResult.fail) {
        await cleanup(ws, videoId);
        return sendError(ws, downloadResult.message);
      }

      if (!(ws.data.query.bKey && bKeys.keys.includes(ws.data.query.bKey))) {
        const mbsUsed = Math.ceil(downloadResult.size / (1024 * 1024))
        const subjects = getRateLimitSubjects(
          getRateLimitKey(ws.data.headers['cf-connecting-ip'] || '0.0.0.0'),
          ws.data.query.rlid
        )
        const limitStatus = await checkMbLimit(subjects, mbsUsed)
        if (limitStatus.isLimited) {
          const file = fs.readdirSync('./videos/').find(f => f.includes(`${videoId}.`))
          if (file) fs.unlinkSync('./videos/' + file)
          await cleanup(ws, videoId);
          return sendError(ws, limitStatus.isNewVisitorLimited ? NEW_VISITOR_STORAGE_LIMIT_MESSAGE : DEFAULT_STORAGE_LIMIT_MESSAGE);
        }
      }

      const uploadSuccess = await handleUpload(ws, videoId);
      if (!uploadSuccess) await redis.del(saveKey(videoId));

      await cleanup(ws, videoId);
      ws.close();
    } else {
      ws.send('DATA - Captcha already submitted.');
    }
  },
  close: async (ws) => {
    await cleanup(ws, videoIds[ws.id]);
    console.log(`closed - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)
  }
})

app.ws('/savechannel', {
  query: t.Object({
    url: t.String(),
    rlid: t.Optional(t.String())
  }),
  body: t.String(),
  open: async (ws) => {
    const range = await checkIpRanges(ws.data.headers['x-forwarded-for'] || '')
    if (range.list != 'cloudflare') return sendError(ws, 'There\'s something wrong with your connection.')

    const blacklistCheck = await checkIpRanges(ws.data.headers['cf-connecting-ip']!)
    if (blacklistCheck.blocked || ws.data.headers['cf-ipcountry'] == 'T1') return sendError(ws, `Your network is flagged as malicious.`)

    console.log(`${ws.id} - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)

    const channelId = await validateChannel(ws.data.query.url);
    if (!channelId) return sendError(ws, 'Invalid channel URL.');
    if (typeof channelId !== 'string') return sendError(ws, `Failed to fetch channel ID - ${channelId.error}`)

    ws.send('DATA - This process is automatic. Your video will start archiving shortly.')
    ws.send('CAPTCHA - Solving a cryptographic challenge before downloading.')
    videoIds[ws.id] = `captcha-${channelId}`;
  },
  message: async (ws, message) => {
    if (message == 'alive') return

    const status = videoIds[ws.id];
    if (!status || !status.startsWith('captcha-')) return sendError(ws, 'No channel associated with this session.');

    const channelId = status.replace('captcha-', '');
    const captchaCheck = await checkCaptcha(message, ws.data.headers['cf-connecting-ip'] || '0.0.0.0')

    if (!captchaCheck.success) {
      await cleanup(ws, channelId);
      console.log(`captcha failed for ${channelId} - ${JSON.stringify(captchaCheck)}`)
      return sendError(ws, 'Captcha validation failed.');
    } else {
      ws.send('DATA - Captcha validated. Starting download...');
    }

    videoIds[ws.id] = `downloading-${channelId}`;
    const videos = await getChannelVideos(channelId);
    if (!Array.isArray(videos)) {
      await cleanup(ws, channelId);
      return sendError(ws, 'Unable to retrieve channel videos from YouTube. Please try again later.');
    }

    for (const video of videos.slice(0, 5)) {
      if (!video || (await redis.get(saveKey(video.video_id))) || (await redis.get(`blacklist:${video.video_id}`))) continue;

      const already = await db.selectFrom('videos')
        .select('id')
        .where('id', '=', video.video_id)
        .executeTakeFirst()
      if (already) continue

      const subjects = getRateLimitSubjects(
        getRateLimitKey(ws.data.headers['cf-connecting-ip'] || '0.0.0.0'),
        ws.data.query.rlid
      )
      const limitStatus = await checkMbLimit(subjects)
      if (limitStatus.isLimited) {
        sendError(ws, limitStatus.isNewVisitorLimited ? NEW_VISITOR_STORAGE_LIMIT_MESSAGE : DEFAULT_STORAGE_LIMIT_MESSAGE, false);
        break;
      }

      console.log(`saving (${subjects.map(subject => Bun.hash(subject).toString()).join(',')}) - ${ws.data.path} - ${video.video_id}`)

      const isSlop = await parseSlop(video.video_id, video.title.text,
        video.description_snippet?.text || '', channelId)

      if (isSlop) {
        sendError(ws, 'Filters can always be wrong. Is the rating wrong? Email me at admin@preservetube.com<br>', false);
        sendError(ws, '<br>Read more about which videos aren\'t suitable on our <a href="/about">FAQ</a> page.', false)
        sendError(ws, 'This video was identified as not suitable for our platform.', false);
        continue;
      }

      ws.send(`DATA - Processing video: ${video.title.text}`);
      await redis.set(saveKey(video.video_id), 'downloading', 'EX', 300);

      const downloadResult = await downloadVideo(ws, video.video_id);
      if (!downloadResult.fail) {
        const mbsUsed = Math.ceil(downloadResult.size / (1024 * 1024))
        const limitStatus = await checkMbLimit(subjects, mbsUsed)
        if (limitStatus.isLimited) {
          const file = fs.readdirSync('./videos/').find(f => f.includes(`${video.video_id}.`))
          if (file) fs.unlinkSync('./videos/' + file)
          sendError(ws, limitStatus.isNewVisitorLimited ? NEW_VISITOR_STORAGE_LIMIT_MESSAGE : DEFAULT_STORAGE_LIMIT_MESSAGE, false);
          break;
        }
        await handleUpload(ws, video.video_id, true);
      }

      await redis.del(saveKey(video.video_id));
      ws.send(`DATA - Created video page for ${video.title.text}`)
    }

    await cleanup(ws, channelId);
    ws.send(`DONE - ${process.env.FRONTEND}/channel/${channelId}`)
    ws.close();
  },
  close: async (ws) => {
    await cleanup(ws, videoIds[ws.id]);
    console.log(`closed - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)
  }
})

app.onError(error)
export default app
