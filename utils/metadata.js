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

async function getChannelVideos(instance, id) {
    const json = await (await fetch(`${instance}/channel/${id}`)).json()
    return json
}

async function getPlaylistVideos(instance, id) {
    const json = await (await fetch(`${instance}/playlists/${id}`)).json()
    return json
}

module.exports = { getInstance, getVideoMetadata, getChannelVideos, getPlaylistVideos }