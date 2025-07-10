import { networkStorage } from '@/storage/NetworkStorage';
import { NetworkRequest } from '@/types';
import { initializeDatabase } from '@/storage/database';

// Mock the handleToolCall function from mcp.ts
const mockHandleToolCall = async (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case "search_network_requests": {
      const requests = await networkStorage.searchRequests(
        args.query as string,
        (args.limit as number) || 100
      );
      return { requests };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

describe('MCP Tool: search_network_requests', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    await networkStorage.clearRequests();
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

  describe('MCP Tool Integration', () => {
    beforeEach(async () => {
      // Setup test data
      const mockRequests = [
        createMockRequest({ 
          requestId: 'mcp-search-1', 
          url: 'https://api.example.com/users',
          method: 'GET',
          requestHeaders: { 'Authorization': 'Bearer token123' },
          responseHeaders: { 'Content-Type': 'application/json' },
          requestBody: null,
          responseBody: JSON.stringify({ users: [{ id: 1, name: 'Alice' }] })
        }),
        createMockRequest({ 
          requestId: 'mcp-search-2', 
          url: 'https://example.com/api/auth/login',
          method: 'POST',
          requestHeaders: { 'Content-Type': 'application/json' },
          responseHeaders: { 'Set-Cookie': 'session=xyz789' },
          requestBody: JSON.stringify({ username: 'admin', password: 'secret' }),
          responseBody: JSON.stringify({ token: 'jwt-token-abc' })
        }),
        createMockRequest({ 
          requestId: 'mcp-search-3', 
          url: 'https://analytics.example.com/track',
          method: 'POST',
          requestHeaders: { 'X-Api-Key': 'analytics-key-123' },
          responseHeaders: { 'Status': 'OK' },
          requestBody: JSON.stringify({ event: 'page_view', error: 'network timeout' }),
          responseBody: 'OK'
        })
      ];
      await networkStorage.insertRequests(mockRequests);
    });

    it('should search network requests via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'api.example.com',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].url).toBe('https://api.example.com/users');
    });

    it('should search in request headers via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'Bearer token123',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].requestHeaders).toEqual({ 'Authorization': 'Bearer token123' });
    });

    it('should search in response headers via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'session=xyz789',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].responseHeaders).toEqual({ 'Set-Cookie': 'session=xyz789' });
    });

    it('should search in request body via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'username',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].requestBody).toContain('username');
    });

    it('should search in response body via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'jwt-token-abc',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].responseBody).toContain('jwt-token-abc');
    });

    it('should handle limit parameter in MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'example.com',
        limit: 2
      });

      expect(result.requests).toHaveLength(2);
    });

    it('should handle default limit in MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'example.com'
        // No limit specified, should default to 100
      });

      expect(result.requests).toHaveLength(3);
    });

    it('should search for authentication-related content via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: '/auth/',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].url).toContain('auth');
    });

    it('should search for error-related content via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'error',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].requestBody).toContain('error');
    });

    it('should search for API keys via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'analytics-key-123',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].requestHeaders).toEqual({ 'X-Api-Key': 'analytics-key-123' });
    });

    it('should return empty results for non-matching queries via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'nonexistent-content',
        limit: 100
      });

      expect(result.requests).toHaveLength(0);
    });

    it('should handle empty query via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: '',
        limit: 100
      });

      expect(result.requests).toHaveLength(3); // Should match all requests
    });

    it('should search across multiple content types via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'application/json',
        limit: 100
      });

      expect(result.requests).toHaveLength(2);
      expect(result.requests.every((r: NetworkRequest) => 
        JSON.stringify(r.requestHeaders || {}).includes('application/json') ||
        JSON.stringify(r.responseHeaders || {}).includes('application/json')
      )).toBe(true);
    });

    it('should search for session-related content via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'session',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].responseHeaders).toHaveProperty('Set-Cookie');
    });

    it('should search for tracking/analytics content via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'analytics',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].url).toContain('analytics');
    });

    it('should handle case-insensitive search via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'USERS',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].url).toContain('users');
    });

    it('should return results in correct order via MCP tool', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'example.com',
        limit: 100
      });

      expect(result.requests).toHaveLength(3);
      // Results should be ordered by timestamp DESC (most recent first)
      for (let i = 0; i < result.requests.length - 1; i++) {
        expect(new Date(result.requests[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(result.requests[i + 1].timestamp).getTime()
        );
      }
    });
  });

  describe('MCP Tool Error Handling', () => {
    it('should handle missing query parameter', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        limit: 100
        // Missing required query parameter - should be handled gracefully
      });
      
      // Should return empty results when query is undefined
      expect(result.requests).toBeDefined();
      expect(Array.isArray(result.requests)).toBe(true);
    });

    it('should handle invalid limit parameter', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'test',
        limit: NaN // Invalid limit type that becomes a number
      });

      // Should default to 100 when limit is invalid
      expect(result.requests).toBeDefined();
    });

    it('should handle unknown tool name', async () => {
      await expect(mockHandleToolCall('unknown_tool', {
        query: 'test'
      })).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('MCP Tool Response Format', () => {
    beforeEach(async () => {
      const mockRequest = createMockRequest({ 
        requestId: 'format-test', 
        url: 'https://example.com/test',
        responseBody: JSON.stringify({ data: 'test' })
      });
      await networkStorage.insertRequests([mockRequest]);
    });

    it('should return response in correct format', async () => {
      const result = await mockHandleToolCall('search_network_requests', {
        query: 'test',
        limit: 100
      });

      expect(result).toHaveProperty('requests');
      expect(Array.isArray(result.requests)).toBe(true);
      expect(result.requests).toHaveLength(1);
      
      const request = result.requests[0];
      expect(request).toHaveProperty('requestId');
      expect(request).toHaveProperty('timestamp');
      expect(request).toHaveProperty('method');
      expect(request).toHaveProperty('url');
      expect(request).toHaveProperty('pageUrl');
      expect(request).toHaveProperty('userAgent');
      expect(request).toHaveProperty('statusCode');
      expect(request).toHaveProperty('duration');
    });

    it('should return properly parsed headers and metadata', async () => {
      const mockRequest = createMockRequest({ 
        requestId: 'headers-test', 
        url: 'https://example.com/headers',
        requestHeaders: { 'Custom-Header': 'value' },
        responseHeaders: { 'Response-Header': 'response-value' },
        metadata: { custom: 'metadata' }
      });
      await networkStorage.insertRequests([mockRequest]);

      const result = await mockHandleToolCall('search_network_requests', {
        query: 'headers',
        limit: 100
      });

      expect(result.requests).toHaveLength(1);
      const request = result.requests[0];
      expect(request.requestHeaders).toEqual({ 'Custom-Header': 'value' });
      expect(request.responseHeaders).toEqual({ 'Response-Header': 'response-value' });
      expect(request.metadata).toEqual({ custom: 'metadata' });
    });
  });
});