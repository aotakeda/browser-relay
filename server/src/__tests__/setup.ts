// Test setup file
process.env.NODE_ENV = 'test';

// Increase timeout for async operations
jest.setTimeout(10000);

// Global test cleanup
afterAll(async () => {
  // Allow time for any pending async operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});