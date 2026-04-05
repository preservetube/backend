const RATE_LIMIT_COOKIE = 'pt_rlid'
const RATE_LIMIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

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

export const getRateLimitSubjects = (ip: string, visitorId?: string): string[] => {
  const subjects = new Set<string>()

  if (ip) subjects.add(`ip:${ip}`)
  if (visitorId) subjects.add(`visitor:${visitorId}`)

  return [...subjects]
}
