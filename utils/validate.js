async function validateVideoInput(input) {
    if (!input) return {
        fail: true,
        message: 'Missing URL'
    }

    const id = input.match(/https:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
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

    const id = input.match(/^.*(youtu.be\/|list=)([^#\&\?]*).*/)?.[2]
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

    const id = input.match(/https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/(.*?)\/featured|(?:.*\/)*(.+))/)?.[2]
    if (!id) return {
        fail: true,
        message: 'Whoops! What is that? That is not a Youtube Channel.'
    }

    return id
}

module.exports = { validateVideoInput, validatePlaylistInput, validateChannelInput }