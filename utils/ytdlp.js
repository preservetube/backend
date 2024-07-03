const WebSocket = require('ws')
const metadata = require('./metadata.js')

async function downloadVideo(url, ws, id) {
    return new Promise(async (resolve, reject) => {
        let quality = '480p'
        const video = await metadata.getVideoMetadata(id)
        if (video.error) {
            return resolve({
                message: `Failed to request Youtube with error ${video.error}. Please retry...`,
                fail: true
            })
        }
        if (video.basic_info.duration >= 900) quality = '360p' // 15 minutes

        quality = await getVideoQuality(video, quality)

        let isDownloading = true 
        const downloader = new WebSocket(`ws://${process.env.METADATA.replace('http://', '')}/download/${id}/${quality}`)
        downloader.on('message', async function message(data) {
            const text = data.toString()
            if (text == 'done') {
                isDownloading = false
                return resolve({
                    fail: false
                })
            } else {
                ws.send(`DATA - ${text}`)
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

async function getVideoQuality(json, quality) {
    const adaptiveFormats = json['streaming_data']['adaptive_formats'];
    let video = adaptiveFormats.find(f => f.quality_label === quality && !f.has_audio);
    
    // If the specified quality isn't available, find the lowest quality video
    if (!video) {
        video = adaptiveFormats.filter(f => !f.has_audio).reduce((prev, current) => {
            if (!prev || parseInt(current.quality_label) < parseInt(prev.quality_label)) {
                return current;
            }
            return prev;
        }, null);
    }

    return video ? video.quality_label : null;
}

module.exports = { downloadVideo }