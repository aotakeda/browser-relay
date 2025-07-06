import { NetworkRequest } from '@/types';
import { runAsync, allAsync, getAsync, CountResult } from '@/storage/database';

// Create a simple logger to avoid circular imports
const logger = {
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(message, ...args),
  info: (message: string, ...args: unknown[]) => console.log(message, ...args)
};

const MAX_NETWORK_REQUESTS = 10000;
const MAX_REQUEST_BODY_SIZE = 1024 * 1024; // 1MB
const MAX_RESPONSE_BODY_SIZE = 1024 * 1024; // 1MB

type NetworkRequestFilter = {
  method?: string;
  url?: string;
  statusCode?: number;
  startTime?: string;
  endTime?: string;
};

class NetworkStorage {
  private listeners: Set<(request: NetworkRequest) => void> = new Set();

  async insertRequests(requests: NetworkRequest[]): Promise<NetworkRequest[]> {
    const insertedRequests: NetworkRequest[] = [];
    
    for (const request of requests) {
      try {
        // Truncate bodies if they're too large
        const requestBody = request.requestBody && request.requestBody.length > MAX_REQUEST_BODY_SIZE
          ? request.requestBody.substring(0, MAX_REQUEST_BODY_SIZE) + '... [truncated]'
          : request.requestBody;
        
        const responseBody = request.responseBody && request.responseBody.length > MAX_RESPONSE_BODY_SIZE
          ? request.responseBody.substring(0, MAX_RESPONSE_BODY_SIZE) + '... [truncated]'
          : request.responseBody;

        const result = await runAsync(
          `INSERT INTO network_requests (
            requestId, timestamp, method, url, requestHeaders, responseHeaders,
            requestBody, responseBody, statusCode, duration, responseSize,
            pageUrl, userAgent, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            request.requestId,
            request.timestamp,
            request.method,
            request.url,
            request.requestHeaders ? JSON.stringify(request.requestHeaders) : null,
            request.responseHeaders ? JSON.stringify(request.responseHeaders) : null,
            requestBody,
            responseBody,
            request.statusCode,
            request.duration,
            request.responseSize,
            request.pageUrl,
            request.userAgent,
            request.metadata ? JSON.stringify(request.metadata) : null
          ]
        );

        const insertedRequest = { 
          ...request, 
          id: result.lastID,
          requestBody,
          responseBody
        };
        insertedRequests.push(insertedRequest);

        // Notify listeners
        this.listeners.forEach(listener => {
          try {
            listener(insertedRequest);
          } catch (error) {
            logger.error('Error in network request listener:', error);
          }
        });
      } catch (error) {
        logger.error('Error inserting network request:', error);
      }
    }

    // Clean up old requests to maintain circular buffer
    await this.cleanupOldRequests();

    return insertedRequests;
  }

  async getRequests(
    limit = 100,
    offset = 0,
    filters: NetworkRequestFilter = {}
  ): Promise<NetworkRequest[]> {
    let query = 'SELECT * FROM network_requests WHERE 1=1';
    const params: unknown[] = [];

    if (filters.method) {
      query += ' AND method = ?';
      params.push(filters.method);
    }

    if (filters.url) {
      query += ' AND url LIKE ?';
      params.push(`%${filters.url}%`);
    }

    if (filters.statusCode) {
      query += ' AND statusCode = ?';
      params.push(filters.statusCode);
    }

    if (filters.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await allAsync<NetworkRequest>(query, params);
    
    return rows.map(row => ({
      ...row,
      requestHeaders: row.requestHeaders ? JSON.parse(row.requestHeaders as unknown as string) : undefined,
      responseHeaders: row.responseHeaders ? JSON.parse(row.responseHeaders as unknown as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : undefined
    }));
  }

  async getRequestById(id: number): Promise<NetworkRequest | null> {
    const row = await getAsync<NetworkRequest>(
      'SELECT * FROM network_requests WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return {
      ...row,
      requestHeaders: row.requestHeaders ? JSON.parse(row.requestHeaders as unknown as string) : undefined,
      responseHeaders: row.responseHeaders ? JSON.parse(row.responseHeaders as unknown as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : undefined
    };
  }

  async getRequestByRequestId(requestId: string): Promise<NetworkRequest | null> {
    const row = await getAsync<NetworkRequest>(
      'SELECT * FROM network_requests WHERE requestId = ?',
      [requestId]
    );

    if (!row) return null;

    return {
      ...row,
      requestHeaders: row.requestHeaders ? JSON.parse(row.requestHeaders as unknown as string) : undefined,
      responseHeaders: row.responseHeaders ? JSON.parse(row.responseHeaders as unknown as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as unknown as string) : undefined
    };
  }

  async clearRequests(): Promise<number> {
    const result = await runAsync('DELETE FROM network_requests');
    return result.changes;
  }

  async getRequestCount(): Promise<number> {
    const result = await getAsync<CountResult>('SELECT COUNT(*) as count FROM network_requests');
    return result?.count || 0;
  }

  private async cleanupOldRequests(): Promise<void> {
    const count = await this.getRequestCount();
    
    if (count > MAX_NETWORK_REQUESTS) {
      const excessCount = count - MAX_NETWORK_REQUESTS;
      await runAsync(
        'DELETE FROM network_requests WHERE id IN (SELECT id FROM network_requests ORDER BY timestamp ASC LIMIT ?)',
        [excessCount]
      );
      logger.info(`Cleaned up ${excessCount} old network requests`);
    }
  }

  onNewRequest(listener: (request: NetworkRequest) => void): void {
    this.listeners.add(listener);
  }

  offNewRequest(listener: (request: NetworkRequest) => void): void {
    this.listeners.delete(listener);
  }
}

export const networkStorage = new NetworkStorage();
export { NetworkStorage };