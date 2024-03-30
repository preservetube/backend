const { Innertube } = require('youtubei.js');
const fetch = require('node-fetch')
const https = require('https')

const maxRetries = 5
const platforms = ['WEB', 'ANDROID', 'iOS']
const cobalt = ['http://cobalt-api:9000', 'https://co.wuk.sh', 'http://cobalt-api:9000']

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
    let error = ''

    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            const platform = platforms[retries % platforms.length];
            const yt = await Innertube.create();
            const info = await yt.getInfo(id, platform);

            if (!info) {
                error = 'ErrorCantConnectToServiceAPI'
                continue; 
            }
            if (info.playability_status.status !== 'OK') {
                error = 'ErrorYTUnavailable'
                continue; 
            }
            if (info.basic_info.is_live) {
                error = 'ErrorLiveVideo'
                continue;
            }
            return info
        } catch (error) {
            continue
        }
    }

    return { error: error || 'ErrorUnknown' }
}

async function getChannel(id) {
    let error = ''

    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            const platform = platforms[retries % platforms.length];
            const yt = await Innertube.create();
            const info = await yt.getChannel(id, platform);

            if (!info) {
                error = 'ErrorCantConnectToServiceAPI'
                continue; 
            }
            return info
        } catch (error) {
            continue
        }
    }

    return { error: error || 'ErrorUnknown' }
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
    let json 

    for (let retries = 0; retries < maxRetries; retries++) {
        try {
            const instance = cobalt[retries % cobalt.length];
            json = await (await fetch(`${instance}/api/json`, {
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

module.exports = { getInstance, getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos, getVideoDownload }