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
import { startRestore, RestoreError } from '@/utils/restore'
import { approveRequest, rejectRequest, dismissRequest } from '@/utils/archiveRequests'
import { approveColdRequest, rejectColdRequest, dismissColdRequest } from '@/utils/coldRequests'

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

  const archiveRequests = await db.selectFrom('archive_requests')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute()

  const coldRequests = await db.selectFrom('cold_requests')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute()

  const fmtBytes = (bytes: number | null) => {
    if (bytes === null || bytes === undefined) return '?'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = Number(bytes)
    let i = 0
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
    return `${value.toFixed(i ? 1 : 0)} ${units[i]}`
  }

  const autoApproveSenders = await db.selectFrom('auto_approve_senders')
    .selectAll()
    .orderBy('created_at', 'asc')
    .execute()

  const fmtLength = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '?'
    const h = Math.floor(seconds / 3600)
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(h ? 2 : 1, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./admin/dashboard', {
    title: 'Admin | PreserveTube',
    requests,
    archiveRequests,
    coldRequests,
    autoApproveSenders,
    fmtLength,
    fmtBytes
  }))
})

app.post('/restore', async ({ body, redirect, error }) => {
  const { videoId, requesterEmail } = body

  try {
    await startRestore(videoId, requesterEmail)
  } catch (err: unknown) {
    if (err instanceof RestoreError) return error(err.status as 400 | 404, err.message)
    throw err
  }

  return redirect('/admin')
}, {
  body: t.Object({
    videoId: t.String(),
    requesterEmail: t.String()
  })
})

app.post('/requests/:id/approve', async ({ params, redirect }) => {
  await approveRequest(params.id)
  return redirect('/admin')
})

app.post('/requests/:id/reject', async ({ params, body, redirect }) => {
  await rejectRequest(params.id, body.note)
  return redirect('/admin')
}, {
  body: t.Object({
    note: t.Optional(t.String())
  })
})

app.post('/requests/:id/dismiss', async ({ params, redirect }) => {
  await dismissRequest(params.id)
  return redirect('/admin')
})

app.post('/cold-requests/:id/approve', async ({ params, redirect }) => {
  await approveColdRequest(params.id)
  return redirect('/admin')
})

app.post('/cold-requests/:id/reject', async ({ params, body, redirect }) => {
  await rejectColdRequest(params.id, body.note)
  return redirect('/admin')
}, {
  body: t.Object({
    note: t.Optional(t.String())
  })
})

app.post('/cold-requests/:id/dismiss', async ({ params, redirect }) => {
  await dismissColdRequest(params.id)
  return redirect('/admin')
})

app.post('/auto-approve', async ({ body, redirect }) => {
  await db.insertInto('auto_approve_senders')
    .values({ email: body.email.trim().toLowerCase(), note: body.note?.trim() || null })
    .onConflict(oc => oc.column('email').doNothing())
    .execute()
  return redirect('/admin')
}, {
  body: t.Object({
    email: t.String(),
    note: t.Optional(t.String())
  })
})

app.post('/auto-approve/delete', async ({ body, redirect }) => {
  await db.deleteFrom('auto_approve_senders')
    .where('email', '=', body.email)
    .execute()
  return redirect('/admin')
}, {
  body: t.Object({
    email: t.String()
  })
})

app.onError(errorPage)
export default app
