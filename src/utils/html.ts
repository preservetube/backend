import { minify } from 'html-minifier-next';
import { Eta } from 'eta';
import path from 'path';

export const m = async (html: string) => {
  return await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true
  })
}

export const eta = new Eta({ views: path.join(__dirname, '../templates'), functionHeader: `const hostname = "${process.env.SERVER_NICKNAME}"` })