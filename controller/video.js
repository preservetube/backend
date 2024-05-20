const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

const DOMPurify = require('isomorphic-dompurify')
const rtm = require('readable-to-ms')
const metadata = require('../utils/metadata.js')
const redis = require('../utils/redis.js')

exports.getVideo = async (req, res) => {
    let info
    const cached = await redis.get(`video:${req.params.id}`)

    if (cached) {
        info = JSON.parse(cached)
    } else {
        info = await prisma.videos.findFirst({
            where: {
                id: req.params.id
            },
            select: {
                title: true,
                description: true,
                thumbnail: true,
                source: true,
                published: true,
                archived: true,
                channel: true, 
                channelId: true, 
                channelAvatar: true,
                channelVerified: true,
                disabled: true,
                hasBeenReported: true
            }
        })
        
        if (!info) return res.json({ error: '404' })
        await redis.set(`video:${req.params.id}`, JSON.stringify(info), 'EX', 3600)
    }

    res.json({
        ...info,
        description: DOMPurify.sanitize(info.description),
    })
}

exports.getChannel = async (req, res) => {
    const cached = await redis.get(`channel:${req.params.id}`)
    if (cached) return res.json(JSON.parse(cached))

    const [videos, channel] = await Promise.all([
        metadata.getChannelVideos(req.params.id),
        metadata.getChannel(req.params.id)
    ])

    if (!videos || !channel || videos.error || channel.error) {
        return res.json({ error: '404' });
    }

    const archived = await prisma.videos.findMany({
        where: {
            channelId: req.params.id
        }, 
        select: {
            id: true,
            title: true,
            thumbnail: true,
            published: true,
            archived: true
        }
    })

    const processedVideos = videos.map(video => {
        const date = !isNaN(new Date(video.published.text).getTime()) ? new Date(video.published.text) : new Date((new Date()).getTime() - rtm(video.published.text).ms); // life is great.
        return {
            id: video.id,
            title: video.title.text,
            thumbnail: video.thumbnails[0].url,
            published: new Date(date).toISOString().slice(0, 10)
        }
    });

    archived.forEach(v => {
        const existingVideoIndex = processedVideos.findIndex(video => video.id === v.id);
        if (existingVideoIndex !== -1) {
            processedVideos[existingVideoIndex] = v;
        } else {
            processedVideos.push({ ...v, deleted: undefined });
        }
    });
    
    processedVideos.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    const json = {
        name: channel.metadata.title,
        avatar: channel.metadata.avatar[0].url,
        verified: channel.header.author?.is_verified,
        videos: processedVideos
    }
    await redis.set(`channel:${req.params.id}`, JSON.stringify(json), 'EX', 3600)
    res.json(json)
}

exports.getOnlyChannelVideos = async (req, res) => {
    const cached = await redis.get(`channelVideos:${req.params.id}`)
    if (cached) return res.json(JSON.parse(cached))

    const archived = await prisma.videos.findMany({
        where: {
            channelId: req.params.id
        }, 
        select: {
            id: true,
            title: true,
            thumbnail: true,
            published: true,
            archived: true
        },
        orderBy: {
            published: 'desc'
        }
    })

    const json = {
        videos: archived 
    }
    await redis.set(`channelVideos:${req.params.id}`, JSON.stringify(json), 'EX', 3600)
    res.json(json)
}

exports.getPlaylist = async (req, res) => {
    const cached = await redis.get(`playlist:${req.params.id}`)
    if (cached) return res.json(JSON.parse(cached))

    const playlist = await metadata.getPlaylistVideos(req.params.id)
    if (!playlist || playlist.error) return res.json({ error: '404' })

    const playlistArchived = await prisma.videos.findMany({
        where: {
            playlist: req.params.id
        }, 
        select: {
            id: true,
            title: true,
            thumbnail: true,
            published: true,
            archived: true
        }
    })

    const allVideos = playlist.relatedStreams.map(video => ({
        id: video.url.replace('/watch?v=', ''),
        published: new Date(video.uploaded).toISOString().slice(0, 10),
        ...video
    }));

    await Promise.all(playlistArchived.map(async (v) => {
        const allVideo = allVideos.find(o => o.id == v.id);
        if (allVideo) {
            const index = allVideos.findIndex(o => o.id == v.id);
            allVideos[index] = v;
        } else {
            const live = await metadata.getVideoMetadata(v.id);
            allVideos.push({
                ...v,
                deleted: live.error ? true : false
            });
        }
    }));
    
    await Promise.all(allVideos.filter(v => !v.archived).map(async (v) => {
        const video = await prisma.videos.findFirst({
            where: {
                id: v.id
            },
            select: {
                id: true,
                title: true,
                thumbnail: true,
                published: true,
                archived: true
            }
        });
        if (video) {
            const index = allVideos.findIndex(o => o.id == v.id);
            allVideos[index] = video;
        }
    }));
    
    allVideos.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    const json = {
        name: playlist.name,
        channel: playlist.uploader,
        url: playlist.uploaderUrl,
        avatar: playlist.uploaderAvatar,
        videos: allVideos
    }
    await redis.set(`playlist:${req.params.id}`, JSON.stringify(json), 'EX', 3600)
    res.json(json)
}