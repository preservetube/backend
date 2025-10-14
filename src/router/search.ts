import { Elysia, t } from 'elysia';
import { RedisRateLimiter } from 'rolling-rate-limiter'

import { db } from '@/utils/database'
import { validateVideo, validateChannel } from '@/utils/regex'
import { m, eta } from '@/utils/html'
import redis from '@/utils/redis';

const app = new Elysia()

const limiter = new RedisRateLimiter({
  client: redis,
  namespace: 'search:',
  interval: 5 * 60 * 1000,
  maxInInterval: 15
})

app.get('/search', async ({ headers, query: { search }, set, redirect, error }) => {
  const hash = Bun.hash(headers['x-userip'] || headers['cf-connecting-ip'] || '0.0.0.0')
  const isLimited = await limiter.limit(hash.toString())
  if (isLimited) return error(429, 'You have been ratelimited.')

  const videoId = validateVideo(search)
  if (videoId) return redirect(`/watch?v=${videoId}`)

  const cached = await redis.get(`search:${Bun.hash(search).toString()}:html`)
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const videos = await db.selectFrom('videos')
    .selectAll()
    .where('title', 'ilike', `%${search}%`)
    .execute()

  const html = await m(eta.render('./search', { 
    data: videos,
    title: 'Search | PreserveTube',
  }))
  await redis.set(`search:${Bun.hash(search).toString()}:html`, html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
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