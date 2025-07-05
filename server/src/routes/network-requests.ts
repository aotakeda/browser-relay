import { Router } from "express";
import { networkStorage } from "@/storage/NetworkStorage";
import { NetworkRequest, NetworkRequestBatch } from "@/types";
import { logger } from "@/index";

// Helper functions for LLM-friendly output
function getStatusEmoji(statusCode: number | undefined): string {
  if (!statusCode) return "⏳";
  if (statusCode >= 200 && statusCode < 300) return "✅";
  if (statusCode >= 300 && statusCode < 400) return "🔄";
  if (statusCode >= 400 && statusCode < 500) return "❌";
  if (statusCode >= 500) return "💥";
  return "❓";
}

function isNoiseRequest(request: NetworkRequest): boolean {
  const url = request.url.toLowerCase();
  const pathname = new URL(request.url).pathname.toLowerCase();

  // Filter out common noise patterns
  const noisePatterns = [
    // Images and media
    /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/,
    /\.(mp4|webm|ogg|mp3|wav)$/,
    // Fonts
    /\.(woff|woff2|ttf|eot)$/,
    // CSS and static assets
    /\.css$/,
    /\/static\//,
    /\/assets\//,
    // Analytics and tracking
    /google-analytics/,
    /googletagmanager/,
    /facebook\.com\/tr/,
    /doubleclick/,
    /scorecardresearch/,
    /track|analytics|telemetry/,
    // CDN and caching
    /cloudflare/,
    /amazonaws\.com/,
    /\.glbimg\.com.*\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/,
  ];

  // Check if URL matches any noise pattern
  if (
    noisePatterns.some((pattern) => pattern.test(url) || pattern.test(pathname))
  ) {
    return true;
  }

  // Filter out very long encoded strings (tracking data)
  if (request.requestBody) {
    const hasLongEncodedString = /[a-zA-Z0-9+/=]{200,}/.test(
      request.requestBody
    );
    if (hasLongEncodedString) return true;
  }

  // Filter out tracking URLs with lots of encoded parameters
  if (url.includes("track") || url.includes("analytics")) {
    const hasEncodedParams = /[a-zA-Z0-9+/=%]{100,}/.test(url);
    if (hasEncodedParams) return true;
  }

  return false;
}

function getMethodEmoji(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "📥";
    case "POST":
      return "📤";
    case "PUT":
      return "✏️";
    case "DELETE":
      return "🗑️";
    case "PATCH":
      return "🔧";
    case "OPTIONS":
      return "🔍";
    default:
      return "📡";
  }
}

function formatHeaders(headers: Record<string, string> | undefined): string {
  if (!headers || Object.keys(headers).length === 0) return "";

  return Object.entries(headers)
    .map(([key, value]) => `    ${key}: ${value}`)
    .join("\n");
}

function truncateContent(content: string | undefined, maxLength = 800): string {
  if (!content) return "";
  if (content.length <= maxLength) return content;

  // If it's JSON, try to show meaningful parts
  try {
    const parsed = JSON.parse(content);
    const prettified = JSON.stringify(parsed, null, 2);
    if (prettified.length <= maxLength) return prettified;

    // Show first part of JSON structure
    return prettified.substring(0, maxLength) + "... [JSON truncated]";
  } catch {
    // Not JSON, check if it's mostly encoded/base64 data
    const hasLongEncodedString = /[a-zA-Z0-9+/=]{100,}/.test(content);
    if (hasLongEncodedString) {
      return "[Encoded/Base64 data - omitted for brevity]";
    }

    return content.substring(0, maxLength) + "... [truncated]";
  }
}

export const networkRequestsRouter: Router = Router();

