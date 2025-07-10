#!/usr/bin/env node

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import { promisify } from "util";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from 'url';

// Database setup - use absolute path to the actual Browser Relay database
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'browserrelay.db');

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);
const dbRun = promisify(db.run.bind(db)) as (sql: string, params?: unknown[]) => Promise<sqlite3.RunResult>;
const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: unknown[]) => Promise<unknown>;
const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: unknown[]) => Promise<unknown[]>;

// Safe JSON parsing helper
const parseJsonSafely = (jsonString: string | null | undefined): unknown => {
  if (!jsonString) return undefined;
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse JSON in MCP server:', error);
    return undefined;
  }
};

// Logger
const logger = {
  info: (message: string, ...args: unknown[]) => console.log(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(message, ...args)
};

// Configuration for MCP response optimization
const MCP_BODY_TRUNCATE_LENGTH = 200; // Keep bodies very short for debugging
const MCP_MAX_RESPONSE_SIZE = 100000; // ~100k tokens max

// Helper function to truncate large strings
const truncateString = (str: string | null | undefined, maxLength: number): string | null => {
  if (!str) return str || null;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated ${str.length - maxLength} chars]`;
};

// Helper function to create minimal network request response with only essential debugging fields
const createMinimalNetworkRequest = (request: any) => {
  return {
    method: request.method,
    url: request.url,
    statusCode: request.statusCode,
    timestamp: request.timestamp,
    duration: request.duration,
    responseSize: request.responseSize,
    pageUrl: request.pageUrl,
    // Only include essential body content (heavily truncated)
    requestBody: truncateString(request.requestBody, MCP_BODY_TRUNCATE_LENGTH),
    responseBody: truncateString(request.responseBody, MCP_BODY_TRUNCATE_LENGTH),
    // Only include essential headers
    contentType: request.responseHeaders?.['content-type'] || request.responseHeaders?.['Content-Type'],
    // Add error context if it's a failed request
    ...(request.statusCode && request.statusCode >= 400 && {
      isError: true,
      errorCategory: request.statusCode >= 500 ? 'server_error' : 'client_error'
    })
  };
};

// Helper function to estimate response size and truncate if needed
const ensureResponseSize = (data: any): any => {
  const jsonStr = JSON.stringify(data);
  
  // Rough estimate: 1 char ≈ 1 token for JSON
  if (jsonStr.length > MCP_MAX_RESPONSE_SIZE) {
    logger.warn(`MCP response too large (${jsonStr.length} chars), truncating...`);
    
    // If it's an array response, reduce the count
    if (data.requests && Array.isArray(data.requests)) {
      const maxItems = Math.floor(MCP_MAX_RESPONSE_SIZE / (jsonStr.length / data.requests.length));
      return {
        ...data,
        requests: data.requests.slice(0, Math.max(1, maxItems)),
        _truncated: true,
        _originalCount: data.requests.length
      };
    }
    
    if (data.logs && Array.isArray(data.logs)) {
      const maxItems = Math.floor(MCP_MAX_RESPONSE_SIZE / (jsonStr.length / data.logs.length));
      return {
        ...data,
        logs: data.logs.slice(0, Math.max(1, maxItems)),
        _truncated: true,
        _originalCount: data.logs.length
      };
    }
  }
  
  return data;
};

// Initialize database
async function initializeDatabase() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      stackTrace TEXT,
      pageUrl TEXT NOT NULL,
      userAgent TEXT,
      metadata TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS network_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requestId TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      requestHeaders TEXT,
      responseHeaders TEXT,
      requestBody TEXT,
      responseBody TEXT,
      statusCode INTEGER,
      duration INTEGER,
      responseSize INTEGER,
      pageUrl TEXT NOT NULL,
      userAgent TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_network_requests_timestamp ON network_requests (timestamp)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_network_requests_method ON network_requests (method)`);
}

const tools = [
  {
    name: "get_console_logs",
    description: "Retrieve console logs with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20 },
        offset: { type: "number", default: 0 },
        level: { type: "string", enum: ["log", "warn", "error", "info"] },
        url: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
    },
  },
  {
    name: "clear_console_logs",
    description: "Clear all stored console logs",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_logs",
    description: "Search console logs by text query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", default: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_network_requests",
    description: "Retrieve network requests with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20 },
        offset: { type: "number", default: 0 },
        method: { type: "string" },
        url: { type: "string" },
        statusCode: { type: "number" },
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
    },
  },
  {
    name: "clear_network_requests",
    description: "Clear all stored network requests",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_network_requests",
    description: "Search network requests by URL, headers, or body content",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to match against URL, headers, or body content" },
        limit: { type: "number", default: 20 },
      },
      required: ["query"],
    },
  },
];

