import pino from 'pino';
import * as colors from '@colors/colors';

const isDevelopment = process.env.NODE_ENV !== 'production';

const formatTimestamp = (): string => new Date().toISOString();

// Development logging functions
const logInfo = (message: string, ...args: unknown[]): void => {
  const timestamp = formatTimestamp();
  console.log(`${colors.gray(timestamp)} ${colors.cyan('INFO')} ${message}`, ...args);
};

const logWarn = (message: string, ...args: unknown[]): void => {
  const timestamp = formatTimestamp();
  console.warn(`${colors.gray(timestamp)} ${colors.yellow('WARN')} ${message}`, ...args);
};

const logError = (message: string, ...args: unknown[]): void => {
  const timestamp = formatTimestamp();
  console.error(`${colors.gray(timestamp)} ${colors.red('ERROR')} ${message}`, ...args);
};

const logDebug = (message: string, ...args: unknown[]): void => {
  const timestamp = formatTimestamp();
  console.debug(`${colors.gray(timestamp)} ${colors.magenta('DEBUG')} ${message}`, ...args);
};

// Production logger setup
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  }
});

// Exported logging functions
export const info = isDevelopment 
  ? logInfo 
  : (message: string, ...args: unknown[]) => pinoLogger.info(message, ...args);

export const warn = isDevelopment 
  ? logWarn 
  : (message: string, ...args: unknown[]) => pinoLogger.warn(message, ...args);

export const error = isDevelopment 
  ? logError 
  : (message: string, ...args: unknown[]) => pinoLogger.error(message, ...args);

export const debug = isDevelopment 
  ? logDebug 
  : (message: string, ...args: unknown[]) => pinoLogger.debug(message, ...args);