networkRequestsRouter.post("/", async (req, res) => {
  try {
    const batch: NetworkRequestBatch = req.body;

    if (!batch.requests || !Array.isArray(batch.requests)) {
      logger.warn("Invalid network request batch format:", batch);
      return res
        .status(400)
        .json({ error: "Invalid network request batch format" });
    }

    // Filter out Browser Relay's own network requests and noise
    const filteredRequests = batch.requests.filter(
      (request) =>
        !request.url.includes("localhost:8765") &&
        !request.url.includes("browser-relay") &&
        !request.pageUrl.includes("chrome-extension://") &&
        !isNoiseRequest(request)
    );

    // Log network requests for LLM visibility (if enabled)
    if (process.env.LOG_NETWORK_REQUESTS !== "false") {
      filteredRequests.forEach((request) => {
        const url = new URL(request.url);
        const hostname = url.hostname;
        const timestamp = new Date(request.timestamp).toLocaleTimeString();
        const statusEmoji = getStatusEmoji(request.statusCode);
        const methodEmoji = getMethodEmoji(request.method);

        // Create LLM-friendly structured network request log
        let logMessage = `=====================\n`;
        logMessage += `${methodEmoji} NETWORK ${request.method} ${statusEmoji} | ${hostname} | ${timestamp}\n`;
        logMessage += `🌐 URL: ${request.url}\n`;
        logMessage += `📊 Status: ${request.statusCode || "pending"}`;

        if (request.duration) {
          logMessage += ` | ⏱️  ${request.duration}ms`;
        }

        // Request details
        const reqHeaders = formatHeaders(request.requestHeaders);
        if (reqHeaders) {
          logMessage += `\n📤 Request Headers:\n${reqHeaders}`;
        }

        const reqBody = truncateContent(request.requestBody);
        if (reqBody) {
          logMessage += `\n📤 Request Body:\n    ${reqBody}`;
        }

        // Response details
        const resHeaders = formatHeaders(request.responseHeaders);
        if (resHeaders) {
          logMessage += `\n📥 Response Headers:\n${resHeaders}`;
        }

        const resBody = truncateContent(request.responseBody);
        if (resBody) {
          logMessage += `\n📥 Response Body:\n    ${resBody}`;
        }

        // Add context for common API patterns
        if (url.pathname.includes("/api/")) {
          logMessage += `\n🔍 API Endpoint Detected`;
        }

        if (
          request.requestHeaders?.["authorization"] ||
          request.requestHeaders?.["Authorization"]
        ) {
          logMessage += `\n🔐 Authenticated Request`;
        }

        logMessage += `\n=====================`;

        // Use appropriate log level based on status
        if (request.statusCode && request.statusCode >= 400) {
          logger.error(logMessage);
        } else {
          logger.info(logMessage);
        }
      });
    }

    // Only store non-Browser Relay network requests in database
    const insertedRequests = await networkStorage.insertRequests(
      filteredRequests
    );

    res.json({
      received: batch.requests.length,
      stored: insertedRequests.length,
    });
  } catch (error) {
    logger.error("Error processing network requests:", error);
    res.status(500).json({ error: "Failed to process network requests" });
  }
});

networkRequestsRouter.get("/", async (req, res) => {
  try {
    const {
      limit = "100",
      offset = "0",
      method,
      url,
      statusCode,
      startTime,
      endTime,
    } = req.query;

    const filters = {
      method: method as string,
      url: url as string,
      statusCode: statusCode ? parseInt(statusCode as string) : undefined,
      startTime: startTime as string,
      endTime: endTime as string,
    };

    const requests = await networkStorage.getRequests(
      parseInt(limit as string),
      parseInt(offset as string),
      filters
    );

    res.json({ requests });
  } catch (error) {
    logger.error("Error fetching network requests:", error);
    res.status(500).json({ error: "Failed to fetch network requests" });
  }
});

networkRequestsRouter.get("/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendRequest = (request: NetworkRequest) => {
    res.write(`data: ${JSON.stringify(request)}\n\n`);
  };

  networkStorage.onNewRequest(sendRequest);

  req.on("close", () => {
    networkStorage.offNewRequest(sendRequest);
  });
});

networkRequestsRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const request = await networkStorage.getRequestById(id);

    if (!request) {
      return res.status(404).json({ error: "Network request not found" });
    }

    res.json({ request });
  } catch (error) {
    logger.error("Error fetching network request:", error);
    res.status(500).json({ error: "Failed to fetch network request" });
  }
});

networkRequestsRouter.delete("/", async (req, res) => {
  try {
    const count = await networkStorage.clearRequests();
    logger.info(`Cleared ${count} network requests`);
    res.json({ cleared: count });
  } catch (error) {
    logger.error("Error clearing network requests:", error);
    res.status(500).json({ error: "Failed to clear network requests" });
  }
});
