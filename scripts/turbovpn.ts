const json = await (await fetch('https://turbovpn.com/api/mms/serverlist/v1/webext/servers_list', {
  method: 'POST',
  headers: {
    'X-App-Type': '302',
    'X-App-Ver-Code': '202507111355',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    "country": "NL",
    "user_ip": "1.1.1.1",
    "os_lang": "en-us",
    "login_id": "0"
  })
})).json()
Bun.write('ranges/turbovpn.txt', json.servers.map(s => s.host_ip + '/32').join('\n'))