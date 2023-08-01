const fetch = require('node-fetch')

async function getInstance() {
    return 'https://invidious.lain.la'
}

async function getVideoMetadata(id) {
    const instance = await getInstance()
    const json = await (await fetch(`${instance}/api/v1/videos/${id}?fields=videoId,title,descriptionHtml,videoThumbnails,published,authorId,error&pretty=1`)).json()
    return json
}

async function getChannel(id) {
    const instance = await getInstance()
    const json = await (await fetch(`${instance}/api/v1/channels/${id}?pretty=1`)).json()
    return json
}

async function getChannelVideos(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const videos = []
            const instance = 'https://pipedapi.kavin.rocks'
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
    const instance ='https://pipedapi.kavin.rocks'
    const json = await (await fetch(`${instance}/playlists/${id}`)).json()
    return json
}

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos }