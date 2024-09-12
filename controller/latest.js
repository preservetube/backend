const { PrismaClient } =  require('@prisma/client')
const redis = require('../utils/redis.js')
const prisma = new PrismaClient()

function createSitemapXML(urls) {
    const xml = urls.map(url => `
        <url>
            <loc>${url}</loc>
            <changefreq>never</changefreq>
            <priority>0.7</priority>
        </url>
    `).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${xml}
    </urlset>`;
}

function createSitemapIndexXML(sitemaps) {
    const xml = sitemaps.map((sitemap, index) => `
        <sitemap>
            <loc>https://api.preservetube.com/${sitemap}</loc>
            <lastmod>${new Date().toISOString()}</lastmod>
        </sitemap>
    `).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${xml}
    </sitemapindex>`;
}

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
    const cachedSitemapIndex = await redis.get('sitemap-index');
    if (cachedSitemapIndex) {
        res.header('Content-Type', 'application/xml');
        return res.send(cachedSitemapIndex);
    }

    const dbVideos = await prisma.videos.findMany({
        select: {
            id: true,
        },
    });

    const urls = dbVideos.map((video) => `https://preservetube.com/watch?v=${video.id}`);
    const sitemaps = [];
    for (let i = 0; i < urls.length; i += 50000) {
        const batch = urls.slice(i, i + 50000);
        await redis.set(`sitemap-${sitemaps.length}`, createSitemapXML(batch), 'EX', 86400);
        sitemaps.push(`sitemap-${sitemaps.length}.xml`);
    }

    const sitemapIndexXML = createSitemapIndexXML(sitemaps);
    await redis.set('sitemap-index', sitemapIndexXML, 'EX', 86400);

    res.header('Content-Type', 'application/xml');
    res.send(sitemapIndexXML);
};

exports.getSubSitemap = async (req, res) => {
    const cachedSitemap = await redis.get(`sitemap-${req.params.index}`);
    if (cachedSitemap) {
        res.header('Content-Type', 'application/xml');
        return res.send(cachedSitemap);
    }

    res.status(404).send('');
};