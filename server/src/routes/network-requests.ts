import { Router } from "express";
import { networkStorage } from "@/storage/NetworkStorage";
import { NetworkRequest, NetworkRequestBatch } from "@/types";
import { logger } from "@/index";

function getStatusCategory(statusCode: number | undefined): string {
  if (!statusCode) return "pending";
  if (statusCode >= 200 && statusCode < 300) return "success";
  if (statusCode >= 300 && statusCode < 400) return "redirect";
  if (statusCode >= 400 && statusCode < 500) return "client_error";
  if (statusCode >= 500 && statusCode < 600) return "server_error";
  return "unknown";
}

function processBodyForJSON(body: string | undefined): unknown {
  if (!body) return null;

  const maxLength = 800;

  // Check if it's encoded/base64 data
  if (body.length > 100 && /^[a-zA-Z0-9+/=]{100,}$/.test(body)) {
    return {
      type: "encoded_data",
      length: body.length,
      truncated: true,
    };
  }

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(body);
    const prettyJSON = JSON.stringify(parsed, null, 2);

    if (prettyJSON.length <= maxLength) {
      return {
        type: "json",
        data: parsed,
        truncated: false,
      };
    } else {
      return {
        type: "json",
        data: parsed,
        truncated: true,
        original_length: body.length,
      };
    }
  } catch {
    // Not JSON, treat as plain text
    if (body.length <= maxLength) {
      return {
        type: "text",
        data: body,
        truncated: false,
      };
    } else {
      return {
        type: "text",
        data: body.substring(0, maxLength),
        truncated: true,
        original_length: body.length,
      };
    }
  }
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
    const filteredRequests = batch.requests.filter((request) => {
      // Filter out ALL requests to our own server (port 27497)
      if (request.url.includes("localhost:27497")) {
        return false;
      }

      // Filter out Browser Relay's own health check requests for port detection
      if (
        request.url.includes("localhost:") &&
        request.url.includes("/health-browser-relay")
      ) {
        return false;
      }

      // Filter out extension and other noise
      if (
        request.url.includes("browser-relay") ||
        request.pageUrl.includes("chrome-extension://")
      ) {
        return false;
      }

      return !isNoiseRequest(request);
    });

    // Log network requests for LLM visibility (if enabled)
    if (process.env.LOG_NETWORK_REQUESTS !== "false") {
      filteredRequests.forEach((request) => {
        const url = new URL(request.url);
        const hostname = url.hostname;
        const date = new Date(request.timestamp);
        const timestamp = isNaN(date.getTime())
          ? request.timestamp
          : date.toISOString();

        // Create JSON structured network request log
        const logData = {
          type: "network_request",
          method: request.method,
          url: request.url,
          hostname,
          timestamp,
          status: {
            code: request.statusCode,
            category: getStatusCategory(request.statusCode),
          },
          ...(request.duration && { duration_ms: request.duration }),
          ...(request.requestHeaders && {
            request_headers: request.requestHeaders,
          }),
          ...(request.requestBody && {
            request_body: processBodyForJSON(request.requestBody),
          }),
          ...(request.responseHeaders && {
            response_headers: request.responseHeaders,
          }),
          ...(request.responseBody && {
            response_body: processBodyForJSON(request.responseBody),
          }),
          ...(request.responseSize && { response_size: request.responseSize }),
          context: {
            is_api_endpoint:
              url.pathname.includes("/api/") || url.hostname.includes("api"),
            is_authenticated: !!(
              request.requestHeaders?.["authorization"] ||
              request.requestHeaders?.["Authorization"]
            ),
            ...(request.userAgent && { user_agent: request.userAgent }),
            ...(request.pageUrl && { page_url: request.pageUrl }),
          },
        };

        // Use appropriate log level based on status
        if (request.statusCode && request.statusCode >= 400) {
          logger.error(JSON.stringify(logData));
        } else {
          logger.info(JSON.stringify(logData));
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

networkRequestsRouter.get("/stream", (req, res) => {
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

networkRequestsRouter.delete("/", async (_req, res) => {
  try {
    const count = await networkStorage.clearRequests();
    logger.info(`Cleared ${count} network requests`);
    res.json({ cleared: count });
  } catch (error) {
    logger.error("Error clearing network requests:", error);
    res.status(500).json({ error: "Failed to clear network requests" });
  }
});
