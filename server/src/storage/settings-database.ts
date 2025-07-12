import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

interface RunResult {
  lastID: number;
  changes: number;
}

// Use different database for tests
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

// Create data directory if it doesn't exist (only for non-test environments)
const dataDir = isTest ? '' : path.join(__dirname, '..', '..', 'data');
const dbPath = isTest 
  ? ':memory:' 
  : path.join(dataDir, 'browserrelay-settings.db');

// Database connection - will be initialized in initializeSettingsDatabase
let settingsDb: sqlite3.Database;

// Custom promisify for db.run to preserve 'this' context
const runAsync = (sql: string, params?: unknown[]): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    if (!settingsDb) {
      reject(new Error('Settings database not initialized. Call initializeSettingsDatabase() first.'));
      return;
    }
    settingsDb.run(sql, params || [], function(this: RunResult, err: Error | null) {
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
    if (!settingsDb) {
      reject(new Error('Settings database not initialized. Call initializeSettingsDatabase() first.'));
      return;
    }
    settingsDb.all(sql, params || [], (err: Error | null, rows: T[]) => {
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
    if (!settingsDb) {
      reject(new Error('Settings database not initialized. Call initializeSettingsDatabase() first.'));
      return;
    }
    settingsDb.get(sql, params || [], (err: Error | null, row: T | undefined) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

export async function initializeSettingsDatabase() {
  try {
    // Initialize database connection if not already done
    if (!settingsDb) {
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
      settingsDb = new sqlite3.Database(dbPath);
    }

    // Create extension_settings table
    await runAsync(`
      CREATE TABLE IF NOT EXISTS extension_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on key for fast lookups
    await runAsync(`
      CREATE INDEX IF NOT EXISTS idx_settings_key ON extension_settings(key);
    `);

    // Insert default settings if they don't exist
    const defaultSettings = {
      logsEnabled: true,
      networkEnabled: true,
      mcpEnabled: false,
      allDomainsMode: true,
      specificDomains: []
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      await runAsync(`
        INSERT OR IGNORE INTO extension_settings (key, value) 
        VALUES (?, ?)
      `, [key, JSON.stringify(value)]);
    }

    console.log('Settings database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize settings database:', error);
    throw error;
  }
}

export { settingsDb, runAsync as settingsRunAsync, allAsync as settingsAllAsync, getAsync as settingsGetAsync };
export type { RunResult };