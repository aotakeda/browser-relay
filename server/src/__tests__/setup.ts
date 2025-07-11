// Global test setup file - applies to all tests
process.env.NODE_ENV = 'test';

// Increase timeout for async operations
jest.setTimeout(10000);

// Import and apply global mocks
import { mockMCPServer, mockIndexLogger } from './utils/mocks';

// Apply global mocks that all tests need
mockMCPServer();
mockIndexLogger();

// Global test cleanup
afterAll(async () => {
  // Allow time for any pending async operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});