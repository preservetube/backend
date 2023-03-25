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

    const files = await fs.readdirSync('videos')
    const webmFiles = files.filter((file) => file.endsWith('.webm'))
    webmFiles.forEach((f) => fs.unlinkSync(`videos/${f}`))
})

module.exports = redis