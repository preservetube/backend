require('dotenv').config()

const express = require('express')
const cors = require('cors')

const logger = require('./utils/logger.js')
const auto = require('./utils/auto.js')

const latestController = require('./controller/latest.js')
const videoController = require('./controller/video.js')
const searchController = require('./controller/search.js')
const websocketController = require('./controller/websocket.js')
const transparencyController = require('./controller/transparency.js')

const app = express()

require('express-ws')(app)
app.use(cors())

app.get('/latest', latestController.getLatest)
app.get('/video/:id', videoController.getVideo)
app.get('/channel/:id', videoController.getChannel)
app.get('/playlist/:id', videoController.getPlaylist)

app.get('/search/video', searchController.searchVideo)
app.get('/search/playlist', searchController.searchPlaylist)
app.get('/search/channel', searchController.searchChannel)

app.get('/transparency/list', transparencyController.getReports)
app.get('/transparency/:id', transparencyController.getReport)

app.ws('/save', websocketController.save)
app.ws('/saveplaylist', websocketController.playlist)
app.ws('/savechannel', websocketController.channel)
app.get('/autodownload', websocketController.addAutodownload)

setInterval(() => {
  auto.handleCheck()
}, 300000)

process.on('uncaughtException', err => {
  logger.info({ message: `Error: ${err.message}` })
})

app.listen(1337, () => {
  logger.info({ message: 'Server listening on port 1337!' })
})