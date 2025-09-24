import WebSocket from 'ws';

async function downloadVideo(ws: any, id: string): Promise<{ fail: boolean, message: string }> {
  return new Promise(async (resolve, reject) => {
    let isDownloading = true
    const downloader = new WebSocket(`ws://${(process.env.METADATA!).replace('http://', '')}/download/${id}`)

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

export { downloadVideo }