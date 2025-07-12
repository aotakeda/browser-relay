// This script runs in MAIN world and can wrap console methods
(() => {
  // Prevent multiple initializations
  if (window.consoleRelayInitialized) {
    return;
  }
  window.consoleRelayInitialized = true;

  const LOG_BATCH_SIZE = 50;
  const LOG_BATCH_INTERVAL = 5000; // 5 seconds

  let logBuffer = [];
  let batchTimer = null;
  let sendingEnabled = false;
  let logsEnabled = true;
  let networkEnabled = true;
  let shouldCaptureDomain = false;
  let allDomainsMode = true; // eslint-disable-line unused-imports/no-unused-vars
  let specificDomains = []; // eslint-disable-line unused-imports/no-unused-vars
  let networkConfig = null;
  let settingsReceived = false;

  const captureStackTrace = () => {
    const stack = new Error().stack;
    return stack ? stack.split("\n").slice(3).join("\n") : undefined;
  };

  // Helper function to safely serialize headers for postMessage
  const serializeHeaders = (headers) => {
    if (!headers) return {};

    try {
      // If it's already a plain object, return it
      if (headers.constructor === Object) {
        return headers;
      }

      // If it's a Headers object, convert it
      if (headers && typeof headers.entries === "function") {
        return Object.fromEntries(headers.entries());
      }

      // For any other case, try to convert to plain object
      return { ...headers };
    } catch (error) {
      // If all else fails, return empty object
      console.warn("[Browser Relay] Failed to serialize headers:", error);
      return {};
    }
  };

  const createLogEntry = (level, args) => ({
    timestamp: new Date().toISOString(),
    level,
    message: args
      .map((arg) => {
        try {
          if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        } catch {
          return "[Unable to stringify]";
        }
      })
      .join(" "),
    stackTrace: captureStackTrace(),
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
  });

  const sendLogs = () => {
    if (
      logBuffer.length === 0 ||
      !sendingEnabled ||
      !logsEnabled ||
      !shouldCaptureDomain
    )
      return;

    const logsToSend = [...logBuffer];
    logBuffer = [];

    // Send to content script via postMessage
    window.postMessage(
      {
        type: "BROWSER_RELAY_LOGS",
        logs: logsToSend,
      },
      "*"
    );
  };

  const scheduleBatch = () => {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(sendLogs, LOG_BATCH_INTERVAL);
  };

  const addLog = (logEntry) => {
    // Filter out Browser Relay's own logs to avoid noise
    if (
      logEntry.message.includes("[Browser Relay]") ||
      logEntry.message.includes("[Network Debug]") ||
      logEntry.message.includes("browser-relay")
    ) {
      return;
    }

    // Don't capture logs if settings haven't been received yet
    if (!settingsReceived) {
      return;
    }

    // Don't capture logs if log capture is disabled or domain not allowed
    if (!logsEnabled || !shouldCaptureDomain) {
      return;
    }

    logBuffer.push(logEntry);

    // Only send if page is loaded and sending is enabled
    if (sendingEnabled) {
      if (logBuffer.length >= LOG_BATCH_SIZE) {
        sendLogs();
      } else {
        scheduleBatch();
      }
    }
  };

  // Add a global function for manual testing
  window.consoleRelayForceFlush = () => {
    sendLogs();
  };

  // Simple server check - only check port 27497
  const checkServer = async () => {
    try {
      const response = await fetch(
        "http://localhost:27497/health-browser-relay",
        {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        }
      );

      if (response.ok) {
        // Also fetch network configuration
        await fetchNetworkConfig();
        return true;
      }
    } catch {
      // Server not available
    }
    return false;
  };

  // Fetch network configuration from server
  const fetchNetworkConfig = async () => {
    try {
      const response = await fetch("http://localhost:27497/network-config", {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const data = await response.json();
        networkConfig = data.config;
      }
    } catch {
      // Use default config if server not available
      networkConfig = {
        enabled: true,
        captureMode: "all",
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        statusCodes: [],
      };
    }
  };

  // Initialize server check
  checkServer();

  // Wrap console methods
  const wrapConsoleMethod = (method, level) => {
    const original = console[method];
    console[method] = function (...args) {
      // Call original method
      original.apply(console, args);

      // Capture log
      try {
        const logEntry = createLogEntry(level, args);
        addLog(logEntry);
      } catch {
        // Fail silently to not interfere with page
      }
    };
  };

  // Enable sending after page load
  const enableSending = () => {
    sendingEnabled = true;

    // Send any buffered logs from page load
    if (logBuffer.length > 0) {
      sendLogs();
    }
  };

  // Listen for settings changes from content script
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data.type !== "BROWSER_RELAY_SETTINGS"
    ) {
      return;
    }

    logsEnabled = event.data.logsEnabled;
    networkEnabled = event.data.networkEnabled;
    shouldCaptureDomain = event.data.shouldCapture;
    allDomainsMode = event.data.allDomainsMode;
    specificDomains = event.data.specificDomains || [];
    settingsReceived = true; // Mark settings as received

    // If capture is disabled (logs or domain), clear any buffered logs
    if (!logsEnabled || !shouldCaptureDomain) {
      logBuffer = [];
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
    }
  });

  // Setup browser console message interception
  const setupBrowserConsoleInterception = () => {
    // Intercept unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      const consoleEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Uncaught (in promise) ${event.reason}`,
        stackTrace: event.reason?.stack || `    at ${window.location.href}`,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          type: "unhandled_promise_rejection",
          source: "browser_generated",
        },
      };
      addLog(consoleEntry);
    });

    // Intercept JavaScript errors AND resource loading errors
    window.addEventListener("error", (event) => {
      // Check if this is a resource loading error (img, script, link, etc.)
      if (event.target !== window && event.target.tagName) {
        const element = event.target;
        const url = element.src || element.href || element.currentSrc;

        if (url) {
          // Determine error type based on URL pattern and context
          let errorMessage = `GET ${url} net::ERR_BLOCKED_BY_CLIENT`;

          // Check if it's a localhost 404 error (common pattern)
          if (
            url.includes("localhost") &&
            (url.includes(".jpg") ||
              url.includes(".png") ||
              url.includes(".css") ||
              url.includes(".js"))
          ) {
            errorMessage = `GET ${url} 404 (Not Found)`;
          }
          // Check for external tracking/analytics URLs (commonly blocked)
          else if (
            url.includes("stats.") ||
            url.includes("analytics") ||
            url.includes("tracking") ||
            url.includes("pusher.com")
          ) {
            errorMessage = `GET ${url} net::ERR_BLOCKED_BY_CLIENT`;
          }

          // This is a resource loading error
          const consoleEntry = {
            timestamp: new Date().toISOString(),
            level: "error",
            message: errorMessage,
            stackTrace: `    at ${element.tagName.toLowerCase()}:${url}`,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent,
            metadata: {
              type: "resource_loading_error",
              element_type: element.tagName.toLowerCase(),
              url: url,
              source: "browser_generated",
            },
          };
          addLog(consoleEntry);
        }
      } else {
        // This is a JavaScript runtime error
        const consoleEntry = {
          timestamp: new Date().toISOString(),
          level: "error",
          message: `Uncaught ${event.error?.name || "Error"}: ${event.message}`,
          stackTrace:
            event.error?.stack ||
            `    at ${event.filename}:${event.lineno}:${event.colno}`,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            type: "javascript_error",
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            source: "browser_generated",
          },
        };
        addLog(consoleEntry);
      }
    });

    // Intercept deprecated API usage warnings
    const originalDeprecatedMethod = window.webkitRequestAnimationFrame;
    if (originalDeprecatedMethod) {
      window.webkitRequestAnimationFrame = function (...args) {
        const consoleEntry = {
          timestamp: new Date().toISOString(),
          level: "warn",
          message:
            "webkitRequestAnimationFrame is deprecated. Please use requestAnimationFrame instead.",
          stackTrace: captureStackTrace(),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            type: "deprecation_warning",
            api: "webkitRequestAnimationFrame",
            source: "browser_generated",
          },
        };
        addLog(consoleEntry);
        return originalDeprecatedMethod.apply(this, args);
      };
    }

    // Intercept security warnings (Content Security Policy violations)
    document.addEventListener("securitypolicyviolation", (event) => {
      const consoleEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Refused to ${event.violatedDirective} '${event.blockedURI}' because it violates the following Content Security Policy directive: "${event.originalPolicy}"`,
        stackTrace: `    at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          type: "csp_violation",
          violatedDirective: event.violatedDirective,
          blockedURI: event.blockedURI,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          columnNumber: event.columnNumber,
          source: "browser_generated",
        },
      };
      addLog(consoleEntry);
    });
  };

  // Setup comprehensive resource error monitoring
  const setupResourceErrorMonitoring = () => {
    // Monitor Performance API for failed resource loads
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === "resource") {
          // Check if resource failed to load
          if (
            entry.transferSize === 0 &&
            entry.decodedBodySize === 0 &&
            entry.duration > 0
          ) {
            // This indicates a failed resource load
            const url = entry.name;

            // Try to determine error type based on URL and context
            let errorMessage = `GET ${url} net::ERR_BLOCKED_BY_CLIENT`;

            // Check if it's a localhost 404 error
            if (url.includes("localhost")) {
              errorMessage = `GET ${url} 404 (Not Found)`;
            }

            const consoleEntry = {
              timestamp: new Date().toISOString(),
              level: "error",
              message: errorMessage,
              stackTrace: `    at ${url}`,
              pageUrl: window.location.href,
              userAgent: navigator.userAgent,
              metadata: {
                type: "resource_loading_error",
                url: url,
                source: "browser_generated",
                duration: entry.duration,
                transferSize: entry.transferSize,
              },
            };
            addLog(consoleEntry);
          }
        }
      });
    });

    try {
      observer.observe({ entryTypes: ["resource"] });
    } catch (error) {
      // Fallback if PerformanceObserver is not supported
      console.warn(
        "PerformanceObserver not supported, using fallback resource monitoring",
        error
      );
    }

    // Also monitor for image loading errors specifically
    document.addEventListener(
      "error",
      (event) => {
        if (
          event.target.tagName === "IMG" ||
          event.target.tagName === "SCRIPT" ||
          event.target.tagName === "LINK"
        ) {
          const url = event.target.src || event.target.href;
          if (url) {
            let errorMessage = `GET ${url} net::ERR_BLOCKED_BY_CLIENT`;

            // Try to determine specific error type
            if (
              url.includes("localhost") &&
              (url.includes(".jpg") ||
                url.includes(".png") ||
                url.includes(".css") ||
                url.includes(".js"))
            ) {
              errorMessage = `GET ${url} 404 (Not Found)`;
            } else if (
              url.includes("stats.") ||
              url.includes("analytics") ||
              url.includes("tracking") ||
              url.includes("pusher.com")
            ) {
              errorMessage = `GET ${url} net::ERR_BLOCKED_BY_CLIENT`;
            }

            const consoleEntry = {
              timestamp: new Date().toISOString(),
              level: "error",
              message: errorMessage,
              stackTrace: `    at ${event.target.tagName.toLowerCase()}:${url}`,
              pageUrl: window.location.href,
              userAgent: navigator.userAgent,
              metadata: {
                type: "resource_loading_error",
                element_type: event.target.tagName.toLowerCase(),
                url: url,
                source: "browser_generated",
              },
            };
            addLog(consoleEntry);
          }
        }
      },
      true
    ); // Use capture phase
  };

  // Initialize console method wrapping immediately
  wrapConsoleMethod("log", "log");
  wrapConsoleMethod("warn", "warn");
  wrapConsoleMethod("error", "error");
  wrapConsoleMethod("info", "info");

  // Capture browser-generated console messages
  setupBrowserConsoleInterception();

  // Monitor resource loading errors more comprehensively
  setupResourceErrorMonitoring();

  // Initialize network interception

  // Enable sending after page load
  if (document.readyState === "complete") {
    enableSending();
  } else {
    window.addEventListener("load", enableSending);
  }

  // Network request interception
  const originalFetch = window.fetch;

  // Track network requests
  let networkBuffer = [];

  const sendNetworkRequests = () => {
    if (networkBuffer.length === 0 || !sendingEnabled) return;

    const requestsToSend = [...networkBuffer];
    networkBuffer = [];

    // Send to content script via postMessage
    window.postMessage(
      {
        type: "BROWSER_RELAY_NETWORK",
        requests: requestsToSend,
      },
      "*"
    );
  };

  const shouldCaptureNetworkRequest = (
    url,
    method = "GET",
    statusCode = null
  ) => {
    // Skip Browser Relay's own requests
    if (
      url.includes("localhost:27497") ||
      url.includes("/health-browser-relay")
    ) {
      return false;
    }

    // Skip chrome-extension URLs
    if (url.startsWith("chrome-extension://")) {
      return false;
    }

    // Use configuration if available
    if (networkConfig) {
      // Check if network capture is enabled
      if (!networkConfig.enabled) {
        return false;
      }

      // Check method filter
      if (
        networkConfig.methods.length > 0 &&
        !networkConfig.methods.includes(method)
      ) {
        return false;
      }

      // Check status code filter
      if (
        networkConfig.statusCodes.length > 0 &&
        statusCode &&
        !networkConfig.statusCodes.includes(statusCode)
      ) {
        return false;
      }

      // Check URL patterns
      if (networkConfig.urlPatterns.length > 0) {
        const urlLower = url.toLowerCase();
        const shouldInclude = networkConfig.urlPatterns.some((pattern) => {
          try {
            const regex = new RegExp(pattern, "i");
            return regex.test(urlLower);
          } catch {
            // If regex is invalid, treat as literal string match
            return urlLower.includes(pattern.toLowerCase());
          }
        });

        if (networkConfig.captureMode === "include" && !shouldInclude) {
          return false;
        }

        if (networkConfig.captureMode === "exclude" && shouldInclude) {
          return false;
        }
      }
    }

    // Skip common noise patterns (as fallback)
    const noisePatterns = [
      // Analytics and tracking
      /google-analytics/,
      /googletagmanager/,
      /doubleclick/,
      /facebook\.com\/tr/,
      /connect\.facebook\.net/,
      /platform\.twitter\.com/,
      // Large media files that don't need response bodies
      /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/,
      /\.(mp4|webm|ogg|mp3|wav)$/,
      /\.(woff|woff2|ttf|eot)$/,
    ];

    return !noisePatterns.some((pattern) => pattern.test(url));
  };

  const processNetworkRequestWithConfig = (requestData) => {
    // Apply configuration filters to the request data
    if (!networkConfig) {
      return requestData; // Return as-is if no config
    }

    const processedData = { ...requestData };

    // Remove headers if not configured to capture
    if (!networkConfig.includeHeaders) {
      delete processedData.requestHeaders;
      delete processedData.responseHeaders;
    }

    // Remove request body if not configured to capture
    if (!networkConfig.includeRequestBody) {
      delete processedData.requestBody;
    }

    // Remove or truncate response body if configured
    if (!networkConfig.includeResponseBody) {
      delete processedData.responseBody;
    } else if (
      processedData.responseBody &&
      processedData.responseBody.length > networkConfig.maxResponseBodySize
    ) {
      processedData.responseBody =
        processedData.responseBody.substring(
          0,
          networkConfig.maxResponseBodySize
        ) + "... [truncated by config]";
    }

    return processedData;
  };

  const addNetworkRequest = (requestData) => {
    // Don't capture if settings haven't been received yet
    if (!settingsReceived) {
      return;
    }

    // Don't capture if network capture is disabled
    if (!networkEnabled) {
      return;
    }

    // Filter out noise and unwanted requests
    if (
      !shouldCaptureNetworkRequest(
        requestData.url,
        requestData.method,
        requestData.statusCode
      )
    ) {
      return;
    }

    // Don't capture if page domain not allowed (use shouldCaptureDomain for page check)
    if (!shouldCaptureDomain) {
      return;
    }

    // Process request data according to configuration
    const processedData = processNetworkRequestWithConfig(requestData);

    networkBuffer.push(processedData);

    // Generate console message for network errors (like Chrome DevTools does)
    if (requestData.statusCode === 0 || requestData.statusCode >= 400) {
      generateNetworkErrorConsoleMessage(requestData);
    }

    // Send if buffer is full or sending is enabled
    if (sendingEnabled && networkBuffer.length >= 10) {
      sendNetworkRequests();
    }
  };

  const generateNetworkErrorConsoleMessage = (requestData) => {
    let message = "";
    let level = "error";

    if (requestData.statusCode === 0) {
      // Network error (like ERR_BLOCKED_BY_CLIENT, ERR_NETWORK_CHANGED, etc.)
      const errorType = requestData.metadata?.error || "Network Error";
      message = `${requestData.method} ${
        requestData.url
      } net::${errorType.toUpperCase()}`;
    } else if (requestData.statusCode >= 400) {
      // HTTP error status
      const statusText = getStatusText(requestData.statusCode);
      message = `${requestData.method} ${requestData.url} ${requestData.statusCode} (${statusText})`;
      level = requestData.statusCode >= 500 ? "error" : "warn";
    }

    if (message) {
      // Create a console log entry that matches Chrome's format
      const consoleEntry = {
        timestamp: requestData.timestamp,
        level: level,
        message: message,
        stackTrace: `    at ${requestData.url}`,
        pageUrl: requestData.pageUrl,
        userAgent: requestData.userAgent,
        metadata: {
          type: "network_error",
          network_request_id: requestData.requestId,
          status_code: requestData.statusCode,
          source: "browser_generated",
        },
      };

      // Add to log buffer (bypassing normal console method wrapping)
      addLog(consoleEntry);
    }
  };

  const getStatusText = (statusCode) => {
    const statusTexts = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      405: "Method Not Allowed",
      408: "Request Timeout",
      429: "Too Many Requests",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout",
    };
    return statusTexts[statusCode] || "Error";
  };

  const mapNetworkErrorToChrome = (error) => {
    const message = error.message.toLowerCase();

    if (message.includes("failed to fetch")) {
      return "ERR_NETWORK_CHANGED";
    }
    if (message.includes("blocked by client")) {
      return "ERR_BLOCKED_BY_CLIENT";
    }
    if (message.includes("cors")) {
      return "ERR_BLOCKED_BY_CORS";
    }
    if (message.includes("timeout")) {
      return "ERR_TIMED_OUT";
    }
    if (message.includes("aborted")) {
      return "ERR_ABORTED";
    }
    if (message.includes("connection") && message.includes("refused")) {
      return "ERR_CONNECTION_REFUSED";
    }
    if (message.includes("name") && message.includes("resolved")) {
      return "ERR_NAME_NOT_RESOLVED";
    }

    return "ERR_NETWORK_CHANGED";
  };

  // Intercept fetch
  window.fetch = async function (...args) {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    let url,
      options = {},
      method = "GET";
    try {
      if (typeof args[0] === "string") {
        url = args[0];
        options = args[1] || {};
      } else if (args[0] instanceof Request) {
        url = args[0].url;
        options = {
          method: args[0].method,
          headers: serializeHeaders(args[0].headers),
          body: args[0].body,
        };
      }

      // Convert relative URLs to absolute
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = new URL(url, window.location.href).href;
      }

      method = options.method || "GET";

      // Skip interception for requests we don't want to capture
      if (!shouldCaptureNetworkRequest(url, method)) {
        return originalFetch.apply(this, args);
      }
    } catch {
      // If we can't parse the URL, just use the original fetch
      return originalFetch.apply(this, args);
    }

    try {
      const response = await originalFetch.apply(this, args);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      // Clone response to read body without consuming it
      const responseClone = response.clone();
      let responseBody = null;
      const contentType = response.headers.get("content-type") || "";

      try {
        // Only capture response bodies for text-based content types
        if (
          contentType.includes("application/json") ||
          contentType.includes("text/") ||
          contentType.includes("application/xml") ||
          contentType.includes("application/javascript")
        ) {
          const text = await responseClone.text();
          // Limit response body size to prevent memory issues
          responseBody =
            text.length > 50000
              ? text.substring(0, 50000) + "... [truncated]"
              : text;
        }
      } catch {
        // Ignore errors reading response body
      }

      const networkRequest = {
        requestId: `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`,
        timestamp,
        method,
        url,
        requestHeaders: serializeHeaders(options.headers),
        responseHeaders: serializeHeaders(response.headers),
        requestBody: options.body ? String(options.body) : null,
        responseBody: responseBody,
        statusCode: response.status,
        duration: duration,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          type: "network_request",
          hostname: new URL(url).hostname,
          status_category: response.status < 400 ? "success" : "error",
          is_api_endpoint: contentType.includes("application/json"),
          is_authenticated: response.headers.get("authorization")
            ? true
            : false,
          source: "browser",
        },
      };

      // Response body captured successfully

      addNetworkRequest(networkRequest);
      return response;
    } catch (error) {
      try {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        const networkRequest = {
          requestId: `${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 11)}`,
          timestamp,
          method,
          url,
          requestHeaders: serializeHeaders(options.headers),
          responseHeaders: {},
          requestBody: options.body ? String(options.body) : null,
          responseBody: null,
          statusCode: 0,
          duration: duration,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            type: "network_request",
            hostname: new URL(url).hostname,
            status_category: "error",
            is_api_endpoint: false,
            is_authenticated: false,
            error: mapNetworkErrorToChrome(error),
            source: "browser",
          },
        };

        addNetworkRequest(networkRequest);
      } catch {
        // Silently ignore errors in error handling
      }
      throw error;
    }
  };

  // Intercept XMLHttpRequest
  const originalXMLHttpRequestOpen = XMLHttpRequest.prototype.open;
  const originalXMLHttpRequestSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._networkRequestData = {
      method,
      url,
      timestamp: new Date().toISOString(),
      startTime: performance.now(),
    };

    // Skip interception for requests we don't want to capture
    if (!shouldCaptureNetworkRequest(url, method)) {
      return originalXMLHttpRequestOpen.call(this, method, url, ...args);
    }

    return originalXMLHttpRequestOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._networkRequestData) {
      this._networkRequestData.request_body = body ? String(body) : null;
      this._networkRequestData.request_headers = {};

      // Capture response
      this.addEventListener("loadend", () => {
        try {
          const endTime = performance.now();
          const duration = Math.round(
            endTime - this._networkRequestData.startTime
          );

          // Convert relative URLs to absolute
          let absoluteUrl = this._networkRequestData.url;
          if (
            !absoluteUrl.startsWith("http://") &&
            !absoluteUrl.startsWith("https://")
          ) {
            absoluteUrl = new URL(absoluteUrl, window.location.href).href;
          }

          const networkRequest = {
            requestId: `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 11)}`,
            timestamp: this._networkRequestData.timestamp,
            method: this._networkRequestData.method,
            url: absoluteUrl,
            requestHeaders: this._networkRequestData.request_headers,
            responseHeaders: {},
            requestBody: this._networkRequestData.request_body,
            responseBody: this.responseText,
            statusCode: this.status,
            duration: duration,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent,
            metadata: {
              type: "network_request",
              hostname: new URL(absoluteUrl).hostname,
              status_category: this.status < 400 ? "success" : "error",
              is_api_endpoint:
                this.getResponseHeader("content-type")?.includes(
                  "application/json"
                ) || false,
              is_authenticated: this.getResponseHeader("authorization")
                ? true
                : false,
              source: "browser",
            },
          };

          addNetworkRequest(networkRequest);
        } catch {
          // Silently ignore errors in network request processing
        }
      });

      // Capture network errors
      this.addEventListener("error", () => {
        try {
          const endTime = performance.now();
          const duration = Math.round(
            endTime - this._networkRequestData.startTime
          );

          let absoluteUrl = this._networkRequestData.url;
          if (
            !absoluteUrl.startsWith("http://") &&
            !absoluteUrl.startsWith("https://")
          ) {
            absoluteUrl = new URL(absoluteUrl, window.location.href).href;
          }

          const networkRequest = {
            requestId: `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 11)}`,
            timestamp: this._networkRequestData.timestamp,
            method: this._networkRequestData.method,
            url: absoluteUrl,
            requestHeaders: this._networkRequestData.request_headers,
            responseHeaders: {},
            requestBody: this._networkRequestData.request_body,
            responseBody: null,
            statusCode: 0,
            duration: duration,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent,
            metadata: {
              type: "network_request",
              hostname: new URL(absoluteUrl).hostname,
              status_category: "error",
              is_api_endpoint: false,
              is_authenticated: false,
              error: "ERR_NETWORK_CHANGED",
              source: "browser",
            },
          };

          addNetworkRequest(networkRequest);
        } catch {
          // Silently ignore errors in network request processing
        }
      });
    }
    return originalXMLHttpRequestSend.call(this, body);
  };

  // Periodically flush network requests
  setInterval(() => {
    if (networkBuffer.length > 0) {
      sendNetworkRequests();
    }
  }, 2000);

  // Send any remaining logs when page unloads
  window.addEventListener("beforeunload", () => {
    if (logBuffer.length > 0) {
      // Use sendBeacon for reliability during unload
      navigator.sendBeacon(
        "http://localhost:27497/logs",
        JSON.stringify({
          logs: logBuffer,
          sessionId: window.location.href,
        })
      );
    }
  });
})();
