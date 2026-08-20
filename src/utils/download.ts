import WebSocket from 'ws'

interface WsLike {
  send: (msg: string) => void
}

async function downloadVideo(ws: WsLike, id: string): Promise<{ fail: boolean, message: string, size: number }> {
  const { promise, resolve } = Promise.withResolvers<{ fail: boolean, message: string, size: number }>()
  let isDownloading = true
  const downloader = new WebSocket(`ws://${(process.env.METADATA!).replace('http://', '')}/download/${id}`)
  let size = 0

  downloader.on('message', function message(data: unknown) {
    const text = String(data)
    if (text.startsWith('VIDEOSIZE-')) {
      size = parseInt(text.replace('VIDEOSIZE-', ''))
    } else if (text === 'done') {
      isDownloading = false
      downloader.close()
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
    isDownloading = false
    return resolve({
      fail: true,
      message: 'The metadata server unexpectedly closed the websocket. Please try again.',
      size
    })
  })

  downloader.on('error', function error(err: Error) {
    if (!isDownloading) return
    isDownloading = false
    downloader.close()
    return resolve({
      fail: true,
      message: `WebSocket error: ${err?.message || String(err)}`,
      size
    })
  })

  return promise
}

export { downloadVideo }