const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

const metadata = require('./metadata.js')
const upload = require('./upload.js')

async function createDatabaseVideo(id, videoUrl, playlistId) {
    const data = await metadata.getVideoMetadata(id)
    const uploaderAvatar = await upload.uploadImage((data.uploaderUrl).replace('/channel/', ''), data.uploaderAvatar)
    const thumbnailUrl = await upload.uploadImage(id, data.thumbnailUrl)
    
    await prisma.videos.create({
        data: {
            id: id,
            title: data.title,
            description: data.description,
            thumbnail: thumbnailUrl,
            source: videoUrl,
            published: data.uploadDate,
            archived: (new Date()).toISOString().slice(0,10),
            channel: data.uploader,
            channelId: (data.uploaderUrl).replace('/channel/', ''),
            channelAvatar: uploaderAvatar,
            channelVerified: data.uploaderVerified,
            playlist: playlistId
        }
    })

    return true
}

module.exports = { createDatabaseVideo }