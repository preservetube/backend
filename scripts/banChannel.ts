import redis from '@/utils/redis'

const [channelId] = Bun.argv.slice(2)

if (!channelId) {
  console.error('Usage: bun run scripts/banChannel.ts [channelId]')
  process.exit(1)
}

const key = 'slop:banned_channels'
const added = await redis.sadd(key, channelId)
const size = await redis.scard(key)

console.log(`${added ? 'Banned' : 'Already banned'} channel ${channelId} (set size: ${size})`)

await redis.quit()