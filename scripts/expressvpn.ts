import { sleep } from "bun";

const file = Bun.file('ranges/expressvpn.txt');
const writer = file.writer();

function inetnumToCIDR(value: string): string[] {
  let [start, end] = value.split(' - ').map(ip =>
    ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet), 0) >>> 0
  )

  const cidrs: string[] = []

  while (start <= end) {
    const maxBits = Math.floor(Math.log2(start & -start)) // largest block start allows
    const fitBits = Math.floor(Math.log2(end - start + 1)) // largest block size fits
    const size = Math.min(maxBits, fitBits)
    const ip = [(start >>> 24) & 255, (start >>> 16) & 255, (start >>> 8) & 255, start & 255].join('.')
    cidrs.push(`${ip}/${32 - size}`)
    start += 2 ** size
  }

  return cidrs
}

const orgs = await (await fetch('https://apps.db.ripe.net/db-web-ui/api/whois/search?abuse-contact=true&ignore404=true&managed-attributes=true&resource-holder=true&type-filter=ORGANISATION&flags=r&offset=0&limit=200&query-string=VPN%20Consumer')).json()
const orgId = orgs.objects.object.map(o => o.attributes.attribute.find(a => a.name === 'organisation').value)

for (const o of orgId) {
  const orgReq = await fetch(`https://apps.db.ripe.net/db-web-ui/api/whois/search?abuse-contact=true&ignore404=true&managed-attributes=true&resource-holder=true&type-filter=INETNUM,INET6NUM&inverse-attribute=ORG&flags=r&offset=0&limit=200&query-string=${o}`)
  if (orgReq.status == 404) {
    console.log(`no inetnum/inet6num for ${o}`)
    continue
  }
  const org = await orgReq.json()
  const primaries = org.objects.object.map(o => o['primary-key'].attribute[0])
  for (const p of primaries) {
    if (p.name == 'inetnum') {
      console.log(inetnumToCIDR(p.value).join('\n'))
      writer.write(inetnumToCIDR(p.value).join('\n') + '\n')
    } else if (p.name == 'inet6num') {
      console.log(p.value)
      writer.write(p.value + '\n')
    }
  }

  writer.flush()

  if (orgReq.headers.get('X-Rate-Limit-Remaining') == '1') {
    console.log('sleeping 5s')
    await sleep(5000)
  }
}

writer.end();