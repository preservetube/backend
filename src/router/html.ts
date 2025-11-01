import { Elysia } from 'elysia';
import { m, eta, error } from '@/utils/html'
const app = new Elysia()

app.get('/', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./index', { 
    title: 'Home | PreserveTube',
    description: 'PreserveTube is a time capsule for YouTube videos! It allows you to preserve any YouTube video, creating a snapshot that will always be available even if the original video disappears or is taken down.',
    keywords: 'youtube archive, youtube video history, youtube deleted, youtube deleted video, youtube downloader, youtube archiver'
  }))
})

app.get('/save', async ({ query: { url }, set, error }) => {
  if (!url) return error(400, 'No url provided.')

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./save', { 
    title: 'Save Video | PreserveTube',
    websocket: process.env.WEBSOCKET,
    sitekey: process.env.SITEKEY,
    url
  }))
})

app.get('/savechannel', async ({ query: { url }, set, error }) => {
  if (!url) return error(400, 'No url provided.')

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./savechannel', { 
    title: 'Save Channel | PreserveTube',
    websocket: process.env.WEBSOCKET,
    sitekey: process.env.SITEKEY,
    url
  }))
})

app.get('/abuse', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./abuse', { 
    title: 'Abuse Report | PreserveTube',
  }))
})

app.get('/dmca', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./dmca', { 
    title: 'DMCA Takedown | PreserveTube',
  }))
})

app.get('/privacy', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./privacy', { 
    title: 'Privacy Policy | PreserveTube',
  }))
})

app.get('/donate', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./donate', { 
    title: 'Donations | PreserveTube',
    description: "Support our mission through donations.",
    keywords: "preservetube donations, crypto"
  }))
})

app.onError(error)
export default app;