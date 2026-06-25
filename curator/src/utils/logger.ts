import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let metaString = Object.keys(meta).length ? '\n' + JSON.stringify(meta, null, 2) : '';
      return `[${timestamp}] ${level}: ${message}${metaString}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});
