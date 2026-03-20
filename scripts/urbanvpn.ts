const post = await (await fetch('https://api-pro.falais.com/rest/v1/security/tokens/accs', {
  method: 'POST',
  headers: {
    'authorization': 'Bearer FihZXBoQi83OomWPQgj9VqEFPzRsLz6p',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    "type": "accs",
    "clientApp": {
      "name": "URBAN_VPN_BROWSER_EXTENSION"
    }
  })
})).json()

const servers = await (await fetch('https://stats.falais.com/api/rest/v2/entrypoints/countries', {
  headers: {
    'authorization': `Bearer ${post.value}`,
    'x-client-app': 'URBAN_VPN_BROWSER_EXTENSION'
  }
})).json()

Bun.write('ranges/urbanvpn.txt', servers.countries.elements.flatMap(c => c.servers.elements.map(s => s.address.primary.ip + '/32')).join('\n'))