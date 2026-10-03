import { isIP } from 'node:net'
import redis from '@/utils/redis'
import { checkIpRanges, getIpNetworkRange } from '@/utils/ranges'

const responseKey = (ip: string) => `synthient:response:${ip}`
const banTtlSeconds = 30 * 24 * 60 * 60

function getBlockDecision(body: string) {
  const result = JSON.parse(body) as {
    intelligence?: {
      categories?: string[]
      providers?: { provider?: string, type?: string }[]
      risk_score?: number
    }
  }
  if (!result.intelligence || !Array.isArray(result.intelligence.categories) || !Array.isArray(result.intelligence.providers)) {
    throw new Error('Invalid IP lookup response')
  }

  if (result.intelligence.categories.includes('RESIDENTIAL_PROXY')) {
    return {
      blocked: typeof result.intelligence.risk_score === 'number' && result.intelligence.risk_score > 90,
      blockRange: false
    }
  }

  return {
    blocked: result.intelligence.categories.includes('FREE_VPN') || result.intelligence.providers.some(provider =>
      provider.type === 'FREE_VPN' ||
      provider.provider === 'NORDVPN' ||
      provider.provider === 'PROTONVPN'),
    blockRange: true
  }
}

export async function isSynthientBlocked(ip: string): Promise<boolean> {
  if (!isIP(ip)) return false
  if ((await checkIpRanges(ip)).blocked) return true

  try {
    const cached = await redis.get(responseKey(ip))
    if (cached) return getBlockDecision(cached).blocked
    if (!process.env.SYNTHIENT_API_KEY) return false

    const response = await fetch(`https://api.synthient.com/api/v4/lookup/ip/${encodeURIComponent(ip)}`, {
      headers: { 'x-api-key': process.env.SYNTHIENT_API_KEY },
      signal: AbortSignal.timeout(5000)
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const decision = getBlockDecision(body)
    if (!decision.blocked) {
      await redis.set(responseKey(ip), body, 'EX', 24 * 60 * 60)
      console.log('[synthient] scan allowed')
      return false
    }

    const range = decision.blockRange ? await getIpNetworkRange(ip) : null
    const transaction = redis.multi()
    transaction.set(responseKey(ip), body, 'EX', banTtlSeconds)
    transaction.set(`synthient:blocked-ip:${ip}`, '1', 'EX', banTtlSeconds)
    if (range) transaction.set(`synthient:blocked-range:${range}`, '1', 'EX', banTtlSeconds)
    await transaction.exec()
    console.log('[synthient] scan blocked')
    return true
  } catch {
    console.log('[synthient] scan failed')
    return false
  }
}
