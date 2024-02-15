const crypto = require('node:crypto')
const validate = require('../utils/validate.js')
const redis = require('../utils/redis.js')
const { RedisRateLimiter } = require('rolling-rate-limiter')
const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

const limiter = new RedisRateLimiter({
    client: redis, 
    namespace: 'search:',
    interval: 5 * 60 * 1000,
    maxInInterval: 5
})

exports.searchVideo = async (req, res) => {
    const ipHash = crypto.createHash('sha256').update(req.headers['x-userip'] || '0.0.0.0').digest('hex')
    const isLimited = await limiter.limit(ipHash)
    if (isLimited) return res.status(429).send('error-You have been ratelimited.')

    const id = await validate.validateVideoInput(req.query.search)
    if (id.fail) {
        const videos = await prisma.videos.findMany({
            where: {
                title: {
                    contains: req.query.search,
                    mode: 'insensitive'
                }
            }
        })
        res.json(videos)
    } else {
        res.send(`redirect-${process.env.FRONTEND}/watch?v=${id}`)
    }
}

exports.searchPlaylist = async (req, res) => {
    const id = await validate.validatePlaylistInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.redirect(`${process.env.FRONTEND}/playlist?list=${id}`)
    }
}

exports.searchChannel = async (req, res) => {
    const id = await validate.validateChannelInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.redirect(`${process.env.FRONTEND}/channel/${id}`)
    }
}