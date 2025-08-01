import WebSocket from 'ws';
import { getVideo } from '@/utils/metadata';

async function downloadVideo(ws: any, id: string): Promise<{ fail: boolean, message: string }> {
  return new Promise(async (resolve, reject) => {
    let quality = '480p'
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

  if (!video) {
    const target = parseInt(quality);
    video = adaptiveFormats // find the quality thats closest to the one we wanted
      .filter((f: any) => !f.has_audio && f.quality_label)
      .reduce((prev: any, curr: any) => {
        const currDiff = Math.abs(parseInt(curr.quality_label) - target);
        const prevDiff = prev ? Math.abs(parseInt(prev.quality_label) - target) : Infinity;
        return currDiff < prevDiff ? curr : prev;
      }, null);
  }

  return video ? video.quality_label : null;
}

export { downloadVideo }