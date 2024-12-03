import { Elysia } from 'elysia';

import { db } from '@/utils/database'
import redis from '@/utils/redis';

const app = new Elysia()

app.get('/transparency/list', async () => {
  const cached = await redis.get('transparency')
  if (cached) return JSON.parse(cached)

  const reports = await db.selectFrom('reports')
    .selectAll()
    .execute()

  const json = reports.map(r => {
    return {
      ...r,
      details: (r.details).split('<').join('&lt;').split('>').join('&gt;'),
      date: (r.date).toISOString().slice(0, 10)
    }
  })

  await redis.set('transparency', JSON.stringify(json), 'EX', 3600)
  return json
})

app.get('/transparency/:id', async ({ params: { id } }) => {
  const cached = await redis.get(`transparency:${id}`)
  if (cached) return JSON.parse(cached)

  const json = await db.selectFrom('reports')
    .selectAll()
    .where('target', '=', id)
    .execute()

  await redis.set(`transparency:${id}`, JSON.stringify(json), 'EX', 3600)
  return json
})

export default app