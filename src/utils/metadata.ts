// metadata either returns innertube or { error: string }
import { getMetadataBackend } from '@/utils/health';
import { sleep } from 'bun';

async function getMetadata(path: string, retries = 3, delay = 1000) {
  let lastError = { error: 'ErrorUnknown' }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${getMetadataBackend()}${path}`)
      const json = await response.json()

      if (response.ok && json.error !== 'ErrorUnknown' && json.error !== 'ErrorCantConnectToServiceAPI') return json
      if (json.error) lastError = json
    } catch {
      lastError = { error: 'ErrorUnknown' }
    }

    if (attempt < retries) await sleep(delay * attempt)
  }

  return lastError
}

async function getVideo(id: string) {
  return await getMetadata(`/video/${id}`)
}

async function getChannel(id: string) {
  return await getMetadata(`/channel/${id}`)
}

async function getChannelVideos(id: string) {
  return await getMetadata(`/videos/${id}`)
}

export { getVideo, getChannel, getChannelVideos }