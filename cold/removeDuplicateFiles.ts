import { db } from '@/utils/database'
import type { File } from '@/types'

async function main() {
  const args = Bun.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('Fetching all files to find duplicates...')
  const allFiles = await db.selectFrom('files').selectAll().execute()
  
  // Group files by hash
  const filesByHash = new Map<string, File[]>()
  for (const file of allFiles) {
    const group = filesByHash.get(file.hash) ?? []
    group.push(file)
    filesByHash.set(file.hash, group)
  }

  const uuidsToDelete: string[] = []
  let duplicateCount = 0

  for (const [hash, group] of filesByHash.entries()) {
    if (group.length > 1) {
      // Find duplicates within the group by comparing properties
      const uniqueFiles: File[] = []
      
      for (const file of group) {
        // Check if `file` is a duplicate of any in `uniqueFiles`
        const isDuplicate = uniqueFiles.some(uniqueFile => {
          return (
            file.videoId === uniqueFile.videoId &&
            file.filename === uniqueFile.filename &&
            file.hash_algorithm === uniqueFile.hash_algorithm &&
            file.size_bytes == uniqueFile.size_bytes &&
            file.duration_seconds == uniqueFile.duration_seconds &&
            file.video_codec === uniqueFile.video_codec &&
            file.audio_codec === uniqueFile.audio_codec &&
            file.resolution === uniqueFile.resolution &&
            file.fps == uniqueFile.fps
          )
        })

        if (isDuplicate) {
          uuidsToDelete.push(file.uuid as string)
          duplicateCount++
        } else {
          uniqueFiles.push(file)
        }
      }
    }
  }

  if (uuidsToDelete.length === 0) {
    console.log('No duplicate files found.')
    return
  }

  console.log(`Found ${duplicateCount} duplicate file(s) across ${filesByHash.size} unique hash(es).`)

  if (dryRun) {
    console.log(`\n[DRY RUN] Would delete the following ${uuidsToDelete.length} UUID(s):`)
    console.log(uuidsToDelete.join('\n'))
    console.log('\nRun without --dry-run to execute the deletion.')
    return
  }

  console.log(`Deleting ${uuidsToDelete.length} duplicate file(s)...`)
  
  // Chunk the deletions in case there are many
  const chunkSize = 1000
  for (let i = 0; i < uuidsToDelete.length; i += chunkSize) {
    const chunk = uuidsToDelete.slice(i, i + chunkSize)
    await db.deleteFrom('files')
      .where('uuid', 'in', chunk)
      .execute()
  }

  console.log('Successfully deleted duplicate files.')
}

try {
  await main()
} catch (error) {
  console.error(error)
} finally {
  await db.destroy()
}
