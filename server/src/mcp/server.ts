import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logStorage } from "@/storage/LogStorage";
import { logger } from "@/index";

let mcpServer: Server | null = null;

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
        limit: { type: "number", default: 100 },
      },
      required: ["query"],
    },
  },
];

const handleToolCall = async (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case "get_console_logs": {
      const logs = await logStorage.getLogs(
        args.limit || 100,
        args.offset || 0,
        {
          level: args.level,
          url: args.url,
          startTime: args.startTime,
          endTime: args.endTime,
        }
      );
      return { logs };
    }

    case "clear_console_logs": {
      const count = await logStorage.clearLogs();
      return { cleared: count };
    }

    case "search_logs": {
      const logs = await logStorage.searchLogs(args.query, args.limit || 100);
      return { logs };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

export const setupMCPServer = async () => {
  if (process.env.MCP_MODE !== "true") {
    logger.info("MCP mode not enabled, skipping MCP server setup");
    return;
  }

  mcpServer = new Server(
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

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
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
  await mcpServer.connect(transport);

  logger.info("MCP server started");
};

export const getMCPServer = (): Server | null => mcpServer;
