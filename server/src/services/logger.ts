import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';

const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const targets = [
  {
    target: 'pino-pretty',
    options: { colorize: true },
    level: process.env.LOG_LEVEL || 'info'
  },
  {
    target: 'pino/file',
    options: { destination: path.join(logsDir, 'curator.log') },
    level: process.env.LOG_LEVEL || 'info'
  }
];

// Create a logger instance with level from environment or default to 'info'
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets
  }
});

export default logger;
