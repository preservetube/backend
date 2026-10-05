import { createOpenAI } from '@ai-sdk/openai'

const provider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY
})

export const chatModel = provider.chat('z-ai/glm-5.3-flash')
