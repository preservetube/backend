const fetch = require('node-fetch')

async function checkCaptcha(response) {
    const confirm = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
            'response': response,
            'secret': process.env.CAPTCHA_SECRET
        })
    })).json()

    return confirm.success
}

module.exports = { checkCaptcha }