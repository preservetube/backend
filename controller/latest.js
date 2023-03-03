const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

exports.getLatest = async (req, res) => {
    res.json(await prisma.videos.findMany({
        take: 30,
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
    }))
}