const fs = require('node:fs')
const crypto = require('node:crypto')
const { RedisRateLimiter } = require('rolling-rate-limiter')

const upload = require('../utils/upload.js')
const ytdlp = require('../utils/ytdlp.js')
const redis = require('../utils/redis.js')

const validate = require('../utils/validate.js')
const metadata = require('../utils/metadata.js')
const websocket = require('../utils/websocket.js')
const captcha = require("../utils/captcha.js")
const logger = require("../utils/logger.js")

const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

const limiter = new RedisRateLimiter({
    client: redis, 
    namespace: 'autodownload:',
    interval: 24 * 60 * 60 * 1000,
    maxInInterval: 5
})

exports.save = async (ws, req) => {
    logger.info({ message: `${req.path} ${JSON.stringify(req.query)}` })

    const id = await validate.validateVideoInput(req.query.url)
    if (id.fail) {
        ws.send(`ERROR - ${id.message}`)
        return ws.close()
    }

    if (await redis.get(id)) {
        ws.send('DATA - Someone is already downloading this video...')
        return ws.close()
    }

    if (await redis.get(`blacklist:${id}`)) {
        ws.send('DATA - You can\'t download that. The video is blacklisted.')
        return ws.close()
    }

    const already = await prisma.videos.findFirst({
        where: {
            id: id
        }
    })

    if (already) return ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${id}`)
    
    ws.send('CAPTCHA - Please complete the captcha:')
    
    ws.on('message', async function(msg) {
        if (msg == 'alive') return 

        if (await redis.get(id) != 'downloading') {
            await redis.set(id, 'downloading')
            const confirm = await captcha.checkCaptcha(msg)

            if (confirm) startDownloading()
            else {
                await redis.del(id)
                ws.send('DATA - You little goofy goober tried to mess with the captcha...')
                ws.close()
            }
        } else {
            ws.send('DATA - You already sent captcha reply...')
        }
    })

    async function startDownloading() {
        ws.send('INFO - Spawning yt-dlp!')

        const download = await ytdlp.downloadVideo(`https://www.youtube.com/watch?v=${id}`, ws)
        if (download.fail) {
            await redis.del(id)
            ws.send(`DATA - ${download.message}`)
            ws.close()
        } else {
            const file = fs.readdirSync("videos").find(f => f.includes(id))
            if (file) {
                try {
                    fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
        
                    ws.send('DATA - Uploading file...')
                    const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                    fs.unlinkSync(`./videos/${id}.webm`)

                    await websocket.createDatabaseVideo(id, videoUrl)
                    ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${id}`)
                } catch (e) {
                    ws.send('DATA - Server side error while processing video. Please try again.')
                    fs.unlinkSync(`./videos/${id}.webm`)
                    logger.error(e)
                }
            } else {
                ws.send('DATA - Failed to find file video.')
            }
            
            await redis.del(id)
            ws.close();
        }
    }
}

exports.playlist = async (ws, req) => {
    logger.info({ message: `${req.path} ${JSON.stringify(req.query)}` })

    const playlistId = await validate.validatePlaylistInput(req.query.url)
    if (playlistId.fail) {
        ws.send(`ERROR - ${playlistId.message}`)
        return ws.close()
    }

    let status = 'captcha'
    ws.send('CAPTCHA - Please complete the captcha:')
    
    ws.on('message', async function(msg) {
        if (msg == 'alive') return 

        if (status == 'captcha') {
            status = 'downloading'
            const confirm = await captcha.checkCaptcha(msg)

            if (confirm) startDownloading()
            else {
                await redis.del(id)
                ws.send('DATA - You little goofy goober tried to mess with the captcha...')
                ws.close()
            }
        } else {
            ws.send('DATA - You already sent captcha reply...')
        }
    })

    async function startDownloading() {
        const playlist = await metadata.getPlaylistVideos(playlistId)
        for (video of playlist.relatedStreams) {
            if (ws.readyState !== ws.OPEN) {
                return logger.info({ message: `Stopped downloading ${playlistId}, websocket is closed` })
            }

            const id = video.url.match(/[?&]v=([^&]+)/)[1]

            const already = await prisma.videos.findFirst({
                where: {
                    id: id
                }
            })

            if (already) {
                ws.send(`DATA - Already downloaded ${video.title}`)
                await prisma.videos.updateMany({
                    where: {
                        id: id
                    }, 
                    data: {
                        playlist: playlistId
                    }
                })
                continue
            }

            if (await redis.get(id)) {
                ws.send(`DATA - Someone is already downloading ${video.title}, skipping.`)
                continue
            }

            if (await redis.get(`blacklist:${id}`)) {
                ws.send(`DATA - ${video.title} is blacklisted from downloading, skipping`)
                continue
            }

            ws.send(`INFO - Downloading ${video.title}<br><br>`)
            await redis.set(id, 'downloading')

            const download = await ytdlp.downloadVideo('https://www.youtube.com' + video.url, ws)
            if (download.fail) {
                ws.send(`DATA - ${download.message}`)
                await redis.del(id)
                continue
            } else {
                const file = fs.readdirSync("./videos").find(f => f.includes(id))
                if (file) {
                    try {
                        fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
                        ws.send(`DATA - Downloaded ${video.title}`)
                        ws.send(`DATA - Uploading ${video.title}`)

                        const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                        ws.send(`DATA - Uploaded ${video.title}`)
                        fs.unlinkSync(`./videos/${id}.webm`)

                        await websocket.createDatabaseVideo(id, videoUrl, playlistId)
                        ws.send(`DATA - Created video page for ${video.title}`)
                    } catch (e) {
                        ws.send(`DATA - Failed downloading video ${video.title}. Going to next video`)
                        fs.unlinkSync(`./videos/${id}.webm`)
                        logger.error(e)
                    }
                } else {
                    ws.send(`DATA - Failed to find file for ${video.title}. Going to next video in the playlist`)
                }

                await redis.del(id)
            }
        }

        ws.send(`DONE - ${process.env.FRONTEND}/playlist?list=${playlistId}`)
    }
}

exports.channel = async (ws, req) => {
    logger.info({ message: `${req.path} ${JSON.stringify(req.query)}` })

    const channelId = await validate.validateChannelInput(req.query.url)
    if (channelId.fail) {
        ws.send(`ERROR - ${channelId.message}`)
        return ws.close()
    }

    let status = 'captcha'
    ws.send('CAPTCHA - Please complete the captcha:')
    
    ws.on('message', async function(msg) {
        if (msg == 'alive') return 
        
        if (status == 'captcha') {
            status = 'downloading'
            const confirm = await captcha.checkCaptcha(msg)

            if (confirm) startDownloading()
            else {
                ws.send('DATA - You little goofy goober tried to mess with the captcha...')
                ws.close()
            }
        } else {
            ws.send('DATA - You already sent captcha reply...')
        }
    })

    async function startDownloading() {
        const videos = await metadata.getChannelVideos(channelId)

        for (video of videos) {
            if (ws.readyState !== ws.OPEN) {
                return logger.info({ message: `Stopped downloading ${channelId}, websocket is closed` })
            }

            const id = video.url.match(/[?&]v=([^&]+)/)[1]

            const already = await prisma.videos.findFirst({
                where: {
                    id: id
                }
            })

            if (already) {
                ws.send(`DATA - Already downloaded ${video.title}`)
                continue
            }

            if (await redis.get(id)) {
                ws.send(`DATA - Someone is already downloading ${video.title}, skipping.`)
                continue
            }

            if (await redis.get(`blacklist:${id}`)) {
                ws.send(`DATA - ${video.title} is blacklisted from downloading, skipping`)
                continue
            }
            
            ws.send(`INFO - Downloading ${video.title}<br><br>`)
            await redis.set(id, 'downloading')

            const download = await ytdlp.downloadVideo('https://www.youtube.com' + video.url, ws)
            if (download.fail) {
                ws.send(`DATA - ${download.message}`)
                await redis.del(id)
                continue
            } else {
                const file = fs.readdirSync("./videos").find(f => f.includes(id))
                if (file) {
                    try {
                        fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
                        ws.send(`DATA - Downloaded ${video.title}`)
                        ws.send(`DATA - Uploading ${video.title}`)

                        const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                        ws.send(`DATA - Uploaded ${video.title}`)
                        fs.unlinkSync(`./videos/${id}.webm`)

                        await websocket.createDatabaseVideo(id, videoUrl)
                        ws.send(`DATA - Created video page for ${video.title}`)
                    } catch (e) {
                        ws.send(`DATA - Failed downloading video ${video.title}. Going to next video`)
                        fs.unlinkSync(`./videos/${id}.webm`)
                        logger.error(e)
                    }
                } else {
                    ws.send(`DATA - Failed to find file for ${video.title}. Going to next video`)
                }

                await redis.del(id)
            }
        }

        ws.send(`DONE - ${process.env.FRONTEND}/channel/${channelId}`)
    }
}

exports.addAutodownload = async (req, res) => {
    const confirm = await captcha.checkCaptcha(req.query.captcha)
    if (!confirm) return res.status(500).send('You little goofy goober tried to mess with the captcha...')

    const channelId = await validate.validateChannelInput(req.query.url)
    if (channelId.fail) {
        return res.status(500).send(channelId.message)
    }

    const already = await prisma.autodownload.findFirst({
        where: {
            channel: channelId
        }
    })

    if (already) {
        res.status(500).send(`This channel is already being automatically downloaded...`)
    } else {
        const ipHash = crypto.createHash('sha256').update(req.headers['x-forwarded-for'] || req.connection.remoteAddress).digest('hex')
        const isLimited = await limiter.limit(ipHash)
    
        if (isLimited) return res.status(420).send(`Hey! You have reached the limit of 5 queued auto-download channels per day. Sadly, hard drives don't grow on trees, so rate limits are necessary. The "Save Channel" feature has no limits, so feel free to use that.<br><br>
        
Are you planning something awesome? Feel free to email me at admin[@]preservetube.com.`)

        await prisma.autodownload.create({
            data: {
                channel: channelId
            }
        })
        res.send('Perfect! Each time this channel uploads their videos will be downloaded')
    }
}