function validateVideo(input: string): string | false {
  try {
    const url = new URL(input);
    const hostnames = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com'
    ];

    // basic hostname check
    if (hostnames.includes(url.hostname)) {
      // basic url
      if (url.pathname === '/watch') {
        const videoId = url.searchParams.get('v');
        return videoId || false;
      }

      // embed url
      const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }

      return false;
    }

    // short urls
    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.replace(/^\//, '');
      return videoId || false;
    }

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

async function validateChannel(input: string): Promise<string | false> {
  try {
    const url = new URL(input);
    const hostnames = [
      'youtube.com', 
      'www.youtube.com', 
      'm.youtube.com'
    ];

    if (hostnames.includes(url.hostname)) {
      // @ urls
      const atMatch = url.pathname.match(/^\/@([a-zA-Z0-9.-]+)/);
      if (atMatch) {
        const channelId = await (await fetch(`https://yt.jaybee.digital/api/channels?part=channels&handle=${atMatch[1]}`)).json()
        return channelId['items'][0]['id']
      }

      // /channel/ and /c/
      const channelMatch = url.pathname.match(/^\/(channel|c)\/([a-zA-Z0-9_-]+)/);
      if (channelMatch) {
        return channelMatch[2];
      }
    }

    return false;
  } catch {
    return false;
  }
}

export { validateVideo, validatePlaylist, validateChannel }