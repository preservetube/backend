import redis from '@/utils/redis'

const RATE_LIMIT_COOKIE = 'pt_rlid'
const RATE_LIMIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const DEFAULT_MB_LIMIT = 250
const NEW_IP_MB_LIMIT = 150
const NEW_IP_TRUST_WINDOW_MS = 6 * 60 * 60 * 1000 // 6h

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {}

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey || rawValue.length === 0) return acc

    acc[rawKey] = decodeURIComponent(rawValue.join('='))
    return acc
  }, {})
}

export const getRateLimitCookieName = (): string => RATE_LIMIT_COOKIE

export const getRateLimitCookie = (cookieHeader?: string): string | undefined => {
  return parseCookieHeader(cookieHeader)[RATE_LIMIT_COOKIE]
}

export const createRateLimitCookieValue = (): string => crypto.randomUUID()

export const buildRateLimitCookie = (value: string): string => {
  return `${RATE_LIMIT_COOKIE}=${encodeURIComponent(value)}; Max-Age=${RATE_LIMIT_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax; Secure`
}

const isIpRateLimitSubject = (subject: string): boolean => subject.startsWith('ip:')

const getSubjectTrustKey = (subject: string): string => `rate-limit:first-seen:${Bun.hash(subject).toString()}`

export const getRateLimitState = async (subject: string): Promise<{ limit: number, isNewVisitor: boolean }> => {
  if (!isIpRateLimitSubject(subject)) {
    return { limit: DEFAULT_MB_LIMIT, isNewVisitor: false }
  }

  const now = Date.now()
  const trustKey = getSubjectTrustKey(subject)
  await redis.set(trustKey, now.toString(), 'NX')

  const firstSeen = Number(await redis.get(trustKey) || now)
  if (Number.isNaN(firstSeen)) {
    return { limit: NEW_IP_MB_LIMIT, isNewVisitor: true }
  }

  const isNewVisitor = now - firstSeen < NEW_IP_TRUST_WINDOW_MS
  return {
    limit: isNewVisitor ? NEW_IP_MB_LIMIT : DEFAULT_MB_LIMIT,
    isNewVisitor
  }
}

export const getRateLimitSubjects = (ip: string, visitorId?: string): string[] => {
  const subjects = new Set<string>()

  if (ip) subjects.add(`ip:${ip}`)
  if (visitorId) subjects.add(`visitor:${visitorId}`)

  return [...subjects]
}
