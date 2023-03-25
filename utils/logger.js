const winston = require('winston')
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
    ],
});

module.exports = logger