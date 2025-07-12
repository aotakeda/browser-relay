// This content script runs in ISOLATED world and can communicate with background script
(() => {
  let logsEnabled = true;
  let networkEnabled = true;
  let specificDomains = [];
  let settingsLoaded = false;

  // Check if current domain should be captured
  const shouldCaptureDomain = () => {
    // If settings haven't loaded yet, don't capture and don't show warning
    if (!settingsLoaded) {
      return false;
    }
    
    // Only capture from explicitly listed domains
    if (!specificDomains || specificDomains.length === 0) {
      return false;
    }

    const hostname = window.location.hostname;
    const port = window.location.port;
    const hostWithPort = port ? `${hostname}:${port}` : hostname;

    return specificDomains.some((domain) => {
      // Exact match with host:port (e.g., localhost:3000)
      if (hostWithPort === domain) {
        return true;
      }

      // Hostname-only match (e.g., example.com)
      if (hostname === domain) {
        return true;
      }

      // Subdomain match (e.g., api.example.com matches example.com)
      if (hostname.endsWith("." + domain)) {
        return true;
      }

      return false;
    });
  };

  // Listen for logs from the main world script
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;

    if (event.data.type === "BROWSER_RELAY_LOGS") {
      // Don't send logs if log capture is disabled or domain not allowed
      if (!logsEnabled || !shouldCaptureDomain()) {
        return;
      }

      const logs = event.data.logs;

      try {
        await chrome.runtime.sendMessage({
          type: "SEND_LOGS",
          logs: logs,
        });
      } catch {
        // Silently fail - don't interfere with page
      }
    } else if (event.data.type === "BROWSER_RELAY_NETWORK") {
      // Don't send network requests if domain not allowed
      if (!shouldCaptureDomain()) {
        return;
      }

      const requests = event.data.requests;

      try {
        await chrome.runtime.sendMessage({
          type: "SEND_NETWORK_REQUESTS",
          requests: requests,
        });
      } catch {
        // Silently fail - don't interfere with page
      }
    }
  });

  // Notify inject script of current settings
  const notifyInjectScript = () => {
    window.postMessage(
      {
        type: "BROWSER_RELAY_SETTINGS",
        logsEnabled,
        networkEnabled,
        specificDomains,
        shouldCapture: shouldCaptureDomain(),
      },
      "*"
    );
  };

  // Initial heartbeat and get capture states
  chrome.runtime
    .sendMessage({ type: "CONTENT_SCRIPT_READY" })
    .then((response) => {
      if (response) {
        if (typeof response.logsEnabled === "boolean") {
          logsEnabled = response.logsEnabled;
        }
        if (typeof response.networkEnabled === "boolean") {
          networkEnabled = response.networkEnabled;
        }
        if (Array.isArray(response.specificDomains)) {
          specificDomains = response.specificDomains;
        }

        // Mark settings as loaded
        settingsLoaded = true;

        // Notify inject script of all settings
        notifyInjectScript();
      }
    })
    .catch(() => {});

  // Listen for state changes from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "LOGS_STATE_CHANGED") {
      logsEnabled = message.enabled;
      notifyInjectScript();
    } else if (message.type === "NETWORK_STATE_CHANGED") {
      networkEnabled = message.enabled;
      notifyInjectScript();
    } else if (message.type === "DOMAIN_SETTINGS_CHANGED") {
      specificDomains = message.specificDomains;
      settingsLoaded = true; // Ensure this is set when domains change
      notifyInjectScript();
    }
  });
})();
