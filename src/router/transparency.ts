import { Elysia } from 'elysia';

import { db } from '@/utils/database'
import { m, eta, error } from '@/utils/html'
import redis from '@/utils/redis';

const app = new Elysia()

app.get('/transparency', async ({ set }) => {
  const cached = await redis.get('transparency:html')
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const reports = await db.selectFrom('reports')
    .selectAll()
    .orderBy('date desc')
    .execute()

  const html = await m(eta.render('./transparency', { 
    data: reports,
    title: 'Transparency | PreserveTube',
  }))
  await redis.set('transparency:html', html, 'EX', 3600)
  
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

app.get('/transparency/:id', async ({ params: { id }, set, error }) => {
  const cached = await redis.get(`transparency:${id}:html`)
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const json = await db.selectFrom('reports')
    .selectAll()
    .where('target', '=', id)
    .executeTakeFirst()
  if (!json) return error(404, 'Report not found.')
  
  const html = await m(eta.render('./transparency-entry', { 
    title: `${json.title} | PreserveTube`,
    t_title: json.title,
    date: json.date.toISOString(),
    details: json.details,
  }))
  await redis.set(`transparency:${id}:html`, html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})


app.get('/deletion', async ({ set }) => {
  const cached = await redis.get('deletion:html')
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const deletionVideos = await db.selectFrom('videos')
    .where('deletion_stage', 'is not', null)
    .selectAll()
    .execute()
    
  const html = await m(eta.render('./deletion', { 
    title: 'Deletion Log | PreserveTube',
    pendingDelete: deletionVideos.filter(v => v.deletion_stage === 'pending_delete'),
    softDelete: deletionVideos.filter(v => v.deletion_stage === 'soft_delete'),
    deleted: deletionVideos.filter(v => v.deletion_stage === 'deleted'),
  }))
  await redis.set('deletion:html', html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

app.onError(error)
export default app