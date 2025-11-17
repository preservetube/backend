const healthStatus: Record<string, string> = {}

async function checkHealth() {
  const metadataServers: string[] = [process.env.METADATA!, process.env.ALTERNATIVE_METADATA!]
  await Promise.all(metadataServers.map(async (m) => {
    try {
      const req = await fetch(m + '/health')
      healthStatus[m] = req.ok ? 'healthy' : 'unhealthy'
    } catch (_) {
      healthStatus[m] = 'unhealthy'
    }
  }))

  console.log(`checked health status - ${Object.entries(healthStatus).map(h => `${h[0]} ${h[1]}`).join(', ')}`)
}

checkHealth()
setInterval(checkHealth, 5 * 60000)

export default healthStatus