// metadata either returns innertube or { error: string }

async function getVideo(id: string) {
  return await (await fetch(`${process.env.METADATA}/video/${id}`)).json()
}

async function getChannel(id: string) {
  return await (await fetch(`${process.env.METADATA}/channel/${id}`)).json()
}

async function getChannelVideos(id: string) {
  return await (await fetch(`${process.env.METADATA}/videos/${id}`)).json()
}

export { getVideo, getChannel, getChannelVideos }