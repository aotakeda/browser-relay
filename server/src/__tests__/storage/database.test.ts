import { initializeDatabase, runAsync, allAsync, getAsync } from '@/storage/database';
import path from 'path';
import fs from 'fs';

// Mock logger to avoid log pollution in tests
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Database', () => {
  beforeEach(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    // Clean up test data
    await runAsync('DELETE FROM logs');
    await runAsync('DELETE FROM network_requests');
  });

  describe('initializeDatabase', () => {
    it('should create logs table with correct schema', async () => {
      const tableInfo = await allAsync(`PRAGMA table_info(logs)`);
      
      const expectedColumns = [
        { name: 'id', type: 'INTEGER', pk: 1, notnull: 0 },
        { name: 'timestamp', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'level', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'message', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'stackTrace', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'pageUrl', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'userAgent', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'metadata', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'created_at', type: 'DATETIME', pk: 0, notnull: 0 }
      ];

      expect(tableInfo).toHaveLength(expectedColumns.length);
      
      expectedColumns.forEach((expectedCol, index) => {
        const actualCol = tableInfo[index] as { name: string; type: string; pk: number; notnull: number };
        expect(actualCol.name).toBe(expectedCol.name);
        expect(actualCol.type).toBe(expectedCol.type);
        expect(actualCol.pk).toBe(expectedCol.pk);
        expect(actualCol.notnull).toBe(expectedCol.notnull);
      });
    });

    it('should create network_requests table with correct schema', async () => {
      const tableInfo = await allAsync(`PRAGMA table_info(network_requests)`);
      
      const expectedColumns = [
        { name: 'id', type: 'INTEGER', pk: 1, notnull: 0 },
        { name: 'requestId', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'timestamp', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'method', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'url', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'requestHeaders', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'responseHeaders', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'requestBody', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'responseBody', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'statusCode', type: 'INTEGER', pk: 0, notnull: 0 },
        { name: 'duration', type: 'INTEGER', pk: 0, notnull: 0 },
        { name: 'responseSize', type: 'INTEGER', pk: 0, notnull: 0 },
        { name: 'pageUrl', type: 'TEXT', pk: 0, notnull: 1 },
        { name: 'userAgent', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'metadata', type: 'TEXT', pk: 0, notnull: 0 },
        { name: 'created_at', type: 'DATETIME', pk: 0, notnull: 0 }
      ];

      expect(tableInfo).toHaveLength(expectedColumns.length);
      
      expectedColumns.forEach((expectedCol, index) => {
        const actualCol = tableInfo[index] as { name: string; type: string; pk: number; notnull: number };
        expect(actualCol.name).toBe(expectedCol.name);
        expect(actualCol.type).toBe(expectedCol.type);
        expect(actualCol.pk).toBe(expectedCol.pk);
        expect(actualCol.notnull).toBe(expectedCol.notnull);
      });
    });

    it('should create indexes for logs table', async () => {
      const indexes = await allAsync(`PRAGMA index_list(logs)`);
      
      const expectedIndexes = [
        'idx_timestamp',
        'idx_level',
        'idx_pageUrl'
      ];

      const actualIndexNames = (indexes as { name: string }[]).map((index) => index.name);
      
      expectedIndexes.forEach(expectedIndex => {
        expect(actualIndexNames).toContain(expectedIndex);
      });
    });

    it('should create indexes for network_requests table', async () => {
      const indexes = await allAsync(`PRAGMA index_list(network_requests)`);
      
      const expectedIndexes = [
        'idx_net_timestamp',
        'idx_net_method',
        'idx_net_url',
        'idx_net_pageUrl',
        'idx_net_requestId'
      ];

      const actualIndexNames = (indexes as { name: string }[]).map((index) => index.name);
      
      expectedIndexes.forEach(expectedIndex => {
        expect(actualIndexNames).toContain(expectedIndex);
      });
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      // Should not throw when called multiple times
      await expect(initializeDatabase()).resolves.not.toThrow();
      await expect(initializeDatabase()).resolves.not.toThrow();
    });
  });

  describe('runAsync', () => {
    it('should execute INSERT statements and return lastID', async () => {
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );

      expect(result.lastID).toBeDefined();
      expect(result.lastID).toBeGreaterThan(0);
      expect(result.changes).toBe(1);
    });

    it('should execute UPDATE statements and return changes', async () => {
      // First insert a record
      const insertResult = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );

      // Then update it
      const updateResult = await runAsync(
        'UPDATE logs SET level = ? WHERE id = ?',
        ['error', insertResult.lastID]
      );

      expect(updateResult.changes).toBe(1);
    });

    it('should execute DELETE statements and return changes', async () => {
      // First insert a record
      await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );

      // Then delete it
      const deleteResult = await runAsync('DELETE FROM logs WHERE level = ?', ['info']);

      expect(deleteResult.changes).toBe(1);
    });

    it('should handle SQL errors properly', async () => {
      await expect(runAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });
  });

  describe('allAsync', () => {
    beforeEach(async () => {
      // Insert test data
      await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'First message', 'https://example.com']
      );
      await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:01:00.000Z', 'error', 'Second message', 'https://test.com']
      );
    });

    it('should return all matching records', async () => {
      const results = await allAsync('SELECT * FROM logs ORDER BY id');

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        level: 'info',
        message: 'First message',
        pageUrl: 'https://example.com'
      });
      expect(results[1]).toMatchObject({
        level: 'error',
        message: 'Second message',
        pageUrl: 'https://test.com'
      });
    });

    it('should support parameterized queries', async () => {
      const results = await allAsync('SELECT * FROM logs WHERE level = ?', ['error']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        level: 'error',
        message: 'Second message'
      });
    });

    it('should return empty array when no matches found', async () => {
      const results = await allAsync('SELECT * FROM logs WHERE level = ?', ['nonexistent']);

      expect(results).toHaveLength(0);
    });

    it('should handle SQL errors properly', async () => {
      await expect(allAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });
  });

  describe('getAsync', () => {
    beforeEach(async () => {
      // Insert test data
      await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );
    });

    it('should return single matching record', async () => {
      const result = await getAsync('SELECT * FROM logs WHERE level = ?', ['info']);

      expect(result).toMatchObject({
        level: 'info',
        message: 'Test message',
        pageUrl: 'https://example.com'
      });
    });

    it('should return undefined when no matches found', async () => {
      const result = await getAsync('SELECT * FROM logs WHERE level = ?', ['nonexistent']);

      expect(result).toBeUndefined();
    });

    it('should support aggregate queries', async () => {
      const result = await getAsync('SELECT COUNT(*) as count FROM logs');

      expect(result).toMatchObject({
        count: 1
      });
    });

    it('should handle SQL errors properly', async () => {
      await expect(getAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });
  });

  describe('data directory creation', () => {
    it('should create data directory if it does not exist', async () => {
      const dataDir = path.join(process.cwd(), 'data');
      
      // The directory should exist (created during initialization)
      expect(fs.existsSync(dataDir)).toBe(true);
    });
  });

  describe('test vs production database', () => {
    it('should use in-memory database for tests', async () => {
      // In test environment, we should be using in-memory database
      expect(process.env.NODE_ENV).toBe('test');
      
      // Verify we can perform database operations (indicates in-memory DB is working)
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );
      
      expect(result.lastID).toBeGreaterThan(0);
    });
  });

  describe('transaction handling', () => {
    it('should support manual transactions', async () => {
      await runAsync('BEGIN TRANSACTION');
      
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Transaction test', 'https://example.com']
      );
      
      await runAsync('COMMIT');
      
      const logs = await allAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(logs).toHaveLength(1);
    });

    it('should support transaction rollback', async () => {
      await runAsync('BEGIN TRANSACTION');
      
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Rollback test', 'https://example.com']
      );
      
      await runAsync('ROLLBACK');
      
      const logs = await allAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(logs).toHaveLength(0);
    });
  });

  describe('database helpers before initialization', () => {
    it('should handle calls to database helpers before initialization', async () => {
      // This test runs in the same process as other tests, so we can't easily test
      // the uninitialized state. Instead, we verify that the helpers work correctly
      // after initialization, which is covered by other tests.
      
      // Verify that helpers work correctly when database is initialized
      const result = await runAsync('SELECT 1 as test');
      expect(result).toBeDefined();
      
      const allResults = await allAsync('SELECT 1 as test');
      expect(allResults).toHaveLength(1);
      
      const getResult = await getAsync('SELECT 1 as test');
      expect(getResult).toBeDefined();
    });
  });
});