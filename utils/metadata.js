const fetch = require('node-fetch')

async function getInstance() {
    for (let i = 0; i < 5; i++) {
        const test = await actualRequest()
        if (test) return test
    }

    async function getActualInstance() {
        const instances = await (await fetch('https://piped-instances.kavin.rocks/')).json()
        return (instances[Math.floor(Math.random() * instances.length)]).api_url    
    }

    async function testInstance(instance) {
        try {
            const videoRequest = await fetch(`${instance}/streams/dQw4w9WgXcQ`)
            const videoJson = await videoRequest.json()
            const thumbnailRequest = await fetch(videoJson.thumbnailUrl)
        
            return (videoRequest.status == 200) && (thumbnailRequest.status == 200)
        } catch (e) {
            return false
        }
    }

    async function actualRequest() {
        try {
            const instance = await getActualInstance()
            const instanceTest = await testInstance(instance)

            if (instanceTest) return instance
            else return false
        } catch (e) {
            return false
        }
    }

}

async function getVideoMetadata(id) {
    const instance = await getInstance()
    const json = await (await fetch(`${instance}/streams/${id}`)).json()
    return json
}

async function getChannel(id) {
    const instance = await getInstance()
    const json = await (await fetch(`${instance}/channel/${id}`)).json()
    return json
}

async function getChannelVideos(id) {
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

                if (videos.length >= 60) resolve(videos)
                if (page.nextpage) await getNextPage(page.nextpage)
                else resolve(videos)
            }

        } catch (e) {
            resolve(false)
        }
    })
}

async function getPlaylistVideos(id) {
    const instance = await getInstance()
    const json = await (await fetch(`${instance}/playlists/${id}`)).json()
    return json
}

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos }