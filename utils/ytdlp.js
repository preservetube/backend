const wget = require('wget-improved')
const DOMPurify = require('isomorphic-dompurify')
const metadata = require('./metadata.js')
const hr = require('@tsmx/human-readable')

async function downloadVideo(url, ws, id) {
    return new Promise(async (resolve, reject) => {
        let quality = '720p'
        const video = await metadata.getVideoMetadata(id)
        if (video.lengthSeconds > 1200) quality = '480p' // 20 minutes
        if (video.lengthSeconds > 2100) quality = '360p' // 35 minutes
        const downloadJson = await metadata.getVideoDownload(url, quality)

        let size = ''
        const alreadyPrecentages = []
        const download = wget.download(downloadJson.url, `./videos/${id}.webm`, {
            proxy: 'socks5://gluetun:1080'
        })
        
        download.on('start', fileSize => {
            size = fileSize
            if (ws) ws.send(`DATA - Download has started in ${quality}`)
        })

        download.on('progress', progress => {
            if (alreadyPrecentages.includes((progress*100).toFixed(0))) return 
            alreadyPrecentages.push((progress*100).toFixed(0))
            
            if (ws) ws.send(`DATA - [download] ${(progress*100).toFixed(2)}% of ${hr.fromBytes(size)}`)
        })

        download.on('error', err => {
            if (ws) ws.send(`DATA - ${DOMPurify.sanitize(err)}`)
        })

        download.on('end', output => {
            if (output == 'Finished writing to disk') {
                ws.send(`DATA - Download has finished`)
                resolve({
                    fail: false
                })
            } else {
                reject({
                    fail: true
                })
            }
        })
    })
}

module.exports = { downloadVideo }