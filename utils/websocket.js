const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const metadata = require('./metadata.js')
const upload = require('./upload.js')

function convertRelativeToDate(relativeTime) {
    const parts = relativeTime.split(' ');
    const amount = parseInt(parts[0]);
    const unit = parts[1];

    const currentDate = new Date();

    switch (unit) {
        case 'hour':
        case 'hours':
            currentDate.setHours(currentDate.getHours() - amount);
            break;
        case 'minute':
        case 'minutes':
            currentDate.setMinutes(currentDate.getMinutes() - amount);
            break;
        case 'day':
        case 'days':
            currentDate.setDate(currentDate.getDate() - amount);
            break;
    }

    return currentDate;
}

async function createDatabaseVideo(id, videoUrl, playlistId) {
    const data = await metadata.getVideoMetadata(id)
    const channelData = await metadata.getChannel(data.basic_info.channel_id)

    if (data.error) return data
    if (channelData.error) return channelData

    const uploaderAvatar = await upload.uploadImage(data.basic_info.channel_id, channelData.metadata.thumbnail[0].url)
    const thumbnailUrl = await upload.uploadImage(id, data.basic_info.thumbnail[0].url)

    await prisma.videos.create({
        data: {
            id: id,
            title: data.basic_info.title,
            description: (data.basic_info.short_description).replaceAll('\n', '<br>'),
            thumbnail: thumbnailUrl,
            source: videoUrl,
            published: (data.primary_info.published.text.endsWith('ago') ? convertRelativeToDate(data.primary_info.published.text) : new Date(data.primary_info.published.text)).toISOString().slice(0, 10),
            archived: (new Date()).toISOString().slice(0, 10),
            channel: channelData.metadata.title,
            channelId: channelData.metadata.external_id,
            channelAvatar: uploaderAvatar,
            channelVerified: channelData.header.author?.is_verified || false,
            playlist: playlistId
        }
    })

    return 'success'
}

module.exports = { createDatabaseVideo }