const fetch = require('node-fetch')

async function getInstance() {
    for (let i = 0; i < 5; i++) {
        const instance = await actuallyGettingInstance()
        if (instance) return instance
    }

    async function actuallyGettingInstance() {
        const instance = await getRandomInstance() 
        const test = await testInstance(instance)
        if (test) return instance
        else {
            return false
        }
    }

    async function getRandomInstance() {
        const instances = await (await fetch('https://piped-instances.kavin.rocks/')).json()
        const list = instances.filter(i => !i.cdn)
        return (list[Math.floor(Math.random() * list.length)]).api_url
    }

    async function testInstance(instance) {
        try {
            await (await fetch(`${instance}/streams/WDogskpmM7M`)).json()
            return true 
        } catch (e) {
            return false 
        }
    }
}

async function getVideoMetadata(instance, id) {
    const json = await (await fetch(`${instance}/streams/${id}`)).json()
    return json
}

async function getChannel(instance, id) {
    const json = await (await fetch(`${instance}/channel/${id}`)).json()
    return json
}

async function getChannelVideos(instance, id) {
    return new Promise(async (resolve, reject) => {
        const videos = []
        const json = await (await fetch(`${instance}/channel/${id}`)).json()
        videos.push(...json.relatedStreams)
        if (json.nextpage) await getNextPage(json.nextpage)
        else resolve(videos)
        
        async function getNextPage(payload) {
            const page = await (await fetch(`${instance}/nextpage/channel/${id}?nextpage=${encodeURIComponent(payload)}`)).json()
            videos.push(...page.relatedStreams)
            if (page.nextpage) await getNextPage(page.nextpage)
            else resolve(videos)
        }
    })
}

async function getPlaylistVideos(instance, id) {
    const json = await (await fetch(`${instance}/playlists/${id}`)).json()
    return json
}

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos }