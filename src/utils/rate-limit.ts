import redis from '@/utils/redis'

const RATE_LIMIT_COOKIE = 'pt_rlid'
const RATE_LIMIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const DEFAULT_MB_LIMIT = 250
const SUBNET_MB_LIMIT = DEFAULT_MB_LIMIT * 3
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
const isSubnetRateLimitSubject = (subject: string): boolean => subject.startsWith('subnet:')

const getSubjectTrustKey = (subject: string): string => `rate-limit:first-seen:${Bun.hash(subject).toString()}`

const getIpv4Subnet24 = (ip: string): string | undefined => {
  const parts = ip.split('.')
  if (parts.length !== 4) return undefined

  const octets = parts.map(part => Number(part))
  if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
}

const parseIpv6 = (ip: string): string[] | undefined => {
  let input = ip.trim().toLowerCase()
  if (!input) return undefined

  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':')
    if (lastColon === -1) return undefined

    const ipv4Part = input.slice(lastColon + 1)
    const subnet24 = getIpv4Subnet24(ipv4Part)
    if (!subnet24) return undefined

    const ipv4Octets = subnet24.split('.')[0] && ipv4Part.split('.').map(part => Number(part))
    if (!ipv4Octets || ipv4Octets.length !== 4) return undefined

    const high = ((ipv4Octets[0]! << 8) + ipv4Octets[1]!).toString(16)
    const low = ((ipv4Octets[2]! << 8) + ipv4Octets[3]!).toString(16)
    input = `${input.slice(0, lastColon)}:${high}:${low}`
  }

  if (input.split('::').length > 2) return undefined

  const hasCompression = input.includes('::')
  const [leftPart, rightPart = ''] = input.split('::')
  const left = leftPart ? leftPart.split(':').filter(Boolean) : []
  const right = rightPart ? rightPart.split(':').filter(Boolean) : []

  const isValidHextet = (value: string) => /^[0-9a-f]{1,4}$/.test(value)
  if (!left.every(isValidHextet) || !right.every(isValidHextet)) return undefined

  if (hasCompression) {
    if (left.length + right.length > 7) return undefined
  } else if (left.length !== 8) {
    return undefined
  }

  const missingCount = hasCompression ? 8 - (left.length + right.length) : 0
  const groups = [...left, ...Array(Math.max(0, missingCount)).fill('0'), ...right]
  if (groups.length !== 8) return undefined

  return groups.map(group => group.padStart(4, '0'))
}

const getIpv6Subnet48 = (ip: string): string | undefined => {
  const groups = parseIpv6(ip)
  if (!groups) return undefined

  return `${groups[0]}:${groups[1]}:${groups[2]}::/48`
}

const getSubnetRateLimitSubject = (ip: string): string | undefined => {
  const subnet24 = getIpv4Subnet24(ip)
  if (subnet24) return `subnet:${subnet24}`

  const subnet48 = getIpv6Subnet48(ip)
  if (subnet48) return `subnet:${subnet48}`

  return undefined
}

export const getRateLimitState = async (subject: string): Promise<{ limit: number, isNewVisitor: boolean }> => {
  if (isSubnetRateLimitSubject(subject)) {
    return { limit: SUBNET_MB_LIMIT, isNewVisitor: false }
  }

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
  const subnetSubject = getSubnetRateLimitSubject(ip)
  if (subnetSubject) subjects.add(subnetSubject)
  if (visitorId) subjects.add(`visitor:${visitorId}`)

  return [...subjects]
}
