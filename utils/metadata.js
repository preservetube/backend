const fetch = require('node-fetch')

async function getInstance() {
    const instances = await (await fetch('https://piped-instances.kavin.rocks/')).json()
    const list = instances.filter(i => i.cdn && i.name != "tokhmi.xyz" && i.name != "rivo.lol")
    return (list[Math.floor(Math.random() * list.length)]).api_url
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