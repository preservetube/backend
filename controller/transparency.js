const { PrismaClient } =  require('@prisma/client')
const redis = require('../utils/redis.js')
const prisma = new PrismaClient()

exports.getReports = async (req, res) => {
    let json
    const cached = await redis.get('transparency')

    if (cached) {
        json = JSON.parse(cached)
    } else {
        json = (await prisma.reports.findMany()).map(r => {
            return {
                ...r,
                details: (r.details).split('<').join('&lt;').split('>').join('&gt;'),
                date: (r.date).toISOString().slice(0,10)
            }
        })
        await redis.set('transparency', JSON.stringify(json), 'EX', 3600)
    }

    res.json(json)
}

exports.getReport = async (req, res) => {
    const data = await prisma.reports.findFirst({
        where: {
            target: req.params.id
        }
    })

    if (!data) {
        res.json({
            error: '404'
        })
    } else {
        res.json({
            ...data,
            details: (data.details).split('<').join('&lt;').split('>').join('&gt;'),
            date: (data.date).toISOString().slice(0,10)
        })
    }
}