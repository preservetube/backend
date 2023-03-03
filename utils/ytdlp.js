const child_process = require('child_process')

async function downloadVideo(url, ws) {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn("../yt-dlp", ["--max-filesize=1G", url], {cwd: 'videos', shell: false})
        
        child.stdout.on("data", data => {
            const msg = data.toString().trim()
            if (!msg) return 
    
            ws.send(`DATA - ${msg}`)
        })

        child.on("close", async (code, signal) => {
            if (code == 2) {
                reject({
                    fail: true,
                    message: 'Video file is above 1GB. Consider selfhosting PreserveTube!'
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