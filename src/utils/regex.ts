function validateVideo(input: string): string | false {
  try {
    const url = new URL(input);
    let videoId: string = ''
    const hostnames = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com'
    ];

    if (hostnames.includes(url.hostname)) {
      if (url.pathname === '/watch') {
        if (!url.searchParams.get('v')) return false
        videoId = url.searchParams.get('v')!
      } else if (url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.replace('/shorts/', '')
      } else if (url.pathname.startsWith('/live/')) {
        videoId = url.pathname.replace('/live/', '')
      } else return false
      // removed - embed url
    }

    // short urls
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.replace(/^\//, '');
    }

    if (videoId && videoId.match(/[\w\-_]{11}/)) return videoId
    return false;
  } catch {
    return false;
  }
}

function validatePlaylist(input: string): string | false {
  try {
    const url = new URL(input);
    const hostnames = [
      'youtube.com', 
      'www.youtube.com', 
      'm.youtube.com'
    ];

    if (hostnames.includes(url.hostname)) {
      // all urls are the same, thank god
      if (url.pathname === '/playlist' || url.pathname === '/watch') {
        const playlistId = url.searchParams.get('list');
        return playlistId || false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function validateChannel(input: string): Promise<string | { error: string; } | false> {
  try {
    const url = new URL(input);
    const hostnames = [
      'youtube.com', 
      'www.youtube.com', 
      'm.youtube.com'
    ];
    const whereIsIt: Record<string, (string|number)[]> = {
      channel: ['metadata', 'channelMetadataRenderer', 'externalId'],
      handle: ['responseContext', 'serviceTrackingParams', 0, 'params'],
      user: ['metadata', 'channelMetadataRenderer', 'externalId']
    }

    if (hostnames.includes(url.hostname)) {
      let whatIsIt = ''

      // many thanks to Benjamin Loison (@Benjamin-Loison) for his PHP implementation of this
      // https://github.com/Benjamin-Loison/YouTube-operational-API/blob/main/channels.php
      // and the stackoverflow answer with all the possible options, thank you.
      // https://stackoverflow.com/a/75843807

      if (url.pathname.startsWith('/channel/')) { // /channel/[id]
        return url.pathname.match(/UC[\w\-_]{22}/gm)?.[0] || false
      } else if (url.pathname.startsWith('/c/')) { // /c/[custom]
        whatIsIt = 'channel'
      } else if (url.pathname.startsWith('/user/')) {
        whatIsIt = 'user'
      } else if (url.pathname.match(/@[\w\-_.]{3,}/gm)) { // /@[handle]
        whatIsIt = 'handle'
      } else return false 

      const channelReq = await fetch(`${process.env.METADATA}/getWebpageJson?url=${url}`)
      if (!channelReq.ok) return {
        error: `Failed to fetch Youtube with status ${channelReq.status}. Please retry.`
      }

      const channelJson = await channelReq.json()
      let channelId: string | Record<any, any> = getByPath(channelJson, whereIsIt[whatIsIt]!);
      if (whatIsIt == 'handle') {
        channelId = channelId.find((c:any) => c.key == 'browse_id').value
      }

      return typeof channelId == 'string' ? channelId : {
        error: 'Failed to extract channel ID from the Youtube provided JSON.'
      }
    }

    return false;
  } catch {
    return false;
  }
}

function getByPath(obj: Record<any, any>, path: (string|number)[]) {
  return path.reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined
    return acc[key]
  }, obj)
}

export { validateVideo, validatePlaylist, validateChannel }