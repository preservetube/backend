import { Elysia } from 'elysia';
import DOMPurify from 'isomorphic-dompurify'

import { db } from '@/utils/database'
import { getChannel, getChannelVideos } from '@/utils/metadata';
import { convertRelativeToDate } from '@/utils/common';
import redis from '@/utils/redis';

const app = new Elysia()

interface processedVideo {
  id: string;
  title: string;
  thumbnail: string;
  published: string;
  deleted?: undefined;
}

app.get('/video/:id', async ({ params: { id }, error }) => {
  const cached = await redis.get(`video:${id}`)
  if (cached) return JSON.parse(cached)

  const json = await db.selectFrom('videos')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()

  if (!json) return error(404, { error: '404' })
  await redis.set(`video:${id}`, JSON.stringify(json), 'EX', 3600)

  return {
    ...json,
    description: DOMPurify.sanitize(json.description),
  }
})

app.get('/channel/:id', async ({ params: { id }, error }) => {
  const cached = await redis.get(`channel:${id}`)
  if (cached) return JSON.parse(cached)

  const [videos, channel] = await Promise.all([
    getChannelVideos(id),
    getChannel(id)
  ])

  if (!videos || !channel || videos.error || channel.error) return error(404, { error: '404' })

  const archived = await db.selectFrom('videos')
    .select(['id', 'title', 'thumbnail', 'published', 'archived'])
    .where('channelId', '=', id)
    .execute()

  const processedVideos: processedVideo[] = videos.map((video: any) => ({ // it would be impossible to set types for youtube output... they change it every day.
    id: video.id,
    title: video.title.text,
    thumbnail: video.thumbnails[0].url,
    published: (video.published.text.endsWith('ago') ? convertRelativeToDate(video.published.text) : new Date(video.published.text)).toISOString().slice(0, 10)
  }))

  archived.forEach(v => {
    const existingVideoIndex = processedVideos.findIndex(video => video.id === v.id);
    if (existingVideoIndex !== -1) {
      processedVideos[existingVideoIndex] = v;
    } else {
      processedVideos.push({ ...v, deleted: undefined });
    }
  });

  processedVideos.sort((a: any, b: any) => new Date(b.published).getTime() - new Date(a.published).getTime());

  const json = {
    name: channel.metadata.title,
    avatar: channel.metadata.avatar[0].url,
    verified: channel.header.author?.is_verified,
    videos: processedVideos
  }

  await redis.set(`channel:${id}`, JSON.stringify(json), 'EX', 3600)
  return json
})

app.get('/channel/:id/videos', async ({ params: { id } }) => {
  const cached = await redis.get(`channelVideos:${id}`)
  if (cached) return JSON.parse(cached)

  const archived = await db.selectFrom('videos')
    .select(['id', 'title', 'thumbnail', 'published', 'archived'])
    .where('channelId', '=', id)
    .orderBy('published desc')
    .execute()

  const json = {
    videos: archived
  }
  await redis.set(`channelVideos:${id}`, JSON.stringify(json), 'EX', 3600)
  return json
})

export default app