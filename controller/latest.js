const { PrismaClient } =  require('@prisma/client')
const { SitemapStream, streamToPromise } = require('sitemap')
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

exports.getSitemap = async (req, res) => {
    const cachedSitemap = await redis.get('sitemap');
    if (cachedSitemap) {
        res.header('Content-Type', 'application/xml');
        return res.send(cachedSitemap);
    }

    const dbVideos = await prisma.videos.findMany({
        select: {
            id: true,
        },
    });

    const videos = dbVideos.map((video) => ({
        url: `/videos/${video.id}`,
        changefreq: 'never',
        priority: 0.7,
    }));

    const smStream = new SitemapStream({ hostname: 'https://preservetube.com' });
    videos.forEach((video) => smStream.write(video));
    smStream.end();

    const sitemap = await streamToPromise(smStream).then((data) => data.toString());
    await redis.set('sitemap', sitemap, 'EX', 86400);

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
};