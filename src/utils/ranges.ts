import { readdir } from 'node:fs/promises'
import * as path from 'node:path'

export interface BlockedIpResult {
  blocked: boolean
  list: string | null
  range: string | null
}

const IPV6_BITS = 128n
const IPV6_FULL_MASK = (1n << IPV6_BITS) - 1n
const NETWORKS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h
const BLOCKED_DIR = path.resolve(process.cwd(), 'ranges')
const asnBanList: number[] = [
  63023, // free vpn servers
  62005, // more free vpns
  14618, // useless scrapers with chromium runing

  // expressvpn
  206092,
  137409,
  262287,

  // tor exits
  60729,
  215125
]


type ParsedIp =
  | { version: 4; value: number }
  | { version: 6; value: bigint }

type ParsedCidr =
  | { version: 4; network: number; mask: number; prefix: number }
  | { version: 6; network: bigint; mask: bigint; prefix: number }

interface AsnMatch {
  asn: number | null
  range: string | null
}

interface NetworkAsnRecord {
  asn: number
  cidr: string
  parsed: ParsedCidr
}

let networksCache: NetworkAsnRecord[] | null = null
let networkRefreshPromise: Promise<void> | null = null
let networksCheckedAt = 0
let networksEtag: string | null = null

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
    return { version: 4, network: ip.value & mask, mask, prefix }
  }

  if (prefix < 0 || prefix > 128) return null
  const mask =
    prefix === 0
      ? 0n
      : (IPV6_FULL_MASK ^ ((1n << (IPV6_BITS - BigInt(prefix))) - 1n)) & IPV6_FULL_MASK

  return { version: 6, network: ip.value & mask, mask, prefix }
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

function parseCsvNetworks(text: string): NetworkAsnRecord[] {
  const records: NetworkAsnRecord[] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line || line === 'network,asn,organization,country') continue

    const firstComma = line.indexOf(',')
    const secondComma = line.indexOf(',', firstComma + 1)
    if (firstComma === -1 || secondComma === -1) continue

    const cidr = line.slice(0, firstComma).trim()
    const asnText = line.slice(firstComma + 1, secondComma).trim()
    if (!cidr || !/^\d+$/.test(asnText)) continue

    const parsed = parseCidr(cidr)
    if (!parsed) continue

    records.push({
      asn: Number(asnText),
      cidr,
      parsed
    })
  }

  return records
}

async function refreshNetworksCache(force: boolean = false): Promise<void> {
  if (networkRefreshPromise) return networkRefreshPromise

  networkRefreshPromise = (async () => {
    const isFresh =
      networksCache !== null &&
      networksCheckedAt > 0 &&
      Date.now() - networksCheckedAt < NETWORKS_REFRESH_INTERVAL_MS

    if (!force && isFresh) {
      return
    }

    try {
      const headResponse = await fetch('https://ip.guide/bulk/networks.csv', {
        method: 'HEAD',
        redirect: 'follow'
      })
      if (!headResponse.ok) {
        throw new Error(`failed to fetch ip.guide head with ${headResponse.status}`)
      }

      const remoteEtag = headResponse.headers.get('etag')
      const shouldDownload =
        networksCache === null || !remoteEtag || !networksEtag || remoteEtag !== networksEtag

      if (shouldDownload) {
        const downloadResponse = await fetch('https://ip.guide/bulk/networks.csv', {
          redirect: 'follow'
        })
        if (!downloadResponse.ok) {
          throw new Error(`failed to fetch ip.guide with ${downloadResponse.status}`)
        }

        const content = await downloadResponse.text()
        networksCache = parseCsvNetworks(content)
      }

      networksCheckedAt = Date.now()
      networksEtag = remoteEtag ?? networksEtag
    } catch (error) {
      if (networksCache === null) networksCache = []

      console.error('Failed to refresh ASN network ranges', error)
    }
  })().finally(() => {
    networkRefreshPromise = null
  })

  return networkRefreshPromise
}

async function resolveIpAsn(parsedIp: ParsedIp): Promise<AsnMatch> {
  await refreshNetworksCache()
  const records = networksCache ?? []
  let bestMatch: NetworkAsnRecord | null = null

  for (const record of records) {
    if (parsedIp.version === 4 && record.parsed.version === 4) {
      if ((parsedIp.value & record.parsed.mask) === record.parsed.network) {
        if (bestMatch == null || record.parsed.prefix > bestMatch.parsed.prefix) {
          bestMatch = record
        }
      }
    }

    if (parsedIp.version === 6 && record.parsed.version === 6) {
      if ((parsedIp.value & record.parsed.mask) === record.parsed.network) {
        if (bestMatch == null || record.parsed.prefix > bestMatch.parsed.prefix) {
          bestMatch = record
        }
      }
    }
  }

  if (bestMatch) {
    return {
      asn: bestMatch.asn,
      range: bestMatch.cidr
    }
  }

  return {
    asn: null,
    range: null
  }
}

export async function checkIpRanges(ip: string): Promise<BlockedIpResult> {
  const parsedIp = parseIp(ip)
  if (parsedIp == null) {
    return { blocked: false, list: null, range: null }
  }

  const asnMatch = await resolveIpAsn(parsedIp)
  const entries = await readdir(BLOCKED_DIR, { withFileTypes: true })

  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.txt'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))

  for (const fileName of files) {
    const filePath = path.join(BLOCKED_DIR, fileName)
    const content = await Bun.file(filePath).text()
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

  if (asnMatch.asn !== null && asnBanList.includes(asnMatch.asn)) {
    return {
      blocked: true,
      list: `asn:${asnMatch.asn}`,
      range: asnMatch.range
    }
  }

  return {
    blocked: false,
    list: null,
    range: null
  }
}

const networkRefreshTimer = setInterval(() => {
  void refreshNetworksCache(true)
}, NETWORKS_REFRESH_INTERVAL_MS)

networkRefreshTimer.unref?.()
void refreshNetworksCache()
