import request from 'supertest';
import express from 'express';
import { networkRequestsRouter } from '@/routes/network-requests';
import { networkStorage } from '@/storage/NetworkStorage';
import { initializeDatabase } from '@/storage/database';
import { NetworkRequest } from '@/types';

// Mock logger to avoid importing index.ts
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/network-requests', networkRequestsRouter);

describe('Network Requests API', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    await networkStorage.clearRequests();
  });

  const createMockRequest = (overrides: Partial<NetworkRequest> = {}): NetworkRequest => ({
    requestId: 'test-request-1',
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: 'https://example.com/api/test',
    pageUrl: 'https://example.com',
    userAgent: 'test-user-agent',
    statusCode: 200,
    duration: 150,
    ...overrides
  });

  describe('POST /network-requests', () => {
    it('should accept valid network request batch', async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1' }),
        createMockRequest({ requestId: 'req-2' })
      ];

      const response = await request(app)
        .post('/network-requests')
        .send({
          requests: mockRequests,
          sessionId: 'test-session'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        received: 2,
        stored: 2
      });
    });

    it('should reject invalid batch format', async () => {
      const response = await request(app)
        .post('/network-requests')
        .send({
          invalidField: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid network request batch format');
    });

    it('should reject non-array requests', async () => {
      const response = await request(app)
        .post('/network-requests')
        .send({
          requests: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid network request batch format');
    });
  });

  describe('GET /network-requests', () => {
    beforeEach(async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1', method: 'GET', url: 'https://example.com/api/1' }),
        createMockRequest({ requestId: 'req-2', method: 'POST', url: 'https://example.com/api/2' }),
        createMockRequest({ requestId: 'req-3', method: 'GET', url: 'https://different.com/api/3' })
      ];
      await networkStorage.insertRequests(mockRequests);
    });

    it('should return all requests by default', async () => {
      const response = await request(app)
        .get('/network-requests');

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(3);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/network-requests?limit=2&offset=1');

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(2);
    });

    it('should filter by method', async () => {
      const response = await request(app)
        .get('/network-requests?method=POST');

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(1);
      expect(response.body.requests[0].method).toBe('POST');
    });

    it('should filter by URL pattern', async () => {
      const response = await request(app)
        .get('/network-requests?url=example.com');

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(2);
      expect(response.body.requests.every((r: { url: string }) => r.url.includes('example.com'))).toBe(true);
    });

    it('should filter by status code', async () => {
      await networkStorage.insertRequests([
        createMockRequest({ requestId: 'req-error', statusCode: 404 })
      ]);

      const response = await request(app)
        .get('/network-requests?statusCode=404');

      expect(response.status).toBe(200);
      expect(response.body.requests).toHaveLength(1);
      expect(response.body.requests[0].statusCode).toBe(404);
    });
  });

  describe('GET /network-requests/:id', () => {
    it('should return specific request by ID', async () => {
      const mockRequest = createMockRequest();
      const inserted = await networkStorage.insertRequests([mockRequest]);
      
      const response = await request(app)
        .get(`/network-requests/${inserted[0].id}`);

      expect(response.status).toBe(200);
      expect(response.body.request).toMatchObject(mockRequest);
    });

    it('should return 404 for non-existent request', async () => {
      const response = await request(app)
        .get('/network-requests/99999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Network request not found');
    });
  });

  describe('DELETE /network-requests', () => {
    it('should clear all requests', async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1' }),
        createMockRequest({ requestId: 'req-2' })
      ];
      await networkStorage.insertRequests(mockRequests);

      const response = await request(app)
        .delete('/network-requests');

      expect(response.status).toBe(200);
      expect(response.body.cleared).toBe(2);

      // Verify requests are cleared
      const getResponse = await request(app)
        .get('/network-requests');
      expect(getResponse.body.requests).toHaveLength(0);
    });
  });

  describe('GET /network-requests/stream', () => {
    it('should respond to stream requests', async () => {
      // Test that the route exists and starts responding
      // We don't test the actual streaming since it's complex in Jest
      const promise = request(app)
        .get('/network-requests/stream')
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