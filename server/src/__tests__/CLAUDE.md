# Testing Guide for Browser Relay

This guide provides comprehensive documentation for writing tests in the Browser Relay codebase, including standardized patterns, utilities, and best practices.

## Table of Contents
- [Test Structure](#test-structure)
- [Utility Functions](#utility-functions)
- [Test Data Factories](#test-data-factories)
- [Database Testing](#database-testing)
- [Express App Testing](#express-app-testing)
- [Mocking Patterns](#mocking-patterns)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)

## Test Structure

### File Organization
```
__tests__/
├── utils/                    # Shared test utilities
│   ├── mocks.ts             # Centralized mock configurations
│   ├── factories.ts         # Test data factories
│   ├── database.ts          # Database testing utilities
│   └── express.ts           # Express app utilities
├── storage/                 # Storage layer tests
├── routes/                  # API route tests
├── mcp/                     # MCP server tests
└── setup.ts                 # Global test setup
```

### Standard Test File Template
```typescript
import { setupTestDatabase, cleanupTestData } from '../utils/database';
import { createMockNetworkRequest, createMockLogs } from '../utils/factories';
import { createNetworkRequestsApp } from '../utils/express';

describe('ComponentName', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('methodName', () => {
    it('should handle specific scenario', async () => {
      // Arrange
      const testData = createMockNetworkRequest();
      
      // Act
      const result = await someFunction(testData);
      
      // Assert
      expect(result).toMatchObject(expectedResult);
    });
  });
});
```

## Utility Functions

### Mocking Utilities (`utils/mocks.ts`)

#### Logger Mocking
```typescript
import { mockIndexLogger, clearAllMocks } from '../utils/mocks';

describe('Component with logging', () => {
  beforeEach(() => {
    mockIndexLogger(); // Mock the logger from @/index
  });

  afterEach(() => {
    clearAllMocks(); // Clear all mock call history
  });
});
```

#### Available Mock Functions
- `mockIndexLogger()` - Mock logger from @/index
- `mockUtilsLogger()` - Mock logger from @/utils/logger
- `mockMCPServer()` - Mock MCP server setup
- `mockDatabase()` - Mock database operations for unit tests
- `clearAllMocks()` - Clear all mock call history

### Database Utilities (`utils/database.ts`)

#### Standard Database Setup
```typescript
import { setupTestDatabase, cleanupTestData, getDatabaseCounts, assertDatabaseEmpty } from '../utils/database';

describe('Database-dependent test', () => {
  beforeAll(async () => {
    await setupTestDatabase(); // Initialize test database
  });

  afterEach(async () => {
    await cleanupTestData(); // Clean all test data after each test
  });

  it('should verify database state', async () => {
    // Insert test data
    await insertTestData();
    
    // Verify counts
    const counts = await getDatabaseCounts();
    expect(counts.requests).toBe(2);
    expect(counts.logs).toBe(1);
    
    // Clean and verify
    await cleanupTestData();
    await assertDatabaseEmpty();
  });
});
```

#### Available Database Functions
- `setupTestDatabase()` - Initialize database for testing
- `cleanupTestData()` - Clean all test data (logs + requests)
- `getDatabaseCounts()` - Get current database record counts
- `assertDatabaseEmpty()` - Assert database has no test data
- `resetTestDatabase()` - Complete database reset (use sparingly)

### Express App Utilities (`utils/express.ts`)

#### Creating Test Apps
```typescript
import { createLogsApp, createNetworkRequestsApp, createFullApp } from '../utils/express';
import request from 'supertest';

describe('API Route Tests', () => {
  const app = createNetworkRequestsApp(); // Pre-configured app

  it('should handle POST requests', async () => {
    const response = await request(app)
      .post('/network-requests')
      .send(testData)
      .expect(200);
    
    expect(response.body).toMatchObject(expectedResponse);
  });
});
```

#### Available App Creators
- `createBasicApp()` - Basic Express app with common middleware
- `createLogsApp()` - App with logs router mounted
- `createNetworkRequestsApp()` - App with network requests router
- `createNetworkConfigApp()` - App with network config router
- `createFullApp()` - App with all routers (for integration tests)
- `addTestRoutes(app)` - Add health check and test routes

## Test Data Factories

### Factory Functions (`utils/factories.ts`)

#### Console Log Factories
```typescript
import { 
  createMockLog, 
  createMockLogs, 
  createLogBatch,
  createLogWithMetadata,
  createLevelVarietyLogs 
} from '../utils/factories';

// Single log with overrides
const log = createMockLog({ 
  level: 'error', 
  message: 'Custom error message' 
});

// Multiple logs
const logs = createMockLogs(5, { 
  pageUrl: 'https://test.com' 
});

// Log batch for API testing
const batch = createLogBatch(logs);

// Log with complex metadata
const logWithMeta = createLogWithMetadata({
  requestId: 'abc123',
  userId: 'user456'
});

// Logs with different levels
const varietyLogs = createLevelVarietyLogs();
```

#### Network Request Factories
```typescript
import { 
  createMockNetworkRequest,
  createMockNetworkRequests,
  createNetworkRequestBatch,
  createMethodVarietyRequests,
  createStatusVarietyRequests,
  createLargeBodyRequest,
  createComplexHeadersRequest
} from '../utils/factories';

// Single request with overrides
const request = createMockNetworkRequest({
  method: 'POST',
  statusCode: 201,
  url: 'https://api.example.com/users'
});

// Multiple requests
const requests = createMockNetworkRequests(3, {
  pageUrl: 'https://test-page.com'
});

// Request batch for API testing
const batch = createNetworkRequestBatch(requests);

// Pre-configured variety requests
const methodRequests = createMethodVarietyRequests(); // GET, POST, PUT, DELETE
const statusRequests = createStatusVarietyRequests(); // 200, 404, 500, 429
const largeRequest = createLargeBodyRequest(5000); // Request with 5KB body
const complexRequest = createComplexHeadersRequest(); // Request with many headers
```

#### Factory Base Templates
All factories use consistent base templates:
- **Base timestamp**: `2023-01-01T00:00:00.000Z`
- **Incremental timestamps**: Each item in multi-item factories gets +1 second
- **Realistic defaults**: All factories provide realistic default values
- **Easy overrides**: Use the overrides parameter to customize any field

## Database Testing

### Transaction Testing
```typescript
describe('Transaction handling', () => {
  it('should rollback on error', async () => {
    const invalidData = createMockLogs(1, { message: '' }); // Invalid log
    
    const initialCount = await getDatabaseCounts();
    
    try {
      await logStorage.insertLogs(invalidData);
    } catch (error) {
      // Expected to throw
    }
    
    const finalCount = await getDatabaseCounts();
    expect(finalCount.logs).toBe(initialCount.logs); // No change
  });
});
```

### Circular Buffer Testing
```typescript
describe('Circular buffer', () => {
  it('should maintain maximum record limits', async () => {
    // Insert more than the limit (10000 records)
    const manyRequests = Array.from({ length: 50 }, (_, i) => 
      createMockNetworkRequest({ requestId: `req-${i}` })
    );
    
    await networkStorage.insertRequests(manyRequests);
    
    const count = await networkStorage.getRequestCount();
    expect(count).toBeLessThanOrEqual(10000);
  });
});
```

## Express App Testing

### Standard API Testing Pattern
```typescript
import request from 'supertest';
import { createNetworkRequestsApp } from '../utils/express';
import { createNetworkRequestBatch } from '../utils/factories';

describe('Network Requests API', () => {
  const app = createNetworkRequestsApp();

  describe('POST /network-requests', () => {
    it('should accept valid request batch', async () => {
      const batch = createNetworkRequestBatch();
      
      const response = await request(app)
        .post('/network-requests')
        .send(batch)
        .expect(200);
      
      expect(response.body).toMatchObject({
        received: 2,
        stored: 2
      });
    });

    it('should reject invalid data', async () => {
      await request(app)
        .post('/network-requests')
        .send({ invalid: 'data' })
        .expect(400);
    });
  });

  describe('GET /network-requests', () => {
    beforeEach(async () => {
      const requests = createMockNetworkRequests(3);
      await networkStorage.insertRequests(requests);
    });

    it('should return stored requests', async () => {
      const response = await request(app)
        .get('/network-requests')
        .expect(200);
      
      expect(response.body.requests).toHaveLength(3);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/network-requests?limit=2&offset=1')
        .expect(200);
      
      expect(response.body.requests).toHaveLength(2);
    });
  });
});
```

## Mocking Patterns

### Automatic Global Mocks (Applied via setup.ts)
- **MCP Server**: Automatically mocked to prevent ESM import issues
- **Logger**: Automatically mocked from @/index

### Manual Mocks for Specific Tests
```typescript
// Mock external dependencies
jest.mock('external-library', () => ({
  someFunction: jest.fn().mockReturnValue('mocked-value')
}));

// Mock internal modules
jest.mock('@/storage/database', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 })
}));
```

### Mock Restoration
```typescript
describe('Test with manual mocks', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear call history
  });

  afterAll(() => {
    jest.restoreAllMocks(); // Restore original implementations
  });
});
```

## Best Practices

### 1. Test Organization
- **One describe block per component/method**
- **Clear test descriptions using "should..."**
- **Group related tests logically**
- **Use nested describe blocks for method grouping**

### 2. Test Data Management
- **Always use factories for test data creation**
- **Use realistic but predictable test data**
- **Clean up data after each test**
- **Avoid hardcoded values in tests**

### 3. Async Testing
- **Always use async/await for database operations**
- **Properly handle Promise rejections**
- **Use appropriate timeouts for long operations**

### 4. Assertions
- **Use specific matchers (toMatchObject, toHaveLength)**
- **Test both positive and negative cases**
- **Verify side effects (database changes, mock calls)**
- **Assert on structure, not exact values when appropriate**

### 5. Database Testing
- **Use transactions in tests when possible**
- **Test error conditions and rollbacks**
- **Verify circular buffer behavior**
- **Test concurrent operations when relevant**

## Common Patterns

### Testing Storage Functions
```typescript
describe('StorageFunction', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should store and retrieve data', async () => {
    const testData = createMockNetworkRequest();
    
    const stored = await networkStorage.insertRequests([testData]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(testData);
    
    const retrieved = await networkStorage.getRequests(10, 0);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toMatchObject(testData);
  });
});
```

### Testing API Routes
```typescript
describe('API Route', () => {
  const app = createNetworkRequestsApp();

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should handle valid requests', async () => {
    const requestData = createNetworkRequestBatch();
    
    const response = await request(app)
      .post('/endpoint')
      .send(requestData)
      .expect(200);
    
    expect(response.body).toMatchObject(expectedStructure);
  });
});
```

### Testing Error Conditions
```typescript
describe('Error Handling', () => {
  it('should handle invalid input gracefully', async () => {
    const invalidData = createMockLog({ message: '' });
    
    await expect(logStorage.insertLogs([invalidData]))
      .rejects
      .toThrow(); // or specific error check
  });

  it('should log errors appropriately', async () => {
    const mockLogger = mockIndexLogger();
    
    // Trigger error condition
    await triggerErrorCondition();
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Expected error message'),
      expect.any(Error)
    );
  });
});
```

### Testing MCP Functions
```typescript
describe('MCP Tool', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should return structured data for AI consumption', async () => {
    // Setup test data
    const requests = createMockNetworkRequests(5);
    await networkStorage.insertRequests(requests);
    
    // Test MCP tool
    const result = await mcpTool.execute({ limit: 3 });
    
    expect(result.requests).toHaveLength(3);
    expect(result.requests[0]).toMatchObject({
      method: expect.any(String),
      url: expect.any(String),
      statusCode: expect.any(Number),
      // Verify minimal structure for AI
    });
  });
});
```

## Performance Testing

### Load Testing
```typescript
describe('Performance', () => {
  it('should handle large batches efficiently', async () => {
    const largeDataSet = createMockNetworkRequests(1000);
    
    const startTime = Date.now();
    await networkStorage.insertRequests(largeDataSet);
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeLessThan(5000); // 5 second limit
  });
});
```

### Memory Testing
```typescript
describe('Memory Management', () => {
  it('should maintain memory limits', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Process large amount of data
    for (let i = 0; i < 100; i++) {
      const data = createMockNetworkRequests(100);
      await networkStorage.insertRequests(data);
      await cleanupTestData();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB limit
  });
});
```

## Debugging Tests

### Useful Debug Patterns
```typescript
// Log test data for debugging
console.log('Test data:', JSON.stringify(testData, null, 2));

// Check database state during tests
const counts = await getDatabaseCounts();
console.log('Database counts:', counts);

// Verify mock calls
console.log('Mock calls:', mockFunction.mock.calls);

// Check test timing
console.time('operation');
await someOperation();
console.timeEnd('operation');
```

### Common Issues and Solutions

1. **Tests failing intermittently**: Ensure proper cleanup in `afterEach`
2. **Database conflicts**: Use unique test data per test
3. **Mock issues**: Clear mocks between tests
4. **Async issues**: Always await async operations
5. **Memory leaks**: Verify cleanup utilities are called

This guide ensures all tests in the Browser Relay codebase follow consistent, maintainable patterns that provide reliable test coverage and excellent developer experience.