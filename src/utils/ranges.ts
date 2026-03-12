import { readdir, readFile } from 'node:fs/promises'
import * as path from 'node:path'

export interface BlockedIpResult {
  blocked: boolean
  list: string | null
  range: string | null
}

const IPV6_BITS = 128n
const IPV6_FULL_MASK = (1n << IPV6_BITS) - 1n

type ParsedIp =
  | { version: 4; value: number }
  | { version: 6; value: bigint }

type ParsedCidr =
  | { version: 4; network: number; mask: number }
  | { version: 6; network: bigint; mask: bigint }

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null

  let result = 0
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const value = Number(part)
    if (value < 0 || value > 255) return null
    result = (result << 8) + value
  }

  return result >>> 0
}

function parseIpv6(ip: string): bigint | null {
  let input = ip.trim().toLowerCase()
  if (!input) return null

  const zoneSeparator = input.indexOf('%')
  if (zoneSeparator >= 0) {
    input = input.slice(0, zoneSeparator)
  }

  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':')
    if (lastColon === -1) return null

    const ipv4Part = input.slice(lastColon + 1)
    const ipv4Int = ipv4ToInt(ipv4Part)
    if (ipv4Int === null) return null

    const high = ((ipv4Int >>> 16) & 0xffff).toString(16)
    const low = (ipv4Int & 0xffff).toString(16)
    input = `${input.slice(0, lastColon)}:${high}:${low}`
  }

  if (input.split('::').length > 2) return null

  const hasCompression = input.includes('::')
  const [leftPart, rightPart = ''] = input.split('::')
  const left = leftPart ? leftPart.split(':').filter(Boolean) : []
  const right = rightPart ? rightPart.split(':').filter(Boolean) : []

  const isValidHextet = (value: string) => /^[0-9a-f]{1,4}$/.test(value)
  if (!left.every(isValidHextet) || !right.every(isValidHextet)) return null

  if (hasCompression) {
    if (left.length + right.length > 7) return null
  } else if (left.length !== 8) {
    return null
  }

  const missingCount = hasCompression ? 8 - (left.length + right.length) : 0
  const groups = [...left, ...Array(Math.max(0, missingCount)).fill('0'), ...right]
  if (groups.length !== 8) return null

  let result = 0n
  for (const group of groups) {
    result = (result << 16n) + BigInt(parseInt(group, 16))
  }

  return result
}

function parseIp(input: string): ParsedIp | null {
  const ipv4 = ipv4ToInt(input)
  if (ipv4 !== null) return { version: 4, value: ipv4 }

  const ipv6 = parseIpv6(input)
  if (ipv6 !== null) return { version: 6, value: ipv6 }

  return null
}

function parseCidr(cidr: string): ParsedCidr | null {
  const [baseIp, prefixText] = cidr.split('/')
  if (!baseIp || !prefixText || !/^\d+$/.test(prefixText)) return null

  const prefix = Number(prefixText)

  const ip = parseIp(baseIp)
  if (!ip) return null

  if (ip.version === 4) {
    if (prefix < 0 || prefix > 32) return null
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return { version: 4, network: ip.value & mask, mask }
  }

  if (prefix < 0 || prefix > 128) return null
  const mask =
    prefix === 0
      ? 0n
      : (IPV6_FULL_MASK ^ ((1n << (IPV6_BITS - BigInt(prefix))) - 1n)) & IPV6_FULL_MASK

  return { version: 6, network: ip.value & mask, mask }
}

function isIpInCidr(ip: ParsedIp, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  if (!parsed) return false

  if (ip.version === 4 && parsed.version === 4) {
    return (ip.value & parsed.mask) === parsed.network
  }

  if (ip.version === 6 && parsed.version === 6) {
    return (ip.value & parsed.mask) === parsed.network
  }

  return false
}

function extractCidrs(text: string): string[] {
  const cidrs: string[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    const cleaned = line.split('#')[0]?.trim()
    if (!cleaned) continue

    const tokens = cleaned.split(/\s+/)
    for (const token of tokens) {
      if (!token.includes('/')) continue
      cidrs.push(token.replace(/^[,;]+|[,;]+$/g, ''))
    }
  }

  return cidrs
}

export async function checkIpRanges(ip: string): Promise<BlockedIpResult> {
  const parsedIp = parseIp(ip)
  if (parsedIp == null) {
    return { blocked: false, list: null, range: null }
  }

  const blockedDir = path.resolve(process.cwd(), 'ranges')
  const entries = await readdir(blockedDir, { withFileTypes: true })

  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.txt'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))

  for (const fileName of files) {
    const filePath = path.join(blockedDir, fileName)
    const content = await readFile(filePath, 'utf8')
    const cidrs = extractCidrs(content)

    for (const cidr of cidrs) {
      if (isIpInCidr(parsedIp, cidr)) {
        return {
          blocked: path.basename(fileName, '.txt') != 'cloudflare',
          list: path.basename(fileName, '.txt'),
          range: cidr
        }
      }
    }
  }

  return { blocked: false, list: null, range: null }
}