import { Redis } from 'ioredis'
import * as fs from 'node:fs'

const redis = new Redis({
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASS,
});

redis.on('ready', async function () {
  console.log('connected to redis')

  const keys = await redis.keys('*')
  const filteredKeys = keys.filter(key => !key.startsWith('blacklist:'))
  if (filteredKeys.length) await redis.del(filteredKeys)

  setInterval(async () => {
    const files = fs.readdirSync('videos')
    const webmFiles = files.filter((file) => file.endsWith('.mp4'))
    webmFiles.forEach(async (f) => {
      const videoId = f.replace('.mp4', '')
      const isActive = await redis.get(videoId)
      if (!isActive) {
        fs.unlinkSync(`./videos/${f}`)
        console.log(`deleted file ${f} because there is no active download of it`)
      }
    })
  }, 5 * 60000)
})

export default redis