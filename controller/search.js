const validate = require('../utils/validate.js')
const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

exports.searchVideo = async (req, res) => {
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
        res.send(`<script>window.location.href = '${process.env.FRONTEND}/playlist?list=${id}'</script>`)
    }
}

exports.searchChannel = async (req, res) => {
    const id = await validate.validateChannelInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.send(`<script>window.location.href = '${process.env.FRONTEND}/channel/${id}'</script>`)
    }
}