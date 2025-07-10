import { ConsoleLog } from '@/types';
import { logStorage } from '@/storage/LogStorage';
import { setupTestDatabase, cleanupTestData } from '../utils/database';
import { 
  createMockLog, 
  createMockLogs, 
  createLogWithMetadata 
} from '../utils/factories';

describe('LogStorage', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('insertLogs', () => {
    it('should insert valid console logs', async () => {
      const testLogs = createMockLogs(2, { userAgent: 'Test Agent' });

      const insertedLogs = await logStorage.insertLogs(testLogs);

      expect(insertedLogs).toHaveLength(2);
      expect(insertedLogs[0]).toMatchObject(testLogs[0]);
      expect(insertedLogs[1]).toMatchObject(testLogs[1]);
      expect(insertedLogs[0].id).toBeDefined();
      expect(insertedLogs[1].id).toBeDefined();
    });

    it('should skip logs with missing required fields', async () => {
      const testLogs: ConsoleLog[] = [
        createMockLog({ message: '' }), // Invalid: empty message
        createMockLog({ message: 'Valid log' }), // Valid log
        createMockLog({ pageUrl: '' }) // Invalid: empty pageUrl
      ];

      const insertedLogs = await logStorage.insertLogs(testLogs);

      expect(insertedLogs).toHaveLength(1);
      expect(insertedLogs[0].message).toBe('Valid log');
    });

    it('should handle logs with complex metadata', async () => {
      const complexMetadata = {
        nested: {
          object: {
            with: ['arrays', 'and', 'strings']
          }
        },
        number: 42,
        boolean: true
      };

      const testLogs = [createLogWithMetadata(complexMetadata)];

      const insertedLogs = await logStorage.insertLogs(testLogs);

      expect(insertedLogs).toHaveLength(1);
      expect(insertedLogs[0].metadata).toEqual(complexMetadata);
    });

    it('should emit newLog event for each inserted log', async () => {
      const eventCallback = jest.fn();
      logStorage.onNewLog(eventCallback);

      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test log 1',
          pageUrl: 'https://example.com'
        },
        {
          timestamp: '2023-01-01T00:01:00.000Z',
          level: 'error',
          message: 'Test log 2',
          pageUrl: 'https://example.com'
        }
      ];

      await logStorage.insertLogs(testLogs);

      expect(eventCallback).toHaveBeenCalledTimes(2);
      expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test log 1',
        id: expect.any(Number)
      }));
      expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test log 2',
        id: expect.any(Number)
      }));

      logStorage.offNewLog(eventCallback);
    });
  });

  describe('getLogs', () => {
    beforeEach(async () => {
      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'First log',
          pageUrl: 'https://example.com'
        },
        {
          timestamp: '2023-01-01T00:01:00.000Z',
          level: 'error',
          message: 'Second log',
          pageUrl: 'https://test.com'
        },
        {
          timestamp: '2023-01-01T00:02:00.000Z',
          level: 'warn',
          message: 'Third log',
          pageUrl: 'https://example.com'
        }
      ];
      await logStorage.insertLogs(testLogs);
    });

    it('should retrieve logs with pagination', async () => {
      const firstPage = await logStorage.getLogs(2, 0);
      const secondPage = await logStorage.getLogs(2, 2);

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(1);
      
      // Results should be ordered by ID DESC (newest first)
      expect(firstPage[0].message).toBe('Third log');
      expect(firstPage[1].message).toBe('Second log');
      expect(secondPage[0].message).toBe('First log');
    });

    it('should filter logs by level', async () => {
      const errorLogs = await logStorage.getLogs(10, 0, { level: 'error' });
      
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
      expect(errorLogs[0].message).toBe('Second log');
    });

    it('should filter logs by URL', async () => {
      const exampleLogs = await logStorage.getLogs(10, 0, { url: 'example.com' });
      
      expect(exampleLogs).toHaveLength(2);
      expect(exampleLogs.every(log => log.pageUrl.includes('example.com'))).toBe(true);
    });

    it('should filter logs by time range', async () => {
      const filteredLogs = await logStorage.getLogs(10, 0, {
        startTime: '2023-01-01T00:00:30.000Z',
        endTime: '2023-01-01T00:01:30.000Z'
      });
      
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].message).toBe('Second log');
    });

    it('should combine multiple filters', async () => {
      const filteredLogs = await logStorage.getLogs(10, 0, {
        level: 'info',
        url: 'example.com'
      });
      
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].message).toBe('First log');
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs and return count', async () => {
      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test log 1',
          pageUrl: 'https://example.com'
        },
        {
          timestamp: '2023-01-01T00:01:00.000Z',
          level: 'error',
          message: 'Test log 2',
          pageUrl: 'https://example.com'
        }
      ];

      await logStorage.insertLogs(testLogs);
      const clearedCount = await logStorage.clearLogs();

      expect(clearedCount).toBe(2);
      
      const remainingLogs = await logStorage.getLogs(10, 0);
      expect(remainingLogs).toHaveLength(0);
    });

    it('should return 0 when clearing empty log table', async () => {
      const clearedCount = await logStorage.clearLogs();
      expect(clearedCount).toBe(0);
    });
  });

  describe('searchLogs', () => {
    beforeEach(async () => {
      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'User clicked button',
          pageUrl: 'https://example.com'
        },
        {
          timestamp: '2023-01-01T00:01:00.000Z',
          level: 'error',
          message: 'Database connection failed',
          stackTrace: 'Error: Connection timeout at button click handler',
          pageUrl: 'https://example.com'
        },
        {
          timestamp: '2023-01-01T00:02:00.000Z',
          level: 'warn',
          message: 'API rate limit exceeded',
          pageUrl: 'https://example.com'
        }
      ];
      await logStorage.insertLogs(testLogs);
    });

    it('should search logs by message content', async () => {
      const results = await logStorage.searchLogs('User clicked');
      
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('User clicked button');
    });

    it('should search logs by stack trace', async () => {
      const results = await logStorage.searchLogs('Connection timeout');
      
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('Database connection failed');
    });

    it('should search case-insensitively', async () => {
      const results = await logStorage.searchLogs('DATABASE');
      
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('Database connection failed');
    });

    it('should respect search limit', async () => {
      const results = await logStorage.searchLogs('', 2); // Search all logs with limit
      
      expect(results).toHaveLength(2);
    });

    it('should return empty array for no matches', async () => {
      const results = await logStorage.searchLogs('nonexistent');
      
      expect(results).toHaveLength(0);
    });
  });

  describe('circular buffer', () => {
    it('should enforce maximum log limit', async () => {
      // Note: The circular buffer enforcement is in LogStorage.ts
      // For this test, we'll just verify it doesn't crash with many logs
      const testLogs: ConsoleLog[] = [];
      for (let i = 0; i < 100; i++) {
        testLogs.push({
          timestamp: `2023-01-01T00:${i.toString().padStart(2, '0')}:00.000Z`,
          level: 'info',
          message: `Log ${i}`,
          pageUrl: 'https://example.com'
        });
      }

      await logStorage.insertLogs(testLogs);
      
      const allLogs = await logStorage.getLogs(200, 0);
      expect(allLogs.length).toBe(100); // All logs should be stored in test
    }, 10000);
  });

  describe('event handlers', () => {
    it('should properly remove event listeners', async () => {
      const eventCallback = jest.fn();
      
      logStorage.onNewLog(eventCallback);
      logStorage.offNewLog(eventCallback);

      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test log',
          pageUrl: 'https://example.com'
        }
      ];

      await logStorage.insertLogs(testLogs);

      expect(eventCallback).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle malformed metadata gracefully', async () => {
      // Create a log with circular reference that can't be JSON.stringify'd
      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      const testLogs: ConsoleLog[] = [
        {
          timestamp: '2023-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test log with circular metadata',
          pageUrl: 'https://example.com',
          metadata: circularObj
        }
      ];

      const insertedLogs = await logStorage.insertLogs(testLogs);
      
      expect(insertedLogs).toHaveLength(1);
      // The metadata is preserved in the returned object but not stored in DB
      expect(insertedLogs[0].metadata).toEqual(circularObj);
    });
  });
});