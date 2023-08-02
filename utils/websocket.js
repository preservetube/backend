const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

const metadata = require('./metadata.js')
const upload = require('./upload.js')

async function createDatabaseVideo(id, videoUrl, playlistId) {
    const data = await metadata.getVideoMetadata(id)
    const channelData = await metadata.getChannel(data.authorId)

    const uploaderAvatar = await upload.uploadImage(data.authorId, channelData.authorThumbnails[1].url)
    const thumbnailUrl = await upload.uploadImage(id, data.videoThumbnails[0].url)
    
    await prisma.videos.create({
        data: {
            id: id,
            title: data.title,
            description: (data.descriptionHtml).replaceAll('\n', '<br>'),
            thumbnail: thumbnailUrl,
            source: videoUrl,
            published: (new Date(data.published*1000)).toISOString().slice(0,10),
            archived: (new Date()).toISOString().slice(0,10),
            channel: channelData.author,
            channelId: channelData.authorId,
            channelAvatar: uploaderAvatar,
            channelVerified: channelData.authorVerified,
            playlist: playlistId
        }
    })

    return true
}

module.exports = { createDatabaseVideo }