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
  requestBody?: string | null;
  responseBody?: string | null;
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

export interface NetworkCaptureConfig {
  enabled: boolean;
  captureMode: 'all' | 'include' | 'exclude';
  urlPatterns: string[];
  includeHeaders: boolean;
  includeRequestBody: boolean;
  includeResponseBody: boolean;
  includeQueryParams: boolean;
  maxResponseBodySize: number;
  methods: string[];
  statusCodes: number[];
}