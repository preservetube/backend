const ID = '[\\w-]{11}'
const URL_PATTERNS = [
  // watch?v=ID, also inside &amp; escaped html and attribution links
  new RegExp(`youtube(?:-nocookie)?\\.com/[^\\s"'<>]*?[?&;]v=(${ID})(?![\\w-])`, 'gi'),
  // /embed/ID /shorts/ID /live/ID /v/ID /e/ID and youtu.be/ID
  new RegExp(`(?:youtube(?:-nocookie)?\\.com/(?:embed|shorts|live|v|e)/|youtu\\.be/)(${ID})(?![\\w-])`, 'gi')
]

// ids straight out of youtube urls (any form)
export function extractUrlIds(text: string): string[] {
  const decoded = text.replace(/%3D/gi, '=').replace(/%3F/gi, '?').replace(/%26/gi, '&').replace(/%2F/gi, '/')
  const ids = new Set<string>()
  for (const pattern of URL_PATTERNS) {
    for (const match of decoded.matchAll(pattern)) ids.add(match[1]!)
  }
  return [...ids]
}

// loose 11-char tokens that look like an id but were pasted without a url.
// prose words are 11 chars too ("information"), so real ids must not look like a plain word,
// and the caller verifies each candidate against youtube before trusting it.
export function extractBareIds(text: string, exclude: Set<string>): string[] {
  const withoutUrls = text.replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
  const ids = new Set<string>()
  for (const match of withoutUrls.matchAll(/(?<![\w-])[\w-]{11}(?![\w-])/g)) {
    const token = match[0]
    if (exclude.has(token)) continue
    if (/^[A-Za-z]?[a-z]+$/.test(token) || /^\d+$/.test(token)) continue
    ids.add(token)
  }
  return [...ids].slice(0, 20)
}
