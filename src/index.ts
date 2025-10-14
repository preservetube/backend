import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static'

import latest from '@/router/latest'
import search from '@/router/search'
import transparency from '@/router/transparency'
import video from '@/router/video'
import websocket from '@/router/websocket'
import html from '@/router/html'

const app = new Elysia()
app.use(latest)
app.use(search)
app.use(transparency)
app.use(video)
app.use(websocket)
app.use(html)
app.onRequest(({ set, path }: any) => {
  set.headers['Onion-Location'] = 'http://tubey5btlzxkcjpxpj2c7irrbhvgu3noouobndafuhbw4i5ndvn4v7qd.onion' + path
})

process.on('uncaughtException', err => {
  console.log(err)
})

app.use(staticPlugin({ prefix: '/' }))
app.listen(1337);
console.log(
  `api is running at ${app.server?.hostname}:${app.server?.port}`
);