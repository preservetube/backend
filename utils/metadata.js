const { Innertube } = require('youtubei.js');
const fetch = require('node-fetch')
const https = require('https')
const maxRetries = 5

const ignoreSsl = new https.Agent({
    rejectUnauthorized: false,
})

async function getInstance() {
    const instances = await (await fetch('https://api.invidious.io/instances.json?pretty=1', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
        }
    })).json()
    const sorted = instances.filter(o => o[1].type == 'https' && o[0] != 'invidious.io.lol' && o[0] != 'invidious.0011.lt')
    return `https://${sorted[Math.floor(Math.random() * sorted.length)][0]}`
}

async function getPipedInstance() {
    const instances = await (await fetch('https://piped-instances.kavin.rocks/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
        },
        agent: ignoreSsl
    })).json()
    return (instances[Math.floor(Math.random() * instances.length)]).api_url
}

async function getVideoMetadata(id) {
    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            const yt = await Innertube.create();
            const info = await yt.getInfo(id, 'WEB');

            if (!info) return { error: 'ErrorCantConnectToServiceAPI' }; // stolen from cobalt :)
            if (info.playability_status.status !== 'OK') return { error: 'ErrorYTUnavailable' };
            if (info.basic_info.is_live) return { error: 'ErrorLiveVideo' };
            return info
        } catch (error) {
            continue
        }
    }

    return false
}

async function getChannel(id) {
    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            const yt = await Innertube.create();
            const info = await yt.getChannel(id, 'WEB');
            if (!info) return { error: 'ErrorCantConnectToServiceAPI' }; // stolen from cobalt :)
            return info
        } catch (error) {
            continue
        }
    }

    return false
}

async function getChannelVideos(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const videos = []
            const instance = await getPipedInstance()
            const json = await (await fetch(`${instance}/channel/${id}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
                }
            })).json()
            videos.push(...json.relatedStreams)
            if (json.nextpage) await getNextPage(json.nextpage)
            else resolve(videos)
            
            async function getNextPage(payload) {
                const page = await (await fetch(`${instance}/nextpage/channel/${id}?nextpage=${encodeURIComponent(payload)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
                    }
                })).json()
                videos.push(...page.relatedStreams)

                if (videos.length >= 60) return resolve(videos)
                if (page.nextpage) await getNextPage(page.nextpage)
                else return resolve(videos)
            }

        } catch (e) {
            resolve(false)
        }
    })
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
    const json = await (await fetch('http://cobalt-api:9000/api/json', {
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

    return json
}

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos, getVideoDownload }