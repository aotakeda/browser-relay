import { EventEmitter } from 'events';
import { ConsoleLog } from '@/types';
import { runAsync, allAsync, getAsync, CountResult } from '@/storage/database';

// Create a simple logger to avoid circular imports
const logger = {
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(message, ...args),
  info: (message: string, ...args: unknown[]) => console.log(message, ...args)
};

interface LogRow {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  stackTrace: string | null;
  pageUrl: string;
  userAgent: string | null;
  metadata: string | null;
}

const MAX_LOGS = 10000;
const logEmitter = new EventEmitter();

// Safe JSON parsing helper
const tryParseJSON = (jsonString: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(jsonString);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch (error) {
    logger.warn('Failed to parse JSON metadata:', error);
    return null;
  }
};

// Safe JSON stringify helper
const tryStringifyJSON = (obj: unknown): string | null => {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    logger.warn('Failed to stringify metadata:', error);
    return null;
  }
};

export const insertLogs = async (logs: ConsoleLog[]): Promise<ConsoleLog[]> => {
  const insertedLogs: ConsoleLog[] = [];
  
  try {
    await runAsync('BEGIN TRANSACTION');
    
    for (const log of logs) {
      // Validate required fields
      if (!log.message || !log.pageUrl) {
        logger.warn('Skipping log with missing required fields:', log);
        continue;
      }
      const result = await runAsync(
        `INSERT INTO logs (timestamp, level, message, stackTrace, pageUrl, userAgent, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          log.timestamp,
          log.level,
          log.message,
          log.stackTrace || null,
          log.pageUrl,
          log.userAgent || null,
          log.metadata ? tryStringifyJSON(log.metadata) : null
        ]
      );
      
      const insertedLog = { ...log, id: result.lastID };
      insertedLogs.push(insertedLog);
      
      logEmitter.emit('newLog', insertedLog);
    }
    
    await enforceCircularBuffer();
    
    await runAsync('COMMIT');
  } catch (error) {
    await runAsync('ROLLBACK');
    logger.error('Failed to insert logs:', error);
    throw error;
  }
  
  return insertedLogs;
};

const enforceCircularBuffer = async (): Promise<void> => {
  const count = await getAsync<CountResult>('SELECT COUNT(*) as count FROM logs');
  
  if (count && count.count > MAX_LOGS) {
    const deleteCount = count.count - MAX_LOGS;
    await runAsync(
      `DELETE FROM logs WHERE id IN (
        SELECT id FROM logs ORDER BY id ASC LIMIT ?
      )`,
      [deleteCount]
    );
    logger.info(`Deleted ${deleteCount} old logs to maintain buffer size`);
  }
};

export const getLogs = async (
  limit: number, 
  offset: number, 
  filters: {
    level?: string;
    url?: string;
    startTime?: string;
    endTime?: string;
  } = {}
): Promise<ConsoleLog[]> => {
  let query = 'SELECT * FROM logs WHERE 1=1';
  const params: unknown[] = [];
  
  if (filters.level) {
    query += ' AND level = ?';
    params.push(filters.level);
  }
  
  if (filters.url) {
    query += ' AND pageUrl LIKE ?';
    params.push(`%${filters.url}%`);
  }
  
  if (filters.startTime) {
    query += ' AND timestamp >= ?';
    params.push(filters.startTime);
  }
  
  if (filters.endTime) {
    query += ' AND timestamp <= ?';
    params.push(filters.endTime);
  }
  
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const rows = await allAsync<LogRow>(query, params);
  
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    level: row.level as ConsoleLog['level'],
    message: row.message,
    stackTrace: row.stackTrace || undefined,
    pageUrl: row.pageUrl,
    userAgent: row.userAgent || undefined,
    metadata: row.metadata ? tryParseJSON(row.metadata) || undefined : undefined
  }));
};

export const clearLogs = async (): Promise<number> => {
  const count = await getAsync<CountResult>('SELECT COUNT(*) as count FROM logs');
  await runAsync('DELETE FROM logs');
  return count ? count.count : 0;
};

export const searchLogs = async (query: string, limit = 100): Promise<ConsoleLog[]> => {
  const rows = await allAsync<LogRow>(
    `SELECT * FROM logs 
     WHERE message LIKE ? OR stackTrace LIKE ?
     ORDER BY id DESC LIMIT ?`,
    [`%${query}%`, `%${query}%`, limit]
  );
  
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    level: row.level as ConsoleLog['level'],
    message: row.message,
    stackTrace: row.stackTrace || undefined,
    pageUrl: row.pageUrl,
    userAgent: row.userAgent || undefined,
    metadata: row.metadata ? tryParseJSON(row.metadata) || undefined : undefined
  }));
};

export const onNewLog = (callback: (log: ConsoleLog) => void) => {
  logEmitter.on('newLog', callback);
};

export const offNewLog = (callback: (log: ConsoleLog) => void) => {
  logEmitter.off('newLog', callback);
};

export const logStorage = {
  insertLogs,
  getLogs,
  clearLogs,
  searchLogs,
  onNewLog,
  offNewLog
};