const API_URL = "http://localhost:8765/logs";
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

let retryCount = 0;
let sessionId = null;

// Generate session ID on installation
chrome.runtime.onInstalled.addListener(() => {
  sessionId = `session_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
});

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
  } catch (error) {
    throw error;
  }
};

const sendLogsWithRetry = async (logs) => {
  try {
    await sendLogsToServer(logs);
  } catch (error) {
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

// Handle extension icon click (optional - for future UI)
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.create({
      url: "http://localhost:8765/logs",
    });
  });
}
