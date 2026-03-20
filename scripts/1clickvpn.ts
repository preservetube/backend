const oneClickVpn = await (await fetch('https://1clickvpn.net/api/v1/servers/')).json()
Bun.write('ranges/1clickvpn.txt', oneClickVpn.flatMap(v => v.nodes.map(n => n.ip + '/32')).join('\n'))