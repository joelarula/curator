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

export function setLogLevel(level: string): void {
  const norm = level.toLowerCase();
  process.env.LOG_LEVEL = norm;
  if (norm === 'silent' || norm === 'none') {
    logger.silent = true;
    for (const transport of logger.transports) {
      transport.silent = true;
    }
  } else {
    logger.silent = false;
    logger.level = norm;
    for (const transport of logger.transports) {
      transport.silent = false;
      transport.level = norm;
    }
  }
}

// Redirect library warnings (such as @google/genai dual key notice) to debug level
const origConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Both GOOGLE_API_KEY and GEMINI_API_KEY are set')) {
    logger.debug(args.join(' '));
    return;
  }
  origConsoleWarn(...args);
};

