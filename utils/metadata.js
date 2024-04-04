const { Innertube } = require('youtubei.js');
const fetch = require('node-fetch')

const maxRetries = 5
const platforms = ['ANDROID', 'iOS', 'WEB']

async function getPipedInstance() {
    const instances = await (await fetch('https://piped-instances.kavin.rocks/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PreserveTube/0.0; +https://preservetube.com)'
        }
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
            const videos = [];
            const yt = await Innertube.create();
            const channel = await yt.getChannel(id);
            let json = await channel.getVideos();
    
            videos.push(...json.videos);
    
            while (json.has_continuation && videos.length < 60) {
                json = await getNextPage(json);
                videos.push(...json.videos);
            }
    
            resolve(videos);
            
        } catch (e) {
            resolve(false);
        }
    });
    
    async function getNextPage(json) {
        const page = await json.getContinuation();
        return page;
    }
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