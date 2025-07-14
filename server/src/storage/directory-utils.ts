import fs from "fs";

/**
 * Safely ensures a directory exists, handling race conditions when multiple
 * processes might try to create the same directory simultaneously.
 */
export async function ensureDataDirectory(dataDir: string): Promise<void> {
  if (!dataDir) {
    throw new Error("Data directory path cannot be empty");
  }

  try {
    await fs.promises.mkdir(dataDir, { recursive: true });
  } catch (error: unknown) {
    // Handle race condition where another process created the directory
    if (error && typeof error === 'object' && 'code' in error && error.code === "EEXIST") {
      try {
        const stats = await fs.promises.stat(dataDir);
        if (!stats.isDirectory()) {
          throw new Error(
            `Data path exists but is not a directory: ${dataDir}`
          );
        }
        // Directory exists and is valid, continue
        return;
      } catch (statError) {
        console.error(
          `Failed to verify existing data directory: ${dataDir}`,
          statError
        );
        throw statError;
      }
    } else {
      console.error(`Failed to create data directory: ${dataDir}`, error);
      throw error;
    }
  }
}

/**
 * Creates a SQLite database connection with proper error handling
 */
export function createDatabaseConnection(
  dbPath: string,
  sqlite3: typeof import('sqlite3')
): Promise<import('sqlite3').Database> {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) {
        console.error(
          `Failed to create database connection to ${dbPath}:`,
          err
        );
        reject(err);
      } else {
        console.log(`Database connection established: ${dbPath}`);
        resolve(database);
      }
    });
  });
}
