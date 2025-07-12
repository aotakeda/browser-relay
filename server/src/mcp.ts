#!/usr/bin/env node

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logStorage } from "./storage/LogStorage.js";
import * as networkStorage from "./storage/NetworkStorage.js";
import { initializeDatabase } from "./storage/database.js";

const tools = [
  {
    name: "get_console_logs",
    description: "Retrieve console logs with optional filters. Examples: get recent errors (level='error'), logs from specific site (url='example.com'), or logs in time range (startTime/endTime).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 100, description: "Maximum number of logs to return" },
        offset: { type: "number", default: 0, description: "Number of logs to skip (for pagination)" },
        level: { type: "string", enum: ["log", "warn", "error", "info"], description: "Filter by log level" },
        url: { type: "string", description: "Filter by page URL (partial match)" },
        startTime: { type: "string", description: "Filter logs after this timestamp (ISO 8601)" },
        endTime: { type: "string", description: "Filter logs before this timestamp (ISO 8601)" },
      },
    },
  },
  {
    name: "get_network_requests",
    description: "Retrieve network requests with optional filters. Examples: get failed requests (statusCode=500), API calls (method='POST'), or requests to specific domain (url='api.example.com').",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 100, description: "Maximum number of requests to return" },
        offset: { type: "number", default: 0, description: "Number of requests to skip (for pagination)" },
        method: { type: "string", description: "Filter by HTTP method (GET, POST, etc.)" },
        url: { type: "string", description: "Filter by URL (partial match)" },
        statusCode: { type: "number", description: "Filter by HTTP status code" },
        startTime: { type: "string", description: "Filter requests after this timestamp (ISO 8601)" },
        endTime: { type: "string", description: "Filter requests before this timestamp (ISO 8601)" },
      },
    },
  },
  {
    name: "search_logs",
    description: "Search console logs by text query. Searches message and stack trace content. Examples: search for 'TypeError' or 'API error' to find specific issues.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to match against log message or stack trace" },
        limit: { type: "number", default: 100, description: "Maximum number of logs to return" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_network_requests", 
    description: "Search network requests by URL, headers, or body content. Searches across URL, request/response headers, and request/response bodies. Examples: search for 'authorization' to find auth headers, or 'error' to find error responses.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to match against URL, headers, or body content" },
        limit: { type: "number", default: 100, description: "Maximum number of requests to return" },
      },
      required: ["query"],
    },
  },
  {
    name: "clear_console_logs",
    description: "Clear all stored console logs. This permanently deletes all log entries from the database. Returns the number of logs deleted.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clear_network_requests",
    description: "Clear all stored network requests. This permanently deletes all request entries from the database. Returns the number of requests deleted.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

const handleToolCall = async (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case "get_console_logs": {
      const logs = await logStorage.getLogs(
        (args.limit as number) || 100,
        (args.offset as number) || 0,
        {
          level: args.level as string,
          url: args.url as string,
          startTime: args.startTime as string,
          endTime: args.endTime as string,
        }
      );
      return { logs };
    }

    case "get_network_requests": {
      const requests = await networkStorage.getRequests(
        (args.limit as number) || 100,
        (args.offset as number) || 0,
        {
          method: args.method as string,
          url: args.url as string,
          statusCode: args.statusCode as number,
          startTime: args.startTime as string,
          endTime: args.endTime as string,
        }
      );
      return { requests };
    }

    case "search_logs": {
      const logs = await logStorage.searchLogs(
        args.query as string,
        (args.limit as number) || 100
      );
      return { logs };
    }

    case "search_network_requests": {
      const requests = await networkStorage.searchRequests(
        args.query as string,
        (args.limit as number) || 100
      );
      return { requests };
    }

    case "clear_console_logs": {
      const count = await logStorage.clearLogs();
      return { cleared: count };
    }

    case "clear_network_requests": {
      const count = await networkStorage.clearRequests();
      return { cleared: count };
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