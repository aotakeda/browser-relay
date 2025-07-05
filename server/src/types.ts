export interface ConsoleLog {
  id?: number;
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  stackTrace?: string;
  pageUrl: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface LogBatch {
  logs: ConsoleLog[];
  sessionId?: string;
}