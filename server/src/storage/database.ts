import sqlite3 from 'sqlite3';

interface RunResult {
  lastID: number;
  changes: number;
}

interface CountResult {
  count: number;
}

import path from 'path';
import fs from 'fs';

// Use different database for tests
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

// Create data directory if it doesn't exist (only for non-test environments)
const dataDir = isTest ? '' : path.join(__dirname, '..', '..', 'data');
const dbPath = isTest 
  ? ':memory:' 
  : path.join(dataDir, 'browserrelay.db');

// Database connection - will be initialized in initializeDatabase
let db: sqlite3.Database;

// Custom promisify for db.run to preserve 'this' context
const runAsync = (sql: string, params?: unknown[]): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call initializeDatabase() first.'));
      return;
    }
    db.run(sql, params || [], function(this: RunResult, err: Error | null) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};

const allAsync = <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call initializeDatabase() first.'));
      return;
    }
    db.all(sql, params || [], (err: Error | null, rows: T[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const getAsync = <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call initializeDatabase() first.'));
      return;
    }
    db.get(sql, params || [], (err: Error | null, row: T | undefined) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

export async function initializeDatabase() {
  try {
    // Initialize database connection if not already done
    if (!db) {
      // Create data directory if it doesn't exist (only for non-test environments)
      if (!isTest) {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Ensure the database file can be created by touching it if it doesn't exist
        if (!fs.existsSync(dbPath)) {
          fs.writeFileSync(dbPath, '');
        }
      }
      
      // Now create the database connection
      db = new sqlite3.Database(dbPath);
    }

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