const fetch = require('node-fetch')

async function validateVideoInput(input) {
    if (!input) return {
        fail: true,
        message: 'Missing URL'
    }

    const id = (input.trim()).match(/^https:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})$/m)?.[1]
    if (!id) return {
        fail: true,
        message: 'Whoops! What is that? That is not a Youtube url.'
    }

    return id
}

async function validatePlaylistInput(input) {
    if (!input) return {
        fail: true,
        message: 'Missing URL'
    }

    const id = (input.trim()).match(/^(?:https?:\/\/)?(?:www\.)?youtu(?:(?:\.be)|(?:be\.com))\/playlist\?list=([\w_-]{34})$/m)?.[1]
    if (!id) return {
        fail: true,
        message: 'Whoops! What is that? That is not a Youtube Playlist.'
    }

    return id
}

async function validateChannelInput(input) {
    if (!input) return {
        fail: true,
        message: 'Missing URL'
    }

    const id = input.match(/^(?:https?:\/\/)?(?:www\.)?youtu(?:(?:\.be)|(?:be\.com))\/(?:channel\/|@)([\w-]+)/m)?.[1]
    if (!id) return {
        fail: true,
        message: 'Whoops! What is that? That is not a Youtube Channel.'
    }

    if (input.includes('@')) {
        const channelId = await (await fetch(`https://pipedapi.kavin.rocks/@/${input.split('@')[1]}`)).json()
        return channelId['id']
    } else {
        return id
    }
}

module.exports = { validateVideoInput, validatePlaylistInput, validateChannelInput }