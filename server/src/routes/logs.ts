import { Router, Request, Response } from 'express';
import { logStorage } from '@/storage/LogStorage';
import { ConsoleLog, LogBatch } from '@/types';
import { logger } from '@/index';

export const logsRouter: Router = Router();

logsRouter.post('/', async (req, res) => {
  try {
    const batch: LogBatch = req.body;
    
    if (!batch.logs || !Array.isArray(batch.logs)) {
      logger.warn('Invalid log batch format:', batch);
      return res.status(400).json({ error: 'Invalid log batch format' });
    }

    // Log each console message for LLM visibility
    batch.logs.forEach(log => {
      const url = new URL(log.pageUrl).hostname;
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      
      if (log.level === 'error') {
        logger.error(`[${url}] ${timestamp} - ${log.message}${log.stackTrace ? '\n' + log.stackTrace : ''}`);
      } else if (log.level === 'warn') {
        logger.warn(`[${url}] ${timestamp} - ${log.message}`);
      } else {
        logger.info(`[${url}] ${timestamp} - ${log.message}`);
      }
    });
    
    const insertedLogs = await logStorage.insertLogs(batch.logs);
    
    res.json({ 
      received: batch.logs.length,
      stored: insertedLogs.length 
    });
  } catch (error) {
    logger.error('Error processing logs:', error);
    res.status(500).json({ error: 'Failed to process logs' });
  }
});

logsRouter.get('/', async (req, res) => {
  try {
    const { 
      limit = '100', 
      offset = '0',
      level,
      url,
      startTime,
      endTime
    } = req.query;

    const filters = {
      level: level as string,
      url: url as string,
      startTime: startTime as string,
      endTime: endTime as string
    };

    const logs = await logStorage.getLogs(
      parseInt(limit as string),
      parseInt(offset as string),
      filters
    );

    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

logsRouter.delete('/', async (req, res) => {
  try {
    const count = await logStorage.clearLogs();
    logger.info(`Cleared ${count} logs`);
    res.json({ cleared: count });
  } catch (error) {
    logger.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

logsRouter.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendLog = (log: ConsoleLog) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logStorage.onNewLog(sendLog);

  req.on('close', () => {
    logStorage.offNewLog(sendLog);
  });
});