import { minify } from 'html-minifier-next';
import * as age from 'age-encryption'
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

export const error = async ({ error }: any) => {
  const debuggingInfo = {
    serverNickname: process.env.SERVER_NICKNAME,
    currentTime: new Date().toISOString(),
    errorStack: error.stack
  }

  const e = new age.Encrypter() // my public key
  e.addRecipient('age19f5carv77e9m7m3egef6dhmj3ltj5t84eca42ag84yn2ljwv94tqmh8le4')
  const ciphertext = await e.encrypt(JSON.stringify(debuggingInfo))
  const armored = age.armor.encode(ciphertext)
  
  return `you found a bug! ${error.message}

does this error keep persiting? please report it to admin@preservetube.com with the following debugging info:
(please copy paste this entire page into the email)

${armored}`
}