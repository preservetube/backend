const { PrismaClient } =  require('@prisma/client')
const prisma = new PrismaClient()

exports.getReports = async (req, res) => {
    res.json((await prisma.reports.findMany()).map(r => {
        return {
            ...r,
            details: (r.details).split('<').join('&lt;').split('>').join('&gt;'),
            date: (r.date).toISOString().slice(0,10)
        }
    }))
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