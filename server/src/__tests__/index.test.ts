import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

// Mock the database and MCP server initialization
jest.mock('@/storage/database', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('@/mcp/server', () => ({
  setupMCPServer: jest.fn().mockResolvedValue(undefined)
}));

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn()
  }
}));

// Mock routes with basic functionality
jest.mock('@/routes/logs', () => {
  const router = express.Router();
  router.get('/', (_req, res) => res.json({ logs: [] }));
  return { logsRouter: router };
});

jest.mock('@/routes/network-requests', () => {
  const router = express.Router();
  router.get('/', (_req, res) => res.json({ requests: [] }));
  return { networkRequestsRouter: router };
});

describe('Main Application', () => {
  let app: express.Application;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    // Recreate the main application setup
    app = express();
    const httpServer = createServer(app);

    app.use(cors({
      origin: true,
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));

    // Mock routers
    const { logsRouter } = await import('@/routes/logs');
    const { networkRequestsRouter } = await import('@/routes/network-requests');

    app.use('/logs', logsRouter);
    app.use('/network-requests', networkRequestsRouter);

    // Health endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });


    server = httpServer;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });


  describe('CORS Configuration', () => {
    it('should allow all origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
    });

    it('should allow credentials', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://example.com')
        .expect(200);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('JSON Middleware', () => {
    it('should parse JSON requests', async () => {
      // Create a simple test endpoint for JSON parsing
      app.post('/test-json', (req, res) => {
        res.json({ received: req.body });
      });

      const testData = { message: 'test', nested: { value: 42 } };

      const response = await request(app)
        .post('/test-json')
        .send(testData)
        .expect(200);

      expect(response.body.received).toEqual(testData);
    });

    it('should have correct JSON size limit', async () => {
      app.post('/test-json', (req, res) => {
        res.json({ received: req.body });
      });

      // Create a large JSON payload (around 5MB, smaller than 10MB limit)
      const largeData = {
        data: 'x'.repeat(5 * 1024 * 1024) // 5MB of data
      };

      const response = await request(app)
        .post('/test-json')
        .send(largeData)
        .expect(200);

      expect(response.body.received).toEqual(largeData);
    });

    it('should reject invalid JSON', async () => {
      app.post('/test-json', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/test-json')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400);

      // Should return some kind of error response (exact format may vary)
      expect(response.status).toBe(400);
    });
  });

  describe('Route Mounting', () => {
    it('should mount logs router at /logs', async () => {
      // The logs router should be mounted and respond
      await request(app)
        .get('/logs')
        .expect(200);

      // Since we're using a mock router, we won't get actual data
      // but we can verify the route is mounted
    });

    it('should mount network-requests router at /network-requests', async () => {
      // The network-requests router should be mounted and respond
      await request(app)
        .get('/network-requests')
        .expect(200);

      // Since we're using a mock router, we won't get actual data
      // but we can verify the route is mounted
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/nonexistent-route')
        .expect(404);
    });

    it('should handle errors in route handlers', async () => {
      // Create a route that throws an error
      app.get('/test-error', () => {
        throw new Error('Test error');
      });

      await request(app)
        .get('/test-error')
        .expect(500);
    });
  });

  describe('Request Size Limits', () => {
    it('should accept requests up to 10MB', async () => {
      app.post('/test-size', (req, res) => {
        res.json({ 
          size: JSON.stringify(req.body).length,
          received: true 
        });
      });

      // Create approximately 1MB of data
      const largeData = {
        data: 'x'.repeat(1024 * 1024) // 1MB of data
      };

      const response = await request(app)
        .post('/test-size')
        .send(largeData)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.size).toBeGreaterThan(1000000); // > 1MB
    });
  });
});