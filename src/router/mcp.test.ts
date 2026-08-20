import { describe, expect, it, mock } from 'bun:test'

process.env.MCP_SECRET = 'test-secret'

mock.module('@/utils/archive', () => ({
  archiveVideo: async (input: string) => {
    // Integration delay simulation to test async handler waiting
    await Bun.sleep(50)
    return { success: true, message: 'Video archived successfully.', videoId: input }
  },
  addToSizeWhitelist: async () => ({ success: true, message: 'Whitelisted.' }),
  getVideoMetadata: async () => ({ success: true, metadata: {} }),
  extractVideoId: (input: string) => input
}))

// Dynamic import required so mock.module executes before mcp module is imported
const { default: app } = await import('./mcp')

describe('HTTP MCP Transport', () => {
  it('returns JSON response for delayed tool call without streaming SSE', async () => {
    const startTime = Date.now()
    const response = await app.handle(
      new Request('http://localhost/api/mcp/', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret',
          'Accept': 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'Mcp-Protocol-Version': '2025-03-26'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'archive_video',
            arguments: { videoId: 'dQw4w9WgXcQ' }
          }
        })
      })
    )

    const duration = Date.now() - startTime
    expect(duration).toBeLessThan(1000)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body.result.content[0].text).toContain('Video archived successfully.')
  })
})
