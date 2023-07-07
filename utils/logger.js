const winston = require('winston')
const { Logtail } = require("@logtail/node")
const { LogtailTransport } = require("@logtail/winston")

const logtail = new Logtail("YFQdKmZgGvxPpusqxCSxsj2b")

const logger = winston.createLogger({
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format:winston.format.combine(
                winston.format.timestamp({format: 'MMM-DD-YYYY HH:mm:ss'}),
                winston.format.printf(info => `${[info.timestamp]}: ${info.message}`),
            )}),
        new winston.transports.File({
            filename: 'logs/client.log',
            format:winston.format.combine(
                winston.format.timestamp({format: 'MMM-DD-YYYY HH:mm:ss'}),
                winston.format.printf(info => `${[info.timestamp]}: ${info.message}`),
            )}),
        new LogtailTransport(logtail, {
            level: 'error'
        })
    ],
});

module.exports = logger