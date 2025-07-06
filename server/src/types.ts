export interface ConsoleLog {
  id?: number;
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  stackTrace?: string;
  pageUrl: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface LogBatch {
  logs: ConsoleLog[];
  sessionId?: string;
}

export interface NetworkRequest {
  id?: number;
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  statusCode?: number;
  duration?: number;
  responseSize?: number;
  pageUrl: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface NetworkRequestBatch {
  requests: NetworkRequest[];
  sessionId?: string;
}