import WebSocket from 'ws';
import { getVideo } from '@/utils/metadata';

async function downloadVideo(ws: any, id: string): Promise<{ fail: boolean, message: string }> {
  return new Promise(async (resolve, reject) => {
    let quality = '360p'
    const video = await getVideo(id)
    if (video.error) {
      return resolve({
        message: `Failed to request Youtube with error ${video.error}. Please retry...`,
        fail: true
      })
    }
    if (video.basic_info.duration >= 900) quality = '360p' // 15 minutes

    quality = await getVideoQuality(video, quality)

    let isDownloading = true
    const downloader = new WebSocket(`ws://${(process.env.METADATA!).replace('http://', '')}/download/${id}/${quality}`)

    downloader.on('message', async function message(data: any) {
      const text = data.toString()
      if (text == 'done') {
        isDownloading = false
        return resolve({
          fail: false,
          message: ''
        })
      } else {
        ws.send(`DATA - ${text}`)
      }
    })

    downloader.on('close', function close() {
      if (!isDownloading) return

      return resolve({
        fail: true,
        message: 'The metadata server unexpectedly closed the websocket. Please try again.'
      })
    })
  })
}

async function getVideoQuality(json: any, quality: string) {
  const adaptiveFormats = json['streaming_data']['adaptive_formats'];
  let video = adaptiveFormats.find((f: any) => f.quality_label === quality && !f.has_audio);

  // If the specified quality isn't available, find the lowest quality video
  if (!video) { // @ts-ignore
    video = adaptiveFormats.filter((f: any) => !f.has_audio).reduce((prev, current) => {
      if (!prev || parseInt(current.quality_label) < parseInt(prev.quality_label)) {
        return current;
      }
      return prev;
    }, null);
  }

  return video ? video.quality_label : null;
}

export { downloadVideo }