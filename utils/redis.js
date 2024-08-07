const Redis = require('ioredis')
const fs = require('node:fs')

const logger = require("./logger.js")

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASS,
});

redis.on('ready', async function () {
    logger.info({ message: 'Connected to redis!' })

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
                logger.info({ message: `deleted file ${f} because there is no active download of it` })
            }
        })
    }, 5*60000)
})

module.exports = redis