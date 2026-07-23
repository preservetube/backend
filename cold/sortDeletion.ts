import { db } from '@/utils/database'
import * as fs from 'node:fs'

const target: string = 's0'
let totalSize = 0

const bucket = (await Bun.file('bucket.txt').text()).split('\n')
const alreadyRemoved = (await Bun.file('headRemoved.txt').text()).split('\n')
const rmFiles = []

const videos = await db.selectFrom('videos')
  .where('source', 'like', `%${target}.archive.party%`)
  .where('deletion_stage', '=', 'cold_storage')
  .select(['id', 'source'])
  .execute()

const files = await db.selectFrom('files')
  .where('videoId', 'in', videos.map(v => v.id))
  .orderBy('files.size_bytes desc')
  .selectAll()
  .execute()

for (const f of files) {
  if (alreadyRemoved.includes(f.filename)) continue

  let isFlagged = false
  const bucketSize = bucket.find(b => b.includes(f.filename))?.split(' ').filter(Boolean)[2]
  if (!bucketSize) {
    console.log('file not in bucket', f.filename)
    continue
  }

  const video = videos.find(v => v.id == f.videoId)
  const headReq = await fetch(video!.source
    .replace('https://s0.archive.party', 'http://193.24.209.204:1337')
    .replace('https://minio.archive.party', 'http://5.83.147.250:9000')
    .replace('https://s2.archive.party', 'http://185.207.125.54:9000')
    .replace('https://s3.archive.party', 'http://193.24.209.233:8080'),
  {
    method: 'HEAD'
  })

  if (headReq.status == 404) {
    fs.appendFileSync('headRemoved.txt', f.filename + '\n')
    continue
  }
  if (headReq.headers.get('Content-Length') != bucketSize) {
    console.log('head size not same for', f.filename)
    console.log([headReq.headers.get('Content-Length'), bucketSize])
    isFlagged = true
  }

  if (f.size_bytes.toString() != bucketSize) {
    console.log('size not same for', f.filename)
    console.log(f.size_bytes, bucketSize)
    isFlagged = true
  }

  if (isFlagged) continue
  console.log(f.size_bytes / 1e9, f.filename + '\n')
  totalSize += f.size_bytes / 1e9

  if (f.size_bytes / 1e9 > 0) rmFiles.push(f.filename)
  if (f.size_bytes / 1e9 < 0) break;
}

console.log(totalSize)
if (target == 'minio' || target == 's2' || target == 's3') console.log(`./mc rm ${rmFiles.map(r => `local/preservetube/${r}`).join(' ')}`)
if (target == 's0') console.log(`rm -- ${rmFiles.join(' ')}`)