// Jest setup file for extension tests

// Mock Chrome APIs globally
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn()
  },
  action: {
    onClicked: {
      addListener: jest.fn()
    }
  }
};

// Mock fetch globally
global.fetch = jest.fn();

// Mock AbortSignal
global.AbortSignal = {
  timeout: jest.fn(() => ({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    aborted: false
  }))
};

// Mock Performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => []),
  getEntriesByType: jest.fn(() => [])
};

// Mock PerformanceObserver
global.PerformanceObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn()
}));

// Mock navigator
Object.defineProperty(global.navigator, 'userAgent', {
  value: 'Mozilla/5.0 (test)',
  writable: true
});

Object.defineProperty(global.navigator, 'sendBeacon', {
  value: jest.fn(),
  writable: true
});

// Setup DOM environment
Object.defineProperty(global.document, 'readyState', {
  value: 'complete',
  writable: true
});

// Mock console methods to avoid noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});