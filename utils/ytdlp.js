const child_process = require('child_process')
const DOMPurify = require('isomorphic-dompurify')
const metadata = require('./metadata.js')

async function downloadVideo(url, ws, id) {
    return new Promise(async (resolve, reject) => {
        const args = ['--proxy', 'socks5://gluetun:1080', url]
        const video = await metadata.getVideoMetadata(id)
        if (video.lengthSeconds > 1500) {
            const formats = await getFormats(url, ws)
            if (!formats.fail && formats.includes('18  mp4')) {
                args.push('-f 18')
            }
        }

        const child = child_process.spawn('../yt-dlp', args, {cwd: 'videos', shell: false})
        // https://github.com/yt-dlp/yt-dlp/blob/cc8d8441524ec3442d7c0d3f8f33f15b66aa06f3/README.md?plain=1#L1500
        
        child.stdout.on("data", data => {
            const msg = data.toString().trim()
            if (!msg) return 
    
            if (ws) ws.send(`DATA - ${DOMPurify.sanitize(msg)}`)
        })

        child.stderr.on("data", data => {
            const msg = data.toString().trim()
            if (!msg) return 
    
            if (ws) ws.send(`DATA - ${DOMPurify.sanitize(msg)}`)
        })

        child.on("close", async (code, signal) => {
            if (code == 2 || code == 1) { // https://github.com/yt-dlp/yt-dlp/issues/4262
                reject({
                    fail: true
                })
            } else {
                resolve({
                    fail: false
                })
            }
        })
    })
}

async function getFormats(url, ws) {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn("../yt-dlp", [url, "-F"], {cwd: 'videos', shell: false})
        let outputs = ''

        child.stdout.on("data", data => {
            const msg = data.toString().trim()
            if (!msg) return 
            
            outputs = outputs + msg
        })

        child.stderr.on("data", data => {
            const msg = data.toString().trim()
            if (!msg) return 
    
            if (ws) ws.send(`DATA - ${DOMPurify.sanitize(msg)}`)
        })

        child.on("close", async (code, signal) => {
            if (code == 2 || code == 1) { // https://github.com/yt-dlp/yt-dlp/issues/4262
                reject({
                    fail: true
                })
            } else {
                resolve(outputs)
            }
        })
    })
}

module.exports = { downloadVideo }