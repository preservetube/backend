import { Elysia, t } from 'elysia';
import * as fs from 'node:fs'

import { db } from '@/utils/database'
import { validateVideo, validateChannel } from '@/utils/regex'
import { checkCaptcha, createDatabaseVideo } from '@/utils/common';
import { downloadVideo } from '@/utils/download';
import { uploadVideo } from '@/utils/upload';
import { getChannelVideos } from '@/utils/metadata';
import redis from '@/utils/redis';

const app = new Elysia()
const videoIds: Record<string, string> = {}

const sendError = (ws: any, message: string) => {
  ws.send(`ERROR - ${message}`);
  ws.close();
};

const cleanup = async (ws: any, videoId: string) => {
  delete videoIds[ws.id];
  if (videoId) await redis.del(videoId);
  await redis.del(ws.id);
};

const handleUpload = async (ws: any, videoId: string, isChannel: boolean = false) => {
  const filePath = `./videos/${videoId}.mp4`;
  if (!fs.existsSync(filePath)) {
    ws.send(`DATA - Video file for ${videoId} not found. Skipping.`);
    return false;
  }

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
    fs.unlinkSync(filePath);
    return false;
  }
};

app.ws('/save', {
  query: t.Object({
    url: t.String()
  }),
  body: t.String(),
  open: async (ws) => {
    console.log(`${ws.id} - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)

    const videoId = validateVideo(ws.data.query.url)
    if (!videoId) return sendError(ws, 'Invalid video URL.');
    if (await redis.get(videoId)) return sendError(ws, 'Someone is already downloading this video...');
    if (await redis.get(`blacklist:${videoId}`)) return sendError(ws, 'This video is blacklisted.');

    const already = await db.selectFrom('videos')
      .select('id')
      .where('id', '=', videoId)
      .executeTakeFirst()

    if (already) {
      ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${videoId}`)
      ws.close()
    } else {
      ws.send('DATA - This process is automatic. Your video will start archiving shortly.')
      ws.send('CAPTCHA - Solving a cryptographic challenge before downloading.')
      videoIds[ws.id] = videoId
    }
  },
  message: async (ws, message) => {
    if (message == 'alive') return 

    const videoId = videoIds[ws.id];
    if (!videoId) return sendError(ws, 'No video ID associated with this session.');

    if (await redis.get(videoId) !== 'downloading') {
      await redis.set(videoId, 'downloading', 'EX', 300)

      if (!(await checkCaptcha(message))) {
        await cleanup(ws, videoId);
        return sendError(ws, 'Captcha validation failed.');
      }

      const downloadResult = await downloadVideo(ws, videoId);
      if (downloadResult.fail) {
        await cleanup(ws, videoId);
        return sendError(ws, downloadResult.message);
      }

      const uploadSuccess = await handleUpload(ws, videoId);
      if (!uploadSuccess) await redis.del(videoId);

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
    url: t.String()
  }),
  body: t.String(),
  open: async (ws) => {
    console.log(`${ws.id} - ${ws.data.path} - ${JSON.stringify(ws.data.query)}`)

    const channelId = await validateChannel(ws.data.query.url);
    if (!channelId) return sendError(ws, 'Invalid channel URL.');

    ws.send('DATA - This process is automatic. Your video will start archiving shortly.')
    ws.send('CAPTCHA - Solving a cryptographic challenge before downloading.')
    videoIds[ws.id] = `captcha-${channelId}`;
  },
  message: async (ws, message) => {
    if (message == 'alive') return 

    const status = videoIds[ws.id];
    if (!status || !status.startsWith('captcha-')) return sendError(ws, 'No channel associated with this session.');

    const channelId = status.replace('captcha-', '');
    if (!(await checkCaptcha(message))) {
      await cleanup(ws, channelId);
      return sendError(ws, 'Captcha validation failed.');
    }

    videoIds[ws.id] = `downloading-${channelId}`;
    const videos = await getChannelVideos(channelId);

    for (const video of videos.slice(0, 5)) {
      if (!video || (await redis.get(video.id)) || (await redis.get(`blacklist:${video.id}`))) continue;
     
      const already = await db.selectFrom('videos')
        .select('id')
        .where('id', '=', video.id)
        .executeTakeFirst()
      if (already) continue

      ws.send(`DATA - Processing video: ${video.title.text}`);
      await redis.set(video.id, 'downloading', 'EX', 300);

      const downloadResult = await downloadVideo(ws, video.id);
      if (!downloadResult.fail) await handleUpload(ws, video.id, true);

      await redis.del(video.id);
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

export default app