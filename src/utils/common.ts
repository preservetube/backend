import { getVideo, getChannel } from "@/utils/metadata";
import { uploadImage } from "@/utils/upload";
import { db } from '@/utils/database'
import crypto from 'node:crypto';

function convertRelativeToDate(relativeTime: string) {
  const parts = relativeTime.split(' ');
  const amount = parseInt(parts[0]);
  const unit = parts[1];

  const currentDate = new Date();

  switch (unit) {
    case 'hour':
    case 'hours':
      currentDate.setHours(currentDate.getHours() - amount);
      break;
    case 'minute':
    case 'minutes':
      currentDate.setMinutes(currentDate.getMinutes() - amount);
      break;
    case 'day':
    case 'days':
      currentDate.setDate(currentDate.getDate() - amount);
      break;
    case 'month':
    case 'months':
      currentDate.setMonth(currentDate.getMonth() - amount);
      break;
    case 'year':
    case 'years':
      currentDate.setFullYear(currentDate.getFullYear() - amount);
      break;
  }

  return currentDate;
}

async function checkCaptcha(response: string) {
  const confirm = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: JSON.stringify({
      'response': response,
      'secret': process.env.CAPTCHA_SECRET
    }),
    headers: {
      'content-type': 'application/json'
    }
  })).json()

  return confirm.success
}

async function createDatabaseVideo(id: string, videoUrl: string) {
  const data = await getVideo(id)
  const channelData = await getChannel(data.videoDetails.channelId)

  if (data.error) return data
  if (channelData.error) return channelData

  const uploaderAvatar = await uploadImage(data.videoDetails.channelId, channelData.metadata.thumbnail[0].url)
  const thumbnailUrl = await uploadImage(id, data.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0].url)

  await db.insertInto('videos')
    .values({
      uuid: crypto.randomUUID(),
      id: id,
      title: data.videoDetails.title,
      description: (data.microformat.playerMicroformatRenderer.description.simpleText).replaceAll('\n', '<br>'),
      thumbnail: thumbnailUrl,
      source: videoUrl,
      published: data.microformat.playerMicroformatRenderer.publishDate.slice(0, 10),
      archived: (new Date()).toISOString().slice(0, 10),
      channel: channelData.metadata.title,
      channelId: channelData.metadata.external_id,
      channelVerified: channelData.header.author?.is_verified || false,
      channelAvatar: uploaderAvatar,
      disabled: false,
      hasBeenReported: false
    })
    .execute()

  return 'success'
}

export { convertRelativeToDate, checkCaptcha, createDatabaseVideo }