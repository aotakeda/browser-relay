// Popup script for Browser Relay extension
(async () => {
  const loadingEl = document.getElementById("loading");
  const contentEl = document.getElementById("content");
  const statusEl = document.getElementById("status");
  const statusTextEl = document.getElementById("status-text");
  const noDomainsWarningEl = document.getElementById("no-domains-warning");
  const domainInputEl = document.getElementById("domain-input");
  const addDomainBtnEl = document.getElementById("add-domain-btn");
  const domainsListEl = document.getElementById("domains-list");
  const domainErrorEl = document.getElementById("domain-error");
  const logsToggleEl = document.getElementById("logs-toggle");
  const networkToggleEl = document.getElementById("network-toggle");
  const mcpToggleEl = document.getElementById("mcp-toggle");
  const clearLogsBtn = document.getElementById("clear-logs");
  const clearNetworkBtn = document.getElementById("clear-network");

  // Network configuration elements
  const networkConfigSectionEl = document.getElementById(
    "network-config-section"
  );
  const captureModeToggleEl = document.getElementById("capture-mode-toggle");
  const networkFiltersEl = document.getElementById("network-filters");
  const urlPatternInputEl = document.getElementById("url-pattern-input");
  const addPatternBtnEl = document.getElementById("add-pattern-btn");
  const urlPatternsListEl = document.getElementById("url-patterns-list");
  const filterModeToggleEl = document.getElementById("filter-mode-toggle");
  const headersToggleEl = document.getElementById("headers-toggle");
  const requestBodyToggleEl = document.getElementById("request-body-toggle");
  const responseBodyToggleEl = document.getElementById("response-body-toggle");
  const maxBodySizeEl = document.getElementById("max-body-size");

  let logsEnabled = true;
  let networkEnabled = true;
  let mcpEnabled = false; // Default to false for MCP mode
  let isConnected = false;
  let specificDomains = []; // array of domain strings

  // Network configuration state
  let networkConfig = {
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

  // Show loading initially
  loadingEl.style.display = "flex";
  contentEl.style.display = "none";

  // Load network configuration from server
  const loadNetworkConfig = async () => {
    if (!isConnected) return;

    try {
      const response = await fetch("http://localhost:27497/network-config", {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        networkConfig = { ...networkConfig, ...data.config };
      }
    } catch (error) {
      console.error("Error loading network config:", error);
    }
  };

  // Save network configuration to server
  const saveNetworkConfig = async () => {
    if (!isConnected) return;

    try {
      const response = await fetch("http://localhost:27497/network-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(networkConfig),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      // Update local config with server response
      const data = await response.json();
      if (data.config) {
        networkConfig = { ...data.config };
        // Update all displays when config changes
        updateNetworkConfigDisplay();
      }
    } catch (error) {
      console.error("Error saving network config:", error);
    }
  };

  // Load current state
  const loadState = async () => {
    try {
      // Get current enabled states and domain configuration from server
      try {
        const response = await fetch("http://localhost:27497/settings", {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const data = await response.json();
          const settings = data.settings;

          logsEnabled = settings.logsEnabled !== false; // default to true
          networkEnabled = settings.networkEnabled !== false; // default to true
          mcpEnabled = settings.mcpEnabled === true; // default to false for MCP
          specificDomains = settings.specificDomains || []; // default to empty array
        } else {
          console.warn(
            "[Browser Relay] Failed to load settings from server, using defaults"
          );
          // Use default values
          logsEnabled = true;
          networkEnabled = true;
          mcpEnabled = false;
          specificDomains = [];
        }
      } catch (error) {
        console.warn(
          "[Browser Relay] Error loading settings from server:",
          error
        );
        // Use default values
        logsEnabled = true;
        networkEnabled = true;
        mcpEnabled = false;
        specificDomains = [];
      }

      // Check server connection
      try {
        const response = await fetch(
          "http://localhost:27497/health-browser-relay",
          {
            method: "GET",
            signal: AbortSignal.timeout(3000),
          }
        );
        isConnected = response.ok;

        if (isConnected) {
          await loadNetworkConfig();
        }
      } catch {
        isConnected = false;
      }

      updateUI();
    } catch (error) {
      console.error("Error loading state:", error);
      updateUI();
    }
  };

  // Domain management functions
  const saveDomainSettings = async () => {
    try {
      // Save to server
      await fetch("http://localhost:27497/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specificDomains,
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch (error) {
      console.warn(
        "[Browser Relay] Failed to save domain settings to server:",
        error
      );
    }

    // Notify background script of domain changes
    await chrome.runtime.sendMessage({
      type: "DOMAIN_SETTINGS_CHANGED",
      specificDomains,
    });
  };

  const addDomain = async () => {
    const input = domainInputEl.value.trim();
    if (!input) return;

    // Normalize the input - extract hostname/domain from URL or use as-is
    let domain = input.toLowerCase();

    // If input looks like a URL, extract the hostname
    if (input.startsWith("http://") || input.startsWith("https://")) {
      try {
        const url = new URL(input);
        domain = url.hostname + (url.port ? ":" + url.port : "");
      } catch {
        showDomainError("Invalid URL format");
        return;
      }
    }

    // Domain validation - allow localhost, IP addresses, and regular domains
    const isValidDomain = (domain) => {
      // Allow localhost (with or without port)
      if (domain.startsWith("localhost")) {
        return /^localhost(:[0-9]+)?$/.test(domain);
      }

      // Allow IP addresses (with or without port)
      if (/^[0-9]/.test(domain)) {
        return /^([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?$/.test(domain);
      }

      // Allow regular domains (with or without port)
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*?(:[0-9]+)?$/.test(
        domain
      );
    };

    if (!isValidDomain(domain)) {
      showDomainError("Invalid domain format");
      return;
    }

    if (specificDomains.includes(domain)) {
      domainInputEl.value = "";
      return;
    }

    specificDomains.push(domain);
    domainInputEl.value = "";
    await saveDomainSettings();
    updateDomainsDisplay();
  };

  const showDomainError = (message) => {
    domainInputEl.style.borderColor = "rgba(255, 107, 107, 0.5)";
    domainErrorEl.textContent = message;
    domainErrorEl.style.display = "block";
    setTimeout(() => {
      domainInputEl.style.borderColor = "";
      domainErrorEl.style.display = "none";
      domainErrorEl.textContent = "";
    }, 4000);
  };

  const removeDomain = async (domain) => {
    specificDomains = specificDomains.filter((d) => d !== domain);
    await saveDomainSettings();
    updateDomainsDisplay();
  };

  // Network configuration management
  const addUrlPattern = async () => {
    const pattern = urlPatternInputEl.value.trim();
    if (!pattern) return;

    if (networkConfig.urlPatterns.includes(pattern)) {
      urlPatternInputEl.value = "";
      return;
    }

    networkConfig.urlPatterns.push(pattern);
    urlPatternInputEl.value = "";
    await saveNetworkConfig();
  };

  const removeUrlPattern = async (pattern) => {
    networkConfig.urlPatterns = networkConfig.urlPatterns.filter(
      (p) => p !== pattern
    );
    await saveNetworkConfig();
  };

  const toggleCaptureMode = async () => {
    const isFiltered = networkConfig.captureMode !== "all";
    networkConfig.captureMode = isFiltered ? "all" : "include";
    await saveNetworkConfig();
  };

  const toggleFilterMode = async () => {
    networkConfig.captureMode =
      networkConfig.captureMode === "include" ? "exclude" : "include";
    await saveNetworkConfig();
  };

  // Update domains display
  const updateDomainsDisplay = () => {
    // Show warning if no domains are specified
    if (specificDomains.length === 0) {
      noDomainsWarningEl.style.display = "block";
    } else {
      noDomainsWarningEl.style.display = "none";
    }

    // Update domains list
    domainsListEl.innerHTML = specificDomains
      .map(
        (domain) => `
        <div class="domain-tag">
          ${domain}
          <span class="domain-remove" data-domain="${domain}">×</span>
        </div>
      `
      )
      .join("");
  };

  // Update network configuration display
  const updateNetworkConfigDisplay = () => {
    // Show/hide network config section based on network enabled state
    networkConfigSectionEl.style.display = networkEnabled ? "block" : "none";

    if (!networkEnabled) return;

    // Update capture mode toggle (All vs Filtered)
    const isFiltered = networkConfig.captureMode !== "all";
    captureModeToggleEl.className = "toggle toggle-small";
    if (isFiltered) {
      captureModeToggleEl.classList.add("enabled");
    }
    captureModeToggleEl.setAttribute("aria-checked", isFiltered.toString());

    // Show/hide filter options
    networkFiltersEl.style.display = isFiltered ? "block" : "none";

    if (isFiltered) {
      // Update filter mode toggle (Include vs Exclude)
      const isExclude = networkConfig.captureMode === "exclude";
      filterModeToggleEl.className = "toggle toggle-small";
      if (isExclude) {
        filterModeToggleEl.classList.add("enabled");
      }
      filterModeToggleEl.setAttribute("aria-checked", isExclude.toString());

      // Update URL patterns list
      urlPatternsListEl.innerHTML = networkConfig.urlPatterns
        .map(
          (pattern) => `
          <div class="domain-tag">
            ${pattern}
            <span class="domain-remove" data-pattern="${pattern}">×</span>
          </div>
        `
        )
        .join("");
    }

    // Update option toggles
    headersToggleEl.className = "toggle";
    if (networkConfig.includeHeaders) {
      headersToggleEl.classList.add("enabled");
    }
    headersToggleEl.setAttribute(
      "aria-checked",
      networkConfig.includeHeaders.toString()
    );

    requestBodyToggleEl.className = "toggle";
    if (networkConfig.includeRequestBody) {
      requestBodyToggleEl.classList.add("enabled");
    }
    requestBodyToggleEl.setAttribute(
      "aria-checked",
      networkConfig.includeRequestBody.toString()
    );

    responseBodyToggleEl.className = "toggle";
    if (networkConfig.includeResponseBody) {
      responseBodyToggleEl.classList.add("enabled");
    }
    responseBodyToggleEl.setAttribute(
      "aria-checked",
      networkConfig.includeResponseBody.toString()
    );

    // Update max body size (convert from bytes to thousands)
    maxBodySizeEl.value = Math.round(networkConfig.maxResponseBodySize / 1000);
  };

  // Update UI based on current state
  const updateUI = () => {
    // Hide loading, show content
    loadingEl.style.display = "none";
    contentEl.style.display = "block";

    // Update domains display
    updateDomainsDisplay();

    // Update network configuration display
    updateNetworkConfigDisplay();

    // Update status
    statusEl.className = "status";
    if (!isConnected) {
      statusEl.classList.add("disconnected");
      statusTextEl.textContent = "Server disconnected";
    } else if (!logsEnabled && !networkEnabled) {
      statusEl.classList.add("paused");
      statusTextEl.textContent = "All capture disabled";
    } else if (!logsEnabled) {
      statusEl.classList.add("paused");
      statusTextEl.textContent = "Console logs disabled";
    } else if (!networkEnabled) {
      statusEl.classList.add("paused");
      statusTextEl.textContent = "Network requests disabled";
    } else {
      statusEl.classList.add("active");
      statusTextEl.textContent = "Capturing logs & network";
    }

    // Update logs toggle
    logsToggleEl.className = "toggle";
    if (logsEnabled) {
      logsToggleEl.classList.add("enabled");
    }
    logsToggleEl.setAttribute("aria-checked", logsEnabled.toString());

    // Update network toggle
    networkToggleEl.className = "toggle";
    if (networkEnabled) {
      networkToggleEl.classList.add("enabled");
    }
    networkToggleEl.setAttribute("aria-checked", networkEnabled.toString());

    // Update MCP toggle
    mcpToggleEl.className = "toggle";
    if (mcpEnabled) {
      mcpToggleEl.classList.add("enabled");
    }
    mcpToggleEl.setAttribute("aria-checked", mcpEnabled.toString());

    // Disable toggles if not connected
    const toggleOpacity = isConnected ? "1" : "0.5";
    const toggleCursor = isConnected ? "pointer" : "not-allowed";

    logsToggleEl.style.opacity = toggleOpacity;
    logsToggleEl.style.cursor = toggleCursor;
    networkToggleEl.style.opacity = toggleOpacity;
    networkToggleEl.style.cursor = toggleCursor;
    mcpToggleEl.style.opacity = toggleOpacity;
    mcpToggleEl.style.cursor = toggleCursor;

    // Disable network config toggles if not connected
    if (headersToggleEl) {
      headersToggleEl.style.opacity = toggleOpacity;
      headersToggleEl.style.cursor = toggleCursor;
    }
    if (requestBodyToggleEl) {
      requestBodyToggleEl.style.opacity = toggleOpacity;
      requestBodyToggleEl.style.cursor = toggleCursor;
    }
    if (responseBodyToggleEl) {
      responseBodyToggleEl.style.opacity = toggleOpacity;
      responseBodyToggleEl.style.cursor = toggleCursor;
    }

    // Disable clear buttons if not connected
    clearLogsBtn.disabled = !isConnected;
    clearNetworkBtn.disabled = !isConnected;

    const buttonOpacity = isConnected ? "1" : "0.5";
    const buttonCursor = isConnected ? "pointer" : "not-allowed";

    clearLogsBtn.style.opacity = buttonOpacity;
    clearLogsBtn.style.cursor = buttonCursor;
    clearNetworkBtn.style.opacity = buttonOpacity;
    clearNetworkBtn.style.cursor = buttonCursor;
  };

  // Toggle logs capture state
  const toggleLogs = async () => {
    if (!isConnected) return;

    try {
      logsEnabled = !logsEnabled;

      // Save to server
      try {
        await fetch("http://localhost:27497/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logsEnabled }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (error) {
        console.warn(
          "[Browser Relay] Failed to save logs setting to server:",
          error
        );
      }

      // Notify background script
      await chrome.runtime.sendMessage({
        type: "TOGGLE_LOGS",
        enabled: logsEnabled,
      });

      updateUI();
    } catch (error) {
      console.error("Error toggling logs:", error);
      // Revert state on error
      logsEnabled = !logsEnabled;
      updateUI();
    }
  };

  // Toggle network capture state
  const toggleNetwork = async () => {
    if (!isConnected) return;

    try {
      networkEnabled = !networkEnabled;

      // Save to server
      try {
        await fetch("http://localhost:27497/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ networkEnabled }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (error) {
        console.warn(
          "[Browser Relay] Failed to save network setting to server:",
          error
        );
      }

      // Notify background script
      await chrome.runtime.sendMessage({
        type: "TOGGLE_NETWORK",
        enabled: networkEnabled,
      });

      updateUI();
    } catch (error) {
      console.error("Error toggling network:", error);
      // Revert state on error
      networkEnabled = !networkEnabled;
      updateUI();
    }
  };

  // Toggle MCP mode
  const toggleMCP = async () => {
    if (!isConnected) return;

    try {
      mcpEnabled = !mcpEnabled;

      // Save to server
      try {
        await fetch("http://localhost:27497/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcpEnabled }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (error) {
        console.warn(
          "[Browser Relay] Failed to save MCP setting to server:",
          error
        );
      }

      // Notify background script to inform server
      await chrome.runtime.sendMessage({
        type: "TOGGLE_MCP",
        enabled: mcpEnabled,
      });

      updateUI();
    } catch (error) {
      console.error("Error toggling MCP:", error);
      // Revert state on error
      mcpEnabled = !mcpEnabled;
      updateUI();
    }
  };

  // Clear console logs
  const clearLogs = async () => {
    if (!isConnected) return;

    try {
      // Show loading state
      clearLogsBtn.textContent = "Clearing...";
      clearLogsBtn.disabled = true;

      // Clear logs on server
      const response = await fetch("http://localhost:27497/logs", {
        method: "DELETE",
      });

      if (response.ok) {
        // Show success feedback
        clearLogsBtn.textContent = "Cleared!";
        setTimeout(() => {
          clearLogsBtn.textContent = "Clear Console Logs";
          clearLogsBtn.disabled = false;
        }, 1000);
      } else {
        throw new Error("Failed to clear logs");
      }
    } catch (error) {
      console.error("Error clearing logs:", error);
      clearLogsBtn.textContent = "Error";
      setTimeout(() => {
        clearLogsBtn.textContent = "Clear Console Logs";
        clearLogsBtn.disabled = false;
      }, 1000);
    }
  };

  // Clear network requests
  const clearNetwork = async () => {
    if (!isConnected) return;

    try {
      // Show loading state
      clearNetworkBtn.textContent = "Clearing...";
      clearNetworkBtn.disabled = true;

      // Clear network requests on server
      const response = await fetch("http://localhost:27497/network-requests", {
        method: "DELETE",
      });

      if (response.ok) {
        // Show success feedback
        clearNetworkBtn.textContent = "Cleared!";
        setTimeout(() => {
          clearNetworkBtn.textContent = "Clear Network Requests";
          clearNetworkBtn.disabled = false;
        }, 1000);
      } else {
        throw new Error("Failed to clear network requests");
      }
    } catch (error) {
      console.error("Error clearing network requests:", error);
      clearNetworkBtn.textContent = "Error";
      setTimeout(() => {
        clearNetworkBtn.textContent = "Clear Network Requests";
        clearNetworkBtn.disabled = false;
      }, 1000);
    }
  };

  // Event listeners
  logsToggleEl.addEventListener("click", toggleLogs);
  logsToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleLogs();
    }
  });

  networkToggleEl.addEventListener("click", toggleNetwork);
  networkToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleNetwork();
    }
  });

  mcpToggleEl.addEventListener("click", toggleMCP);
  mcpToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMCP();
    }
  });

  clearLogsBtn.addEventListener("click", clearLogs);
  clearNetworkBtn.addEventListener("click", clearNetwork);

  // Domain management event listeners

  addDomainBtnEl.addEventListener("click", addDomain);

  domainInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addDomain();
    }
  });

  domainInputEl.addEventListener("input", () => {
    // Clear error when user starts typing
    if (domainErrorEl.style.display === "block") {
      domainInputEl.style.borderColor = "";
      domainErrorEl.style.display = "none";
      domainErrorEl.textContent = "";
    }
  });

  // Event delegation for domain removal
  domainsListEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("domain-remove")) {
      const domain = e.target.getAttribute("data-domain");
      removeDomain(domain);
    }
  });

  // Network configuration event listeners
  captureModeToggleEl.addEventListener("click", toggleCaptureMode);
  captureModeToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCaptureMode();
    }
  });

  filterModeToggleEl.addEventListener("click", toggleFilterMode);
  filterModeToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleFilterMode();
    }
  });

  addPatternBtnEl.addEventListener("click", addUrlPattern);

  urlPatternInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addUrlPattern();
    }
  });

  // Event delegation for URL pattern removal
  urlPatternsListEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("domain-remove")) {
      const pattern = e.target.getAttribute("data-pattern");
      removeUrlPattern(pattern);
    }
  });

  // Network option toggles
  const toggleNetworkOption = (option) => async () => {
    if (!isConnected) return;
    networkConfig[option] = !networkConfig[option];
    await saveNetworkConfig();
  };

  headersToggleEl.addEventListener(
    "click",
    toggleNetworkOption("includeHeaders")
  );
  headersToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleNetworkOption("includeHeaders")();
    }
  });

  requestBodyToggleEl.addEventListener(
    "click",
    toggleNetworkOption("includeRequestBody")
  );
  requestBodyToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleNetworkOption("includeRequestBody")();
    }
  });

  responseBodyToggleEl.addEventListener(
    "click",
    toggleNetworkOption("includeResponseBody")
  );
  responseBodyToggleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleNetworkOption("includeResponseBody")();
    }
  });

  // Max body size input
  maxBodySizeEl.addEventListener("change", async () => {
    if (!isConnected) return;
    const newSizeThousands = parseInt(maxBodySizeEl.value);
    if (newSizeThousands >= 1 && newSizeThousands <= 1000) {
      networkConfig.maxResponseBodySize = newSizeThousands * 1000;
      await saveNetworkConfig();
    } else {
      // Reset to current value if invalid
      maxBodySizeEl.value = Math.round(
        networkConfig.maxResponseBodySize / 1000
      );
    }
  });

  // Load initial state
  await loadState();

  // Refresh connection status every 5 seconds
  setInterval(async () => {
    try {
      const response = await fetch(
        "http://localhost:27497/health-browser-relay",
        {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        }
      );
      const newConnected = response.ok;
      if (newConnected !== isConnected) {
        isConnected = newConnected;
        updateUI();
      }
    } catch {
      if (isConnected) {
        isConnected = false;
        updateUI();
      }
    }
  }, 5000);
})();
