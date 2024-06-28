const wget = require('wget-improved')
const DOMPurify = require('isomorphic-dompurify')
const metadata = require('./metadata.js')
const hr = require('@tsmx/human-readable')

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

        const downloadJson = await metadata.getVideoDownload(url, quality)
        if (downloadJson.status == 'error') {
            return resolve({
                message: `Failed to request Youtube with error ${downloadJson.text}. Please retry...`,
                fail: true
            })
        }

        let size = ''
        let startTime = Date.now()
        let prevBytes = 0
        let speed = 0
        const alreadyPrecentages = []

        const target = Array.isArray(downloadJson.url) ? downloadJson.url[0] : downloadJson.url
        const download = wget.download(target, `./videos/${id}.mp4`)
        
        download.on('start', fileSize => {
            size = fileSize
            if (ws) ws.send(`DATA - Download has started in ${quality}p`)
        })

        download.on('progress', progress => {
            if (alreadyPrecentages.includes((progress*100).toFixed(0))) return 
            alreadyPrecentages.push((progress*100).toFixed(0))

            const currentTime = Date.now()
            const elapsedTime = (currentTime - startTime) / 1000
            const currentBytes = progress * size
            const bytesDownloaded = currentBytes - prevBytes
            speed = bytesDownloaded / elapsedTime 
            prevBytes = currentBytes

            const speedInMBps = speed / 1048576 
            const remainingBytes = size - currentBytes
            const remainingTime = remainingBytes / speed 

            if (ws) ws.send(`DATA - [download] ${(progress*100).toFixed(2)}% of ${hr.fromBytes(size)} at ${speedInMBps.toFixed(2)} MB/s ETA ${secondsToTime(remainingTime.toFixed(0))}`)
        })

        download.on('error', err => {
            if (ws) ws.send(`DATA - ${DOMPurify.sanitize(err)}`)
        })

        download.on('end', output => {
            if (output == 'Finished writing to disk') {
                ws.send(`DATA - Download has finished`)
                return resolve({
                    fail: false
                })
            } else {
                return resolve({
                    fail: true
                })
            }
        })
    })
}

function secondsToTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const formattedSeconds = remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds;
    return `${minutes}:${formattedSeconds}`;
}

module.exports = { downloadVideo }