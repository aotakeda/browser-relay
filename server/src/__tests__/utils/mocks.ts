// Note: jest is available globally in our test environment

/**
 * Centralized mock configurations for consistent testing
 */

// Standard logger mock that can be imported across all test files
export const createLoggerMock = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

// Pre-configured logger mock for immediate use
export const mockLogger = createLoggerMock();

// Mock index.ts logger
export const mockIndexLogger = () => {
  jest.mock('@/index', () => ({
    logger: mockLogger
  }));
  return mockLogger;
};

// Mock utils logger for tests that import it directly
export const mockUtilsLogger = () => {
  jest.mock('@/utils/logger', () => ({
    info: mockLogger.info,
    warn: mockLogger.warn,
    error: mockLogger.error,
    debug: mockLogger.debug
  }));
  return mockLogger;
};

// Mock MCP server setup to avoid initialization in tests
export const mockMCPServer = () => {
  jest.mock('@/mcp/server', () => ({
    setupMCPServer: jest.fn().mockResolvedValue(undefined)
  }));
};

// Mock database operations for unit tests that don't need real DB
export const mockDatabase = () => {
  const mockDb = {
    runAsync: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
    allAsync: jest.fn().mockResolvedValue([]),
    getAsync: jest.fn().mockResolvedValue(null)
  };
  
  jest.mock('@/storage/database', () => ({
    initializeDatabase: jest.fn().mockResolvedValue(undefined),
    runAsync: mockDb.runAsync,
    allAsync: mockDb.allAsync,
    getAsync: mockDb.getAsync
  }));
  
  return mockDb;
};

// Clear all mocks - useful in afterEach hooks
export const clearAllMocks = () => {
  Object.values(mockLogger).forEach(mockFn => mockFn.mockClear());
};