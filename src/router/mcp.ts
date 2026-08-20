import { Elysia, t } from 'elysia'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { addToSizeWhitelist, archiveVideo, getVideoMetadata } from '@/utils/archive'

function isAuthorized(headers: Record<string, string | undefined>): boolean {
  const authHeader = headers['authorization'] || headers['Authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader
  const secret = process.env.MCP_SECRET || process.env.MCP_KEY

  if (!secret || !token) return false
  return token === secret
}

function createMcpServer() {
  const server = new Server(
    { name: 'preservetube-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'add_to_size_whitelist',
        description: 'Add a YouTube video ID to the size whitelist in preservetube-metadata config.json',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      },
      {
        name: 'archive_video',
        description: 'Archive a YouTube video on PreserveTube by video ID or URL',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      },
      {
        name: 'get_video_metadata',
        description: 'Fetch video metadata including title, duration/length, channel, publish date, and preserved database record if archived.',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      }
    ]
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const inputArg = String((args as Record<string, unknown>)?.videoId || (args as Record<string, unknown>)?.url || '')

    if (name === 'add_to_size_whitelist') {
      const result = await addToSizeWhitelist(inputArg)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }

    if (name === 'archive_video') {
      const result = await archiveVideo(inputArg)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }

    if (name === 'get_video_metadata') {
      const result = await getVideoMetadata(inputArg)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }

    throw new Error(`Unknown tool: ${name}`)
  })

  return server
}

async function handleMcpStreamRequest(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport()
  const mcpServer = createMcpServer()
  await mcpServer.connect(transport)
  return await transport.handleRequest(request)
}

const app = new Elysia({ prefix: '/api/mcp' })

app.onBeforeHandle(({ headers, set }) => {
  if (!isAuthorized(headers as Record<string, string | undefined>)) {
    set.status = 401
    return { success: false, message: 'Unauthorized: Invalid or missing Bearer authorization token.' }
  }
})

app.get('/tools', () => {
  return {
    tools: [
      {
        name: 'add_to_size_whitelist',
        description: 'Add a YouTube video ID to the size whitelist in preservetube-metadata config.json',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      },
      {
        name: 'archive_video',
        description: 'Archive a YouTube video on PreserveTube by video ID or URL',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      },
      {
        name: 'get_video_metadata',
        description: 'Fetch video metadata including title, duration/length, channel, publish date, and preserved database record if archived.',
        inputSchema: {
          type: 'object',
          properties: {
            videoId: { type: 'string', description: 'YouTube video ID or URL' }
          },
          required: ['videoId']
        }
      }
    ]
  }
})

app.post('/call', async ({ body }: { body: { name: string, arguments?: { videoId?: string, url?: string } } }) => {
  const { name, arguments: args } = body
  const inputArg = String(args?.videoId || args?.url || '')

  if (name === 'add_to_size_whitelist') {
    return await addToSizeWhitelist(inputArg)
  }

  if (name === 'archive_video') {
    return await archiveVideo(inputArg)
  }

  if (name === 'get_video_metadata') {
    return await getVideoMetadata(inputArg)
  }

  return { success: false, message: `Unknown tool: ${name}` }
}, {
  body: t.Object({
    name: t.String(),
    arguments: t.Optional(t.Object({
      videoId: t.Optional(t.String()),
      url: t.Optional(t.String())
    }))
  })
})

app.all('/', async ({ request }) => {
  return await handleMcpStreamRequest(request)
})

app.all('/*', async ({ request }) => {
  return await handleMcpStreamRequest(request)
})

export default app
export { isAuthorized }
