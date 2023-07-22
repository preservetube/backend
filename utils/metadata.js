const fetch = require('node-fetch')

async function getInstance() {
    const instances = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi-libre.kavin.rocks',
        'https://piped-api.privacy.com.de',
        'https://api.piped.projectsegfau.lt',
        'https://pipedapi.in.projectsegfau.lt',
        'https://pipedapi.us.projectsegfau.lt',
        'https://watchapi.whatever.social',
        'https://api.piped.privacydev.net',
        'https://pipedapi.palveluntarjoaja.eu',
        'https://pipedapi.smnz.de',
        'https://pipedapi.adminforge.de',
        'https://pipedapi.qdi.fi',
        'https://piped-api.hostux.net',
        'https://api.piped.yt',
        'https://pipedapi.osphost.fi',
        'https://pipedapi.simpleprivacy.fr'
    ]

    return instances[Math.floor(Math.random() * instances.length)]
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