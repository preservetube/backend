import { Elysia } from 'elysia';
import DOMPurify from 'isomorphic-dompurify'

import { db } from '@/utils/database'
import { getChannel, getChannelVideos } from '@/utils/metadata';
import { convertRelativeToDate } from '@/utils/common';
import { m, eta, error } from '@/utils/html'
import redis from '@/utils/redis';

const app = new Elysia()

interface processedVideo {
  id: string;
  title: string;
  thumbnail: string;
  published: string;
  deleted?: undefined;
}

app.get('/watch', async ({ query: { v }, set, redirect, error }) => {
  if (!v) return error(404)

  const cached = await redis.get(`watch:${v}:html`)
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const idMatch = v.match(/^([\w\-_]{11})(?:-(\d+))?$/)
  if (!idMatch) return error(404)

  const baseId = idMatch[1];
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const allowedVersionPattern = new RegExp(`^${escapeRegex(baseId)}(?:-\\d+)?$`);

  const videoVersions = (await db.selectFrom('videos')
    .selectAll()
    .where('id', 'like', `${baseId}%`)
    .execute())
    .filter(video => allowedVersionPattern.test(video.id))
    .sort((a, b) => {
      const aVersion = Number(a.id.slice(baseId.length + 1) || 1);
      const bVersion = Number(b.id.slice(baseId.length + 1) || 1);
      return aVersion - bVersion;
    });

  const json = videoVersions.find(video => video.id === v) || videoVersions[0];

  if (!json) {
    const html = await m(eta.render('./watch', { 
      isMissing: true,
      id: baseId,
      title: 'Video Not Found | PreserveTube',
      manualAnalytics: true
    }))

    set.headers['cache-control'] = 'public, no-cache'
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return error(404, html)
  }
  if (json.disabled) return redirect(`/transparency/${json.id}`)

  let transparency: any[] = []
  if (json.hasBeenReported) {
    transparency = await db.selectFrom('reports')
      .selectAll()
      .where('target', '=', json.id)
      .execute()
  }

  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if (node.tagName === 'A') {
      const disallowedPatterns: RegExp[] = [
        /\/playlist/i,
        /\/hashtag\//i,
        /\/live\//i,
        /\/user\//i,
        /\/shorts\//i,
        /\/c\//i,
        /\/@[^\/]/i
      ];
      const href = node.getAttribute('href') || '';
      
      const shouldConvertToSpan = disallowedPatterns.some(pattern => 
        pattern.test(href)
      );
      
      if (shouldConvertToSpan) {
        const span = node.ownerDocument.createElement('span');
        span.innerHTML = node.innerHTML;
        if (node.className) span.className = node.className;
        node.parentNode?.replaceChild(span, node);
      } else {
        node.setAttribute('rel', 'nofollow noopener noreferrer');
      }
    }
  })

  const html = await m(eta.render('./watch', { 
    transparency,
    versions: videoVersions.map(video => ({
      id: video.id,
      archived: video.archived
    })),
    baseId,
    ...json,
    description: DOMPurify.sanitize(json.description),
    title: `${json.title} | PreserveTube`,
    v_title: json.title,
    keywords: `${json.title} video archive, ${json.title} ${json.channel} archive`,
    manualAnalytics: true
  }))
  await redis.set(`watch:${v}:html`, html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

function hasIdentifyingUA(req: Request): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  return /^[^\s]+\/[\d.]+ \([^)]+\)$/.test(ua);
}

app.get('/video/:id', async ({ request, params: { id }, error }) => {
  const isNice = hasIdentifyingUA(request)
  if (!isNice) return `This endpoint is provided for people that prefer not to scrape, and depends on your honesty.
Please identify yourself with a User-Agent in the format: AppName/1.0 (a way for me to contact you, or a brief explanation of what you're doing).`

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

app.get('/channel/:id', async ({ params: { id }, set }) => {
  const cached = await redis.get(`channel:${id}:html`)
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const [videos, channel] = await Promise.all([
    getChannelVideos(id),
    getChannel(id)
  ])

  if (!videos || !channel || videos.error || channel.error) {
    const html = await m(eta.render('./channel', { 
      failedToFetch: true,
      id
    }))
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return html
  }

  const archived = await db.selectFrom('videos')
    .select(['id', 'title', 'thumbnail', 'published', 'archived'])
    .where('channelId', '=', id)
    .execute()

  const processedVideos: processedVideo[] = videos.map((video: any) => ({ // it would be impossible to set types for youtube output... they change it every day.
    id: video.video_id,
    title: video.title.text,
    thumbnail: video.thumbnails[0].url,
    published: video.upcoming?.slice(0, 10) || (video.published.text.endsWith('ago') ? convertRelativeToDate(video.published.text) : new Date(video.published.text)).toISOString().slice(0, 10)
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

  const html = await m(eta.render('./channel', { 
    name: channel.metadata.title,
    avatar: channel.metadata.avatar[0].url,
    verified: channel.header.author?.is_verified,
    videos: processedVideos,
    title: `${channel.metadata.title} | PreserveTube`,
    keywords: `${channel.metadata.title} archive, ${channel.metadata.title} channel archive, ${channel.metadata.title} deleted video, ${channel.metadata.title} video deleted`
  }))
  await redis.set(`channel:${id}:html`, html, 'EX', 3600)
  
  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

app.get('/channel/:id/videos', async ({ params: { id }, set }) => {
  const cached = await redis.get(`channelVideos:${id}:html`)
  if (cached) {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return cached
  }

  const archived = await db.selectFrom('videos')
    .select(['id', 'title', 'thumbnail', 'published', 'archived'])
    .where('channelId', '=', id)
    .orderBy('published desc')
    .execute()

  const html = await m(eta.render('./channel-videos', { 
    videos: archived,
    title: `${id} videos | PreserveTube`,
    keywords: `${id} archive, ${id} channel archive, ${id} deleted video, ${id} video deleted`
  }))
  await redis.set(`channelVideos:${id}:html`, html, 'EX', 3600)

  set.headers['Content-Type'] = 'text/html; charset=utf-8'
  return html
})

app.onError(error)
export default app
