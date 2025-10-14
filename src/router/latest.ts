import { Elysia } from 'elysia';
import { db } from '@/utils/database'
import { createSitemapXML, createSitemapIndexXML } from '@/utils/sitemap'
import { m, eta } from '@/utils/html'
import redis from '@/utils/redis';

const app = new Elysia()

app.get('/latest', async ({ set }) => {
  const cached = await redis.get('latest:html')
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const json = await db.selectFrom('videos')
    .select(['id', 'title', 'thumbnail', 'published', 'archived', 'channel', 'channelId', 'channelAvatar', 'channelVerified'])
    .orderBy('archived desc')
    .limit(51)
    .execute()
  
  const html = await m(eta.render('./latest', { 
    data: json,
    title: 'Latest | PreserveTube',
  }))
  await redis.set('latest:html', html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

app.get('/sitemap-index.xml', async ({ set }) => {
  const cachedSitemapIndex = await redis.get('sitemap-index');
  if (cachedSitemapIndex) {
    set.headers['Content-Type'] = 'application/xml'
    return cachedSitemapIndex
  }

  const videos = await db.selectFrom('videos')
    .select('id')
    .execute()

  const urls = videos.map((video) => `https://preservetube.com/watch?v=${video.id}`);
  const sitemaps = [];

  for (let i = 0; i < urls.length; i += 50000) {
    const batch = urls.slice(i, i + 50000);
    await redis.set(`sitemap-${sitemaps.length}`, createSitemapXML(batch), 'EX', 86400);
    sitemaps.push(`sitemap-${sitemaps.length}.xml`);
  }

  const sitemapIndexXML = createSitemapIndexXML(sitemaps);
  await redis.set('sitemap-index', sitemapIndexXML, 'EX', 86400);

  set.headers['Content-Type'] = 'application/xml'
  return sitemapIndexXML
})

app.get('/sitemap-:index.xml', async ({ set, params: { index }, error, path }) => { 
  const indexNum = path.replace('/sitemap-', '').replace('.xml', '')
  const cachedSitemap = await redis.get(`sitemap-${indexNum}`);
  if (cachedSitemap) {
    set.headers['Content-Type'] = 'application/xml'
    return cachedSitemap
  }

  return error(404)
})

export default app