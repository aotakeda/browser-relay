import sqlite3 from 'sqlite3';
import { promisify } from 'util';

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
// Use __dirname to get the directory of this file, then navigate to server/data
// This file is in server/src/storage/, so we go up 2 levels to server/ then into data/
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Use different database for tests
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
const dbPath = isTest 
  ? ':memory:' 
  : path.join(dataDir, 'browserrelay.db');
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

    // Create network_requests table
    await runAsync(`
      CREATE TABLE IF NOT EXISTS network_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requestId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        requestHeaders TEXT,
        responseHeaders TEXT,
        requestBody TEXT,
        responseBody TEXT,
        statusCode INTEGER,
        duration INTEGER,
        responseSize INTEGER,
        pageUrl TEXT NOT NULL,
        userAgent TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_net_timestamp ON network_requests(timestamp);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_net_method ON network_requests(method);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_net_url ON network_requests(url);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_net_pageUrl ON network_requests(pageUrl);
    `);

    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_net_requestId ON network_requests(requestId);
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export { db, runAsync, allAsync, getAsync };
export type { RunResult, CountResult };