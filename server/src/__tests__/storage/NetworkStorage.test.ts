import { NetworkStorage } from '@/storage/NetworkStorage';
import { NetworkRequest } from '@/types';
import { initializeDatabase } from '@/storage/database';

// Mock logger to avoid importing index.ts
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('NetworkStorage', () => {
  let networkStorage: NetworkStorage;

  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(() => {
    networkStorage = new NetworkStorage();
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

  describe('insertRequests', () => {
    it('should insert single network request successfully', async () => {
      const mockRequest = createMockRequest();
      const result = await networkStorage.insertRequests([mockRequest]);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockRequest);
      expect(result[0].id).toBeDefined();
    });

    it('should insert multiple network requests', async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1', url: 'https://example.com/api/1' }),
        createMockRequest({ requestId: 'req-2', url: 'https://example.com/api/2' })
      ];
      
      const result = await networkStorage.insertRequests(mockRequests);
      
      expect(result).toHaveLength(2);
      expect(result[0].requestId).toBe('req-1');
      expect(result[1].requestId).toBe('req-2');
    });

    it('should handle requests with headers', async () => {
      const mockRequest = createMockRequest({
        requestHeaders: { 'Content-Type': 'application/json' },
        responseHeaders: { 'Server': 'nginx' }
      });
      
      const result = await networkStorage.insertRequests([mockRequest]);
      
      expect(result[0].requestHeaders).toEqual({ 'Content-Type': 'application/json' });
      expect(result[0].responseHeaders).toEqual({ 'Server': 'nginx' });
    });

    it('should truncate large request bodies', async () => {
      const largeBody = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const mockRequest = createMockRequest({
        requestBody: largeBody
      });
      
      const result = await networkStorage.insertRequests([mockRequest]);
      
      // The actual implementation should truncate at 1MB + '... [truncated]'
      expect(result[0].requestBody!.length).toBeLessThan(largeBody.length);
      expect(result[0].requestBody!.length).toBe(1024 * 1024 + '... [truncated]'.length);
      expect(result[0].requestBody!.endsWith('... [truncated]')).toBe(true);
    });
  });

  describe('getRequests', () => {
    beforeEach(async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1', method: 'GET', url: 'https://example.com/api/1' }),
        createMockRequest({ requestId: 'req-2', method: 'POST', url: 'https://example.com/api/2' }),
        createMockRequest({ requestId: 'req-3', method: 'GET', url: 'https://different.com/api/3' })
      ];
      await networkStorage.insertRequests(mockRequests);
    });

    it('should retrieve all requests by default', async () => {
      const result = await networkStorage.getRequests();
      
      expect(result).toHaveLength(3);
    });

    it('should support pagination', async () => {
      const result = await networkStorage.getRequests(2, 1);
      
      expect(result).toHaveLength(2);
    });

    it('should filter by method', async () => {
      const result = await networkStorage.getRequests(100, 0, { method: 'POST' });
      
      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('POST');
    });

    it('should filter by URL pattern', async () => {
      const result = await networkStorage.getRequests(100, 0, { url: 'example.com' });
      
      expect(result).toHaveLength(2);
      expect(result.every((r: NetworkRequest) => r.url.includes('example.com'))).toBe(true);
    });

    it('should filter by status code', async () => {
      await networkStorage.insertRequests([
        createMockRequest({ requestId: 'req-error', statusCode: 404 })
      ]);
      
      const result = await networkStorage.getRequests(100, 0, { statusCode: 404 });
      
      expect(result).toHaveLength(1);
      expect(result[0].statusCode).toBe(404);
    });
  });

  describe('getRequestById', () => {
    it('should retrieve request by ID', async () => {
      const mockRequest = createMockRequest();
      const inserted = await networkStorage.insertRequests([mockRequest]);
      
      const result = await networkStorage.getRequestById(inserted[0].id!);
      
      expect(result).toMatchObject(mockRequest);
    });

    it('should return null for non-existent ID', async () => {
      const result = await networkStorage.getRequestById(99999);
      
      expect(result).toBeNull();
    });
  });

  describe('getRequestByRequestId', () => {
    it('should retrieve request by requestId', async () => {
      const mockRequest = createMockRequest({ requestId: 'unique-request-id' });
      await networkStorage.insertRequests([mockRequest]);
      
      const result = await networkStorage.getRequestByRequestId('unique-request-id');
      
      expect(result).toMatchObject(mockRequest);
    });

    it('should return null for non-existent requestId', async () => {
      const result = await networkStorage.getRequestByRequestId('non-existent');
      
      expect(result).toBeNull();
    });
  });

  describe('clearRequests', () => {
    it('should clear all requests', async () => {
      const mockRequests = [
        createMockRequest({ requestId: 'req-1' }),
        createMockRequest({ requestId: 'req-2' })
      ];
      await networkStorage.insertRequests(mockRequests);
      
      const clearedCount = await networkStorage.clearRequests();
      const remainingRequests = await networkStorage.getRequests();
      
      expect(clearedCount).toBe(2);
      expect(remainingRequests).toHaveLength(0);
    });
  });

  describe('listeners', () => {
    it('should notify listeners when new requests are added', async () => {
      const listener = jest.fn();
      networkStorage.onNewRequest(listener);
      
      const mockRequest = createMockRequest();
      await networkStorage.insertRequests([mockRequest]);
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining(mockRequest));
    });

    it('should remove listeners correctly', async () => {
      const listener = jest.fn();
      networkStorage.onNewRequest(listener);
      networkStorage.offNewRequest(listener);
      
      const mockRequest = createMockRequest();
      await networkStorage.insertRequests([mockRequest]);
      
      expect(listener).not.toHaveBeenCalled();
    });
  });
});