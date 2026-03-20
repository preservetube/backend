import * as fs from 'node:fs'

async function getARecords(hostname: string): Promise<string[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
    hostname
  )}&type=A`;

  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
  });

  if (!res.ok) {
    throw new Error(`dns query failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    Status: number;
    Answer?: Array<{ name: string; type: number; data: string }>;
  };

  if (body.Status !== 0 || !body.Answer) {
    return [];
  }

  return body.Answer.filter((a) => a.type === 1).map((a) => a.data);
}

const hostnames = ['de-hub.freeruproxy.ink', 'us-hub.freeruproxy.ink', 'fr-hub.freeruproxy.ink', 'nl-hub.freeruproxy.ink']
for (const h of hostnames) {
  const records = await getARecords(h)
  fs.appendFileSync('ranges/vpnly.txt', records.map(r => r + '/32').join('\n') + '\n')
}