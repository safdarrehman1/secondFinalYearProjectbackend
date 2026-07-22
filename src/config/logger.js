const winston = require('winston');
const config = require('./config');

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  format: config.env === 'production'
    ? winston.format.combine(
      enumerateErrorFormat(),
      winston.format.timestamp(),
      winston.format.splat(),
      winston.format.json(),
    )
    : winston.format.combine(
      enumerateErrorFormat(),
      winston.format.colorize(),
      winston.format.splat(),
      winston.format.printf(({ level, message }) => `${level}: ${message}`),
    ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

module.exports = logger;
