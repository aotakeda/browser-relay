import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import winston from 'winston';
import { logsRouter } from '@/routes/logs';
import { initializeDatabase } from '@/storage/database';
import { setupMCPServer } from '@/mcp/server';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8765;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

app.use(cors({
  origin: true, // Allow all origins for content scripts
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

app.use('/logs', logsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Allow-list configuration endpoint
app.get('/allowed-domains', (_req, res) => {
  const allowedDomainsEnv = process.env.CONSOLE_RELAY_ALLOWED_DOMAINS;
  const enabled = !!allowedDomainsEnv;
  const domains = enabled ? allowedDomainsEnv.split(',').map(d => d.trim()).filter(d => d) : [];
  
  logger.info(`Allowed domains check: enabled=${enabled}, domains=${domains.join(', ')}`);
  
  res.json({ 
    enabled,
    domains
  });
});

async function start() {
  try {
    await initializeDatabase();
    logger.info('Database initialized');

    await setupMCPServer();
    logger.info('MCP server initialized');

    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close database connection
  const { db } = await import('@/storage/database');
  db.close((err) => {
    if (err) {
      logger.error('Error closing database:', err);
    } else {
      logger.info('Database connection closed');
    }
    process.exit(0);
  });
}

export { logger };