import { ConsoleLog, NetworkRequest, LogBatch, NetworkRequestBatch } from '@/types';

/**
 * Standardized test data factories for consistent test data generation
 */

// Base timestamp for consistent test data
const BASE_TIMESTAMP = '2023-01-01T00:00:00.000Z';

/**
 * Create a mock console log with optional overrides
 */
export const createMockLog = (overrides: Partial<ConsoleLog> = {}): ConsoleLog => ({
  timestamp: BASE_TIMESTAMP,
  level: 'info',
  message: 'Test log message',
  pageUrl: 'https://example.com',
  userAgent: 'Mozilla/5.0 (Test Browser)',
  ...overrides
});

/**
 * Create multiple mock logs
 */
export const createMockLogs = (count: number, baseOverrides: Partial<ConsoleLog> = {}): ConsoleLog[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockLog({
      ...baseOverrides,
      message: `Test log message ${index + 1}`,
      timestamp: new Date(Date.parse(BASE_TIMESTAMP) + index * 1000).toISOString()
    })
  );
};

/**
 * Create a log batch for API testing
 */
export const createLogBatch = (logs?: ConsoleLog[]): LogBatch => ({
  logs: logs || createMockLogs(2)
});

/**
 * Create a mock network request with optional overrides
 */
export const createMockNetworkRequest = (overrides: Partial<NetworkRequest> = {}): NetworkRequest => ({
  requestId: 'test-request-1',
  timestamp: BASE_TIMESTAMP,
  method: 'GET',
  url: 'https://api.example.com/data',
  statusCode: 200,
  duration: 150,
  pageUrl: 'https://example.com',
  userAgent: 'Mozilla/5.0 (Test Browser)',
  requestHeaders: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-token'
  },
  responseHeaders: {
    'Content-Type': 'application/json',
    'Content-Length': '1234'
  },
  requestBody: '{"query": "test"}',
  responseBody: '{"result": "success", "data": []}',
  responseSize: 1234,
  ...overrides
});

/**
 * Create multiple mock network requests
 */
export const createMockNetworkRequests = (
  count: number, 
  baseOverrides: Partial<NetworkRequest> = {}
): NetworkRequest[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockNetworkRequest({
      ...baseOverrides,
      requestId: `test-request-${index + 1}`,
      url: `https://api.example.com/data/${index + 1}`,
      timestamp: new Date(Date.parse(BASE_TIMESTAMP) + index * 1000).toISOString()
    })
  );
};

/**
 * Create a network request batch for API testing
 */
export const createNetworkRequestBatch = (requests?: NetworkRequest[]): NetworkRequestBatch => ({
  requests: requests || createMockNetworkRequests(2)
});

/**
 * Create requests with different HTTP methods
 */
export const createMethodVarietyRequests = (): NetworkRequest[] => [
  createMockNetworkRequest({ method: 'GET', url: 'https://api.example.com/users' }),
  createMockNetworkRequest({ method: 'POST', url: 'https://api.example.com/users', statusCode: 201 }),
  createMockNetworkRequest({ method: 'PUT', url: 'https://api.example.com/users/1' }),
  createMockNetworkRequest({ method: 'DELETE', url: 'https://api.example.com/users/1', statusCode: 204 })
];

/**
 * Create requests with different status codes
 */
export const createStatusVarietyRequests = (): NetworkRequest[] => [
  createMockNetworkRequest({ statusCode: 200, url: 'https://api.example.com/success' }),
  createMockNetworkRequest({ statusCode: 404, url: 'https://api.example.com/notfound' }),
  createMockNetworkRequest({ statusCode: 500, url: 'https://api.example.com/error' }),
  createMockNetworkRequest({ statusCode: 429, url: 'https://api.example.com/ratelimited' })
];

/**
 * Create logs with different levels
 */
export const createLevelVarietyLogs = (): ConsoleLog[] => [
  createMockLog({ level: 'info', message: 'Information message' }),
  createMockLog({ level: 'warn', message: 'Warning message' }),
  createMockLog({ level: 'error', message: 'Error message' }),
  createMockLog({ level: 'log', message: 'Debug message' })
];

/**
 * Create request with large body for truncation testing
 */
export const createLargeBodyRequest = (bodySize = 2000): NetworkRequest => {
  const largeBody = 'x'.repeat(bodySize);
  return createMockNetworkRequest({
    requestBody: largeBody,
    responseBody: largeBody
  });
};

/**
 * Create log with metadata for JSON parsing testing
 */
export const createLogWithMetadata = (metadata: Record<string, unknown>): ConsoleLog => {
  return createMockLog({
    metadata,
    message: 'Log with custom metadata'
  });
};

/**
 * Create request with complex headers for header testing
 */
export const createComplexHeadersRequest = (): NetworkRequest => {
  return createMockNetworkRequest({
    requestHeaders: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer complex-token',
      'X-Custom-Header': 'custom-value',
      'User-Agent': 'Test-Agent/1.0'
    },
    responseHeaders: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Set-Cookie': 'sessionid=abc123; Path=/; HttpOnly',
      'X-Rate-Limit-Remaining': '100'
    }
  });
};