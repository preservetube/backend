import { createOpenAI } from '@ai-sdk/openai'

const provider = createOpenAI({
  baseURL: 'https://opencode.ai/zen/go/v1',
  apiKey: process.env.OPENCODE_API_KEY,
  // opencode go rejects requests without a session id (used for routing)
  headers: { 'x-opencode-session': crypto.randomUUID() }
})

// zen's /responses endpoint is unreliable; .chat() forces /chat/completions
export const chatModel = provider.chat('glm-5.3-flash')
