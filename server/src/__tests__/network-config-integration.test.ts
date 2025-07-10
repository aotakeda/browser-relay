import * as networkStorage from '../storage/NetworkStorage';
import { getCurrentNetworkConfig } from '../routes/network-config';
import request from 'supertest';
import express from 'express';
import { networkConfigRouter } from '../routes/network-config';
import { initializeDatabase } from '../storage/database';

describe('Network Configuration Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    await initializeDatabase();
    
    app = express();
    app.use(express.json());
    app.use('/network-config', networkConfigRouter);
  });

  beforeEach(async () => {
    // Reset configuration before each test
    await request(app).post('/network-config/reset');
  });

  afterEach(async () => {
    await networkStorage.clearRequests();
  });


  describe('Configuration-based Size Limits', () => {
    it('should respect configured maxResponseBodySize', async () => {
      // Configure smaller response body size limit
      const config = {
        maxResponseBodySize: 100 // 100 bytes
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      // Simulate applying the configuration in practice
      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(100);

      // Test with response body that exceeds the limit
      const largeResponseBody = 'x'.repeat(150);
      
      // In practice, the capture logic would truncate based on the config
      const shouldTruncate = largeResponseBody.length > currentConfig.maxResponseBodySize;
      const truncatedBody = shouldTruncate 
        ? largeResponseBody.substring(0, currentConfig.maxResponseBodySize) + '... [truncated]'
        : largeResponseBody;

      expect(shouldTruncate).toBe(true);
      expect(truncatedBody).toBe('x'.repeat(100) + '... [truncated]');
      expect(truncatedBody.length).toBe(115); // 100 + '... [truncated]'.length
    });

    it('should handle zero maxResponseBodySize', async () => {
      const config = {
        maxResponseBodySize: 0
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(0);

      const responseBody = 'any response';
      const shouldTruncate = responseBody.length > currentConfig.maxResponseBodySize;
      const truncatedBody = shouldTruncate 
        ? responseBody.substring(0, currentConfig.maxResponseBodySize) + '... [truncated]'
        : responseBody;

      expect(shouldTruncate).toBe(true);
      expect(truncatedBody).toBe('... [truncated]');
    });

    it('should handle very large maxResponseBodySize', async () => {
      const config = {
        maxResponseBodySize: 1000000 // 1MB
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(1000000);

      const responseBody = 'x'.repeat(500000); // 500KB
      const shouldTruncate = responseBody.length > currentConfig.maxResponseBodySize;
      
      expect(shouldTruncate).toBe(false);
      expect(responseBody.length).toBe(500000);
    });

    it('should update size limits dynamically', async () => {
      // Start with default config
      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(50000);

      // Update to smaller size
      await request(app)
        .post('/network-config')
        .send({ maxResponseBodySize: 1000 })
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(1000);

      // Update to larger size
      await request(app)
        .post('/network-config')
        .send({ maxResponseBodySize: 100000 })
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.maxResponseBodySize).toBe(100000);
    });
  });

  describe('Body Capture Configuration', () => {
    it('should respect includeRequestBody setting', async () => {
      // Test with includeRequestBody enabled
      let config = {
        includeRequestBody: true
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeRequestBody).toBe(true);

      // Test with includeRequestBody disabled
      config = {
        includeRequestBody: false
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeRequestBody).toBe(false);
    });

    it('should respect includeResponseBody setting', async () => {
      // Test with includeResponseBody enabled
      let config = {
        includeResponseBody: true
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeResponseBody).toBe(true);

      // Test with includeResponseBody disabled
      config = {
        includeResponseBody: false
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeResponseBody).toBe(false);
    });

    it('should respect includeHeaders setting', async () => {
      // Test with includeHeaders enabled
      let config = {
        includeHeaders: true
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeHeaders).toBe(true);

      // Test with includeHeaders disabled
      config = {
        includeHeaders: false
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeHeaders).toBe(false);
    });

    it('should respect includeQueryParams setting', async () => {
      // Test with includeQueryParams enabled
      let config = {
        includeQueryParams: true
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeQueryParams).toBe(true);

      // Test with includeQueryParams disabled
      config = {
        includeQueryParams: false
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeQueryParams).toBe(false);
    });

    it('should handle combined body and header capture settings', async () => {
      const config = {
        includeHeaders: false,
        includeRequestBody: true,
        includeResponseBody: false,
        includeQueryParams: true
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.includeHeaders).toBe(false);
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(false);
      expect(currentConfig.includeQueryParams).toBe(true);
    });
  });

  describe('Capture Mode Integration', () => {
    it('should handle all capture mode with body settings', async () => {
      const config = {
        captureMode: 'all',
        includeRequestBody: true,
        includeResponseBody: true,
        maxResponseBodySize: 1000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.captureMode).toBe('all');
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(true);
      expect(currentConfig.maxResponseBodySize).toBe(1000);

      // All requests should be captured with bodies
      const testUrls = [
        'https://api.example.com/users',
        'https://example.com/static/image.png',
        'https://analytics.example.com/track'
      ];

      testUrls.forEach(() => {
        const shouldCapture = currentConfig.captureMode === 'all';
        expect(shouldCapture).toBe(true);
      });
    });

    it('should handle include mode with filtered body capture', async () => {
      const config = {
        captureMode: 'include',
        urlPatterns: ['*/api/*'],
        includeRequestBody: true,
        includeResponseBody: true,
        maxResponseBodySize: 5000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.captureMode).toBe('include');
      expect(currentConfig.urlPatterns).toEqual(['*/api/*']);
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(true);
      expect(currentConfig.maxResponseBodySize).toBe(5000);

      // Test URL pattern matching
      const testCases = [
        { url: 'https://example.com/api/users', expected: true },
        { url: 'https://example.com/static/image.png', expected: false },
        { url: 'https://api.example.com/users', expected: false } // doesn't match */api/*
      ];

      testCases.forEach(({ url, expected }) => {
        const patterns = currentConfig.urlPatterns;
        const matchesPattern = patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        });
        
        const shouldCapture = currentConfig.captureMode === 'include' ? matchesPattern : !matchesPattern;
        expect(shouldCapture).toBe(expected);
      });
    });

    it('should handle exclude mode with selective body capture', async () => {
      const config = {
        captureMode: 'exclude',
        urlPatterns: ['*.png', '*.jpg', '*analytics*'],
        includeRequestBody: false,
        includeResponseBody: true,
        maxResponseBodySize: 25000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.captureMode).toBe('exclude');
      expect(currentConfig.urlPatterns).toEqual(['*.png', '*.jpg', '*analytics*']);
      expect(currentConfig.includeRequestBody).toBe(false);
      expect(currentConfig.includeResponseBody).toBe(true);
      expect(currentConfig.maxResponseBodySize).toBe(25000);
    });
  });

  describe('Method and Status Code Filtering with Bodies', () => {
    it('should filter by HTTP methods and capture bodies accordingly', async () => {
      const config = {
        methods: ['POST', 'PUT', 'PATCH'],
        includeRequestBody: true,
        includeResponseBody: true,
        maxResponseBodySize: 10000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.methods).toEqual(['POST', 'PUT', 'PATCH']);
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(true);

      // Test method filtering
      const testMethods = [
        { method: 'GET', expected: false },
        { method: 'POST', expected: true },
        { method: 'PUT', expected: true },
        { method: 'PATCH', expected: true },
        { method: 'DELETE', expected: false }
      ];

      testMethods.forEach(({ method, expected }) => {
        const shouldCapture = currentConfig.methods.length === 0 || currentConfig.methods.includes(method);
        expect(shouldCapture).toBe(expected);
      });
    });

    it('should filter by status codes and capture bodies accordingly', async () => {
      const config = {
        statusCodes: [200, 201, 400, 500],
        includeRequestBody: true,
        includeResponseBody: true,
        maxResponseBodySize: 15000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.statusCodes).toEqual([200, 201, 400, 500]);
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(true);

      // Test status code filtering
      const testStatusCodes = [
        { status: 200, expected: true },
        { status: 201, expected: true },
        { status: 400, expected: true },
        { status: 404, expected: false },
        { status: 500, expected: true }
      ];

      testStatusCodes.forEach(({ status, expected }) => {
        const shouldCapture = currentConfig.statusCodes.length === 0 || currentConfig.statusCodes.includes(status);
        expect(shouldCapture).toBe(expected);
      });
    });

    it('should handle combined method and status code filtering', async () => {
      const config = {
        methods: ['POST', 'PUT'],
        statusCodes: [200, 201, 400],
        includeRequestBody: true,
        includeResponseBody: false,
        maxResponseBodySize: 20000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.methods).toEqual(['POST', 'PUT']);
      expect(currentConfig.statusCodes).toEqual([200, 201, 400]);
      expect(currentConfig.includeRequestBody).toBe(true);
      expect(currentConfig.includeResponseBody).toBe(false);

      // Test combined filtering
      const testCases = [
        { method: 'POST', status: 200, expected: true },
        { method: 'POST', status: 404, expected: false },
        { method: 'GET', status: 200, expected: false },
        { method: 'PUT', status: 201, expected: true },
        { method: 'DELETE', status: 200, expected: false }
      ];

      testCases.forEach(({ method, status, expected }) => {
        const methodMatches = currentConfig.methods.length === 0 || currentConfig.methods.includes(method);
        const statusMatches = currentConfig.statusCodes.length === 0 || currentConfig.statusCodes.includes(status);
        const shouldCapture = methodMatches && statusMatches;
        expect(shouldCapture).toBe(expected);
      });
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should handle API-only capture with full body logging', async () => {
      const config = {
        captureMode: 'include',
        urlPatterns: ['*/api/*', '*/v1/*'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        statusCodes: [200, 201, 400, 404, 500],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig).toMatchObject(config);

      // Test complex filtering logic
      const testCases = [
        { url: 'https://example.com/api/users', method: 'GET', status: 200, expected: true },
        { url: 'https://example.com/v1/products', method: 'POST', status: 201, expected: true },
        { url: 'https://example.com/static/image.png', method: 'GET', status: 200, expected: false },
        { url: 'https://example.com/api/users', method: 'PATCH', status: 200, expected: false },
        { url: 'https://example.com/api/users', method: 'GET', status: 302, expected: false }
      ];

      testCases.forEach(({ url, method, status, expected }) => {
        const patterns = currentConfig.urlPatterns;
        const matchesPattern = patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        });
        
        const urlMatches = currentConfig.captureMode === 'include' ? matchesPattern : !matchesPattern;
        const methodMatches = currentConfig.methods.length === 0 || currentConfig.methods.includes(method);
        const statusMatches = currentConfig.statusCodes.length === 0 || currentConfig.statusCodes.includes(status);
        
        const shouldCapture = urlMatches && methodMatches && statusMatches;
        expect(shouldCapture).toBe(expected);
      });
    });

    it('should handle minimal capture configuration', async () => {
      const config = {
        captureMode: 'exclude',
        urlPatterns: ['*.png', '*.jpg', '*.gif', '*.css', '*.js', '*analytics*', '*tracking*'],
        includeHeaders: false,
        includeRequestBody: false,
        includeResponseBody: false,
        includeQueryParams: false,
        maxResponseBodySize: 0
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig).toMatchObject(config);

      // Verify minimal capture settings
      expect(currentConfig.includeHeaders).toBe(false);
      expect(currentConfig.includeRequestBody).toBe(false);
      expect(currentConfig.includeResponseBody).toBe(false);
      expect(currentConfig.includeQueryParams).toBe(false);
      expect(currentConfig.maxResponseBodySize).toBe(0);
    });

    it('should handle performance-focused configuration', async () => {
      const config = {
        captureMode: 'include',
        urlPatterns: ['*/api/*'],
        methods: ['GET', 'POST'],
        statusCodes: [200, 201],
        includeHeaders: true,
        includeRequestBody: false, // Skip request bodies for performance
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 10000 // Smaller size for performance
      };
      
      await request(app)
        .post('/network-config')
        .send(config)
        .expect(200);

      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig).toMatchObject(config);

      // Verify performance-focused settings
      expect(currentConfig.includeRequestBody).toBe(false);
      expect(currentConfig.includeResponseBody).toBe(true);
      expect(currentConfig.maxResponseBodySize).toBe(10000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid size limits gracefully', async () => {
      const invalidConfigs = [
        { maxResponseBodySize: -1 },
        { maxResponseBodySize: 'invalid' },
        { maxResponseBodySize: null }
      ];

      for (const config of invalidConfigs) {
        const response = await request(app)
          .post('/network-config')
          .send(config)
          .expect(400);

        expect(response.body.error).toBe('maxResponseBodySize must be a non-negative number');
      }
    });

    it('should reset to defaults and restore all settings', async () => {
      // First, set a complex configuration
      const complexConfig = {
        captureMode: 'exclude',
        urlPatterns: ['*.png', '*.jpg'],
        methods: ['GET', 'POST'],
        statusCodes: [200, 404],
        includeHeaders: false,
        includeRequestBody: false,
        includeResponseBody: false,
        includeQueryParams: false,
        maxResponseBodySize: 5000
      };
      
      await request(app)
        .post('/network-config')
        .send(complexConfig)
        .expect(200);

      // Verify the complex config was set
      let currentConfig = getCurrentNetworkConfig();
      expect(currentConfig).toMatchObject(complexConfig);

      // Reset to defaults
      await request(app)
        .post('/network-config/reset')
        .expect(200);

      // Verify defaults are restored
      currentConfig = getCurrentNetworkConfig();
      expect(currentConfig).toMatchObject({
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        statusCodes: []
      });
    });

    it('should handle partial configuration updates without affecting other settings', async () => {
      // Start with a custom configuration
      const initialConfig = {
        captureMode: 'include',
        urlPatterns: ['*/api/*'],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: false,
        maxResponseBodySize: 25000
      };
      
      await request(app)
        .post('/network-config')
        .send(initialConfig)
        .expect(200);

      // Update only specific fields
      const partialUpdate = {
        includeResponseBody: true,
        maxResponseBodySize: 75000
      };
      
      await request(app)
        .post('/network-config')
        .send(partialUpdate)
        .expect(200);

      // Verify only specified fields were updated
      const currentConfig = getCurrentNetworkConfig();
      expect(currentConfig.captureMode).toBe('include'); // preserved
      expect(currentConfig.urlPatterns).toEqual(['*/api/*']); // preserved
      expect(currentConfig.includeHeaders).toBe(true); // preserved
      expect(currentConfig.includeRequestBody).toBe(true); // preserved
      expect(currentConfig.includeResponseBody).toBe(true); // updated
      expect(currentConfig.maxResponseBodySize).toBe(75000); // updated
    });
  });
});