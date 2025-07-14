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
import { fileURLToPath } from "url";
import { ensureDataDirectory, createDatabaseConnection } from "./storage/directory-utils.js";

// Database setup - use same path as main server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "browserrelay.db");

// Database connection - will be initialized in initializeDatabase
let db: sqlite3.Database;

// Database helper functions
const dbRun = async (
  sql: string,
  params?: unknown[]
): Promise<sqlite3.RunResult> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(
        new Error("Database not initialized. Call initializeDatabase() first.")
      );
      return;
    }
    db.run(
      sql,
      params || [],
      function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      }
    );
  });
};

const dbGet = async (sql: string, params?: unknown[]): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(
        new Error("Database not initialized. Call initializeDatabase() first.")
      );
      return;
    }
    db.get(sql, params || [], (err: Error | null, row: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const dbAll = async (sql: string, params?: unknown[]): Promise<unknown[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(
        new Error("Database not initialized. Call initializeDatabase() first.")
      );
      return;
    }
    db.all(sql, params || [], (err: Error | null, rows: unknown[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Safe JSON parsing helper
const parseJsonSafely = (jsonString: string | null | undefined): unknown => {
  if (!jsonString) return undefined;
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse JSON in MCP server:", error);
    return undefined;
  }
};

// Logger
const logger = {
  info: (message: string, ...args: unknown[]) => console.log(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
};

// Configuration for MCP response optimization
const MCP_BODY_TRUNCATE_LENGTH = 200; // Keep bodies very short for debugging
const MCP_MAX_RESPONSE_SIZE = 100000; // ~100k tokens max

// Helper function to truncate large strings
const truncateString = (
  str: string | null | undefined,
  maxLength: number
): string | null => {
  if (!str) return str || null;
  if (str.length <= maxLength) return str;
  return (
    str.substring(0, maxLength) +
    `... [truncated ${str.length - maxLength} chars]`
  );
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
    responseBody: truncateString(
      request.responseBody,
      MCP_BODY_TRUNCATE_LENGTH
    ),
    // Only include essential headers
    contentType:
      request.responseHeaders?.["content-type"] ||
      request.responseHeaders?.["Content-Type"],
    // Add error context if it's a failed request
    ...(request.statusCode &&
      request.statusCode >= 400 && {
        isError: true,
        errorCategory:
          request.statusCode >= 500 ? "server_error" : "client_error",
      }),
  };
};

// Helper function to estimate response size and truncate if needed
const ensureResponseSize = (data: any): any => {
  const jsonStr = JSON.stringify(data);

  // Rough estimate: 1 char ≈ 1 token for JSON
  if (jsonStr.length > MCP_MAX_RESPONSE_SIZE) {
    logger.warn(
      `MCP response too large (${jsonStr.length} chars), truncating...`
    );

    // If it's an array response, reduce the count
    if (data.requests && Array.isArray(data.requests)) {
      const maxItems = Math.floor(
        MCP_MAX_RESPONSE_SIZE / (jsonStr.length / data.requests.length)
      );
      return {
        ...data,
        requests: data.requests.slice(0, Math.max(1, maxItems)),
        _truncated: true,
        _originalCount: data.requests.length,
      };
    }

    if (data.logs && Array.isArray(data.logs)) {
      const maxItems = Math.floor(
        MCP_MAX_RESPONSE_SIZE / (jsonStr.length / data.logs.length)
      );
      return {
        ...data,
        logs: data.logs.slice(0, Math.max(1, maxItems)),
        _truncated: true,
        _originalCount: data.logs.length,
      };
    }
  }

  return data;
};

// Initialize database
async function initializeDatabase() {
  try {
    // Initialize database connection if not already done
    if (!db) {
      // Create data directory if it doesn't exist
      await ensureDataDirectory(dataDir);
      
      // Create the database connection with proper error handling
      db = await createDatabaseConnection(dbPath, sqlite3);
    }

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

  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp)`
  );
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level)`);
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_network_requests_timestamp ON network_requests (timestamp)`
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_network_requests_method ON network_requests (method)`
  );

    console.log('MCP database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize MCP database:', error);
    throw error;
  }
}

const tools = [
  {
    name: "get_console_logs",
    description:
      "Retrieve console logs captured from web pages with optional filtering capabilities. Returns logs with timestamp, level, message, page URL, and optional stack trace information.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          default: 20,
          description:
            "Maximum number of log entries to return (1-1000). Defaults to 20 for optimal performance.",
        },
        offset: {
          type: "number",
          default: 0,
          description:
            "Number of log entries to skip for pagination. Use with limit to paginate through large result sets.",
        },
        level: {
          type: "string",
          enum: ["log", "warn", "error", "info"],
          description:
            "Filter logs by severity level. 'error' for errors, 'warn' for warnings, 'info' for informational, 'log' for general console.log statements.",
        },
        url: {
          type: "string",
          description:
            "Filter logs by page URL using partial string matching. For example, 'example.com' will match all pages containing that domain.",
        },
        startTime: {
          type: "string",
          description:
            "Filter logs after this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only logs with timestamp >= startTime will be returned.",
        },
        endTime: {
          type: "string",
          description:
            "Filter logs before this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only logs with timestamp <= endTime will be returned.",
        },
      },
    },
  },
  {
    name: "clear_console_logs",
    description:
      "Delete all stored console logs from the local database. This action is irreversible and will permanently remove all captured console log entries from all web pages.",
    inputSchema: {
      type: "object",
      properties: {},
      description:
        "No parameters required. This tool will clear all console logs regardless of their timestamp, level, or origin page.",
    },
  },
  {
    name: "search_logs",
    description:
      "Search console logs using text-based queries to find specific log messages or stack traces. Performs case-insensitive partial matching across log messages and stack trace content.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search term to find in log messages and stack traces. Supports partial matching (e.g., 'error' matches 'TypeError', 'network error', etc.). Case-insensitive.",
        },
        limit: {
          type: "number",
          default: 20,
          description:
            "Maximum number of matching log entries to return (1-1000). Defaults to 20 for optimal performance.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_network_requests",
    description:
      "Retrieve HTTP/HTTPS network requests captured from web pages with optional filtering capabilities. Returns essential debugging information including method, URL, status code, timing, and truncated request/response bodies.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          default: 20,
          description:
            "Maximum number of network requests to return (1-1000). Defaults to 20 for optimal performance and to avoid token limits.",
        },
        offset: {
          type: "number",
          default: 0,
          description:
            "Number of network requests to skip for pagination. Use with limit to paginate through large result sets.",
        },
        method: {
          type: "string",
          description:
            "Filter requests by HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS). Case-insensitive exact match.",
        },
        url: {
          type: "string",
          description:
            "Filter requests by URL using partial string matching. Matches against the full request URL including query parameters.",
        },
        statusCode: {
          type: "number",
          description:
            "Filter requests by HTTP status code (e.g., 200, 404, 500). Use exact match for specific status codes.",
        },
        startTime: {
          type: "string",
          description:
            "Filter requests after this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only requests with timestamp >= startTime will be returned.",
        },
        endTime: {
          type: "string",
          description:
            "Filter requests before this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only requests with timestamp <= endTime will be returned.",
        },
      },
    },
  },
  {
    name: "clear_network_requests",
    description:
      "Delete all stored network requests from the local database. This action is irreversible and will permanently remove all captured HTTP/HTTPS request data from all web pages.",
    inputSchema: {
      type: "object",
      properties: {},
      description:
        "No parameters required. This tool will clear all network requests regardless of their method, status code, timestamp, or origin page.",
    },
  },
  {
    name: "search_network_requests",
    description:
      "Search network requests using text-based queries across URLs, headers, and request/response bodies. Performs case-insensitive partial matching to find specific API calls, errors, or content patterns.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search term to find in request URLs, headers, request bodies, and response bodies. Supports partial matching (e.g., 'api/users' matches 'https://example.com/api/users/123'). Case-insensitive.",
        },
        limit: {
          type: "number",
          default: 20,
          description:
            "Maximum number of matching network requests to return (1-1000). Defaults to 20 for optimal performance and to avoid token limits.",
        },
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
        metadata: parseJsonSafely(row.metadata),
      }));
      return ensureResponseSize({ logs });
    }

    case "clear_console_logs": {
      const result = (await dbRun("DELETE FROM logs")) as sqlite3.RunResult;
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
        metadata: parseJsonSafely(row.metadata),
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
        metadata: parseJsonSafely(row.metadata),
      }));

      const minimalRequests = requests.map(createMinimalNetworkRequest);
      return ensureResponseSize({ requests: minimalRequests });
    }

    case "clear_network_requests": {
      const result = (await dbRun(
        "DELETE FROM network_requests"
      )) as sqlite3.RunResult;
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
        [
          searchTerm,
          searchTerm,
          searchTerm,
          searchTerm,
          searchTerm,
          (args.limit as number) || 20,
        ]
      );

      const requests = rows.map((row: any) => ({
        ...row,
        requestHeaders: parseJsonSafely(row.requestHeaders),
        responseHeaders: parseJsonSafely(row.responseHeaders),
        metadata: parseJsonSafely(row.metadata),
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
      name: "local-lens",
      version: "0.1.4",
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
