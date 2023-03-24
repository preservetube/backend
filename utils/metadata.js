const fetch = require('node-fetch')

async function getInstance() {
    const instances = await (await fetch('https://piped-instances.kavin.rocks/')).json()
    return (instances[Math.floor(Math.random() * instances.length)]).api_url
}

async function getVideoMetadata(id) {
    for (let i = 0; i < 5; i++) {
        const video = await actualRequest()
        if (video) return video
    }

    async function actualRequest() {
        try {
            const instance = await getInstance()
            const json = await (await fetch(`${instance}/streams/${id}`)).json()
            return json
        } catch (e) {
            return false
        }
    }
}

async function getChannel(id) {
    for (let i = 0; i < 5; i++) {
        const channel = await actualRequest()
        if (channel) return channel
    }

    async function actualRequest() {
        try {
            const instance = await getInstance()
            const json = await (await fetch(`${instance}/channel/${id}`)).json()
            return json
        } catch (e) {
            return false
        }
    }
}

async function getChannelVideos(id) {
    for (let i = 0; i < 5; i++) {
        const videos = await actualRequest()
        if (videos) return videos
    }

    async function actualRequest() {
        return new Promise(async (resolve, reject) => {
            try {
                const videos = []
                const instance = await getInstance()
                const json = await (await fetch(`${instance}/channel/${id}`)).json()
                videos.push(...json.relatedStreams)
                if (json.nextpage) await getNextPage(json.nextpage)
                else resolve(videos)
                
                async function getNextPage(payload) {
                    const page = await (await fetch(`${instance}/nextpage/channel/${id}?nextpage=${encodeURIComponent(payload)}`)).json()
                    videos.push(...page.relatedStreams)

                    if (videos.length >= 210) resolve(videos)
                    if (page.nextpage) await getNextPage(page.nextpage)
                    else resolve(videos)
                }

            } catch (e) {
                resolve(false)
            }
        })
    }
}

async function getPlaylistVideos(id) {
    for (let i = 0; i < 5; i++) {
        const playlists = await actualRequest()
        if (playlists) return playlists
    }

    async function actualRequest() {
        try {
            const instance = await getInstance()
            const json = await (await fetch(`${instance}/playlists/${id}`)).json()
            return json
        } catch (e) {
            return false
        }
    }
}

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos }