const fetch = require('node-fetch')

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

async function getVideoDownload(json, quality) {
    const adaptiveFormats = json['streaming_data']['adaptive_formats'];
    let video = adaptiveFormats.find(f => f.quality_label === `${quality}p` && !f.has_audio);
    if (!video) { // stupid bullshit. basically finding the lowest quality if the quality specified isnt there
        video = adaptiveFormats.filter(f => !f.has_audio).reduce((prev, current) => {
            if (!prev || parseInt(current.quality_label) < parseInt(prev.quality_label)) {
                return current;
            }
            return prev;
        }, null);
    }

    const audio = adaptiveFormats.find(f => f.has_audio);

    return {
        url: [
            video.url,
            audio.url
        ]
    };
}


module.exports = { getVideoMetadata, getChannel, getChannelVideos, getPlaylistVideos, getVideoDownload }