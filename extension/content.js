// This content script runs in ISOLATED world and can communicate with background script
(() => {
  let logsEnabled = true;
  let networkEnabled = true;
  let allDomainsMode = true;
  let specificDomains = [];

  // Check if current domain should be captured
  const shouldCaptureDomain = () => {
    if (allDomainsMode) {
      return true;
    }

    const hostname = window.location.hostname;
    const port = window.location.port;
    const hostWithPort = port ? `${hostname}:${port}` : hostname;

    return specificDomains.some((domain) => {
      // First check exact match with host:port
      if (hostWithPort === domain) {
        return true;
      }

      // Then check hostname-only match (for domains without ports)
      if (hostname === domain) {
        return true;
      }

      // Finally check subdomain match (for domains without ports)
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
        allDomainsMode,
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
        if (typeof response.allDomainsMode === "boolean") {
          allDomainsMode = response.allDomainsMode;
        }
        if (Array.isArray(response.specificDomains)) {
          specificDomains = response.specificDomains;
        }

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
      allDomainsMode = message.allDomainsMode;
      specificDomains = message.specificDomains;
      notifyInjectScript();
    }
  });
})();
