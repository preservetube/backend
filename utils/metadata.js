const fetch = require('node-fetch')
const maxRetries = 5

async function getPipedInstance() {
    const instances = await (await fetch('https://piped-instances.kavin.rocks/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
        }
    })).json()
    return (instances[Math.floor(Math.random() * instances.length)]).api_url
}

async function getVideoMetadata(id) {
    return await (await fetch(`${process.env.METADATA}/video/${id}`)).json()
}

async function getChannel(id) {
    return await (await fetch(`${process.env.METADATA}/channel/${id}`)).json()
}

async function getChannelVideos(id) {
    return await (await fetch(`${process.env.METADATA}/videos/${id}`)).json()
}

async function getPlaylistVideos(id) {
    const instance = await getPipedInstance()
    const json = await (await fetch(`${instance}/playlists/${id}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
        }
    })).json()
    return json
}

async function getVideoDownload(url, quality) {
    let json 

    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            json = await (await fetch('http://gluetun:9000/api/json', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'url': url,
                    'vQuality': quality
                })
            })).json()

            if (json.error) continue
            return json
        } catch (error) {
            continue
        }
    }

    return json
}

module.exports = { getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos, getVideoDownload }