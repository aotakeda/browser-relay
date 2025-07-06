import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { logsRouter } from '@/routes/logs';
import { networkRequestsRouter } from '@/routes/network-requests';
import { initializeDatabase } from '@/storage/database';
import { logStorage } from '@/storage/LogStorage';
import { networkStorage } from '@/storage/NetworkStorage';
import { ConsoleLog, LogBatch, NetworkRequestBatch } from '@/types';

// Mock logger to avoid log pollution in tests
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    // Setup full application
    app = express();
    
    app.use(cors({
      origin: true,
      credentials: true
    }));
    
    app.use(express.json({ limit: '10mb' }));
    
    app.use('/logs', logsRouter);
    app.use('/network-requests', networkRequestsRouter);
    
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    await initializeDatabase();
  });

  afterEach(async () => {
    // Clean up all data
    await logStorage.clearLogs();
    await networkStorage.clearRequests();
    
    // Clean up environment variables
    delete process.env.LOG_CONSOLE_MESSAGES;
    delete process.env.LOG_NETWORK_REQUESTS;
  });

  describe('Full Console Log Flow', () => {
    it('should handle complete console log lifecycle', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Application started',
            pageUrl: 'https://example.com',
            userAgent: 'Mozilla/5.0 (Chrome)'
          },
          {
            timestamp: '2023-01-01T00:01:00.000Z',
            level: 'error',
            message: 'API call failed',
            stackTrace: 'Error: 404 Not Found\\n  at fetch()',
            pageUrl: 'https://example.com/api',
            userAgent: 'Mozilla/5.0 (Chrome)',
            metadata: { endpoint: '/api/users', method: 'GET' }
          }
        ]
      };

      // 1. Post logs
      const postResponse = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(postResponse.body).toEqual({
        received: 2,
        stored: 2
      });

      // 2. Retrieve all logs
      const getAllResponse = await request(app)
        .get('/logs')
        .expect(200);

      expect(getAllResponse.body.logs).toHaveLength(2);
      expect(getAllResponse.body.logs[0]).toMatchObject({
        level: 'error',
        message: 'API call failed',
        stackTrace: 'Error: 404 Not Found\\n  at fetch()',
        metadata: { endpoint: '/api/users', method: 'GET' }
      });

      // 3. Filter logs by level
      const filterResponse = await request(app)
        .get('/logs?level=error')
        .expect(200);

      expect(filterResponse.body.logs).toHaveLength(1);
      expect(filterResponse.body.logs[0].level).toBe('error');

      // 4. Search logs
      const searchResponse = await request(app)
        .get('/logs?url=api')
        .expect(200);

      expect(searchResponse.body.logs).toHaveLength(1);
      expect(searchResponse.body.logs[0].pageUrl).toBe('https://example.com/api');

      // 5. Clear logs
      const clearResponse = await request(app)
        .delete('/logs')
        .expect(200);

      expect(clearResponse.body.cleared).toBe(2);

      // 6. Verify logs are cleared
      const emptyResponse = await request(app)
        .get('/logs')
        .expect(200);

      expect(emptyResponse.body.logs).toHaveLength(0);
    });
  });

  describe('Full Network Request Flow', () => {
    it('should handle complete network request lifecycle', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/users',
            requestHeaders: {
              'Authorization': 'Bearer token123',
              'Content-Type': 'application/json'
            },
            responseHeaders: {
              'Content-Type': 'application/json',
              'X-Request-ID': 'req-001'
            },
            statusCode: 200,
            duration: 150,
            responseBody: '{"users": [{"id": 1, "name": "John"}]}',
            pageUrl: 'https://example.com',
            userAgent: 'Mozilla/5.0 (Chrome)'
          },
          {
            requestId: 'req-002',
            timestamp: '2023-01-01T00:01:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/users',
            requestHeaders: {
              'Authorization': 'Bearer token123',
              'Content-Type': 'application/json'
            },
            requestBody: '{"name": "Jane", "email": "jane@example.com"}',
            statusCode: 201,
            duration: 200,
            responseBody: '{"id": 2, "name": "Jane", "email": "jane@example.com"}',
            pageUrl: 'https://example.com',
            userAgent: 'Mozilla/5.0 (Chrome)'
          }
        ]
      };

      // 1. Post network requests
      const postResponse = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(postResponse.body).toEqual({
        received: 2,
        stored: 2
      });

      // 2. Retrieve all requests
      const getAllResponse = await request(app)
        .get('/network-requests')
        .expect(200);

      expect(getAllResponse.body.requests).toHaveLength(2);
      expect(getAllResponse.body.requests[0]).toMatchObject({
        method: 'POST',
        url: 'https://api.example.com/users',
        statusCode: 201
      });

      // 3. Filter by method
      const filterResponse = await request(app)
        .get('/network-requests?method=GET')
        .expect(200);

      expect(filterResponse.body.requests).toHaveLength(1);
      expect(filterResponse.body.requests[0].method).toBe('GET');

      // 4. Filter by status code
      const statusResponse = await request(app)
        .get('/network-requests?statusCode=201')
        .expect(200);

      expect(statusResponse.body.requests).toHaveLength(1);
      expect(statusResponse.body.requests[0].statusCode).toBe(201);

      // 5. Get individual request
      const requests = await networkStorage.getRequests(10, 0);
      const requestId = requests[0].id;

      const individualResponse = await request(app)
        .get(`/network-requests/${requestId}`)
        .expect(200);

      expect(individualResponse.body.request).toMatchObject({
        method: 'POST',
        url: 'https://api.example.com/users'
      });

      // 6. Clear requests
      const clearResponse = await request(app)
        .delete('/network-requests')
        .expect(200);

      expect(clearResponse.body.cleared).toBe(2);

      // 7. Verify requests are cleared
      const emptyResponse = await request(app)
        .get('/network-requests')
        .expect(200);

      expect(emptyResponse.body.requests).toHaveLength(0);
    });
  });

  describe('Mixed Data Scenarios', () => {
    it('should handle both console logs and network requests simultaneously', async () => {
      // Post console logs
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Making API call',
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      // Post network requests
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:01.000Z',
            method: 'GET',
            url: 'https://api.example.com/data',
            statusCode: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      // Verify both are stored
      const logsResponse = await request(app).get('/logs').expect(200);
      const requestsResponse = await request(app).get('/network-requests').expect(200);

      expect(logsResponse.body.logs).toHaveLength(1);
      expect(requestsResponse.body.requests).toHaveLength(1);

      // Health check should still work
      const healthResponse = await request(app).get('/health').expect(200);
      expect(healthResponse.body.status).toBe('ok');
    });
  });

  describe('Environment Variable Integration', () => {
    it('should respect LOG_CONSOLE_MESSAGES=false', async () => {
      process.env.LOG_CONSOLE_MESSAGES = 'false';

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test message',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      // Should still store logs, but not log them to console
      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });

      // Verify log was stored
      const getResponse = await request(app).get('/logs').expect(200);
      expect(getResponse.body.logs).toHaveLength(1);
    });

    it('should respect LOG_NETWORK_REQUESTS=false', async () => {
      process.env.LOG_NETWORK_REQUESTS = 'false';

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/test',
            statusCode: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      // Should still store requests, but not log them to console
      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });

      // Verify request was stored
      const getResponse = await request(app).get('/network-requests').expect(200);
      expect(getResponse.body.requests).toHaveLength(1);
    });
  });

  describe('Browser Relay Filtering Integration', () => {
    it('should filter out Browser Relay logs across the entire flow', async () => {
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
            message: 'Another normal log',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 3,
        stored: 2
      });

      // Verify only non-Browser Relay logs were stored
      const getResponse = await request(app).get('/logs').expect(200);
      expect(getResponse.body.logs).toHaveLength(2);
      
      const messages = getResponse.body.logs.map((log: ConsoleLog) => log.message);
      expect(messages).toContain('Normal log message');
      expect(messages).toContain('Another normal log');
      expect(messages).not.toContain('[Browser Relay] Debug message');
    });

    it('should filter out Browser Relay network requests', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/data',
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-002',
            timestamp: '2023-01-01T00:01:00.000Z',
            method: 'POST',
            url: 'http://localhost:27497/logs',
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-003',
            timestamp: '2023-01-01T00:02:00.000Z',
            method: 'GET',
            url: 'https://example.com/image.png',
            statusCode: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 3,
        stored: 1 // Only the first request should be stored (localhost port and .png filtered out)
      });

      // Verify only the API request was stored
      const getResponse = await request(app).get('/network-requests').expect(200);
      expect(getResponse.body.requests).toHaveLength(1);
      expect(getResponse.body.requests[0].url).toBe('https://api.example.com/data');
    });

    it('should filter out requests to Browser Relay server port only', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/data',
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-002',
            timestamp: '2023-01-01T00:01:00.000Z',
            method: 'GET',
            url: 'http://localhost:27497/health-browser-relay',
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-003',
            timestamp: '2023-01-01T00:02:00.000Z',
            method: 'POST',
            url: 'http://localhost:27497/logs',
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-004',
            timestamp: '2023-01-01T00:03:00.000Z',
            method: 'GET',
            url: 'http://localhost:3000/api/data', // Different port - should NOT be filtered
            statusCode: 200,
            pageUrl: 'https://example.com'
          },
          {
            requestId: 'req-005',
            timestamp: '2023-01-01T00:04:00.000Z',
            method: 'GET',
            url: 'http://localhost:9000/health-browser-relay', // Browser Relay health check - should be filtered
            statusCode: 200,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 5,
        stored: 2 // API request + localhost:3000 request should be stored, port 27497 + health-browser-relay filtered
      });

      // Verify the correct requests were stored
      const getResponse = await request(app).get('/network-requests').expect(200);
      expect(getResponse.body.requests).toHaveLength(2);
      
      const storedUrls = getResponse.body.requests.map((req: { url: string }) => req.url);
      expect(storedUrls).toContain('https://api.example.com/data');
      expect(storedUrls).toContain('http://localhost:3000/api/data');
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle invalid data gracefully across endpoints', async () => {
      // Invalid log batch
      const invalidLogResponse = await request(app)
        .post('/logs')
        .send({ logs: 'not an array' })
        .expect(400);

      expect(invalidLogResponse.body.error).toBe('Invalid log batch format');

      // Invalid network request batch
      const invalidNetworkResponse = await request(app)
        .post('/network-requests')
        .send({ requests: 'not an array' })
        .expect(400);

      expect(invalidNetworkResponse.body.error).toBe('Invalid network request batch format');

      // Non-existent network request
      const notFoundResponse = await request(app)
        .get('/network-requests/99999')
        .expect(404);

      expect(notFoundResponse.body.error).toBe('Network request not found');

      // Health should still work
      await request(app).get('/health').expect(200);
    });
  });

  describe('Performance and Limits', () => {
    it('should handle large batches efficiently', async () => {
      // Create a large batch of logs
      const largeBatch: LogBatch = {
        logs: Array.from({ length: 100 }, (_, i) => ({
          timestamp: `2023-01-01T00:${i.toString().padStart(2, '0')}:00.000Z`,
          level: 'info' as const,
          message: `Log message ${i}`,
          pageUrl: 'https://example.com'
        }))
      };

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/logs')
        .send(largeBatch)
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.body).toEqual({
        received: 100,
        stored: 100
      });

      // Should complete within reasonable time (5 seconds)
      expect(duration).toBeLessThan(5000);

      // Verify all logs were stored
      const getResponse = await request(app)
        .get('/logs?limit=200')
        .expect(200);

      expect(getResponse.body.logs).toHaveLength(100);
    });
  });
});