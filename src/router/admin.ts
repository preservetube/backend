import { Elysia, t } from 'elysia'
import { db } from '@/utils/database'
import { m, eta, error as errorPage } from '@/utils/html'
import {
  getSessionToken,
  createAdminSession,
  isValidAdminSession,
  destroyAdminSession,
  buildSessionCookie,
  clearSessionCookie
} from '@/utils/adminAuth'
import { initiateRestore } from '@/utils/glacier'

const app = new Elysia({ prefix: '/admin' })

app.onBeforeHandle(async ({ path, request, set, headers, redirect }) => {
  if (path === '/admin/login') return

  const token = getSessionToken(headers.cookie)
  if (await isValidAdminSession(token)) return

  if (request.method === 'GET') return redirect('/admin/login')

  set.status = 401
  return { success: false, message: 'Unauthorized' }
})

app.get('/login', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./admin/login', {
    title: 'Admin Login | PreserveTube'
  }))
})

app.post('/login', async ({ body, set, redirect }) => {
  if (body.password !== process.env.ADMIN_SECRET) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    set.status = 401
    return await m(eta.render('./admin/login', {
      title: 'Admin Login | PreserveTube',
      loginError: 'Incorrect password.'
    }))
  }

  const token = await createAdminSession()
  set.headers['Set-Cookie'] = buildSessionCookie(token)
  return redirect('/admin')
}, {
  body: t.Object({
    password: t.String()
  })
})

app.post('/logout', async ({ headers, redirect }) => {
  const token = getSessionToken(headers.cookie)
  if (token) await destroyAdminSession(token)
  return new Response(null, {
    status: 302,
    headers: { 'Set-Cookie': clearSessionCookie(), Location: '/admin/login' }
  })
})

app.get('/', async ({ set }) => {
  const requests = await db.selectFrom('restore_requests')
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute()

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./admin/dashboard', {
    title: 'Admin | PreserveTube',
    requests
  }))
})

app.post('/restore', async ({ body, redirect, error }) => {
  const { videoId, requesterEmail } = body

  const video = await db.selectFrom('videos')
    .select(['id', 'deletion_stage'])
    .where('id', '=', videoId)
    .executeTakeFirst()

  if (!video) return error(404, 'No archived video found with that ID.')
  if (video.deletion_stage !== 'cold_storage') return error(400, 'That video is not currently in cold storage.')

  const inserted = await db.insertInto('restore_requests')
    .values({
      videoId,
      requester_email: requesterEmail,
      status: 'requested'
    })
    .returning('uuid')
    .executeTakeFirstOrThrow()

  await initiateRestore(videoId)

  await db.updateTable('restore_requests')
    .set({ status: 'restoring', aws_restore_requested_at: new Date(), updated_at: new Date() })
    .where('uuid', '=', inserted.uuid)
    .execute()

  return redirect('/admin')
}, {
  body: t.Object({
    videoId: t.String(),
    requesterEmail: t.String()
  })
})

app.onError(errorPage)
export default app