const handleToolCall = async (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case "get_console_logs": {
      let query = "SELECT * FROM logs";
      const params: unknown[] = [];
      const conditions: string[] = [];

      if (args.level) {
        conditions.push("level = ?");
        params.push(args.level);
      }
      if (args.url) {
        conditions.push("pageUrl LIKE ?");
        params.push(`%${args.url}%`);
      }
      if (args.startTime) {
        conditions.push("timestamp >= ?");
        params.push(args.startTime);
      }
      if (args.endTime) {
        conditions.push("timestamp <= ?");
        params.push(args.endTime);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      params.push((args.limit as number) || 20, (args.offset as number) || 0);

      const rows = await dbAll(query, params);
      const logs = rows.map((row: any) => ({
        ...row,
        metadata: parseJsonSafely(row.metadata)
      }));
      return ensureResponseSize({ logs });
    }

    case "clear_console_logs": {
      const result = await dbRun("DELETE FROM logs") as sqlite3.RunResult;
      return { cleared: result.changes };
    }

    case "search_logs": {
      const searchTerm = `%${args.query}%`;
      const rows = await dbAll(
        "SELECT * FROM logs WHERE message LIKE ? OR stackTrace LIKE ? ORDER BY timestamp DESC LIMIT ?",
        [searchTerm, searchTerm, (args.limit as number) || 20]
      );
      const logs = rows.map((row: any) => ({
        ...row,
        metadata: parseJsonSafely(row.metadata)
      }));
      return ensureResponseSize({ logs });
    }

    case "get_network_requests": {
      let query = "SELECT * FROM network_requests";
      const params: unknown[] = [];
      const conditions: string[] = [];

      if (args.method) {
        conditions.push("method = ?");
        params.push(args.method);
      }
      if (args.url) {
        conditions.push("url LIKE ?");
        params.push(`%${args.url}%`);
      }
      if (args.statusCode) {
        conditions.push("statusCode = ?");
        params.push(args.statusCode);
      }
      if (args.startTime) {
        conditions.push("timestamp >= ?");
        params.push(args.startTime);
      }
      if (args.endTime) {
        conditions.push("timestamp <= ?");
        params.push(args.endTime);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      params.push((args.limit as number) || 20, (args.offset as number) || 0);

      const rows = await dbAll(query, params);
      const requests = rows.map((row: any) => ({
        ...row,
        requestHeaders: parseJsonSafely(row.requestHeaders),
        responseHeaders: parseJsonSafely(row.responseHeaders),
        metadata: parseJsonSafely(row.metadata)
      }));
      
      const minimalRequests = requests.map(createMinimalNetworkRequest);
      return ensureResponseSize({ requests: minimalRequests });
    }

    case "clear_network_requests": {
      const result = await dbRun("DELETE FROM network_requests") as sqlite3.RunResult;
      return { cleared: result.changes };
    }

    case "search_network_requests": {
      const searchTerm = `%${args.query}%`;
      const rows = await dbAll(
        `SELECT * FROM network_requests 
         WHERE url LIKE ? 
         OR requestHeaders LIKE ? 
         OR responseHeaders LIKE ?
         OR requestBody LIKE ?
         OR responseBody LIKE ?
         ORDER BY timestamp DESC LIMIT ?`,
        [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, (args.limit as number) || 20]
      );
      
      const requests = rows.map((row: any) => ({
        ...row,
        requestHeaders: parseJsonSafely(row.requestHeaders),
        responseHeaders: parseJsonSafely(row.responseHeaders),
        metadata: parseJsonSafely(row.metadata)
      }));
      
      const minimalRequests = requests.map(createMinimalNetworkRequest);
      return ensureResponseSize({ requests: minimalRequests });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

const setupMCPServer = async () => {
  await initializeDatabase();
  
  const server = new Server(
    {
      name: "browser-relay",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleToolCall(
        request.params.name,
        request.params.arguments || {}
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("MCP tool error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP server started");
};

// Start the server
setupMCPServer().catch((error) => {
  logger.error("Failed to start MCP server:", error);
  process.exit(1);
});