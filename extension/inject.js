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

  // Enable sending after page load
  if (document.readyState === 'complete') {
    enableSending();
  } else {
    window.addEventListener('load', enableSending);
  }

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