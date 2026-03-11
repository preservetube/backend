import { Elysia } from 'elysia';
import { m, eta, error } from '@/utils/html'
import healthStatus from '@/utils/health';
import { checkIpRanges } from '@/utils/ranges';
const app = new Elysia()

app.get('/', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./index', { 
    title: 'Home | PreserveTube',
    description: 'PreserveTube is a time capsule for YouTube videos! It allows you to preserve any YouTube video, creating a snapshot that will always be available even if the original video disappears or is taken down.',
    keywords: 'youtube archive, youtube video history, youtube deleted, youtube deleted video, youtube downloader, youtube archiver'
  }))
})

app.get('/save', async ({ query: { url }, set, headers, error }) => {
  if (!url) return error(400, 'No url provided.')

  const ranges = await checkIpRanges(headers['cf-connecting-ip'] || headers['x-forwarded-for'] || '')
  if (ranges.blocked) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return await m(eta.render('./blocked', { 
      title: 'Blocked | PreserveTube'
    }))
  }

  let websocket = process.env.WEBSOCKET
  if (healthStatus[process.env.METADATA!] != 'healthy') {
    websocket = process.env.ALTERNATIVE_WEBSOCKET!
  }
  const ytPatched = (process.env.YT_PATCHED || '').toLowerCase() === 'true' || process.env.YT_PATCHED === '1'

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./save', { 
    title: 'Save Video | PreserveTube',
    websocket,
    sitekey: process.env.SITEKEY,
    url,
    ytPatched
  }))
})

app.get('/savechannel', async ({ query: { url }, set, headers, error }) => {
  if (!url) return error(400, 'No url provided.')

  const ranges = await checkIpRanges(headers['cf-connecting-ip'] || headers['x-forwarded-for'] || '')
  if (ranges.blocked) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return await m(eta.render('./blocked', { 
      title: 'Blocked | PreserveTube'
    }))
  }

  let websocket = process.env.WEBSOCKET
  if (healthStatus[process.env.METADATA!] != 'healthy') {
    websocket = process.env.ALTERNATIVE_WEBSOCKET!
  }

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./savechannel', { 
    title: 'Save Channel | PreserveTube',
    websocket,
    sitekey: process.env.SITEKEY,
    url
  }))
})

app.get('/about', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./about', { 
    title: 'About (FAQ) | PreserveTube',
  }))
})

app.get('/abuse', async ({ set }) => {
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return await m(eta.render('./abuse', { 
    title: 'Abuse Report | PreserveTube',
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
