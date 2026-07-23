import { getVideo } from '@/utils/metadata'
import { db } from '@/utils/database'
import * as fs from 'node:fs'

type FileEntry = {
  id: string
  size: number
  line: string
}

type VideoStatus = {
  id: string
  size: number
  title: string | null
  stillUp: boolean
}

const INPUT_PATH = 'ratios3.txt'
const OUTPUT_PATH = 'colds3.txt'
const CONCURRENCY = 2
const checkOnlyChannelId = false

function parseOutput(text: string): FileEntry[] {
  const entries: FileEntry[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const ratioEntry = parseRatioEntry(trimmed, line)
    if (ratioEntry) {
      entries.push(ratioEntry)
      continue
    }

    const lsEntry = parseLsEntry(trimmed, line)
    if (lsEntry) {
      entries.push(lsEntry)
    }
  }

  return entries
}

function parseLsEntry(trimmed: string, line: string): FileEntry | null {
  const match = trimmed.match(
    /^[^\s]+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+[A-Za-z]{3}\s+\d{1,2}\s+(?:\d{4}|\d{2}:\d{2})\s+(.+)$/
  )
  if (!match) return null

  const [, sizeText, filename] = match
  const size = Number(sizeText)
  if (!Number.isFinite(size)) return null

  const idMatch = filename.match(/^([^.]+)\.\w+$/)
  const id = idMatch?.[1]
  if (!id) return null

  return { id, size, line }
}

function parseRatioEntry(trimmed: string, line: string): FileEntry | null {
  const columns = trimmed.split('\t')
  if (columns.length < 7) return null

  const [rankText, , , sizeText, , , filename] = columns
  if (!/^\d+$/.test(rankText)) return null

  const size = Number(sizeText)
  if (!Number.isFinite(size)) return null

  const idMatch = filename.match(/^([^.]+)\.\w+$/)
  const id = idMatch?.[1]
  if (!id) return null

  return { id, size, line }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )

  return results
}

async function getVideoWithRetry(id: string, retries = 3, delay = 1000): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const json = await getVideo(id)
      if (json && !json.error) {
        return json
      }
      console.warn(`[Retry ${attempt}/${retries}] getVideo(${id}) returned empty or error:`, json)
    } catch (e: any) {
      console.error(`[Retry ${attempt}/${retries}] getVideo(${id}) threw:`, e)
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }
  return null
}

async function getPageViewsWithRetry(id: string, retries = 3, delay = 1000): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://a.gloe.net/api/stats/preservetube.com/top-stats?period=all&date=2026-04-29&filters=%7B%22page%22%3A%22%2Fwatch%2F${id}%22%7D&with_imported=true&comparison=previous_period&compare_from=undefined&compare_to=undefined&match_day_of_week=true`, {
        headers: {
          'cookie': 'logged_in=true; _plausible_key=SFMyNTY.g3QAAAAFbQAAAAtfY3NyZl90b2tlbm0AAAAYN0drdE52TGVzejBCSHVBdmlTdWQzTXdTbQAAAA9jdXJyZW50X3VzZXJfaWRhAW0AAAAJbGFzdF9zZWVuYmnxNDttAAAACmxvZ2luX2Rlc3RkAANuaWxtAAAAEnNlc3Npb25fdGltZW91dF9hdGJqA6pE.q1ENNi4aJLNquuSIo_1cca054Tj9lWPmalOAnMNuK8A'
        }
      })
      if (response.ok) {
        const aJson = await response.json() as any
        const topStats = aJson?.['top_stats']
        if (Array.isArray(topStats)) {
          const pageViewsObj = topStats.find((s: any) => s.name == 'Total pageviews')
          if (pageViewsObj && typeof pageViewsObj.value === 'number') {
            return pageViewsObj.value
          }
        }
      }
      console.warn(`[Retry ${attempt}/${retries}] Failed to fetch page views for ${id}`)
    } catch (e: any) {
      console.error(`[Retry ${attempt}/${retries}] Fetch page views for ${id} threw:`, e)
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }
  return 0
}

async function main() {
  const text = await Bun.file(INPUT_PATH).text()
  const files = parseOutput(text)

  if (files.length === 0) {
    throw new Error(`No video entries could be parsed from ${INPUT_PATH}`)
  }

  await Bun.write(OUTPUT_PATH, '')

  const statuses = (await mapConcurrent(files, CONCURRENCY, async (file) => {
    const isAlreadyCold = await db.selectFrom('files')
      .where('videoId', '=', file.id)
      .selectAll()
      .executeTakeFirst()

    if (isAlreadyCold) return {
      id: file.id,
      size: file.size,
      title: 'already cold',
      stillUp: false,
    }

    const archivedMetadata = await db.selectFrom('videos')
      .where('id', '=', file.id)
      .selectAll()
      .executeTakeFirst()

    if (!archivedMetadata || archivedMetadata.deletion_stage) {
      console.log(`${file.id} on disk, but not in database`)
      fs.appendFileSync('missing.txt', `${file.line}\n`)
      return false
    }

    const channelList = ['UCMnULQ6F6kLDAHxofDWIbrw', 'UCWEoAwbfSQtgB-_OUN-g7gg']
    if (archivedMetadata?.channelId && channelList.includes(archivedMetadata.channelId)) {
      console.log(file.id, archivedMetadata?.channelId, 'added based on channel id')
      fs.appendFileSync(OUTPUT_PATH, `${file.line}\n`)
      return {
        id: file.id,
        size: file.size,
        title: archivedMetadata.title,
        stillUp: true
      }
    }

    if (checkOnlyChannelId) return {
      id: file.id,
      size: file.size,
      title: archivedMetadata.title,
      stillUp: true
    }

    const json = await getVideoWithRetry(file.id) as { videoDetails?: { title?: string } } | null
    console.log(json)
    const title = json?.videoDetails?.title ?? null
    const stillUp = Boolean(title)

    const pageViews = await getPageViewsWithRetry(file.id)

    console.log(file.id, archivedMetadata?.channelId, archivedMetadata?.title, stillUp, pageViews)

    if ((stillUp && pageViews < 5) || (!stillUp && pageViews < 2)) {
      fs.appendFileSync(OUTPUT_PATH, `${file.line}\n`)
    }

    const status: VideoStatus = {
      id: file.id,
      size: file.size,
      title,
      stillUp,
    }

    return status
  })).filter(s => s != false)

  const stillUpCount = statuses.filter((status) => status.stillUp).length
  const gone = statuses
    .filter((status) => !status.stillUp)
    .sort((a, b) => b.size - a.size)

  console.log(`Parsed ${files.length} files from ${INPUT_PATH}`)
  console.log(`Checked ${files.length} videos`)
  console.log(`Still up: ${stillUpCount}`)
  console.log(`Gone: ${gone.length}`)
  console.log(`Wrote ${OUTPUT_PATH}`)

  if (gone.length === 0) {
    return
  }

  console.log('')
  console.log('Gone videos:')
  console.log('')

  for (const video of gone) {
    console.log(`${formatBytes(video.size)}\t${video.id}`)
  }
}

await main()
