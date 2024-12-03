import { Elysia } from 'elysia';

import latest from '@/router/latest'
import search from '@/router/search'
import transparency from '@/router/transparency'
import video from '@/router/video'
import websocket from '@/router/websocket'

const app = new Elysia()
app.use(latest)
app.use(search)
app.use(transparency)
app.use(video)
app.use(websocket)

process.on('uncaughtException', err => {
  console.log(err)
})

app.listen(1337);
console.log(
  `api is running at ${app.server?.hostname}:${app.server?.port}`
);