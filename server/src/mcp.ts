#!/usr/bin/env node

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logStorage } from "./storage/LogStorage.js";
import { networkStorage } from "./storage/NetworkStorage.js";
import { initializeDatabase } from "./storage/database.js";

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
    name: "search_network_requests",
    description: "Search network requests by URL, headers, or body content",
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
      // For now, we'll do a simple search through getRequests
      // TODO: Implement proper search functionality in NetworkStorage
      const requests = await networkStorage.getRequests(
        (args.limit as number) || 100,
        0,
        {
          url: args.query as string,
        }
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