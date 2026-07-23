import { readdir } from 'node:fs/promises'

type FfprobeStream = {
  codec_name?: string
  codec_type?: string
  duration?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
}

type FfprobeFormat = {
  duration?: string
}

type FfprobeOutput = {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

function printUsage() {
  console.error('Usage: bun run generateColdRow.ts --input-folder=/mnt/cold --prefix=cold/ --suffix=.webm')
  console.error('Example: bun run generateColdRow.ts --input-folder=./cold --prefix=cold/ --suffix=.webm')
}

function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return 'unknown'
  return `${width}x${height}`
}

function parseDuration(durationText?: string): number {
  if (!durationText) return 0
  const duration = Number(durationText)
  return Number.isFinite(duration) ? duration : 0
}

function parseFps(rate?: string): number {
  if (!rate) return 0
  const [numeratorText, denominatorText] = rate.split('/')
  const numerator = Number(numeratorText)
  const denominator = denominatorText ? Number(denominatorText) : 1

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0
  }

  return Number((numerator / denominator).toFixed(3))
}

async function hashFile(path: string): Promise<string> {
  const proc = Bun.spawn(['sha256sum', '--', path], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || 'sha256sum failed')
  }

  const hash = stdout.trim().split(/\s+/)[0]
  if (!hash) throw new Error('sha256sum did not return a hash')
  return hash
}

async function getVideoMetadata(path: string): Promise<FfprobeOutput> {
  const proc = Bun.spawn([
    'ffprobe',
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path,
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || 'ffprobe failed')
  }

  return JSON.parse(stdout) as FfprobeOutput
}

function normalizeDirectory(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readFlagValue(arg: string, longName: string, shortName: string): string | undefined {
  if (arg.startsWith(`--${longName}=`)) {
    return arg.slice(longName.length + 3)
  }

  if (arg.startsWith(`-${shortName}=`)) {
    return arg.slice(shortName.length + 2)
  }
}

function parseArgs(args: string[]): { inputFolder: string, suffix: string } {
  let inputFolder: string | undefined
  let prefix: string | undefined
  let suffix: string | undefined

  for (const arg of args) {
    inputFolder ??= readFlagValue(arg, 'input-folder', 'input-folder')
    inputFolder ??= readFlagValue(arg, 'input', 'input')
    prefix ??= readFlagValue(arg, 'prefix', 'prefix')
    suffix ??= readFlagValue(arg, 'suffix', 'suffix')
  }

  if (!prefix || !suffix) {
    printUsage()
    process.exit(1)
  }

  return {
    inputFolder: normalizeDirectory(inputFolder ?? prefix),
    suffix,
  }
}

async function readInputIds(inputFolder: string, suffix: string): Promise<string[]> {
  const entries = await readdir(inputFolder, { withFileTypes: true })
  const suffixPattern = new RegExp(`${escapeRegExp(suffix)}$`)

  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(suffix))
    .map(entry => entry.name.replace(suffixPattern, ''))
    .sort()
}

async function generateRow(videoId: string, inputFolder: string, suffix: string) {
  const filePath = `${inputFolder}${videoId}${suffix}`
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    throw new Error(`File not found for ${videoId}: ${filePath}`)
  }

  const filename = filePath.split('/').pop()
  if (!filename) {
    throw new Error(`Invalid file path for ${videoId}: ${filePath}`)
  }

  const [hash, metadata] = await Promise.all([
    hashFile(filePath),
    getVideoMetadata(filePath),
  ])

  const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video')
  const audioStream = metadata.streams?.find(stream => stream.codec_type === 'audio')

  return {
    videoId,
    filename,
    hash,
    hash_algorithm: 'sha256',
    size_bytes: file.size,
    duration_seconds: parseDuration(videoStream?.duration ?? metadata.format?.duration),
    video_codec: videoStream?.codec_name ?? 'unknown',
    audio_codec: audioStream?.codec_name ?? 'unknown',
    resolution: formatResolution(videoStream?.width, videoStream?.height),
    fps: parseFps(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
  }
}

async function main() {
  const { inputFolder, suffix } = parseArgs(Bun.argv.slice(2))
  const ids = await readInputIds(inputFolder, suffix)
  if (ids.length === 0) {
    console.error(`No files ending in ${suffix} found in ${inputFolder}`)
    printUsage()
    process.exit(1)
  }

  for (const videoId of ids) {
    console.log(await generateRow(videoId, inputFolder, suffix))
  }
}

await main()
