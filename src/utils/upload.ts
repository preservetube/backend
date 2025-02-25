import { S3 } from 'ultralight-s3';
import * as fs from 'node:fs'

const keys = JSON.parse(fs.readFileSync('s3.json', 'utf-8'))
const videos3 = new S3({
  endpoint: keys.endpoint,
  accessKeyId: keys.videos[0].access,
  secretAccessKey: keys.videos[0].secret,
  bucketName: keys.videos[0].bucket,
  region: 'auto'
})

const images3 = new S3({
  endpoint: keys.endpoint,
  accessKeyId: keys.images[0].access,
  secretAccessKey: keys.images[0].secret,
  bucketName: keys.images[0].bucket,
  region: 'auto'
});

async function uploadVideo(video: string) {
  const videoFile = fs.readFileSync(video)
  const uploaded = await videos3.put(video.split('/')[2], videoFile)
  return uploaded.url.replace(keys.endpoint, 'https://s3.archive.party')
}

async function uploadImage(id: string, url: string) {
  const exists = await images3.fileExists(`${id}.webp`)
  if (exists) return `${keys.images[0].url}${id}.webp`

  const response = await fetch(url)
  const buffer = Buffer.from(await response.arrayBuffer())

  const uploaded = await images3.put(`${id}.webp`, buffer)
  return uploaded.url.replace(keys.endpoint, 'https://s3.archive.party')
}

export { uploadVideo, uploadImage }