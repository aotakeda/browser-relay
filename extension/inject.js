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
  const _pageLoaded = false;
  let sendingEnabled = false;
  let logsEnabled = true;
  let shouldCaptureDomain = true;

  // Store original console methods to avoid infinite loops
  const _originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  const captureStackTrace = () => {
    const stack = new Error().stack;
    return stack ? stack.split("\n").slice(3).join("\n") : undefined;
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
    if (logBuffer.length === 0 || !sendingEnabled || !logsEnabled || !shouldCaptureDomain) return;

    const logsToSend = [...logBuffer];
    logBuffer = [];

    // Send to content script via postMessage
    window.postMessage({
      type: "CONSOLE_RELAY_LOGS",
      logs: logsToSend
    }, "*");
  };

  const scheduleBatch = () => {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(sendLogs, LOG_BATCH_INTERVAL);
  };

  const addLog = (logEntry) => {
    // Filter out Browser Relay's own logs to avoid noise
    if (logEntry.message.includes('[Browser Relay]') || 
        logEntry.message.includes('[Network Debug]') ||
        logEntry.message.includes('browser-relay')) {
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

  // Configuration management
  const _PORT = '27497'; // fixed port
  
  // Simple server check - only check port 27497
  const checkServer = async () => {
    try {
      const response = await fetch('http://localhost:27497/health-browser-relay', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not available
    }
    return false;
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
    pageLoaded = true;
    
    // Send any buffered logs from page load
    if (logBuffer.length > 0) {
      sendLogs();
    }
  };

  // Listen for settings changes from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data.type !== 'CONSOLE_RELAY_SETTINGS') {
      return;
    }
    
    logsEnabled = event.data.logsEnabled;
    shouldCaptureDomain = event.data.shouldCapture;
    
    // If capture is disabled (logs or domain), clear any buffered logs
    if (!logsEnabled || !shouldCaptureDomain) {
      logBuffer = [];
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
    }
  });

  // Initialize console method wrapping immediately
  wrapConsoleMethod("log", "log");
  wrapConsoleMethod("warn", "warn");
  wrapConsoleMethod("error", "error");
  wrapConsoleMethod("info", "info");
  
  // Initialize network interception

  // Enable sending after page load
  if (document.readyState === 'complete') {
    enableSending();
  } else {
    window.addEventListener('load', enableSending);
  }

  // Network request interception
  const originalFetch = window.fetch;
  
  // Track network requests
  let networkBuffer = [];
  
  const sendNetworkRequests = () => {
    if (networkBuffer.length === 0 || !sendingEnabled || !shouldCaptureDomain) return;
    
    const requestsToSend = [...networkBuffer];
    networkBuffer = [];
    
    // Send to content script via postMessage
    window.postMessage({
      type: "CONSOLE_RELAY_NETWORK",
      requests: requestsToSend
    }, "*");
  };
  
  const shouldCaptureNetworkRequest = (url) => {
    // Skip Browser Relay's own requests
    if (url.includes('localhost:27497') || url.includes('/health-browser-relay')) {
      return false;
    }
    
    // Skip chrome-extension URLs
    if (url.startsWith('chrome-extension://')) {
      return false;
    }
    
    // Skip common noise patterns
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
      /\.(woff|woff2|ttf|eot)$/
    ];
    
    return !noisePatterns.some(pattern => pattern.test(url));
  };

  const addNetworkRequest = (requestData) => {
    // Filter out noise and unwanted requests
    if (!shouldCaptureNetworkRequest(requestData.url)) {
      return;
    }
    
    // Don't capture if domain not allowed
    if (!shouldCaptureDomain) {
      return;
    }
    
    networkBuffer.push(requestData);
    
    // Send if buffer is full or sending is enabled
    if (sendingEnabled && networkBuffer.length >= 10) {
      sendNetworkRequests();
    }
  };
  
  // Intercept fetch
  window.fetch = async function(...args) {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    
    let url, options = {}, method = 'GET';
    try {
      if (typeof args[0] === 'string') {
        url = args[0];
        options = args[1] || {};
      } else if (args[0] instanceof Request) {
        url = args[0].url;
        options = {
          method: args[0].method,
          headers: Object.fromEntries(args[0].headers.entries()),
          body: args[0].body
        };
      }
      
      // Convert relative URLs to absolute
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = new URL(url, window.location.href).href;
      }
      
      method = options.method || 'GET';
      
      // Skip interception for requests we don't want to capture
      if (!shouldCaptureNetworkRequest(url)) {
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
      const contentType = response.headers.get('content-type') || '';
      
      try {
        // Only capture response bodies for text-based content types
        if (contentType.includes('application/json') || 
            contentType.includes('text/') || 
            contentType.includes('application/xml') ||
            contentType.includes('application/javascript')) {
          const text = await responseClone.text();
          // Limit response body size to prevent memory issues
          responseBody = text.length > 50000 ? text.substring(0, 50000) + '... [truncated]' : text;
        }
      } catch {
        // Ignore errors reading response body
      }
      
      const networkRequest = {
        requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp,
        method,
        url,
        requestHeaders: options.headers || {},
        responseHeaders: Object.fromEntries(response.headers.entries()),
        requestBody: options.body ? String(options.body) : null,
        responseBody: responseBody,
        statusCode: response.status,
        duration: duration,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          type: 'network_request',
          hostname: new URL(url).hostname,
          status_category: response.status < 400 ? 'success' : 'error',
          is_api_endpoint: contentType.includes('application/json'),
          is_authenticated: response.headers.get('authorization') ? true : false
        }
      };
      
      // Response body captured successfully
      
      addNetworkRequest(networkRequest);
      return response;
    } catch (error) {
      try {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        
        const networkRequest = {
          requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp,
          method,
          url,
          requestHeaders: options.headers || {},
          responseHeaders: {},
          requestBody: options.body ? String(options.body) : null,
          responseBody: null,
          statusCode: 0,
          duration: duration,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            type: 'network_request',
            hostname: new URL(url).hostname,
            status_category: 'error',
            is_api_endpoint: false,
            is_authenticated: false,
            error: error.message
          }
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
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._networkRequestData = {
      method,
      url,
      timestamp: new Date().toISOString(),
      startTime: performance.now()
    };
    
    // Skip interception for requests we don't want to capture
    if (!shouldCaptureNetworkRequest(url)) {
      return originalXMLHttpRequestOpen.call(this, method, url, ...args);
    }
    
    return originalXMLHttpRequestOpen.call(this, method, url, ...args);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (this._networkRequestData) {
      this._networkRequestData.request_body = body ? String(body) : null;
      this._networkRequestData.request_headers = {};
      
      // Capture response
      this.addEventListener('loadend', () => {
        try {
          const endTime = performance.now();
          const duration = Math.round(endTime - this._networkRequestData.startTime);
          
          // Convert relative URLs to absolute
          let absoluteUrl = this._networkRequestData.url;
          if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
            absoluteUrl = new URL(absoluteUrl, window.location.href).href;
          }
          
          const networkRequest = {
            requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
              type: 'network_request',
              hostname: new URL(absoluteUrl).hostname,
              status_category: this.status < 400 ? 'success' : 'error',
              is_api_endpoint: this.getResponseHeader('content-type')?.includes('application/json') || false,
              is_authenticated: this.getResponseHeader('authorization') ? true : false
            }
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
        'http://localhost:27497/logs',
        JSON.stringify({
          logs: logBuffer,
          sessionId: window.location.href,
        })
      );
    }
  });
})();