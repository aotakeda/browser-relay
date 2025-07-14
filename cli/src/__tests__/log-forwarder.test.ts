/**
 * Unit tests for LogForwarder functional implementation
 * Tests log batching, forwarding, error handling, and process lifecycle
 */

import { createLogForwarder } from '../log-forwarder';
import { consoleMock } from './setup';

// Mock timers for controlling intervals
jest.useFakeTimers();

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock process.pid
const originalPid = process.pid;
beforeAll(() => {
  Object.defineProperty(process, 'pid', { value: 12345, writable: true });
});

afterAll(() => {
  Object.defineProperty(process, 'pid', { value: originalPid, writable: true });
});

describe('LogForwarder', () => {
  let logForwarder: ReturnType<typeof createLogForwarder>;
  const serverUrl = 'http://localhost:27497';
  const processName = 'test-process';

  beforeEach(() => {
    // Arrange
    mockFetch.mockClear();
  });

  afterEach(async () => {
    // Cleanup
    if (logForwarder) {
      await logForwarder.stop();
    }
    jest.clearAllTimers();
    
    // Remove all process listeners to prevent memory leaks
    process.removeAllListeners('beforeExit');
  });

  describe('createLogForwarder', () => {
    it('should return object with correct methods', () => {
      // Act
      logForwarder = createLogForwarder(serverUrl, processName);

      // Assert
      expect(logForwarder).toHaveProperty('forwardLog');
      expect(logForwarder).toHaveProperty('stop');
      expect(typeof logForwarder.forwardLog).toBe('function');
      expect(typeof logForwarder.stop).toBe('function');
    });

    it('should set up periodic flushing interval', () => {
      // Arrange
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      // Act
      logForwarder = createLogForwarder(serverUrl, processName);

      // Assert
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('should set up process exit handler', () => {
      // Arrange
      const processOnSpy = jest.spyOn(process, 'on');

      // Act
      logForwarder = createLogForwarder(serverUrl, processName);

      // Assert
      expect(processOnSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    });
  });

  describe('forwardLog_BatchedMessages', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false); // silent mode
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    it('should batch single message with correct metadata', () => {
      // Arrange
      const message = 'Test log message';

      // Act
      logForwarder.forwardLog('log', message);
      jest.advanceTimersByTime(5000);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0]).toMatchObject({
        level: 'log',
        message: message,
        pageUrl: `process://${processName}`,
        userAgent: 'local-lens-cli',
        metadata: {
          source: 'backend-console',
          backendProcess: processName,
          pid: 12345,
          captureMethod: 'local-lens-cli',
          messageCount: 1
        }
      });
    });

    it('should batch multiple messages into single log entry', () => {
      // Arrange
      const messages = ['Message 1', 'Message 2', 'Message 3'];

      // Act
      messages.forEach(msg => logForwarder.forwardLog('log', msg));
      jest.advanceTimersByTime(5000);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('Message 1\nMessage 2\nMessage 3');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });

    it('should handle different log levels by using log level', () => {
      // Arrange & Act
      logForwarder.forwardLog('error', 'Error message');
      logForwarder.forwardLog('warn', 'Warning message');
      logForwarder.forwardLog('info', 'Info message');

      // Assert
      jest.advanceTimersByTime(5000);
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].level).toBe('log'); // All batched as 'log' level
      expect(body.logs[0].message).toBe('Error message\nWarning message\nInfo message');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });
  });

  describe('forwardLog_MultiLineMessage_BatchesLines', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    it('should split multi-line messages and batch them', () => {
      // Arrange
      const multiLineMessage = 'Line 1\nLine 2\nLine 3';

      // Act
      logForwarder.forwardLog('log', multiLineMessage);
      jest.advanceTimersByTime(5000);

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('Line 1\nLine 2\nLine 3');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });

    it('should ignore empty lines in multi-line messages', () => {
      // Arrange
      const messageWithEmptyLines = 'Line 1\n\nLine 2\n   \nLine 3';

      // Act
      logForwarder.forwardLog('log', messageWithEmptyLines);
      jest.advanceTimersByTime(5000);

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('Line 1\nLine 2\nLine 3');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });

    it('should trim whitespace from individual lines', () => {
      // Arrange
      const messageWithWhitespace = '  Line 1  \n\t\tLine 2\t\t\n   Line 3   ';

      // Act
      logForwarder.forwardLog('log', messageWithWhitespace);
      jest.advanceTimersByTime(5000);

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('Line 1\nLine 2\nLine 3');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });
  });

  describe('forwardLog_BufferFull_TriggersImmediateFlush', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    it('should flush immediately when buffer reaches max size', () => {
      // Arrange
      const maxBufferSize = 1000; // Updated buffer size

      // Act
      for (let i = 0; i < maxBufferSize; i++) {
        logForwarder.forwardLog('log', `Message ${i}`);
      }

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].metadata.messageCount).toBe(maxBufferSize);
    });

    it('should continue buffering after flush', () => {
      // Arrange
      const maxBufferSize = 1000;

      // Act
      // Fill buffer to trigger flush
      for (let i = 0; i < maxBufferSize; i++) {
        logForwarder.forwardLog('log', `Message ${i}`);
      }
      
      // Add more messages
      logForwarder.forwardLog('log', 'Additional message 1');
      logForwarder.forwardLog('log', 'Additional message 2');
      
      // Trigger timer flush
      jest.advanceTimersByTime(5000);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      const secondCall = mockFetch.mock.calls[1];
      const secondBody = JSON.parse(secondCall[1]?.body as string);
      expect(secondBody.logs).toHaveLength(1);
      expect(secondBody.logs[0].metadata.messageCount).toBe(2);
    });
  });

  describe('flushLogs_SuccessfulRequest_SendsLogsToServer', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, true); // verbose mode
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    it('should send batched logs with correct request format', () => {
      // Arrange
      const message = 'Test message';

      // Act
      logForwarder.forwardLog('log', message);
      jest.advanceTimersByTime(5000);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        `${serverUrl}/logs`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: expect.any(AbortSignal),
          body: expect.stringContaining(message)
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body).toHaveProperty('logs');
      expect(body).toHaveProperty('sessionId');
      expect(body.sessionId).toMatch(/local-lens-cli-test-process-\d+/);
      expect(body.logs).toHaveLength(1);
    });

    it('should display success message in verbose mode', async () => {
      // Arrange
      const messages = ['Message 1', 'Message 2', 'Message 3'];

      // Act
      messages.forEach(msg => logForwarder.forwardLog('log', msg));
      
      // Advance timers and run all pending promises
      jest.runOnlyPendingTimers();
      await Promise.resolve(); // Allow promises to resolve

      // Assert
      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('[Local Lens] Sent batched log with 3 messages')
      );
    });

    it('should not display success message in silent mode', () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false); // silent mode
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
      const message = 'Test message';

      // Act
      logForwarder.forwardLog('log', message);
      jest.advanceTimersByTime(5000);

      // Assert
      expect(consoleMock.log).not.toHaveBeenCalled();
    });
  });

  describe('flushLogs_NetworkError_HandlesGracefully', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, true); // verbose mode
    });

    it('should handle network errors and retry logs', async () => {
      // Arrange
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      // Act
      logForwarder.forwardLog('log', 'Test message');
      
      // Advance timers and allow promises to resolve
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Assert
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('[Local Lens] Failed to send logs: Network error')
      );
      
      // Should retry on next flush
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle server errors and retry logs', async () => {
      // Arrange
      mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      // Act
      logForwarder.forwardLog('log', 'Test message');
      
      // Advance timers and allow promises to resolve
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      // Assert
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('[Local Lens] Failed to send logs: Server responded with 500')
      );
    });

    it('should limit buffer size when retrying failed requests', () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));
      const maxBufferSize = 1000;

      // Act
      // Fill buffer multiple times to test size limiting
      for (let i = 0; i < maxBufferSize * 2; i++) {
        logForwarder.forwardLog('log', `Message ${i}`);
      }
      
      // Trigger multiple failed flushes
      jest.advanceTimersByTime(5000);
      jest.advanceTimersByTime(5000);

      // Assert
      // Should have attempted to send logs but buffer is limited
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // When successful, should send batched log with limited message count
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
      jest.advanceTimersByTime(5000);
      
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].metadata.messageCount).toBeLessThanOrEqual(maxBufferSize);
    });

    it('should not display error message in silent mode', () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false); // silent mode
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      logForwarder.forwardLog('log', 'Test message');
      jest.advanceTimersByTime(2000);

      // Assert
      expect(consoleMock.error).not.toHaveBeenCalled();
    });
  });

  describe('flushLogs_EmptyBuffer_DoesNotSendRequest', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName);
    });

    it('should not send request when buffer is empty', () => {
      // Act
      jest.advanceTimersByTime(5000);

      // Assert
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send request after buffer has been flushed', () => {
      // Arrange
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Act
      logForwarder.forwardLog('log', 'Test message');
      jest.advanceTimersByTime(5000); // First flush
      jest.advanceTimersByTime(5000); // Second flush with empty buffer

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop_CleanupResources_ClearsIntervalAndFlushes', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName);
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    it('should clear interval and flush remaining logs', async () => {
      // Arrange
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      logForwarder.forwardLog('log', 'Final message');

      // Act
      await logForwarder.stop();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs[0].message).toBe('Final message');
    });

    it('should handle stop when buffer is empty', async () => {
      // Arrange
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Act
      await logForwarder.stop();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);
    });

    it('should handle empty message', () => {
      // Act
      logForwarder.forwardLog('log', '');

      // Assert
      jest.advanceTimersByTime(5000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only message', () => {
      // Act
      logForwarder.forwardLog('log', '   \t\n   ');

      // Assert
      jest.advanceTimersByTime(5000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle very long messages', () => {
      // Arrange
      const longMessage = 'x'.repeat(10000);

      // Act
      logForwarder.forwardLog('log', longMessage);

      // Assert
      jest.advanceTimersByTime(5000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs[0].message).toBe(longMessage);
    });

    it('should handle special characters in messages', () => {
      // Arrange
      const specialMessage = 'Test with "quotes" and \\backslashes\\ and émojis 🎉';

      // Act
      logForwarder.forwardLog('log', specialMessage);

      // Assert
      jest.advanceTimersByTime(5000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs[0].message).toBe(specialMessage);
    });
  });
});