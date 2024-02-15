const { PrismaClient } =  require('@prisma/client')
const redis = require('../utils/redis.js')
const prisma = new PrismaClient()

exports.getLatest = async (req, res) => {
    let json
    const cached = await redis.get('latest')

    if (cached) {
        json = JSON.parse(cached)
    } else {
        json = await prisma.videos.findMany({
            take: 90,
            orderBy: [
                {
                    archived: 'desc'
                }
            ],
            select: {
                id: true,
                title: true,
                thumbnail: true,
                published: true,
                archived: true,
                channel: true,
                channelId: true,
                channelAvatar: true,
                channelVerified: true
            }
        })
        await redis.set('latest', JSON.stringify(json), 'EX', 3600)
    }

    res.json(json)
}