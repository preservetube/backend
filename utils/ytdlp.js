const child_process = require('child_process')
const DOMPurify = require('isomorphic-dompurify')

async function downloadVideo(url, ws) {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn("../yt-dlp", ['--proxy http://gluetun:8888', url], {cwd: 'videos', shell: false})
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
            if (code == 2) {
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

module.exports = { downloadVideo }