const WebSocket = require('ws')
const metadata = require('./metadata.js')

async function downloadVideo(url, ws, id) {
    return new Promise(async (resolve, reject) => {
        let quality = '720'
        const video = await metadata.getVideoMetadata(id)
        if (video.error) {
            return resolve({
                message: `Failed to request Youtube with error ${video.error}. Please retry...`,
                fail: true
            })
        }
        if (video.basic_info.duration >= 900) quality = '360' // 15 minutes

        let isDownloading = true 
        const downloader = new WebSocket(`ws://${process.env.METADATA.replace('http://', '')}/download/${id}/${quality}p`)
        downloader.on('message', async function message(data) {
            const text = data.toString()
            if (text == 'done') {
                isDownloading = false
                return resolve({
                    fail: false
                })
            } else {
                ws.send(text)
            }
        })

        downloader.on('close', function close(code, reason) {
            if (!isDownloading) return

            return resolve({
                fail: true,
                message: 'The metadata server unexpectedly closed the websocket. Please try again.'
            })
        })
    })
}

module.exports = { downloadVideo }