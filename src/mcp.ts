import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { addToSizeWhitelist, archiveVideo, getVideoMetadata } from '@/utils/archive'

const server = new Server(
  {
    name: 'preservetube-mcp',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'add_to_size_whitelist',
      description: 'Add a YouTube video ID to the size whitelist in preservetube-metadata config.json to bypass max video size limits.',
      inputSchema: {
        type: 'object',
        properties: {
          videoId: {
            type: 'string',
            description: 'YouTube video ID (11 characters) or full YouTube URL'
          }
        },
        required: ['videoId']
      }
    },
    {
      name: 'archive_video',
      description: 'Archive a YouTube video by ID or URL on PreserveTube.',
      inputSchema: {
        type: 'object',
        properties: {
          videoId: {
            type: 'string',
            description: 'YouTube video ID (11 characters) or full YouTube URL'
          }
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
          videoId: {
            type: 'string',
            description: 'YouTube video ID (11 characters) or full YouTube URL'
          }
        },
        required: ['videoId']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const inputArg = args && typeof args === 'object' && ('videoId' in args || 'url' in args)
    ? String((args as Record<string, unknown>).videoId || (args as Record<string, unknown>).url || '')
    : ''

  if (name === 'add_to_size_whitelist') {
    const result = await addToSizeWhitelist(inputArg)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }

  if (name === 'archive_video') {
    const result = await archiveVideo(inputArg)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }

  if (name === 'get_video_metadata') {
    const result = await getVideoMetadata(inputArg)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }

  throw new Error(`Unknown tool: ${name}`)
})

async function run() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

run().catch(console.error)
