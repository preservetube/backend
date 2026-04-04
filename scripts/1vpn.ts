const freeLocationsText = await(await fetch('https://raw.githubusercontent.com/1vpn/browser_extension/b58394076cc61beda2a6cc2292915180db58bc17/src/utils/freeLocations.js')).text()
const freeLocations = JSON.parse(freeLocationsText.replace('const freeLocations = ', '').replace('export default freeLocations', '').trim())

for (const l of Object.entries(freeLocations).filter(h => h[1].isPremium != true)) {
  for (const h of l[1].hosts) {
    const v4 = await (await fetch('https://ipinfo.io', {
      proxy: `https://a2epfq5ugq0u:ptkx3fqg6v7n@${h.hostname}:${h.port}`,
      headers: {
        'user-agent': 'curl/8.4.0'
      }
    })).json()
    console.log(v4.ip + '/32')
  }
}