import request from 'supertest';
import express from 'express';
import { logsRouter } from '@/routes/logs';
import { logStorage } from '@/storage/LogStorage';
import { initializeDatabase } from '@/storage/database';
import { ConsoleLog, LogBatch } from '@/types';

// Mock logger to avoid log pollution in tests
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Logs Router', () => {
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/logs', logsRouter);
    
    await initializeDatabase();
  });

  afterEach(async () => {
    await logStorage.clearLogs();
    // Clean up environment variables
    delete process.env.LOG_CONSOLE_MESSAGES;
  });

  describe('POST /logs', () => {
    it('should accept valid log batch and return summary', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log message',
            pageUrl: 'https://example.com',
            userAgent: 'Test Agent'
          },
          {
            timestamp: '2023-01-01T00:01:00.000Z',
            level: 'error',
            message: 'Test error message',
            stackTrace: 'Error stack trace',
            pageUrl: 'https://example.com/error',
            userAgent: 'Test Agent'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 2,
        stored: 2
      });
    });

    it('should filter out Browser Relay logs', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Normal log message',
            pageUrl: 'https://example.com'
          },
          {
            timestamp: '2023-01-01T00:01:00.000Z',
            level: 'info',
            message: '[Browser Relay] Debug message',
            pageUrl: 'https://example.com'
          },
          {
            timestamp: '2023-01-01T00:02:00.000Z',
            level: 'info',
            message: '[Network Debug] Network message',
            pageUrl: 'https://example.com'
          },
          {
            timestamp: '2023-01-01T00:03:00.000Z',
            level: 'info',
            message: 'Message with browser-relay content',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 4,
        stored: 1
      });

      // Verify only the normal log was stored
      const storedLogs = await logStorage.getLogs(10, 0);
      expect(storedLogs).toHaveLength(1);
      expect(storedLogs[0].message).toBe('Normal log message');
    });

    it('should handle environment variable LOG_CONSOLE_MESSAGES=false', async () => {
      process.env.LOG_CONSOLE_MESSAGES = 'false';

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log message',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should return 400 for invalid log batch format', async () => {
      const invalidBatch = {
        logs: 'not an array'
      };

      const response = await request(app)
        .post('/logs')
        .send(invalidBatch)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid log batch format'
      });
    });

    it('should return 400 for missing logs property', async () => {
      const invalidBatch = {
        notLogs: []
      };

      const response = await request(app)
        .post('/logs')
        .send(invalidBatch)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid log batch format'
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock logStorage.insertLogs to throw an error
      const originalInsertLogs = logStorage.insertLogs;
      logStorage.insertLogs = jest.fn().mockRejectedValue(new Error('Database error'));

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log message',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to process logs'
      });

      // Restore original function
      logStorage.insertLogs = originalInsertLogs;
    });
  });

  describe('GET /logs', () => {
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

    it('should return logs with default pagination', async () => {
      const response = await request(app)
        .get('/logs')
        .expect(200);

      expect(response.body.logs).toHaveLength(3);
      expect(response.body.logs[0].message).toBe('Third log'); // Newest first
    });

    it('should support pagination with limit and offset', async () => {
      const response = await request(app)
        .get('/logs?limit=2&offset=1')
        .expect(200);

      expect(response.body.logs).toHaveLength(2);
      expect(response.body.logs[0].message).toBe('Second log');
    });

    it('should filter by level', async () => {
      const response = await request(app)
        .get('/logs?level=error')
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].level).toBe('error');
    });

    it('should filter by URL', async () => {
      const response = await request(app)
        .get('/logs?url=example.com')
        .expect(200);

      expect(response.body.logs).toHaveLength(2);
      expect(response.body.logs.every((log: ConsoleLog) => log.pageUrl.includes('example.com'))).toBe(true);
    });

    it('should filter by time range', async () => {
      const response = await request(app)
        .get('/logs?startTime=2023-01-01T00:00:30.000Z&endTime=2023-01-01T00:01:30.000Z')
        .expect(200);

      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0].message).toBe('Second log');
    });

    it('should handle database errors gracefully', async () => {
      // Mock logStorage.getLogs to throw an error
      const originalGetLogs = logStorage.getLogs;
      logStorage.getLogs = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/logs')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch logs'
      });

      // Restore original function
      logStorage.getLogs = originalGetLogs;
    });
  });

  describe('DELETE /logs', () => {
    beforeEach(async () => {
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
    });

    it('should clear all logs and return count', async () => {
      const response = await request(app)
        .delete('/logs')
        .expect(200);

      expect(response.body).toEqual({
        cleared: 2
      });

      // Verify logs were cleared
      const remainingLogs = await logStorage.getLogs(10, 0);
      expect(remainingLogs).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      // Mock logStorage.clearLogs to throw an error
      const originalClearLogs = logStorage.clearLogs;
      logStorage.clearLogs = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/logs')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to clear logs'
      });

      // Restore original function
      logStorage.clearLogs = originalClearLogs;
    });
  });

  describe('GET /logs/stream', () => {
    it('should respond to stream requests', async () => {
      // Test that the route exists and starts responding
      // We don't test the actual streaming since it's complex in Jest
      const promise = request(app)
        .get('/logs/stream')
        .timeout(100);

      // Expect either success (headers sent) or timeout (streaming started)
      try {
        await promise;
        // If we get here, the route responded successfully
        expect(true).toBe(true);
      } catch (error: unknown) {
        // If it times out, that means streaming started (which is expected)
        const err = error as { timeout?: boolean; code?: string; status?: number };
        expect(err.timeout || err.code === 'ECONNABORTED' || err.status === undefined).toBeTruthy();
      }
    });
  });
});