import * as fs from 'node:fs'
const keys = JSON.parse(fs.readFileSync('s3.json', 'utf-8'))

async function uploadVideo(video: string) {
  const uploaded = await fetch(`${keys.endpoint}/${video.split('/')[2]}`, {
    method: 'PUT',
    headers: {
      'x-authtoken': keys.videos[0].secret
    },
    body: await Bun.file(video).arrayBuffer()
  })
  return uploaded.url.replace(keys.endpoint, 'https://s4.archive.party')
}

async function uploadImage(id: string, url: string) {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const bufferHash = Bun.hash(Buffer.from(arrayBuffer)).toString()

  const exists = await fetch(`${keys.endpoint}/${id}-${bufferHash}.webp`, {
    method: 'HEAD',
    headers: {
      'x-authtoken': keys.videos[0].secret
    }
  })
  if (exists.status == 200) return `${keys.images[0].url}${id}-${bufferHash}.webp`

  const uploaded = await fetch(`${keys.endpoint}/${id}-${bufferHash}.webp`, {
    method: 'PUT',
    headers: {
      'x-authtoken': keys.videos[0].secret
    },
    body: await response.arrayBuffer()
  })
  return uploaded.url.replace(keys.endpoint, 'https://s4.archive.party')
}

export { uploadVideo, uploadImage }