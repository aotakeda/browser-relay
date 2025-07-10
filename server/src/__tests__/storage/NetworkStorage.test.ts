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

    describe('Request Body Capture', () => {
      it('should store request body when provided', async () => {
        const requestBody = JSON.stringify({ user: 'test', password: 'secret' });
        const mockRequest = createMockRequest({ 
          requestBody,
          method: 'POST'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe(requestBody);
        
        // Verify it's stored in database
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe(requestBody);
      });

      it('should handle null request body', async () => {
        const mockRequest = createMockRequest({ 
          requestBody: null,
          method: 'GET'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBeNull();
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBeNull();
      });

      it('should handle undefined request body', async () => {
        const mockRequest = createMockRequest({ 
          requestBody: undefined,
          method: 'GET'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBeUndefined();
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBeNull();
      });

      it('should truncate large request bodies', async () => {
        const largeRequestBody = 'x'.repeat(1024 * 1024 + 100); // 1MB + 100 bytes
        const mockRequest = createMockRequest({ 
          requestBody: largeRequestBody,
          method: 'POST'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe('x'.repeat(1024 * 1024) + '... [truncated]');
        expect(result[0].requestBody!.length).toBeLessThan(largeRequestBody.length);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe('x'.repeat(1024 * 1024) + '... [truncated]');
      });

      it('should handle form data request bodies', async () => {
        const formData = 'username=test&password=secret&csrf_token=abc123';
        const mockRequest = createMockRequest({ 
          requestBody: formData,
          method: 'POST',
          requestHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe(formData);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe(formData);
      });

      it('should handle binary request bodies', async () => {
        const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64');
        const mockRequest = createMockRequest({ 
          requestBody: binaryData,
          method: 'POST',
          requestHeaders: { 'Content-Type': 'application/octet-stream' }
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe(binaryData);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe(binaryData);
      });
    });

    describe('Response Body Capture', () => {
      it('should store response body when provided', async () => {
        const responseBody = JSON.stringify({ success: true, data: [] });
        const mockRequest = createMockRequest({ 
          responseBody,
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe(responseBody);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe(responseBody);
      });

      it('should handle null response body', async () => {
        const mockRequest = createMockRequest({ 
          responseBody: null,
          statusCode: 204
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBeNull();
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBeNull();
      });

      it('should handle undefined response body', async () => {
        const mockRequest = createMockRequest({ 
          responseBody: undefined,
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBeUndefined();
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBeNull();
      });

      it('should truncate large response bodies', async () => {
        const largeResponseBody = 'y'.repeat(1024 * 1024 + 100); // 1MB + 100 bytes
        const mockRequest = createMockRequest({ 
          responseBody: largeResponseBody,
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe('y'.repeat(1024 * 1024) + '... [truncated]');
        expect(result[0].responseBody!.length).toBeLessThan(largeResponseBody.length);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe('y'.repeat(1024 * 1024) + '... [truncated]');
      });

      it('should handle HTML response bodies', async () => {
        const htmlResponse = '<html><body><h1>Hello World</h1></body></html>';
        const mockRequest = createMockRequest({ 
          responseBody: htmlResponse,
          statusCode: 200,
          responseHeaders: { 'Content-Type': 'text/html' }
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe(htmlResponse);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe(htmlResponse);
      });

      it('should handle XML response bodies', async () => {
        const xmlResponse = '<?xml version="1.0"?><root><item>data</item></root>';
        const mockRequest = createMockRequest({ 
          responseBody: xmlResponse,
          statusCode: 200,
          responseHeaders: { 'Content-Type': 'application/xml' }
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe(xmlResponse);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe(xmlResponse);
      });

      it('should handle empty response bodies', async () => {
        const mockRequest = createMockRequest({ 
          responseBody: '',
          statusCode: 204
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe('');
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe('');
      });

      it('should handle response body with special characters', async () => {
        const specialCharResponse = '{"message": "Hello 世界! 🌍", "emoji": "🚀"}';
        const mockRequest = createMockRequest({ 
          responseBody: specialCharResponse,
          statusCode: 200,
          responseHeaders: { 'Content-Type': 'application/json; charset=utf-8' }
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe(specialCharResponse);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseBody).toBe(specialCharResponse);
      });
    });

    describe('Size Limits and Truncation', () => {
      it('should respect maximum request body size limit', async () => {
        // Test exactly at the limit
        const exactLimitBody = 'x'.repeat(1024 * 1024); // Exactly 1MB
        const mockRequest = createMockRequest({ 
          requestBody: exactLimitBody,
          method: 'POST'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe(exactLimitBody);
        expect(result[0].requestBody!.length).toBe(1024 * 1024);
      });

      it('should respect maximum response body size limit', async () => {
        // Test exactly at the limit
        const exactLimitBody = 'y'.repeat(1024 * 1024); // Exactly 1MB
        const mockRequest = createMockRequest({ 
          responseBody: exactLimitBody,
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseBody).toBe(exactLimitBody);
        expect(result[0].responseBody!.length).toBe(1024 * 1024);
      });

      it('should truncate both request and response bodies when both are large', async () => {
        const largeRequestBody = 'a'.repeat(1024 * 1024 + 50);
        const largeResponseBody = 'b'.repeat(1024 * 1024 + 100);
        
        const mockRequest = createMockRequest({ 
          requestBody: largeRequestBody,
          responseBody: largeResponseBody,
          method: 'POST',
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe('a'.repeat(1024 * 1024) + '... [truncated]');
        expect(result[0].responseBody).toBe('b'.repeat(1024 * 1024) + '... [truncated]');
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe('a'.repeat(1024 * 1024) + '... [truncated]');
        expect(retrieved!.responseBody).toBe('b'.repeat(1024 * 1024) + '... [truncated]');
      });

      it('should handle edge case of empty strings vs null', async () => {
        const mockRequest = createMockRequest({ 
          requestBody: '',
          responseBody: '',
          method: 'POST',
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestBody).toBe('');
        expect(result[0].responseBody).toBe('');
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestBody).toBe('');
        expect(retrieved!.responseBody).toBe('');
      });
    });

    describe('Headers and Metadata Storage', () => {
      it('should store request headers when provided', async () => {
        const requestHeaders = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
          'X-Custom-Header': 'custom-value'
        };
        
        const mockRequest = createMockRequest({ 
          requestHeaders,
          method: 'POST'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestHeaders).toEqual(requestHeaders);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestHeaders).toEqual(requestHeaders);
      });

      it('should store response headers when provided', async () => {
        const responseHeaders = {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Rate-Limit': '100'
        };
        
        const mockRequest = createMockRequest({ 
          responseHeaders,
          statusCode: 200
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].responseHeaders).toEqual(responseHeaders);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.responseHeaders).toEqual(responseHeaders);
      });

      it('should store metadata when provided', async () => {
        const metadata = {
          source: 'fetch',
          intercepted: true,
          requestSize: 500,
          responseSize: 1200
        };
        
        const mockRequest = createMockRequest({ metadata });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].metadata).toEqual(metadata);
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.metadata).toEqual(metadata);
      });

      it('should handle null/undefined headers gracefully', async () => {
        const mockRequest = createMockRequest({ 
          requestHeaders: undefined,
          responseHeaders: undefined,
          method: 'GET'
        });
        
        const result = await networkStorage.insertRequests([mockRequest]);
        
        expect(result[0].requestHeaders).toBeUndefined();
        expect(result[0].responseHeaders).toBeUndefined();
        
        const retrieved = await networkStorage.getRequestById(result[0].id!);
        expect(retrieved!.requestHeaders).toBeUndefined();
        expect(retrieved!.responseHeaders).toBeUndefined();
      });
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

  describe('searchRequests', () => {
    beforeEach(async () => {
      const mockRequests = [
        createMockRequest({ 
          requestId: 'search-1', 
          url: 'https://api.example.com/users',
          method: 'GET',
          requestHeaders: { 'Authorization': 'Bearer token123' },
          responseHeaders: { 'Content-Type': 'application/json' },
          requestBody: null,
          responseBody: JSON.stringify({ users: [{ id: 1, name: 'John' }] })
        }),
        createMockRequest({ 
          requestId: 'search-2', 
          url: 'https://example.com/api/auth/login',
          method: 'POST',
          requestHeaders: { 'Content-Type': 'application/json' },
          responseHeaders: { 'Set-Cookie': 'session=abc123' },
          requestBody: JSON.stringify({ username: 'admin', password: 'secret' }),
          responseBody: JSON.stringify({ token: 'jwt-token-here' })
        }),
        createMockRequest({ 
          requestId: 'search-3', 
          url: 'https://analytics.example.com/track',
          method: 'POST',
          requestHeaders: { 'X-Api-Key': 'analytics-key' },
          responseHeaders: { 'Status': 'OK' },
          requestBody: JSON.stringify({ event: 'page_view', error: 'not found' }),
          responseBody: 'OK'
        }),
        createMockRequest({ 
          requestId: 'search-4', 
          url: 'https://example.com/static/image.png',
          method: 'GET',
          requestHeaders: { 'Accept': 'image/png' },
          responseHeaders: { 'Content-Type': 'image/png' },
          requestBody: null,
          responseBody: null
        })
      ];
      await networkStorage.insertRequests(mockRequests);
    });

    it('should search by URL substring', async () => {
      const result = await networkStorage.searchRequests('api.example.com');
      
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://api.example.com/users');
    });

    it('should search by URL path', async () => {
      const result = await networkStorage.searchRequests('/auth/login');
      
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/api/auth/login');
    });

    it('should search in request headers', async () => {
      const result = await networkStorage.searchRequests('Bearer token123');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestHeaders).toEqual({ 'Authorization': 'Bearer token123' });
    });

    it('should search in response headers', async () => {
      const result = await networkStorage.searchRequests('session=abc123');
      
      expect(result).toHaveLength(1);
      expect(result[0].responseHeaders).toEqual({ 'Set-Cookie': 'session=abc123' });
    });

    it('should search in request body', async () => {
      const result = await networkStorage.searchRequests('username');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestBody).toContain('username');
    });

    it('should search in response body', async () => {
      const result = await networkStorage.searchRequests('jwt-token-here');
      
      expect(result).toHaveLength(1);
      expect(result[0].responseBody).toContain('jwt-token-here');
    });

    it('should search across multiple fields', async () => {
      const result = await networkStorage.searchRequests('example.com');
      
      expect(result.length).toBeGreaterThanOrEqual(3); // Should match URLs containing example.com
      expect(result.every((r: NetworkRequest) => r.url.includes('example.com'))).toBe(true);
    });

    it('should search for error-related content', async () => {
      const result = await networkStorage.searchRequests('error');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestBody).toContain('error');
    });

    it('should search for authentication-related content', async () => {
      const result = await networkStorage.searchRequests('/auth/');
      
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain('auth');
    });

    it('should search for API key content', async () => {
      const result = await networkStorage.searchRequests('analytics-key');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestHeaders).toEqual({ 'X-Api-Key': 'analytics-key' });
    });

    it('should be case-insensitive', async () => {
      const result = await networkStorage.searchRequests('USERS');
      
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain('users');
    });

    it('should handle empty search query', async () => {
      const result = await networkStorage.searchRequests('');
      
      expect(result).toHaveLength(4); // Should match all requests
    });

    it('should handle search query with no matches', async () => {
      const result = await networkStorage.searchRequests('nonexistent-search-term');
      
      expect(result).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      const result = await networkStorage.searchRequests('example.com', 2);
      
      expect(result).toHaveLength(2);
    });

    it('should search in JSON request bodies', async () => {
      const result = await networkStorage.searchRequests('admin');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestBody).toContain('admin');
    });

    it('should search in JSON response bodies', async () => {
      const result = await networkStorage.searchRequests('John');
      
      expect(result).toHaveLength(1);
      expect(result[0].responseBody).toContain('John');
    });

    it('should handle requests with null bodies', async () => {
      const result = await networkStorage.searchRequests('image.png');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestBody).toBeNull();
      expect(result[0].responseBody).toBeNull();
    });

    it('should search for content-type headers', async () => {
      const result = await networkStorage.searchRequests('application/json');
      
      expect(result).toHaveLength(2);
      expect(result.every((r: NetworkRequest) => 
        JSON.stringify(r.requestHeaders || {}).includes('application/json') ||
        JSON.stringify(r.responseHeaders || {}).includes('application/json')
      )).toBe(true);
    });

    it('should handle special characters in search', async () => {
      const result = await networkStorage.searchRequests('page_view');
      
      expect(result).toHaveLength(1);
      expect(result[0].requestBody).toContain('page_view');
    });

    it('should return results in descending timestamp order', async () => {
      const result = await networkStorage.searchRequests('example.com');
      
      expect(result.length).toBeGreaterThanOrEqual(3); // At least 3 results
      // Results should be ordered by timestamp DESC (most recent first)
      for (let i = 0; i < result.length - 1; i++) {
        expect(new Date(result[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(result[i + 1].timestamp).getTime()
        );
      }
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