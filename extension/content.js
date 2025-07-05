// This content script runs in ISOLATED world and can communicate with background script
(() => {
  // Listen for logs from the main world script
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data.type !== 'CONSOLE_RELAY_LOGS') {
      return;
    }

    const logs = event.data.logs;

    try {
      await chrome.runtime.sendMessage({
        type: "SEND_LOGS",
        logs: logs,
      });
    } catch (error) {
      // Silently fail - don't interfere with page
    }
  });

  // Initial heartbeat
  chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {});
})();
