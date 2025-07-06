// Configuration management
const PORT = "27497"; // fixed port
const API_URL = `http://localhost:${PORT}/logs`;
const NETWORK_API_URL = `http://localhost:${PORT}/network-requests`;

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

let retryCount = 0;
let sessionId = null;
let networkRequestsBuffer = [];
const pendingRequests = new Map(); // requestId -> request data

// Generate session ID on installation
chrome.runtime.onInstalled.addListener(() => {
  sessionId = `session_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
});

// Simple server health check - only check port 27497
const checkServer = async () => {
  try {
    const response = await fetch(`http://localhost:27497/health-browser-relay`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      console.log('[Browser Relay] Connected to server on port 27497');
      return true;
    }
  } catch {
    console.log('[Browser Relay] Server not found on port 27497');
  }
  return false;
};

// Check server on startup
checkServer();

// Retry server check every 60 seconds
setInterval(async () => {
  await checkServer();
}, 60000);

const sendLogsToServer = async (logs) => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        logs,
        sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    // Reset retry count on success
    retryCount = 0;
    return await response.json();
  } catch {
    throw error;
  }
};

const sendLogsWithRetry = async (logs) => {
  try {
    await sendLogsToServer(logs);
  } catch {
    if (retryCount < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[retryCount];
      retryCount++;

      setTimeout(() => {
        sendLogsWithRetry(logs);
      }, delay);
    } else {
      retryCount = 0;
    }
  }
};

const sendNetworkRequestsToServer = async (requests) => {
  try {
    const response = await fetch(NETWORK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests,
        sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    return await response.json();
  } catch {
    throw error;
  }
};

const sendNetworkRequestsWithRetry = async (requests) => {
  try {
    await sendNetworkRequestsToServer(requests);
  } catch {
    // Silently fail for network requests to avoid overwhelming logs
  }
};

const flushNetworkRequests = () => {
  if (networkRequestsBuffer.length > 0) {
    const requestsToSend = [...networkRequestsBuffer];
    networkRequestsBuffer = [];
    sendNetworkRequestsWithRetry(requestsToSend);
  }
};

// Filter out noise from network requests
const shouldCaptureRequest = (url) => {
  // Skip extension URLs
  if (url.startsWith("chrome-extension://")) return false;

  // Skip Browser Relay's own server requests (port 27497)
  if (url.includes('localhost:27497')) {
    return false;
  }

  // Skip Browser Relay's own health check requests for port detection
  if (url.includes("localhost:") && url.includes("/health-browser-relay")) {
    return false;
  }

  // Skip common noise
  const noisePatterns = [
    /favicon\.ico/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.svg$/,
    /\.woff/,
    /\.ttf$/,
    /\.eot$/,
    /google-analytics/,
    /googletagmanager/,
    /doubleclick/,
    /facebook\.com\/tr/,
    /connect\.facebook\.net/,
    /platform\.twitter\.com/,
  ];

  return !noisePatterns.some((pattern) => pattern.test(url));
};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEND_LOGS") {
    sendLogsWithRetry(message.logs);
    sendResponse({ received: true });
  } else if (message.type === "CONTENT_SCRIPT_READY") {
    sendResponse({ sessionId });
  }

  return true; // Keep message channel open for async response
});

// Network request capture
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!shouldCaptureRequest(details.url)) return;

    const requestData = {
      requestId: details.requestId,
      timestamp: new Date().toISOString(),
      method: details.method,
      url: details.url,
      pageUrl: details.initiator || details.url,
      userAgent: navigator.userAgent,
      requestBody: details.requestBody
        ? JSON.stringify(details.requestBody)
        : undefined,
    };

    pendingRequests.set(details.requestId, requestData);
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!shouldCaptureRequest(details.url)) return;

    const requestData = pendingRequests.get(details.requestId);
    if (requestData) {
      const headers = {};
      details.requestHeaders?.forEach((header) => {
        headers[header.name] = header.value;
      });
      requestData.requestHeaders = headers;
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!shouldCaptureRequest(details.url)) return;

    const requestData = pendingRequests.get(details.requestId);
    if (requestData) {
      const headers = {};
      details.responseHeaders?.forEach((header) => {
        headers[header.name] = header.value;
      });
      requestData.responseHeaders = headers;
      requestData.statusCode = details.statusCode;
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!shouldCaptureRequest(details.url)) return;

    const requestData = pendingRequests.get(details.requestId);
    if (requestData) {
      // Calculate duration
      const completedTime = new Date().toISOString();
      const startTime = new Date(requestData.timestamp);
      const endTime = new Date(completedTime);
      requestData.duration = endTime.getTime() - startTime.getTime();

      // Add final response data
      requestData.statusCode = details.statusCode;

      // Add to buffer
      networkRequestsBuffer.push(requestData);

      // Clean up
      pendingRequests.delete(details.requestId);

      // Flush if buffer is full
      if (networkRequestsBuffer.length >= 50) {
        flushNetworkRequests();
      }
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!shouldCaptureRequest(details.url)) return;

    const requestData = pendingRequests.get(details.requestId);
    if (requestData) {
      requestData.statusCode = 0;
      requestData.metadata = { error: details.error };

      // Add to buffer
      networkRequestsBuffer.push(requestData);

      // Clean up
      pendingRequests.delete(details.requestId);
    }
  },
  { urls: ["<all_urls>"] }
);

// Flush network requests periodically
setInterval(flushNetworkRequests, 5000);

// Handle extension icon click (optional - for future UI)
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((_tab) => {
    chrome.tabs.create({
      url: API_URL,
    });
  });
}
