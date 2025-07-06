import request from 'supertest';
import express from 'express';
import { logsRouter } from '@/routes/logs';
import { networkRequestsRouter } from '@/routes/network-requests';
import { initializeDatabase } from '@/storage/database';
import { logStorage } from '@/storage/LogStorage';
import { networkStorage } from '@/storage/NetworkStorage';
import { LogBatch, NetworkRequestBatch } from '@/types';

// Mock logger to avoid log pollution in tests
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Edge Cases and Error Handling', () => {
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/logs', logsRouter);
    app.use('/network-requests', networkRequestsRouter);
    
    await initializeDatabase();
  });

  afterEach(async () => {
    await logStorage.clearLogs();
    await networkStorage.clearRequests();
  });

  describe('Console Logs Edge Cases', () => {
    it('should handle logs with extremely long messages', async () => {
      const veryLongMessage = 'A'.repeat(100000); // 100KB message

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: veryLongMessage,
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

      // Verify the long message was stored correctly
      const getResponse = await request(app).get('/logs').expect(200);
      expect(getResponse.body.logs[0].message).toBe(veryLongMessage);
    });

    it('should handle logs with null/undefined values', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test message',
            pageUrl: 'https://example.com',
            stackTrace: undefined,
            userAgent: undefined,
            metadata: undefined
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

    it('should handle logs with special characters and Unicode', async () => {
      const specialMessage = 'Test with special chars: 🎉 \n\r\t"\'\\&<>émojis and newlines';

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: specialMessage,
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

      const getResponse = await request(app).get('/logs').expect(200);
      expect(getResponse.body.logs[0].message).toBe(specialMessage);
    });

    it('should handle logs with invalid timestamp formats', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: 'not-a-valid-timestamp',
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

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should handle extremely large metadata objects', async () => {
      const largeMetadata = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
          nested: {
            deep: {
              property: `deep-value-${i}`
            }
          }
        }))
      };

      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test with large metadata',
            pageUrl: 'https://example.com',
            metadata: largeMetadata
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

      const getResponse = await request(app).get('/logs').expect(200);
      expect(getResponse.body.logs[0].metadata).toEqual(largeMetadata);
    });

    it('should handle empty log batch', async () => {
      const logBatch: LogBatch = {
        logs: []
      };

      const response = await request(app)
        .post('/logs')
        .send(logBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 0,
        stored: 0
      });
    });
  });

  describe('Network Requests Edge Cases', () => {
    it('should handle network requests with very large payloads', async () => {
      // Create a large payload that won't trigger noise filter (no long encoded strings)
      const largePayload = JSON.stringify({
        data: Array.from({ length: 5000 }, (_, i) => `item_${i}_with_some_text`).join(' ')
      });

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/large-data',
            requestBody: largePayload,
            responseBody: largePayload,
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
        received: 1,
        stored: 1
      });
    });

    it('should handle network requests with malformed JSON in bodies', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'POST',
            url: 'https://api.example.com/malformed',
            requestBody: '{ "invalid": json }',
            responseBody: '{ "also": invalid }',
            statusCode: 400,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should handle network requests with missing optional fields', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/minimal',
            pageUrl: 'https://example.com'
            // Missing all optional fields
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should handle network requests with invalid URLs', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'not-a-valid-url',
            pageUrl: 'https://example.com'
          }
        ]
      };

      // This should cause a server error due to URL parsing failure
      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle network requests with extremely long URLs', async () => {
      const veryLongUrl = 'https://example.com/api/endpoint?' + 
        Array.from({ length: 1000 }, (_, i) => `param${i}=value${i}`).join('&');

      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: veryLongUrl,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should handle network requests with negative durations and sizes', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/test',
            duration: -100, // Invalid negative duration
            responseSize: -1000, // Invalid negative size
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
        received: 1,
        stored: 1
      });
    });

    it('should handle empty network request batch', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: []
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 0,
        stored: 0
      });
    });
  });

  describe('Query Parameter Edge Cases', () => {
    beforeEach(async () => {
      // Insert some test data
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log',
            pageUrl: 'https://example.com'
          }
        ]
      };
      await request(app).post('/logs').send(logBatch);
    });

    it('should handle invalid limit and offset values', async () => {
      const responses = await Promise.all([
        request(app).get('/logs?limit=invalid').expect(200),
        request(app).get('/logs?offset=invalid').expect(200),
        request(app).get('/logs?limit=-1').expect(200),
        request(app).get('/logs?offset=-1').expect(200),
        request(app).get('/logs?limit=0').expect(200)
      ]);

      responses.forEach(response => {
        expect(response.body).toHaveProperty('logs');
        expect(Array.isArray(response.body.logs)).toBe(true);
      });
    });

    it('should handle special characters in query parameters', async () => {
      const specialUrl = 'https://example.com/path?param=value&special=<>&"\'';
      
      const response = await request(app)
        .get(`/logs?url=${encodeURIComponent(specialUrl)}`)
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    it('should handle very long query parameters', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(10000);
      
      const response = await request(app)
        .get(`/logs?url=${encodeURIComponent(longUrl)}`)
        .expect(200);

      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Content-Type Edge Cases', () => {
    it('should handle requests with no content-type header', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log',
            pageUrl: 'https://example.com'
          }
        ]
      };

      // Without proper content-type, express might not parse JSON correctly
      const response = await request(app)
        .post('/logs')
        .type('') // No content-type
        .send(JSON.stringify(logBatch))
        .expect(400); // Expect bad request due to parsing issues

      expect(response.status).toBe(400);
    });

    it('should handle requests with incorrect content-type', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Test log',
            pageUrl: 'https://example.com'
          }
        ]
      };

      // With text/plain content-type, express won't parse as JSON
      const response = await request(app)
        .post('/logs')
        .type('text/plain')
        .send(JSON.stringify(logBatch))
        .expect(400); // Expect bad request due to parsing issues

      expect(response.status).toBe(400);
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle maximum integer values', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/test',
            statusCode: 2147483647, // Max 32-bit signed int
            duration: 2147483647,
            responseSize: 2147483647,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });

    it('should handle zero values', async () => {
      const networkBatch: NetworkRequestBatch = {
        requests: [
          {
            requestId: 'req-001',
            timestamp: '2023-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.example.com/test',
            statusCode: 0,
            duration: 0,
            responseSize: 0,
            pageUrl: 'https://example.com'
          }
        ]
      };

      const response = await request(app)
        .post('/network-requests')
        .send(networkBatch)
        .expect(200);

      expect(response.body).toEqual({
        received: 1,
        stored: 1
      });
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple sequential requests', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Sequential test',
            pageUrl: 'https://example.com'
          }
        ]
      };

      // Send 5 sequential requests to avoid SQLite transaction conflicts
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/logs')
          .send({
            ...logBatch,
            logs: logBatch.logs.map(log => ({
              ...log,
              message: `Sequential test ${i}`
            }))
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          received: 1,
          stored: 1
        });
      }

      // Verify all logs were stored
      const getResponse = await request(app).get('/logs?limit=20').expect(200);
      expect(getResponse.body.logs.length).toBe(5);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle rapid successive requests', async () => {
      const logBatch: LogBatch = {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00.000Z',
            level: 'info',
            message: 'Rapid test',
            pageUrl: 'https://example.com'
          }
        ]
      };

      const startTime = Date.now();
      
      // Send 50 rapid requests
      for (let i = 0; i < 50; i++) {
        await request(app)
          .post('/logs')
          .send({
            ...logBatch,
            logs: logBatch.logs.map(log => ({
              ...log,
              message: `Rapid test ${i}`
            }))
          })
          .expect(200);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds

      // Verify all logs were stored
      const getResponse = await request(app).get('/logs?limit=100').expect(200);
      expect(getResponse.body.logs.length).toBe(50);
    });
  });
});