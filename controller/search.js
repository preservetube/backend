const validate = require('../utils/validate.js')

exports.searchVideo = async (req, res) => {
    const id = await validate.validateVideoInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.send(`<script>window.location.href = '${process.env.FRONTEND}/watch?v=${id}'</script>`)
    }
}

exports.searchPlaylist = async (req, res) => {
    const id = await validate.validatePlaylistInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.send(`<script>window.location.href = '${process.env.FRONTEND}/playlist?list=${id}'</script>`)
    }
}

exports.searchChannel = async (req, res) => {
    const id = await validate.validateChannelInput(req.query.url)
    if (id.fail) {
        res.status(500).send(id.message)
    } else {
        res.send(`<script>window.location.href = '${process.env.FRONTEND}/channel/${id}'</script>`)
    }
}