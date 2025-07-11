import { NetworkRequest } from '@/types';
import { runAsync, allAsync, getAsync, CountResult } from '@/storage/database';
import { info, warn, error } from '@/utils/logger';

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

// Event listeners for new requests
const listeners = new Set<(request: NetworkRequest) => void>();

const parseJsonSafely = <T = unknown>(jsonString: string | null | undefined): T | undefined => {
  if (!jsonString) return undefined;
  try {
    return JSON.parse(jsonString) as T;
  } catch (parseError) {
    warn('Failed to parse JSON in network request:', parseError);
    return undefined;
  }
};

const cleanupOldRequests = async (): Promise<void> => {
  const count = await getRequestCount();
  
  if (count > MAX_NETWORK_REQUESTS) {
    const excessCount = count - MAX_NETWORK_REQUESTS;
    await runAsync(
      'DELETE FROM network_requests WHERE id IN (SELECT id FROM network_requests ORDER BY timestamp ASC LIMIT ?)',
      [excessCount]
    );
    info(`Cleaned up ${excessCount} old network requests`);
  }
};

export const insertRequests = async (requests: NetworkRequest[]): Promise<NetworkRequest[]> => {
  const insertedRequests: NetworkRequest[] = [];
  
  // Begin transaction
  await runAsync('BEGIN');
  
  try {
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
        listeners.forEach(listener => {
          try {
            listener(insertedRequest);
          } catch (listenerError) {
            error('Error in network request listener:', listenerError);
          }
        });
      } catch (insertError) {
        error('Error inserting network request:', insertError);
      }
    }

    // Commit transaction
    await runAsync('COMMIT');
    
    // Clean up old requests to maintain circular buffer
    await cleanupOldRequests();

    return insertedRequests;
  } catch (transactionError) {
    // Rollback transaction on error
    try {
      await runAsync('ROLLBACK');
    } catch (rollbackError) {
      error('Failed to rollback transaction:', rollbackError);
    }
    error('Failed to insert network requests:', transactionError);
    throw transactionError;
  }
};

export const getRequests = async (
  limit = 100,
  offset = 0,
  filters: NetworkRequestFilter = {}
): Promise<NetworkRequest[]> => {
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
    requestHeaders: parseJsonSafely<Record<string, string>>(row.requestHeaders as unknown as string),
    responseHeaders: parseJsonSafely<Record<string, string>>(row.responseHeaders as unknown as string),
    metadata: parseJsonSafely<Record<string, unknown>>(row.metadata as unknown as string)
  }));
};

export const getRequestById = async (id: number): Promise<NetworkRequest | null> => {
  const row = await getAsync<NetworkRequest>(
    'SELECT * FROM network_requests WHERE id = ?',
    [id]
  );

  if (!row) return null;

  return {
    ...row,
    requestHeaders: parseJsonSafely<Record<string, string>>(row.requestHeaders as unknown as string),
    responseHeaders: parseJsonSafely<Record<string, string>>(row.responseHeaders as unknown as string),
    metadata: parseJsonSafely<Record<string, unknown>>(row.metadata as unknown as string)
  };
};

export const getRequestByRequestId = async (requestId: string): Promise<NetworkRequest | null> => {
  const row = await getAsync<NetworkRequest>(
    'SELECT * FROM network_requests WHERE requestId = ?',
    [requestId]
  );

  if (!row) return null;

  return {
    ...row,
    requestHeaders: parseJsonSafely<Record<string, string>>(row.requestHeaders as unknown as string),
    responseHeaders: parseJsonSafely<Record<string, string>>(row.responseHeaders as unknown as string),
    metadata: parseJsonSafely<Record<string, unknown>>(row.metadata as unknown as string)
  };
};

export const clearRequests = async (): Promise<number> => {
  const result = await runAsync('DELETE FROM network_requests');
  return result.changes;
};

export const getRequestCount = async (): Promise<number> => {
  const result = await getAsync<CountResult>('SELECT COUNT(*) as count FROM network_requests');
  return result?.count || 0;
};

export const searchRequests = async (query: string, limit = 100): Promise<NetworkRequest[]> => {
  if (!query) {
    query = '';
  }
  const searchTerm = `%${query}%`;
  const rows = await allAsync<NetworkRequest>(
    `SELECT * FROM network_requests 
     WHERE url LIKE ? 
     OR requestHeaders LIKE ? 
     OR responseHeaders LIKE ?
     OR requestBody LIKE ?
     OR responseBody LIKE ?
     ORDER BY timestamp DESC LIMIT ?`,
    [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit]
  );
  
  return rows.map(row => ({
    ...row,
    requestHeaders: parseJsonSafely<Record<string, string>>(row.requestHeaders as unknown as string),
    responseHeaders: parseJsonSafely<Record<string, string>>(row.responseHeaders as unknown as string),
    metadata: parseJsonSafely<Record<string, unknown>>(row.metadata as unknown as string)
  }));
};

export const onNewRequest = (listener: (request: NetworkRequest) => void): void => {
  listeners.add(listener);
};

export const offNewRequest = (listener: (request: NetworkRequest) => void): void => {
  listeners.delete(listener);
};