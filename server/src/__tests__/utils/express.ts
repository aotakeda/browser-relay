import express from 'express';
import cors from 'cors';
import { logsRouter } from '@/routes/logs';
import { networkRequestsRouter } from '@/routes/network-requests';
import { networkConfigRouter } from '@/routes/network-config';

/**
 * Standardized Express app creation for consistent test server setup
 */

/**
 * Create a basic Express app with common middleware
 */
export const createBasicApp = (): express.Application => {
  const app = express();
  app.use(express.json());
  app.use(cors());
  return app;
};

/**
 * Create app with logs router mounted
 */
export const createLogsApp = (): express.Application => {
  const app = createBasicApp();
  app.use('/logs', logsRouter);
  return app;
};

/**
 * Create app with network requests router mounted
 */
export const createNetworkRequestsApp = (): express.Application => {
  const app = createBasicApp();
  app.use('/network-requests', networkRequestsRouter);
  return app;
};

/**
 * Create app with network config router mounted
 */
export const createNetworkConfigApp = (): express.Application => {
  const app = createBasicApp();
  app.use('/network-config', networkConfigRouter);
  return app;
};

/**
 * Create full app with all routers (for integration tests)
 */
export const createFullApp = (): express.Application => {
  const app = createBasicApp();
  app.use('/logs', logsRouter);
  app.use('/network-requests', networkRequestsRouter);
  app.use('/network-config', networkConfigRouter);
  return app;
};

/**
 * Common test routes for health checks and testing
 */
export const addTestRoutes = (app: express.Application): void => {
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  app.get('/test-error', () => {
    throw new Error('Test error for error handling tests');
  });
};