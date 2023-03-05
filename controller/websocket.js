const fs = require('node:fs')

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

exports.save = async (ws, req) => {
    logger.info({ message: `${req.path} ${JSON.stringify(req.query)} ${JSON.stringify(req.headers)}` })

    const id = await validate.validateVideoInput(req.query.url)
    if (id.fail) {
        ws.send(`ERROR - ${id.message}`)
        return ws.close()
    }

    if (await redis.get(id)) {
        ws.send('DATA - Someone is already downloading this video...')
        ws.close()
    }

    const already = await prisma.videos.findFirst({
        where: {
            id: id
        }
    })

    if (already) return ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${id}`)
    
    ws.send('CAPTCHA - Please complete the captcha:')
    
    ws.on('message', async function(msg) {
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

        const download = await ytdlp.downloadVideo(req.query.url, ws)
        if (download.fail) {
            await redis.del(id)
            ws.send(`DATA - ${download.message}`)
            ws.close()
        } else {
            const file = fs.readdirSync("videos").find(f => f.includes(id))
            if (file) {
                fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
    
                ws.send('DATA - Uploading file...')
                const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                fs.unlinkSync(`./videos/${id}.webm`)

                await websocket.createDatabaseVideo(id, videoUrl)

                ws.send(`DONE - ${process.env.FRONTEND}/watch?v=${id}`)
            }
            
            await redis.del(id)
            ws.close();
        }
    }
}

exports.playlist = async (ws, req) => {
    logger.info({ message: `${req.path} ${JSON.stringify(req.query)} ${JSON.stringify(req.headers)}` })

    const playlistId = await validate.validatePlaylistInput(req.query.url)
    if (playlistId.fail) {
        ws.send(`ERROR - ${playlistId.message}`)
        return ws.close()
    }

    let status = 'captcha'
    ws.send('CAPTCHA - Please complete the captcha:')
    
    ws.on('message', async function(msg) {
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
        const instance = await metadata.getInstance()
        const playlist = await metadata.getPlaylistVideos(instance, playlistId)
        for (video of playlist.relatedStreams) {
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

            ws.send(`INFO - Downloading ${video.title}<br><br>`)
            await redis.set(id, 'downloading')

            const download = await ytdlp.downloadVideo('https://www.youtube.com' + video.url, ws)
            if (download.fail) {
                ws.send(`DATA - ${download.message}`)
                await redis.del(id)
                continue
            } else {
                await redis.del(id)
                
                const file = fs.readdirSync("./videos").find(f => f.includes(id))
                if (file) {
                    fs.renameSync(`./videos/${file}`, `./videos/${id}.webm`)
                    ws.send(`DATA - Downloaded ${video.title}`)
                    ws.send(`DATA - Uploading ${video.title}`)

                    const videoUrl = await upload.uploadVideo(`./videos/${id}.webm`)
                    ws.send(`DATA - Uploaded ${video.title}`)
                    fs.unlinkSync(`./videos/${id}.webm`)

                    await websocket.createDatabaseVideo(id, videoUrl)
                    ws.send(`DATA - Created video page for ${video.title}`)
                } else {
                    ws.send(`DATA - Failed to find file for ${video.title}. Going to next video in the playlist`)
                    continue
                }
            }
        }

        ws.send(`DONE - ${process.env.FRONTEND}/playlist?list=${playlistId}`)
    }
}