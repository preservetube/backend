import { format } from 'date-fns';

function createSitemapXML(urls: string[]) {
  const xml = urls.map(url => `
    <url>
      <loc>${encodeURI(url)}</loc>
      <changefreq>never</changefreq>
      <priority>0.7</priority>
    </url>
  `).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${xml}
</urlset>`;
}

function createSitemapIndexXML(sitemaps: string[]) {
  const xml = sitemaps.map(sitemap => `
    <sitemap>
      <loc>${encodeURI(sitemap)}</loc>
      <lastmod>${format(new Date(), 'yyyy-MM-dd')}</lastmod>
    </sitemap>
  `).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${xml}
</sitemapindex>`;
}

export { createSitemapXML, createSitemapIndexXML }