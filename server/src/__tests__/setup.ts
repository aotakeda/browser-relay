// Test setup file
process.env.NODE_ENV = 'test';

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock MCP server to avoid ESM import issues
jest.mock('@/mcp/server', () => ({
  setupMCPServer: jest.fn().mockResolvedValue(undefined)
}));

// Global test cleanup
afterAll(async () => {
  // Allow time for any pending async operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});