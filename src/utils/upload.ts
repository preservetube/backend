import * as fs from 'node:fs'
const keys = JSON.parse(fs.readFileSync('s3.json', 'utf-8'))

async function uploadVideo(video: string) {
  const fileBuffer = await Bun.file(video).arrayBuffer()
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(fileBuffer);
  const fileHash = hasher.digest("hex");

  const uploaded = await fetch(`${keys.endpoint}/preservetube/${video.split('/')[2]}`, {
    method: 'PUT',
    headers: {
      'x-authtoken': keys.videos[0].secret,
      'x-file-hash': fileHash
    },
    body: fileBuffer
  })
  if (!uploaded.ok) throw new Error(`failed to upload video - ${uploaded.status} (${uploaded.statusText}) ${await uploaded.text()}`)
  return uploaded.url.replace(keys.endpoint, 'https://s5.archive.party')
}

async function uploadImage(id: string, url: string) {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const bufferHash = Bun.hash(Buffer.from(arrayBuffer)).toString()

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(arrayBuffer);
  const fileHash = hasher.digest("hex");

  const exists = await fetch(`${keys.endpoint}/preservetube-media/${id}-${bufferHash}.webp`, {
    method: 'HEAD',
    headers: {
      'x-authtoken': keys.videos[0].secret
    }
  })
  if (exists.status == 200) return `${keys.images[0].url}${id}-${bufferHash}.webp`

  const uploaded = await fetch(`${keys.endpoint}/preservetube-media//${id}-${bufferHash}.webp`, {
    method: 'PUT',
    headers: {
      'x-authtoken': keys.videos[0].secret,
      'x-file-hash': fileHash
    },
    body: arrayBuffer
  })
  if (!uploaded.ok) throw new Error(`failed to upload video - ${uploaded.status} (${uploaded.statusText}) ${await uploaded.text()}`)
  return uploaded.url.replace(keys.endpoint, 'https://s5.archive.party')
}

export { uploadVideo, uploadImage }