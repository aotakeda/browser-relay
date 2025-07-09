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
// The MCP server should use the same database as the main server
// Use import.meta.url to get the directory of this file, then navigate to server/data
// This file is in server/src/, so we go up 1 level to server/ then into data/
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
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      hostname TEXT NOT NULL,
      status_code INTEGER,
      status_category TEXT,
      duration_ms INTEGER,
      request_headers TEXT,
      request_body TEXT,
      response_headers TEXT,
      response_body TEXT,
      response_size INTEGER,
      context TEXT
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
        limit: { type: "number", default: 100 },
        offset: { type: "number", default: 0 },
        level: { type: "string", enum: ["log", "warn", "error", "info"] },
        url: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
    },
  },
  {
    name: "get_network_requests",
    description: "Retrieve network requests with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 100 },
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
    name: "search_logs",
    description: "Search console logs by text query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", default: 100 },
      },
      required: ["query"],
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
    name: "clear_network_requests",
    description: "Clear all stored network requests",
    inputSchema: {
      type: "object",
      properties: {},
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

      query += " ORDER BY id DESC LIMIT ? OFFSET ?";
      params.push(args.limit || 100, args.offset || 0);

      const logs = await dbAll(query, params);
      return { logs };
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
        conditions.push("status_code = ?");
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

      query += " ORDER BY id DESC LIMIT ? OFFSET ?";
      params.push(args.limit || 100, args.offset || 0);

      const requests = await dbAll(query, params);
      return { requests };
    }

    case "search_logs": {
      const query = `
        SELECT * FROM logs 
        WHERE message LIKE ? OR stackTrace LIKE ?
        ORDER BY id DESC LIMIT ?
      `;
      const searchTerm = `%${args.query}%`;
      const logs = await dbAll(query, [searchTerm, searchTerm, args.limit || 100]);
      return { logs };
    }

    case "clear_console_logs": {
      const result = await dbGet("SELECT COUNT(*) as count FROM logs") as { count: number } | undefined;
      await dbRun("DELETE FROM logs");
      return { cleared: result?.count || 0 };
    }

    case "clear_network_requests": {
      const result = await dbGet("SELECT COUNT(*) as count FROM network_requests") as { count: number } | undefined;
      await dbRun("DELETE FROM network_requests");
      return { cleared: result?.count || 0 };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

async function main() {
  try {
    // Initialize database
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

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main();