const fs = require('node:fs')

const upload = require('../utils/upload.js')
const ytdlp = require('../utils/ytdlp.js')
const redis = require('../utils/redis.js')

const metadata = require('../utils/metadata.js')
const websocket = require('../utils/websocket.js')
const logger = require("../utils/logger.js")

const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

async function handleCheck() {
    const channels = await prisma.autodownload.findMany()

    for (c of channels) {
        if (await redis.get(c.channel)) {
            logger.info({ message: `${c.channel} is already being downloaded` })
        } else {
            await redis.set(c.channel, 'downloading')
            await handleDownload(c.channel)
            await redis.del(c.channel)
        }
    }
}

async function handleDownload(channelId) {
    logger.info({ message: `Checking ${channelId} for new videos...` })

    const videos = await metadata.getChannelVideos(channelId)
    if (!videos) return logger.info({ message: `Failed requesting Youtube for ${channelId}` }) 
    let downloadIndex = 0

    await Promise.all(videos.map(async (video) => {
        const id = video.url.match(/[?&]v=([^&]+)/)[1]

        const already = await prisma.videos.findFirst({
            where: {
                id: id
            }
        })

        if (already) return
        if (await redis.get(id)) {
            logger.info({ message: `Someone is already downloading ${video.title}, ${id}` })
            return
        }

        if (await redis.get(`blacklist:${id}`)) {
            logger.info({ message: `${video.title} is blacklisted from downloading, ${id}` })
            return
        }

        if (video.duration > 5400) {
            logger.info({ message: `${video.title} is longer than 1h30m, ${id}` })
            return
        }

        await redis.set(id, 'downloading')

        downloadIndex++
        await delay(downloadIndex * 15000)

        logger.info({ message: `Starting to download ${video.title}, ${id}` })

        const download = await ytdlp.downloadVideo('https://www.youtube.com' + video.url)
        if (download.fail) {
            logger.info({ message: `Failed downloading ${video.title}, ${id} -> ${download.message}` })
            await redis.del(id)
            return
        } else {
            const file = fs.readdirSync("./videos").find(f => f.includes(id))
            if (file) {
                fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
                logger.info({ message: `Downloaded ${video.title}, ${id}` })

                const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                logger.info({ message: `Uploaded ${video.title}, ${id}` })
                fs.unlinkSync(`./videos/${id}.webm`)

                await websocket.createDatabaseVideo(id, videoUrl)
                await redis.del(id)
            } else {
                await redis.set(id, 'error')
                logger.info({ message: `Couldn't find file for ${video.title}, ${id}` })
            }
        }
    }))
}

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { handleCheck, handleDownload }