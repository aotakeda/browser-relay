import request from 'supertest';
import express from 'express';
import { initializeDatabase } from '@/storage/database';
import { logStorage } from '@/storage/LogStorage';
import { networkStorage } from '@/storage/NetworkStorage';
import { LogBatch, NetworkRequestBatch } from '@/types';

// Mock logger to capture JSON output
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.mock('@/index', () => ({
  logger: mockLogger
}));

// Import routes after mocking
import { logsRouter } from '@/routes/logs';
import { networkRequestsRouter } from '@/routes/network-requests';

describe('JSON Output Format', () => {
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/logs', logsRouter);
    app.use('/network-requests', networkRequestsRouter);
    
    await initializeDatabase();
    
    // Clear mock calls
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await logStorage.clearLogs();
    await networkStorage.clearRequests();
  });

  describe('Console Logs JSON Output', () => {
    beforeEach(() => {
      process.env.LOG_CONSOLE_MESSAGES = 'true';
    });

    afterEach(() => {
      delete process.env.LOG_CONSOLE_MESSAGES;
    });

    it('should output console logs as JSON with all required fields', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log message',
            pageUrl: 'https://example.com/page',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'console_log',
        level: 'info',
        hostname: 'example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        page_url: 'https://example.com/page',
        message: 'Test log message',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        browser: 'Chrome'
      });
    });

    it('should output error logs with stack trace as JSON', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'error',
            message: 'Test error message',
            pageUrl: 'https://example.com/page',
            stackTrace: 'Error: Test error\n    at Object.test (test.js:1:1)'
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.error.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'console_log',
        level: 'error',
        hostname: 'example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        page_url: 'https://example.com/page',
        message: 'Test error message',
        stack_trace: 'Error: Test error\n    at Object.test (test.js:1:1)'
      });
    });

    it('should output warn logs as JSON', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'warn',
            message: 'Test warning message',
            pageUrl: 'https://example.com/page'
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.warn.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'console_log',
        level: 'warn',
        hostname: 'example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        page_url: 'https://example.com/page',
        message: 'Test warning message'
      });
    });

    it('should include metadata in JSON output when present', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log with metadata',
            pageUrl: 'https://example.com/page',
            metadata: {
              custom_field: 'custom_value',
              number_field: 42
            }
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'console_log',
        level: 'info',
        hostname: 'example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        page_url: 'https://example.com/page',
        message: 'Test log with metadata',
        metadata: {
          custom_field: 'custom_value',
          number_field: 42
        }
      });
    });

    it('should not output logs when LOG_CONSOLE_MESSAGES is false', async () => {
      process.env.LOG_CONSOLE_MESSAGES = 'false';

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log message',
            pageUrl: 'https://example.com/page'
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('Network Requests JSON Output', () => {
    beforeEach(() => {
      process.env.LOG_NETWORK_REQUESTS = 'true';
    });

    afterEach(() => {
      delete process.env.LOG_NETWORK_REQUESTS;
    });

    it('should output network requests as JSON with all required fields', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/users',
            statusCode: 200,
            duration: 150,
            pageUrl: 'https://example.com',
            userAgent: 'Test Agent'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'network_request',
        method: 'GET',
        url: 'https://api.example.com/users',
        hostname: 'api.example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        status: {
          code: 200,
          category: 'success'
        },
        duration_ms: 150,
        context: {
          is_api_endpoint: true,
          is_authenticated: false,
          user_agent: 'Test Agent',
          page_url: 'https://example.com'
        }
      });
    });

    it('should output error network requests with error log level', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-002',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/users',
            statusCode: 500,
            duration: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.error.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'network_request',
        method: 'POST',
        url: 'https://api.example.com/users',
        hostname: 'api.example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        status: {
          code: 500,
          category: 'server_error'
        },
        duration_ms: 200,
        context: {
          is_api_endpoint: true,
          is_authenticated: false,
          page_url: 'https://example.com'
        }
      });
    });

    it('should include request and response headers in JSON output', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-003',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/users',
            statusCode: 201,
            requestHeaders: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer token123'
            },
            responseHeaders: {
              'Content-Type': 'application/json',
              'X-Custom-Header': 'value'
            },
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog).toEqual({
        type: 'network_request',
        method: 'POST',
        url: 'https://api.example.com/users',
        hostname: 'api.example.com',
        timestamp: '2023-01-01T00:00:00.000Z',
        status: {
          code: 201,
          category: 'success'
        },
        request_headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123'
        },
        response_headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'value'
        },
        context: {
          is_api_endpoint: true,
          is_authenticated: true,
          page_url: 'https://example.com'
        }
      });
    });

    it('should process JSON request and response bodies correctly', async () => {
      const requestBody = JSON.stringify({ name: 'John', email: 'john@example.com' });
      const responseBody = JSON.stringify({ id: 1, name: 'John', email: 'john@example.com' });

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-004',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/users',
            statusCode: 201,
            requestBody,
            responseBody,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog.request_body).toEqual({
        type: 'json',
        data: { name: 'John', email: 'john@example.com' },
        truncated: false
      });

      expect(parsedLog.response_body).toEqual({
        type: 'json',
        data: { id: 1, name: 'John', email: 'john@example.com' },
        truncated: false
      });
    });

    it('should process plain text bodies correctly', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-005',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/text',
            statusCode: 200,
            requestBody: 'Simple text request',
            responseBody: 'Simple text response',
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog.request_body).toEqual({
        type: 'text',
        data: 'Simple text request',
        truncated: false
      });

      expect(parsedLog.response_body).toEqual({
        type: 'text',
        data: 'Simple text response',
        truncated: false
      });
    });

    it('should handle encoded/base64 data correctly', async () => {
      const encodedData = 'a'.repeat(150); // Long alphanumeric string

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-006',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/upload',
            statusCode: 200,
            requestBody: encodedData,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog.request_body).toEqual({
        type: 'encoded_data',
        length: 150,
        truncated: true
      });
    });

    it('should handle large JSON bodies with truncation', async () => {
      // Clear previous calls
      jest.clearAllMocks();
      
      // Create a large JSON object that won't trigger noise filter
      const largeData = {
        users: Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          profile: {
            age: 20 + (i % 50),
            city: `City ${i % 10}`,
            interests: [`hobby${i % 5}`, `sport${i % 3}`]
          }
        }))
      };
      const largeBody = JSON.stringify(largeData);

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-007',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/large',
            statusCode: 200,
            requestBody: largeBody,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      
      const loggedMessage = mockLogger.info.mock.calls[0][0];
      // Since our logger now passes objects directly, no need to parse JSON
      const parsedLog = loggedMessage;

      expect(parsedLog.request_body).toEqual({
        type: 'json',
        data: largeData,
        truncated: true,
        original_length: largeBody.length
      });
    });

    it('should not output requests when LOG_NETWORK_REQUESTS is false', async () => {
      process.env.LOG_NETWORK_REQUESTS = 'false';

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-008',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/users',
            statusCode: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('Status Categories', () => {
    beforeEach(() => {
      process.env.LOG_NETWORK_REQUESTS = 'true';
    });

    afterEach(() => {
      delete process.env.LOG_NETWORK_REQUESTS;
    });

    const testCases = [
      { statusCode: undefined, expectedCategory: 'pending' },
      { statusCode: 200, expectedCategory: 'success' },
      { statusCode: 201, expectedCategory: 'success' },
      { statusCode: 301, expectedCategory: 'redirect' },
      { statusCode: 302, expectedCategory: 'redirect' },
      { statusCode: 400, expectedCategory: 'client_error' },
      { statusCode: 404, expectedCategory: 'client_error' },
      { statusCode: 500, expectedCategory: 'server_error' },
      { statusCode: 502, expectedCategory: 'server_error' },
      { statusCode: 999, expectedCategory: 'unknown' }
    ];

    testCases.forEach(({ statusCode, expectedCategory }) => {
      it(`should categorize status code ${statusCode} as ${expectedCategory}`, async () => {
        const networkBatch: NetworkRequestBatch = {
          requests: [
            {
              requestId: 'req-status-test',
              timestamp: '2023-01-01T00:00:00.000Z',
              method: 'GET',
              url: 'https://api.example.com/test',
              statusCode,
              pageUrl: 'https://example.com'
            }
          ]
        };

        await request(app)
          .post('/network-requests')
          .send(networkBatch)
          .expect(200);

        const loggerMethod = statusCode && statusCode >= 400 ? mockLogger.error : mockLogger.info;
        expect(loggerMethod).toHaveBeenCalledTimes(1);
        
        const loggedMessage = loggerMethod.mock.calls[0][0];
        // Since our logger now passes objects directly, no need to parse JSON
        const parsedLog = loggedMessage;

        expect(parsedLog.status.category).toBe(expectedCategory);
      });
    });
  });
});