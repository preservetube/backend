// metadata either returns innertube or { error: string }
import { getMetadataBackend } from '@/utils/health';

async function getVideo(id: string) {
  return await (await fetch(`${getMetadataBackend()}/video/${id}`)).json()
}

async function getChannel(id: string) {
  return await (await fetch(`${getMetadataBackend()}/channel/${id}`)).json()
}

async function getChannelVideos(id: string) {
  return await (await fetch(`${getMetadataBackend()}/videos/${id}`)).json()
}

export { getVideo, getChannel, getChannelVideos }