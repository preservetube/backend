import { db } from '@/utils/database'
import type { NewFile } from '@/types'

const DEFAULT_INPUT_PATH = './coldRows.txt'

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

function getLineAndColumn(text: string, index: number): { line: number; column: number; context: string } {
  const lines = text.slice(0, index).split('\n')
  const line = lines.length
  const column = lines[lines.length - 1].length + 1

  const allLines = text.split('\n')
  const startLineIdx = Math.max(0, line - 3)
  const endLineIdx = Math.min(allLines.length - 1, line + 2)

  const contextLines = allLines.slice(startLineIdx, endLineIdx + 1).map((l, i) => {
    const currentLineNum = startLineIdx + i + 1
    const prefix = currentLineNum === line ? '-> ' : '   '
    return `${prefix}${String(currentLineNum).padStart(4, ' ')} | ${l}`
  })

  return {
    line,
    column,
    context: contextLines.join('\n'),
  }
}

function extractObjectBlocks(text: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let startIndex = -1
  const openBraceIndices: number[] = []

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (char === '{') {
      if (depth === 0) {
        startIndex = index
      }
      depth += 1
      openBraceIndices.push(index)
      continue
    }

    if (char !== '}') continue

    depth -= 1
    openBraceIndices.pop()

    if (depth < 0) {
      const { line, column, context } = getLineAndColumn(text, index)
      console.error(`Error: Unexpected closing brace at line ${line}, column ${column}:\n${context}`)
      throw new Error(`Unexpected closing brace at position ${index}`)
    }

    if (depth === 0 && startIndex !== -1) {
      blocks.push(text.slice(startIndex, index + 1))
      startIndex = -1
    }
  }

  if (depth !== 0) {
    console.error(`Error: Input contains an unterminated object literal (depth: ${depth}).`)
    console.error(`There are ${openBraceIndices.length} unclosed '{' brace(s).`)

    const maxToPrint = Math.min(openBraceIndices.length, 3)
    for (let i = 0; i < maxToPrint; i++) {
      const braceIndex = openBraceIndices[i]
      const { line, column, context } = getLineAndColumn(text, braceIndex)
      console.error(`\nUnclosed '{' #${i + 1} at line ${line}, column ${column}:`)
      console.error(context)
    }

    if (openBraceIndices.length > maxToPrint) {
      console.error(`\n... and ${openBraceIndices.length - maxToPrint} more unclosed brace(s).`)
    }

    throw new Error('Input contains an unterminated object literal')
  }

  return blocks
}

function parseColdRow(block: string): NewFile {
  const parsed = Function(`"use strict"; return (${block})`)()

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed row is not an object')
  }

  return parsed as NewFile
}

async function loadRows(inputPath: string): Promise<NewFile[]> {
  const text = await Bun.file(inputPath).text()
  const blocks = extractObjectBlocks(text)

  if (blocks.length === 0) {
    throw new Error(`No row objects found in ${inputPath}`)
  }

  return blocks.map(parseColdRow)
}

async function main() {
  const args = Bun.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const inputPath = args.find(arg => arg !== '--dry-run') ?? DEFAULT_INPUT_PATH
  const rows = await loadRows(inputPath)
  const videoIds = [...new Set(rows.map(row => row.videoId))]

  const uniqueHashes = [...new Set(rows.map(r => r.hash))]
  const existingFilesChunks = []
  for (const chunk of chunkArray(uniqueHashes, 1000)) {
    const filesChunk = await db.selectFrom('files')
      .where('hash', 'in', chunk)
      .selectAll()
      .execute()
    existingFilesChunks.push(filesChunk)
  }
  const existingFiles = existingFilesChunks.flat()

  const rowsToInsert: NewFile[] = []
  for (const row of rows) {
    const matches = existingFiles.filter(f => f.hash === row.hash)
    const isDuplicate = matches.some(match => {
      return Object.keys(row).every(key => {
        const k = key as keyof NewFile
        return row[k] == (match as any)[k]
      })
    })

    if (!isDuplicate) {
      rowsToInsert.push(row)
    }
  }

  if (dryRun) {
    console.log(`Parsed ${rows.length} row(s) from ${inputPath}`)
    console.log(`Would insert ${rowsToInsert.length} new row(s) and skip ${rows.length - rowsToInsert.length} duplicate(s)`)
    console.log(JSON.stringify(rowsToInsert, null, 2))
    console.log(`Would set deletion_stage to cold_storage for ${videoIds.length} video(s)`)
    return
  }

  if (rowsToInsert.length > 0) {
    for (const chunk of chunkArray(rowsToInsert, 100)) {
      await db.insertInto('files')
        .values(chunk)
        .execute()
    }
  }

  for (const chunk of chunkArray(videoIds, 1000)) {
    await db.updateTable('videos')
      .where('id', 'in', chunk)
      .set({ deletion_stage: 'cold_storage' })
      .execute()
  }

  console.log(`Inserted ${rowsToInsert.length} row(s) from ${inputPath}`)
  console.log(`Skipped ${rows.length - rowsToInsert.length} duplicate row(s)`)
  console.log(`Set deletion_stage to cold_storage for ${videoIds.length} video(s)`)
}

try {
  await main()
} finally {
  await db.destroy()
}
