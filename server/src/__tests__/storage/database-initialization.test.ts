import { initializeDatabase, runAsync, allAsync, getAsync } from '@/storage/database';

// Mock logger to avoid log pollution in tests
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Database Initialization', () => {
  describe('database initialization behavior', () => {
    it('should initialize database successfully', async () => {
      // This tests the basic initialization flow
      await expect(initializeDatabase()).resolves.not.toThrow();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      // Should not throw when called multiple times
      await expect(initializeDatabase()).resolves.not.toThrow();
      await expect(initializeDatabase()).resolves.not.toThrow();
      await expect(initializeDatabase()).resolves.not.toThrow();
    });

    it('should handle concurrent initializations', async () => {
      // Start multiple initializations concurrently
      const promises = Array.from({ length: 3 }, () => initializeDatabase());
      
      // All should complete successfully
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('database helper error handling', () => {
    beforeEach(async () => {
      // Ensure database is initialized for these tests
      await initializeDatabase();
    });

    it('should handle database operations correctly after initialization', async () => {
      // Test that helpers work correctly when database is initialized
      await expect(runAsync('SELECT 1')).resolves.not.toThrow();
      await expect(allAsync('SELECT 1')).resolves.not.toThrow();
      await expect(getAsync('SELECT 1')).resolves.not.toThrow();
    });

    it('should handle SQL errors properly in runAsync', async () => {
      await expect(runAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });

    it('should handle SQL errors properly in allAsync', async () => {
      await expect(allAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });

    it('should handle SQL errors properly in getAsync', async () => {
      await expect(getAsync('INVALID SQL STATEMENT')).rejects.toThrow();
    });
  });

  describe('database operations after initialization', () => {
    beforeEach(async () => {
      await initializeDatabase();
      // Clean up any existing test data
      await runAsync('DELETE FROM logs');
      await runAsync('DELETE FROM network_requests');
    });

    it('should perform basic database operations', async () => {
      // Insert test data
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Test message', 'https://example.com']
      );
      
      expect(result.lastID).toBeGreaterThan(0);
      expect(result.changes).toBe(1);
      
      // Retrieve test data
      const logs = await allAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'Test message',
        pageUrl: 'https://example.com'
      });
      
      // Test single record retrieval
      const log = await getAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(log).toMatchObject({
        level: 'info',
        message: 'Test message',
        pageUrl: 'https://example.com'
      });
    });

    it('should handle transaction rollback', async () => {
      // Test transaction rollback
      await runAsync('BEGIN TRANSACTION');
      
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Rollback test', 'https://example.com']
      );
      
      await runAsync('ROLLBACK');
      
      // Record should not exist after rollback
      const logs = await allAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(logs).toHaveLength(0);
    });

    it('should handle network requests table operations', async () => {
      // Insert test network request
      const result = await runAsync(
        `INSERT INTO network_requests (
          requestId, timestamp, method, url, statusCode, pageUrl
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        ['req-123', '2023-01-01T00:00:00.000Z', 'GET', 'https://api.example.com', 200, 'https://example.com']
      );
      
      expect(result.lastID).toBeGreaterThan(0);
      expect(result.changes).toBe(1);
      
      // Retrieve test data
      const requests = await allAsync('SELECT * FROM network_requests WHERE id = ?', [result.lastID]);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        requestId: 'req-123',
        method: 'GET',
        url: 'https://api.example.com',
        statusCode: 200,
        pageUrl: 'https://example.com'
      });
    });
  });

  describe('database schema validation', () => {
    beforeEach(async () => {
      await initializeDatabase();
    });

    it('should create logs table with correct schema', async () => {
      const tableInfo = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'");
      expect(tableInfo).toHaveLength(1);
      
      // Check column structure
      const columns = await allAsync<{ name: string }>("PRAGMA table_info(logs)");
      const columnNames = columns.map((col) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('level');
      expect(columnNames).toContain('message');
      expect(columnNames).toContain('pageUrl');
    });

    it('should create network_requests table with correct schema', async () => {
      const tableInfo = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='network_requests'");
      expect(tableInfo).toHaveLength(1);
      
      // Check column structure
      const columns = await allAsync<{ name: string }>("PRAGMA table_info(network_requests)");
      const columnNames = columns.map((col) => col.name);
      
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('requestId');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('method');
      expect(columnNames).toContain('url');
      expect(columnNames).toContain('statusCode');
      expect(columnNames).toContain('pageUrl');
    });

    it('should create appropriate indexes', async () => {
      // Check logs indexes
      const logsIndexes = await allAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='logs'");
      const logsIndexNames = logsIndexes.map((index) => index.name);
      expect(logsIndexNames).toContain('idx_timestamp');
      expect(logsIndexNames).toContain('idx_level');
      expect(logsIndexNames).toContain('idx_pageUrl');
      
      // Check network_requests indexes
      const requestsIndexes = await allAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='network_requests'");
      const requestsIndexNames = requestsIndexes.map((index) => index.name);
      expect(requestsIndexNames).toContain('idx_net_timestamp');
      expect(requestsIndexNames).toContain('idx_net_method');
      expect(requestsIndexNames).toContain('idx_net_url');
      expect(requestsIndexNames).toContain('idx_net_pageUrl');
      expect(requestsIndexNames).toContain('idx_net_requestId');
    });
  });

  describe('database initialization edge cases', () => {
    it('should handle rapid successive initializations', async () => {
      // Test rapid initialization calls
      const promises = Array.from({ length: 10 }, () => initializeDatabase());
      
      // All should complete successfully
      await expect(Promise.all(promises)).resolves.not.toThrow();
      
      // Database should still be functional
      const result = await runAsync('SELECT 1 as test');
      expect(result).toBeDefined();
    });

    it('should maintain database integrity after multiple initializations', async () => {
      // Initialize multiple times
      await initializeDatabase();
      await initializeDatabase();
      await initializeDatabase();
      
      // Insert test data
      const result = await runAsync(
        'INSERT INTO logs (timestamp, level, message, pageUrl) VALUES (?, ?, ?, ?)',
        ['2023-01-01T00:00:00.000Z', 'info', 'Integrity test', 'https://example.com']
      );
      
      expect(result.lastID).toBeGreaterThan(0);
      
      // Verify data can be retrieved
      const logs = await allAsync('SELECT * FROM logs WHERE id = ?', [result.lastID]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'Integrity test'
      });
    });
  });
});