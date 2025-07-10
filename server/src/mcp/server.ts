import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logStorage } from "../storage/LogStorage.js";
import { networkStorage } from "../storage/NetworkStorage.js";
import { logger } from "../index.js";
import { NetworkRequest, ConsoleLog } from "../types.js";

let mcpServer: Server | null = null;

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
const createMinimalNetworkRequest = (request: NetworkRequest) => {
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
      const logs = await logStorage.getLogs(
        (args.limit as number) || 20,
        (args.offset as number) || 0,
        {
          level: args.level as string,
          url: args.url as string,
          startTime: args.startTime as string,
          endTime: args.endTime as string,
        }
      );
      return ensureResponseSize({ logs });
    }

    case "clear_console_logs": {
      const count = await logStorage.clearLogs();
      return { cleared: count };
    }

    case "search_logs": {
      const logs = await logStorage.searchLogs(args.query as string, (args.limit as number) || 20);
      return { logs };
    }

    case "get_network_requests": {
      const requests = await networkStorage.getRequests(
        (args.limit as number) || 20,
        (args.offset as number) || 0,
        {
          method: args.method as string,
          url: args.url as string,
          statusCode: args.statusCode as number,
          startTime: args.startTime as string,
          endTime: args.endTime as string,
        }
      );
      const minimalRequests = requests.map(createMinimalNetworkRequest);
      return ensureResponseSize({ requests: minimalRequests });
    }

    case "clear_network_requests": {
      const count = await networkStorage.clearRequests();
      return { cleared: count };
    }

    case "search_network_requests": {
      const requests = await networkStorage.searchRequests(
        args.query as string,
        (args.limit as number) || 20
      );
      const minimalRequests = requests.map(createMinimalNetworkRequest);
      return ensureResponseSize({ requests: minimalRequests });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

export const setupMCPServer = async () => {
  // Allow setup to be called dynamically, don't check environment variable
  if (mcpServer) {
    logger.info("MCP server already initialized");
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

// Standalone mode - detect if this module is being run directly
const isStandalone = () => {
  try {
    // Check if this module is the main module being executed
    return process.argv[1] && process.argv[1].includes('mcp/server.js');
  } catch {
    return false;
  }
};

if (isStandalone()) {
  (async () => {
    try {
      await setupMCPServer();
      logger.info("MCP server started in standalone mode");
    } catch (error) {
      logger.error("Failed to start MCP server:", error);
      process.exit(1);
    }
  })();
}
