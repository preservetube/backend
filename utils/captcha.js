const fetch = require('node-fetch')

async function checkCaptcha(response) {
    const confirm = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: JSON.stringify({
            'response': response,
            'secret': process.env.CAPTCHA_SECRET
        }),
        headers: {
            'content-type': 'application/json'
        }
    })).json()

    return confirm.success
}

module.exports = { checkCaptcha }