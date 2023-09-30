const child_process = require('child_process')
const DOMPurify = require('isomorphic-dompurify')

async function downloadVideo(url, ws) {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn("../yt-dlp", [url], {cwd: 'videos', shell: false})
        
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