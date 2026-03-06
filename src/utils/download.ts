import WebSocket from 'ws';

async function downloadVideo(ws: any, id: string): Promise<{ fail: boolean, message: string, size: number }> {
  return new Promise(async (resolve, reject) => {
    let isDownloading = true
    const downloader = new WebSocket(`ws://${(process.env.METADATA!).replace('http://', '')}/download/${id}`)
    let size: number = 0

    downloader.on('message', async function message(data: any) {
      const text = data.toString()
      if (text.startsWith('VIDEOSIZE-')) {
        size = parseInt(text.replace('VIDEOSIZE-', ''))
      } else if (text == 'done') {
        isDownloading = false
        return resolve({
          fail: false,
          message: '',
          size
        })
      } else {
        ws.send(`DATA - ${text}`)
      }
    })

    downloader.on('close', function close() {
      if (!isDownloading) return

      return resolve({
        fail: true,
        message: 'The metadata server unexpectedly closed the websocket. Please try again.',
        size
      })
    })
  })
}

export { downloadVideo }