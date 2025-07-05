import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { logger } from '@/index';

interface RunResult {
  lastID: number;
  changes: number;
}

interface CountResult {
  count: number;
}

import path from 'path';
import fs from 'fs';

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Use different database for tests
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
const dbPath = isTest 
  ? ':memory:' 
  : path.join(dataDir, 'console-logs.db');
const db = new sqlite3.Database(dbPath);

// Custom promisify for db.run to preserve 'this' context
const runAsync = (sql: string, params?: unknown[]): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function(this: RunResult, err: Error | null) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};
const allAsync = promisify(db.all.bind(db)) as <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
const getAsync = promisify(db.get.bind(db)) as <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;

export async function initializeDatabase() {
  try {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        stackTrace TEXT,
        pageUrl TEXT NOT NULL,
        userAgent TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON logs(timestamp);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_level ON logs(level);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_pageUrl ON logs(pageUrl);
    `);

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

export { db, runAsync, allAsync, getAsync };
export type { RunResult, CountResult };