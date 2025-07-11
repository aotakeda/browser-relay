import { initializeDatabase } from '@/storage/database';
import * as networkStorage from '@/storage/NetworkStorage';
import { logStorage } from '@/storage/LogStorage';

/**
 * Standardized database utilities for consistent test database management
 */

/**
 * Initialize database for testing - call this in beforeAll
 */
export const setupTestDatabase = async (): Promise<void> => {
  await initializeDatabase();
};

/**
 * Clean all test data - call this in afterEach
 */
export const cleanupTestData = async (): Promise<void> => {
  await Promise.all([
    networkStorage.clearRequests(),
    logStorage.clearLogs()
  ]);
};

/**
 * Get current database counts for assertions
 */
export const getDatabaseCounts = async (): Promise<{ logs: number; requests: number }> => {
  const [requestCount, logCount] = await Promise.all([
    networkStorage.getRequestCount(),
    // Note: logStorage doesn't have a count method, so we fetch and count
    logStorage.getLogs(10000, 0).then(logs => logs.length)
  ]);
  
  return {
    logs: logCount,
    requests: requestCount
  };
};

/**
 * Assert database is empty (useful for test verification)
 */
export const assertDatabaseEmpty = async (): Promise<void> => {
  const counts = await getDatabaseCounts();
  expect(counts.logs).toBe(0);
  expect(counts.requests).toBe(0);
};

/**
 * Complete database reset - more thorough than cleanup, use sparingly
 */
export const resetTestDatabase = async (): Promise<void> => {
  await cleanupTestData();
  await assertDatabaseEmpty();
};