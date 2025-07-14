// Test setup file for CLI unit tests

// Mock global fetch for all tests
global.fetch = jest.fn();

// Mock console methods to prevent noise in test output
const consoleMock = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Store original console methods
const originalConsole = { ...console };

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Mock console methods globally
  global.console.log = consoleMock.log;
  global.console.error = consoleMock.error;
  global.console.warn = consoleMock.warn;
  global.console.info = consoleMock.info;
});

afterEach(() => {
  // Restore original console after each test
  global.console.log = originalConsole.log;
  global.console.error = originalConsole.error;
  global.console.warn = originalConsole.warn;
  global.console.info = originalConsole.info;
});

// Export mocks for use in tests
export { consoleMock };