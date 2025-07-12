import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logStorage } from "../storage/LogStorage.js";
import * as networkStorage from "../storage/NetworkStorage.js";
import { logger } from "../index.js";
import { NetworkRequest } from "../types.js";

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
const ensureResponseSize = (data: unknown): unknown => {
  const jsonStr = JSON.stringify(data);
  
  // Rough estimate: 1 char ≈ 1 token for JSON
  if (jsonStr.length > MCP_MAX_RESPONSE_SIZE) {
    logger.warn(`MCP response too large (${jsonStr.length} chars), truncating...`);
    
    // Type guard for object with requests property
    if (data && typeof data === 'object' && 'requests' in data) {
      const typedData = data as { requests: unknown[] };
      if (Array.isArray(typedData.requests)) {
        const maxItems = Math.floor(MCP_MAX_RESPONSE_SIZE / (jsonStr.length / typedData.requests.length));
        return {
          ...typedData,
          requests: typedData.requests.slice(0, Math.max(1, maxItems)),
          _truncated: true,
          _originalCount: typedData.requests.length
        };
      }
    }
    
    // Type guard for object with logs property
    if (data && typeof data === 'object' && 'logs' in data) {
      const typedData = data as { logs: unknown[] };
      if (Array.isArray(typedData.logs)) {
        const maxItems = Math.floor(MCP_MAX_RESPONSE_SIZE / (jsonStr.length / typedData.logs.length));
        return {
          ...typedData,
          logs: typedData.logs.slice(0, Math.max(1, maxItems)),
          _truncated: true,
          _originalCount: typedData.logs.length
        };
      }
    }
  }
  
  return data;
};

const tools = [
  {
    name: "get_console_logs",
    description: "Retrieve console logs captured from web pages with optional filtering capabilities. Returns logs with timestamp, level, message, page URL, and optional stack trace information.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { 
          type: "number", 
          default: 20, 
          description: "Maximum number of log entries to return (1-1000). Defaults to 20 for optimal performance." 
        },
        offset: { 
          type: "number", 
          default: 0, 
          description: "Number of log entries to skip for pagination. Use with limit to paginate through large result sets." 
        },
        level: { 
          type: "string", 
          enum: ["log", "warn", "error", "info"], 
          description: "Filter logs by severity level. 'error' for errors, 'warn' for warnings, 'info' for informational, 'log' for general console.log statements." 
        },
        url: { 
          type: "string", 
          description: "Filter logs by page URL using partial string matching. For example, 'example.com' will match all pages containing that domain." 
        },
        startTime: { 
          type: "string", 
          description: "Filter logs after this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only logs with timestamp >= startTime will be returned." 
        },
        endTime: { 
          type: "string", 
          description: "Filter logs before this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only logs with timestamp <= endTime will be returned." 
        },
      },
    },
  },
  {
    name: "clear_console_logs",
    description: "Delete all stored console logs from the local database. This action is irreversible and will permanently remove all captured console log entries from all web pages.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "No parameters required. This tool will clear all console logs regardless of their timestamp, level, or origin page."
    },
  },
  {
    name: "search_logs",
    description: "Search console logs using text-based queries to find specific log messages or stack traces. Performs case-insensitive partial matching across log messages and stack trace content.",
    inputSchema: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search term to find in log messages and stack traces. Supports partial matching (e.g., 'error' matches 'TypeError', 'network error', etc.). Case-insensitive." 
        },
        limit: { 
          type: "number", 
          default: 20, 
          description: "Maximum number of matching log entries to return (1-1000). Defaults to 20 for optimal performance." 
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_network_requests",
    description: "Retrieve HTTP/HTTPS network requests captured from web pages with optional filtering capabilities. Returns essential debugging information including method, URL, status code, timing, and truncated request/response bodies.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { 
          type: "number", 
          default: 20, 
          description: "Maximum number of network requests to return (1-1000). Defaults to 20 for optimal performance and to avoid token limits." 
        },
        offset: { 
          type: "number", 
          default: 0, 
          description: "Number of network requests to skip for pagination. Use with limit to paginate through large result sets." 
        },
        method: { 
          type: "string", 
          description: "Filter requests by HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS). Case-insensitive exact match." 
        },
        url: { 
          type: "string", 
          description: "Filter requests by URL using partial string matching. Matches against the full request URL including query parameters." 
        },
        statusCode: { 
          type: "number", 
          description: "Filter requests by HTTP status code (e.g., 200, 404, 500). Use exact match for specific status codes." 
        },
        startTime: { 
          type: "string", 
          description: "Filter requests after this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only requests with timestamp >= startTime will be returned." 
        },
        endTime: { 
          type: "string", 
          description: "Filter requests before this timestamp (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ). Only requests with timestamp <= endTime will be returned." 
        },
      },
    },
  },
  {
    name: "clear_network_requests",
    description: "Delete all stored network requests from the local database. This action is irreversible and will permanently remove all captured HTTP/HTTPS request data from all web pages.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "No parameters required. This tool will clear all network requests regardless of their method, status code, timestamp, or origin page."
    },
  },
  {
    name: "search_network_requests",
    description: "Search network requests using text-based queries across URLs, headers, and request/response bodies. Performs case-insensitive partial matching to find specific API calls, errors, or content patterns.",
    inputSchema: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search term to find in request URLs, headers, request bodies, and response bodies. Supports partial matching (e.g., 'api/users' matches 'https://example.com/api/users/123'). Case-insensitive." 
        },
        limit: { 
          type: "number", 
          default: 20, 
          description: "Maximum number of matching network requests to return (1-1000). Defaults to 20 for optimal performance and to avoid token limits." 
        },
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
      version: "0.1.4",
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
