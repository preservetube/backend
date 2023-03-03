const Redis = require('ioredis')
const logger = require("./logger.js")

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASS,
});

redis.on('ready', function () {
    logger.info({ message: 'Connected to redis!' })
});

module.exports = redis