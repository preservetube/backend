import redis from '@/utils/redis'

const SESSION_COOKIE = 'pt_admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {}

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey || rawValue.length === 0) return acc

    acc[rawKey] = decodeURIComponent(rawValue.join('='))
    return acc
  }, {})
}

function getSessionToken(cookieHeader?: string): string | undefined {
  return parseCookieHeader(cookieHeader)[SESSION_COOKIE]
}

async function createAdminSession(): Promise<string> {
  const token = crypto.randomUUID()
  await redis.set(`admin:session:${token}`, '1', 'EX', SESSION_TTL_SECONDS)
  return token
}

async function isValidAdminSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  return (await redis.get(`admin:session:${token}`)) === '1'
}

async function destroyAdminSession(token: string): Promise<void> {
  await redis.del(`admin:session:${token}`)
}

function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/admin; HttpOnly; SameSite=Strict; Secure`
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/admin; HttpOnly; SameSite=Strict; Secure`
}

export {
  getSessionToken,
  createAdminSession,
  isValidAdminSession,
  destroyAdminSession,
  buildSessionCookie,
  clearSessionCookie
}
