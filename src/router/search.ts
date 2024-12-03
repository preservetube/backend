import { Elysia, t } from 'elysia';
import { Redis } from 'ioredis'
import { RedisRateLimiter } from 'rolling-rate-limiter'

import { db } from '@/utils/database'
import { validateVideo, validatePlaylist, validateChannel } from '@/utils/regex'

const app = new Elysia()
const redis = new Redis({
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASS,
});

const limiter = new RedisRateLimiter({
  client: redis,
  namespace: 'search:',
  interval: 5 * 60 * 1000,
  maxInInterval: 15
})

app.get('/search/video', async ({ headers, query: { search }, error }) => {
  const hash = Bun.hash(headers['x-userip'] || headers['cf-connecting-ip'] || '0.0.0.0')
  const isLimited = await limiter.limit(hash.toString())
  if (isLimited) return error(429, 'error-You have been ratelimited.')

  const videoId = validateVideo(search)
  if (videoId) return `redirect-${process.env.FRONTEND}/watch?v=${videoId}`

  const videos = await db.selectFrom('videos')
    .selectAll()
    .where('title', 'ilike', `%${search}%`)
    .execute()

  return videos
}, {
  query: t.Object({
    search: t.String()
  })
})

app.get('/search/channel', async ({ query: { url }, error, redirect }) => {
  const channelId = await validateChannel(url)
  if (!channelId) return error(400, 'Whoops! What is that? That is not a Youtube Channel.')

  return redirect(`${process.env.FRONTEND}/channel/${channelId}`)
}, {
  query: t.Object({
    url: t.String()
  })
})

export default app