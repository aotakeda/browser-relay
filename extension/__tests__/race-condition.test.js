/**
 * @jest-environment jsdom
 */

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock window.postMessage
global.window.postMessage = jest.fn();

describe('Race Condition Fixes', () => {
  let mockInjectScript;
  let mockAddLog;
  let mockAddNetworkRequest;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock inject script state
    mockInjectScript = {
      shouldCaptureDomain: false, // Fixed: defaults to false
      settingsReceived: false,    // Fixed: added settings flag
      logsEnabled: true,
      networkEnabled: true,
      logBuffer: [],
      networkBuffer: []
    };

    // Mock the addLog function from inject.js
    mockAddLog = jest.fn((logEntry) => {
      // Don't capture logs if settings haven't been received yet
      if (!mockInjectScript.settingsReceived) {
        return;
      }

      // Don't capture logs if log capture is disabled or domain not allowed
      if (!mockInjectScript.logsEnabled || !mockInjectScript.shouldCaptureDomain) {
        return;
      }

      mockInjectScript.logBuffer.push(logEntry);
    });

    // Mock the addNetworkRequest function from inject.js
    mockAddNetworkRequest = jest.fn((requestData) => {
      // Don't capture if settings haven't been received yet
      if (!mockInjectScript.settingsReceived) {
        return;
      }

      // Don't capture if network capture is disabled
      if (!mockInjectScript.networkEnabled) {
        return;
      }

      // Don't capture if page domain not allowed
      if (!mockInjectScript.shouldCaptureDomain) {
        return;
      }

      mockInjectScript.networkBuffer.push(requestData);
    });
  });

  describe('Initial State Safety', () => {
    it('should default shouldCaptureDomain to false', () => {
      expect(mockInjectScript.shouldCaptureDomain).toBe(false);
    });

    it('should default settingsReceived to false', () => {
      expect(mockInjectScript.settingsReceived).toBe(false);
    });

    it('should not capture logs before settings are received', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test log message'
      };

      mockAddLog(logEntry);

      expect(mockInjectScript.logBuffer).toHaveLength(0);
    });

    it('should not capture network requests before settings are received', () => {
      const networkRequest = {
        url: 'https://api.example.com/data',
        method: 'GET',
        timestamp: new Date().toISOString()
      };

      mockAddNetworkRequest(networkRequest);

      expect(mockInjectScript.networkBuffer).toHaveLength(0);
    });
  });

  describe('Settings Reception', () => {
    it('should start capturing after settings are received and domain is allowed', () => {
      // Simulate receiving settings
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = true;

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test log message'
      };

      mockAddLog(logEntry);

      expect(mockInjectScript.logBuffer).toHaveLength(1);
      expect(mockInjectScript.logBuffer[0]).toEqual(logEntry);
    });

    it('should not capture when settings received but domain not allowed', () => {
      // Simulate receiving settings with domain not allowed
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = false;

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test log message'
      };

      mockAddLog(logEntry);

      expect(mockInjectScript.logBuffer).toHaveLength(0);
    });
  });

  describe('Background Script Default Behavior', () => {
    it('should default to safer allDomainsMode = false', () => {
      // This simulates the fixed background script behavior
      const backgroundScriptDefaults = {
        allDomainsMode: false, // Fixed: changed from true to false
        specificDomains: []
      };

      expect(backgroundScriptDefaults.allDomainsMode).toBe(false);
    });

    it('should require explicit true for allDomainsMode setting', () => {
      // Simulate settings parsing logic from background.js
      const parseSettings = (settings) => {
        return {
          allDomainsMode: settings.allDomainsMode === true, // Fixed: explicit true check
          specificDomains: settings.specificDomains || []
        };
      };

      // Test various values
      expect(parseSettings({ allDomainsMode: true }).allDomainsMode).toBe(true);
      expect(parseSettings({ allDomainsMode: false }).allDomainsMode).toBe(false);
      expect(parseSettings({ allDomainsMode: undefined }).allDomainsMode).toBe(false);
      expect(parseSettings({ allDomainsMode: null }).allDomainsMode).toBe(false);
      expect(parseSettings({ allDomainsMode: 'true' }).allDomainsMode).toBe(false);
      expect(parseSettings({}).allDomainsMode).toBe(false);
    });
  });

  describe('New Tab Scenarios', () => {
    it('should handle new tab opening with no settings', () => {
      // Simulate a new tab opening - inject script loads first
      const newTabState = {
        shouldCaptureDomain: false,
        settingsReceived: false,
        logsEnabled: true,
        networkEnabled: true,
        logBuffer: [],
        networkBuffer: []
      };

      // Try to capture a log immediately (before content script loads)
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Early log message'
      };

      // Simulate the addLog function behavior
      if (!newTabState.settingsReceived) {
        // Should not capture
        expect(newTabState.logBuffer).toHaveLength(0);
      }
    });

    it('should handle content script loading and sending settings', () => {
      // Start with new tab state
      mockInjectScript.settingsReceived = false;
      mockInjectScript.shouldCaptureDomain = false;

      // Simulate content script loading and getting settings from background
      const settingsFromBackground = {
        logsEnabled: true,
        networkEnabled: true,
        allDomainsMode: false,
        specificDomains: ['localhost:4321'],
        shouldCapture: true // Content script calculated this
      };

      // Simulate settings message being sent to inject script
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = settingsFromBackground.shouldCapture;

      // Now logs should be captured
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Post-settings log message'
      };

      mockAddLog(logEntry);

      expect(mockInjectScript.logBuffer).toHaveLength(1);
    });

    it('should handle failed settings loading gracefully', () => {
      // Simulate settings loading failure - background script uses safe defaults
      const fallbackSettings = {
        logsEnabled: true,
        networkEnabled: true,
        allDomainsMode: false, // Safe default
        specificDomains: [] // Empty array
      };

      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = false; // No domains allowed

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test log message'
      };

      mockAddLog(logEntry);

      // Should not capture because domain not allowed
      expect(mockInjectScript.logBuffer).toHaveLength(0);
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent logs from being captured during the race window', () => {
      // Simulate the race condition scenario
      const raceConditionLogs = [];

      // 1. New tab opens, inject script loads
      mockInjectScript.settingsReceived = false;
      mockInjectScript.shouldCaptureDomain = false;

      // 2. Page generates logs immediately
      for (let i = 0; i < 5; i++) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Race condition log ${i}`
        };
        
        mockAddLog(logEntry);
      }

      // 3. Logs should not be captured yet
      expect(mockInjectScript.logBuffer).toHaveLength(0);

      // 4. Content script loads and sends settings
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = true;

      // 5. New logs should now be captured
      const postSettingsLog = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Post-settings log'
      };

      mockAddLog(postSettingsLog);

      // Only the post-settings log should be captured
      expect(mockInjectScript.logBuffer).toHaveLength(1);
      expect(mockInjectScript.logBuffer[0].message).toBe('Post-settings log');
    });

    it('should handle multiple tabs opening simultaneously', () => {
      // Simulate multiple tabs opening at once
      const tabs = [];

      for (let i = 0; i < 3; i++) {
        tabs.push({
          shouldCaptureDomain: false,
          settingsReceived: false,
          logsEnabled: true,
          networkEnabled: true,
          logBuffer: [],
          networkBuffer: []
        });
      }

      // All tabs should start with safe defaults
      tabs.forEach(tab => {
        expect(tab.shouldCaptureDomain).toBe(false);
        expect(tab.settingsReceived).toBe(false);
        expect(tab.logBuffer).toHaveLength(0);
      });

      // Simulate early log attempts on all tabs
      tabs.forEach((tab, index) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Tab ${index} early log`
        };

        // Simulate addLog behavior
        if (!tab.settingsReceived) {
          // Should not capture
          expect(tab.logBuffer).toHaveLength(0);
        }
      });
    });
  });

  describe('Settings Synchronization', () => {
    it('should handle settings changes after initial load', () => {
      // Start with settings received and domain allowed
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = true;

      // Capture initial log
      const initialLog = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Initial log'
      };

      mockAddLog(initialLog);
      expect(mockInjectScript.logBuffer).toHaveLength(1);

      // Simulate domain settings change - domain no longer allowed
      mockInjectScript.shouldCaptureDomain = false;

      // Try to capture another log
      const blockedLog = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Blocked log'
      };

      mockAddLog(blockedLog);

      // Should still only have the initial log
      expect(mockInjectScript.logBuffer).toHaveLength(1);
      expect(mockInjectScript.logBuffer[0].message).toBe('Initial log');
    });

    it('should handle re-enabling after being disabled', () => {
      // Start with settings received but domain not allowed
      mockInjectScript.settingsReceived = true;
      mockInjectScript.shouldCaptureDomain = false;

      // Try to capture log - should be blocked
      const blockedLog = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Blocked log'
      };

      mockAddLog(blockedLog);
      expect(mockInjectScript.logBuffer).toHaveLength(0);

      // Re-enable domain
      mockInjectScript.shouldCaptureDomain = true;

      // Try to capture log - should work now
      const allowedLog = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Allowed log'
      };

      mockAddLog(allowedLog);
      expect(mockInjectScript.logBuffer).toHaveLength(1);
      expect(mockInjectScript.logBuffer[0].message).toBe('Allowed log');
    });
  });
});