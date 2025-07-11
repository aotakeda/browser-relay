import { getCurrentNetworkConfig } from '../routes/network-config';
import { NetworkCaptureConfig } from '../types';

describe('Network Capture Settings Logic', () => {
  describe('Network Configuration Management', () => {
    it('should provide default network capture configuration', () => {
      const config = getCurrentNetworkConfig();
      
      expect(config).toMatchObject({
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

    it('should handle capture mode filtering logic', () => {
      const config: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'include',
        urlPatterns: ['api.*', '*.json'],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST'],
        statusCodes: [200, 201]
      };

      // Test URL pattern matching logic
      const testUrls = [
        'https://api.example.com/users',
        'https://example.com/data.json',
        'https://example.com/image.png',
        'https://analytics.example.com/track'
      ];

      const shouldCapture = (url: string) => {
        if (config.captureMode === 'all') return true;
        
        const patterns = config.urlPatterns;
        const matchesPattern = patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        });

        return config.captureMode === 'include' ? matchesPattern : !matchesPattern;
      };

      expect(shouldCapture(testUrls[0])).toBe(true);  // matches 'api.*'
      expect(shouldCapture(testUrls[1])).toBe(true);  // matches '*.json'
      expect(shouldCapture(testUrls[2])).toBe(false); // doesn't match any pattern
      expect(shouldCapture(testUrls[3])).toBe(false); // doesn't match any pattern
    });

    it('should handle exclude mode filtering logic', () => {
      const config: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'exclude',
        urlPatterns: ['*.png', '*.jpg', 'analytics.*'],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST'],
        statusCodes: []
      };

      const shouldCapture = (url: string) => {
        if (config.captureMode === 'all') return true;
        
        const patterns = config.urlPatterns;
        const matchesPattern = patterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        });

        return config.captureMode === 'include' ? matchesPattern : !matchesPattern;
      };

      const testUrls = [
        'https://example.com/image.png',
        'https://example.com/photo.jpg',
        'https://analytics.example.com/track',
        'https://api.example.com/users'
      ];

      expect(shouldCapture(testUrls[0])).toBe(false); // excluded by '*.png'
      expect(shouldCapture(testUrls[1])).toBe(false); // excluded by '*.jpg'
      expect(shouldCapture(testUrls[2])).toBe(false); // excluded by 'analytics.*'
      expect(shouldCapture(testUrls[3])).toBe(true);  // not excluded
    });

    it('should handle method filtering logic', () => {
      const config: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST'],
        statusCodes: []
      };

      const shouldCaptureMethod = (method: string) => {
        return config.methods.length === 0 || config.methods.includes(method);
      };

      expect(shouldCaptureMethod('GET')).toBe(true);
      expect(shouldCaptureMethod('POST')).toBe(true);
      expect(shouldCaptureMethod('PUT')).toBe(false);
      expect(shouldCaptureMethod('DELETE')).toBe(false);
      expect(shouldCaptureMethod('PATCH')).toBe(false);
    });

    it('should handle status code filtering logic', () => {
      const config: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: [],
        statusCodes: [200, 201, 400, 500]
      };

      const shouldCaptureStatus = (statusCode: number) => {
        return config.statusCodes.length === 0 || config.statusCodes.includes(statusCode);
      };

      expect(shouldCaptureStatus(200)).toBe(true);
      expect(shouldCaptureStatus(201)).toBe(true);
      expect(shouldCaptureStatus(400)).toBe(true);
      expect(shouldCaptureStatus(500)).toBe(true);
      expect(shouldCaptureStatus(404)).toBe(false);
      expect(shouldCaptureStatus(302)).toBe(false);
    });

    it('should handle response body size limits', () => {
      const config: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 1000,
        methods: [],
        statusCodes: []
      };

      const shouldTruncateResponse = (responseBody: string) => {
        return responseBody.length > config.maxResponseBodySize;
      };

      const truncateResponse = (responseBody: string) => {
        if (responseBody.length <= config.maxResponseBodySize) {
          return responseBody;
        }
        return responseBody.substring(0, config.maxResponseBodySize) + '... [truncated]';
      };

      const shortResponse = 'short response';
      const longResponse = 'x'.repeat(1500);

      expect(shouldTruncateResponse(shortResponse)).toBe(false);
      expect(shouldTruncateResponse(longResponse)).toBe(true);
      expect(truncateResponse(shortResponse)).toBe(shortResponse);
      expect(truncateResponse(longResponse)).toBe('x'.repeat(1000) + '... [truncated]');
    });
  });

  describe('Network Configuration Integration', () => {
    it('should validate configuration properties', () => {
      const validConfig: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'include',
        urlPatterns: ['api.*', '*.json'],
        includeHeaders: false,
        includeRequestBody: true,
        includeResponseBody: false,
        includeQueryParams: true,
        maxResponseBodySize: 25000,
        methods: ['GET', 'POST', 'PUT'],
        statusCodes: [200, 201, 400]
      };

      expect(typeof validConfig.enabled).toBe('boolean');
      expect(['all', 'include', 'exclude']).toContain(validConfig.captureMode);
      expect(Array.isArray(validConfig.urlPatterns)).toBe(true);
      expect(typeof validConfig.includeHeaders).toBe('boolean');
      expect(typeof validConfig.includeRequestBody).toBe('boolean');
      expect(typeof validConfig.includeResponseBody).toBe('boolean');
      expect(typeof validConfig.includeQueryParams).toBe('boolean');
      expect(typeof validConfig.maxResponseBodySize).toBe('number');
      expect(validConfig.maxResponseBodySize).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(validConfig.methods)).toBe(true);
      expect(Array.isArray(validConfig.statusCodes)).toBe(true);
    });

    it('should handle edge cases in URL pattern matching', () => {
      const testPatterns = [
        { pattern: 'api.*', url: 'https://api.example.com/users', expected: true },
        { pattern: 'api.*', url: 'https://example.com/api/users', expected: true }, // This actually matches because "api" is in the URL
        { pattern: '*.json', url: 'https://example.com/data.json', expected: true },
        { pattern: '*.json', url: 'https://example.com/data.json?param=1', expected: true },
        { pattern: '*github*', url: 'https://api.github.com/repos', expected: true },
        { pattern: '*github*', url: 'https://example.com/github/repo', expected: true },
        { pattern: 'exact.match', url: 'exact.match', expected: true },
        { pattern: 'exact.match', url: 'not.exact.match', expected: true }, // This also matches because "exact.match" is contained in "not.exact.match"
        { pattern: 'exact.match', url: 'different.url', expected: false }
      ];

      testPatterns.forEach(({ pattern, url, expected }) => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        expect(regex.test(url)).toBe(expected);
      });
    });

    it('should handle complex filtering scenarios', () => {
      const scenarios = [
        {
          name: 'API requests only with success status codes',
          config: {
            enabled: true,
            captureMode: 'include' as const,
            urlPatterns: ['*/api/*'],
            includeHeaders: true,
            includeRequestBody: true,
            includeResponseBody: true,
            includeQueryParams: true,
            maxResponseBodySize: 50000,
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            statusCodes: [200, 201, 202, 204]
          },
          testCases: [
            { url: 'https://example.com/api/users', method: 'GET', status: 200, expected: true },
            { url: 'https://example.com/api/users', method: 'POST', status: 201, expected: true },
            { url: 'https://example.com/api/users', method: 'GET', status: 404, expected: false },
            { url: 'https://example.com/static/image.png', method: 'GET', status: 200, expected: false }
          ]
        },
        {
          name: 'Exclude tracking and analytics',
          config: {
            enabled: true,
            captureMode: 'exclude' as const,
            urlPatterns: ['*analytics*', '*tracking*', '*.png', '*.jpg'],
            includeHeaders: true,
            includeRequestBody: true,
            includeResponseBody: true,
            includeQueryParams: true,
            maxResponseBodySize: 50000,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
            statusCodes: [] as number[]
          },
          testCases: [
            { url: 'https://analytics.example.com/track', method: 'GET', status: 200, expected: false },
            { url: 'https://example.com/tracking/pixel', method: 'GET', status: 200, expected: false },
            { url: 'https://example.com/image.png', method: 'GET', status: 200, expected: false },
            { url: 'https://example.com/api/users', method: 'GET', status: 200, expected: true }
          ]
        }
      ];

      scenarios.forEach(({ config, testCases }) => {
        testCases.forEach(({ url, method, status, expected }) => {
          const shouldCapture = (url: string, method: string, status: number) => {
            if (!config.enabled) return false;
            
            // URL pattern matching
            const patterns = config.urlPatterns;
            const matchesPattern = patterns.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(url);
            });
            
            let urlMatches = true;
            if (config.captureMode === 'include') {
              urlMatches = matchesPattern;
            } else if (config.captureMode === 'exclude') {
              urlMatches = !matchesPattern;
            }
            
            // Method filtering
            const methodMatches = config.methods.length === 0 || config.methods.includes(method);
            
            // Status code filtering
            const statusMatches = config.statusCodes.length === 0 || config.statusCodes.includes(status);
            
            return urlMatches && methodMatches && statusMatches;
          };

          expect(shouldCapture(url, method, status)).toBe(expected);
        });
      });
    });
  });

  describe('Request/Response Body Handling', () => {
    it('should handle request body inclusion settings', () => {
      const configWithRequestBody: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: [],
        statusCodes: []
      };

      const configWithoutRequestBody: NetworkCaptureConfig = {
        ...configWithRequestBody,
        includeRequestBody: false
      };

      expect(configWithRequestBody.includeRequestBody).toBe(true);
      expect(configWithoutRequestBody.includeRequestBody).toBe(false);
      
      // In practice, the request body would be included/excluded based on this setting
      const shouldIncludeRequestBody = (config: NetworkCaptureConfig) => config.includeRequestBody;
      
      expect(shouldIncludeRequestBody(configWithRequestBody)).toBe(true);
      expect(shouldIncludeRequestBody(configWithoutRequestBody)).toBe(false);
    });

    it('should handle response body inclusion settings', () => {
      const configWithResponseBody: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: [],
        statusCodes: []
      };

      const configWithoutResponseBody: NetworkCaptureConfig = {
        ...configWithResponseBody,
        includeResponseBody: false
      };

      expect(configWithResponseBody.includeResponseBody).toBe(true);
      expect(configWithoutResponseBody.includeResponseBody).toBe(false);
      
      const shouldIncludeResponseBody = (config: NetworkCaptureConfig) => config.includeResponseBody;
      
      expect(shouldIncludeResponseBody(configWithResponseBody)).toBe(true);
      expect(shouldIncludeResponseBody(configWithoutResponseBody)).toBe(false);
    });

    it('should handle header inclusion settings', () => {
      const configWithHeaders: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: [],
        statusCodes: []
      };

      const configWithoutHeaders: NetworkCaptureConfig = {
        ...configWithHeaders,
        includeHeaders: false
      };

      expect(configWithHeaders.includeHeaders).toBe(true);
      expect(configWithoutHeaders.includeHeaders).toBe(false);
      
      const shouldIncludeHeaders = (config: NetworkCaptureConfig) => config.includeHeaders;
      
      expect(shouldIncludeHeaders(configWithHeaders)).toBe(true);
      expect(shouldIncludeHeaders(configWithoutHeaders)).toBe(false);
    });

    it('should handle query parameter inclusion settings', () => {
      const configWithQueryParams: NetworkCaptureConfig = {
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: [],
        statusCodes: []
      };

      const configWithoutQueryParams: NetworkCaptureConfig = {
        ...configWithQueryParams,
        includeQueryParams: false
      };

      expect(configWithQueryParams.includeQueryParams).toBe(true);
      expect(configWithoutQueryParams.includeQueryParams).toBe(false);
      
      const shouldIncludeQueryParams = (config: NetworkCaptureConfig) => config.includeQueryParams;
      
      expect(shouldIncludeQueryParams(configWithQueryParams)).toBe(true);
      expect(shouldIncludeQueryParams(configWithoutQueryParams)).toBe(false);
    });
  });

  describe('Size Limit Validation', () => {
    it('should validate maxResponseBodySize ranges', () => {
      const validSizes = [0, 1, 1000, 50000, 100000, 1000000];
      const invalidSizes = [-1, -100, 'string', null, undefined, NaN];

      validSizes.forEach(size => {
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(size)).toBe(true);
      });

      invalidSizes.forEach(size => {
        const isValid = typeof size === 'number' && size >= 0 && Number.isFinite(size);
        expect(isValid).toBe(false);
      });
    });

    it('should handle size limit edge cases', () => {
      const testCases = [
        { size: 0, input: 'test', expected: '... [truncated]' },
        { size: 1, input: 'test', expected: 't... [truncated]' },
        { size: 4, input: 'test', expected: 'test' },
        { size: 5, input: 'test', expected: 'test' },
        { size: 1000, input: 'x'.repeat(999), expected: 'x'.repeat(999) },
        { size: 1000, input: 'x'.repeat(1000), expected: 'x'.repeat(1000) },
        { size: 1000, input: 'x'.repeat(1001), expected: 'x'.repeat(1000) + '... [truncated]' }
      ];

      testCases.forEach(({ size, input, expected }) => {
        const truncate = (text: string, maxSize: number) => {
          if (text.length <= maxSize) return text;
          return text.substring(0, maxSize) + '... [truncated]';
        };

        expect(truncate(input, size)).toBe(expected);
      });
    });
  });
});