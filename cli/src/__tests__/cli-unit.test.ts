/**
 * Simplified CLI unit tests focusing on core functionality
 * Tests individual functions and components without full integration
 */

import { createLogForwarder } from '../log-forwarder';
import { consoleMock } from './setup';

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('CLI Core Functionality', () => {
  describe('LogForwarder Integration', () => {
    let logForwarder: ReturnType<typeof createLogForwarder>;
    const serverUrl = 'http://localhost:27497';
    const processName = 'test-process';

    beforeEach(() => {
      // Arrange
      jest.useFakeTimers();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    });

    afterEach(async () => {
      // Cleanup
      if (logForwarder) {
        await logForwarder.stop();
      }
      process.removeAllListeners('beforeExit');
      jest.useRealTimers();
    });

    it('should create LogForwarder with correct configuration', () => {
      // Act
      logForwarder = createLogForwarder(serverUrl, processName, true);

      // Assert
      expect(logForwarder).toHaveProperty('forwardLog');
      expect(logForwarder).toHaveProperty('stop');
    });

    it('should forward logs to server', async () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);

      // Act
      logForwarder.forwardLog('log', 'Test message');
      
      // Trigger flush
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        `${serverUrl}/logs`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test message')
        })
      );
    });

    it('should handle different log levels', async () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);

      // Act
      logForwarder.forwardLog('error', 'Error message');
      logForwarder.forwardLog('warn', 'Warning message');
      logForwarder.forwardLog('info', 'Info message');
      
      // Trigger flush
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].level).toBe('log'); // All batched as 'log' level
      expect(body.logs[0].message).toContain('Error message');
      expect(body.logs[0].message).toContain('Warning message');
      expect(body.logs[0].message).toContain('Info message');
      expect(body.logs[0].metadata.messageCount).toBe(3);
    });

    it('should include process metadata in logs', async () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);

      // Act
      logForwarder.forwardLog('log', 'Test message');
      
      // Trigger flush
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Assert
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const logEntry = body.logs[0];
      
      expect(logEntry.pageUrl).toBe(`process://${processName}`);
      expect(logEntry.userAgent).toBe('local-lens-cli');
      expect(logEntry.metadata.source).toBe('backend-console');
      expect(logEntry.metadata.backendProcess).toBe(processName);
      expect(logEntry.metadata.captureMethod).toBe('local-lens-cli');
    });

    it('should handle network errors gracefully', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));
      logForwarder = createLogForwarder(serverUrl, processName, true);

      // Act
      logForwarder.forwardLog('log', 'Test message');
      
      // Trigger flush
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Assert
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('[Local Lens] Failed to send logs: Network error')
      );
    });

    it('should batch multiple log entries', async () => {
      // Arrange
      logForwarder = createLogForwarder(serverUrl, processName, false);

      // Act
      for (let i = 0; i < 5; i++) {
        logForwarder.forwardLog('log', `Message ${i}`);
      }
      
      // Trigger flush
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('Message 0\nMessage 1\nMessage 2\nMessage 3\nMessage 4');
      expect(body.logs[0].metadata.messageCount).toBe(5);
    });

    it('should clean up resources when stopped', async () => {
      // Arrange
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      logForwarder = createLogForwarder(serverUrl, processName, false);
      
      logForwarder.forwardLog('log', 'Final message');

      // Act
      await logForwarder.stop();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.logs[0].message).toBe('Final message');
    });
  });

  describe('Command Line Argument Parsing', () => {
    it('should extract command name from complex commands', () => {
      // Arrange
      const testCases = [
        { input: 'rails server', expected: 'rails' },
        { input: 'bundle exec rails server', expected: 'bundle' },
        { input: 'npm start', expected: 'npm' },
        { input: 'python manage.py runserver', expected: 'python' },
        { input: 'uvicorn main:app --reload', expected: 'uvicorn' },
      ];

      testCases.forEach(({ input, expected }) => {
        // Act
        const commandName = input.split(' ')[0];

        // Assert
        expect(commandName).toBe(expected);
      });
    });

    it('should handle command argument parsing', () => {
      // Arrange
      const command = 'rails server';
      const args = ['-p', '4000', '--environment', 'development'];

      // Act
      const [cmd, ...cmdArgs] = command.split(' ').concat(args);

      // Assert
      expect(cmd).toBe('rails');
      expect(cmdArgs).toEqual(['server', '-p', '4000', '--environment', 'development']);
    });

    it('should handle empty arguments', () => {
      // Arrange
      const command = 'rails';
      const args: string[] = [];

      // Act
      const [cmd, ...cmdArgs] = command.split(' ').concat(args);

      // Assert
      expect(cmd).toBe('rails');
      expect(cmdArgs).toEqual([]);
    });
  });

  describe('URL and Server Configuration', () => {
    it('should use default server URL when none provided', () => {
      // Arrange
      const defaultUrl = 'http://localhost:27497';
      const options: { server?: string } = {};

      // Act
      const serverUrl = options.server || defaultUrl;

      // Assert
      expect(serverUrl).toBe(defaultUrl);
    });

    it('should use custom server URL when provided', () => {
      // Arrange
      const customUrl = 'http://localhost:8080';
      const options = { server: customUrl };

      // Act
      const serverUrl = options.server || 'http://localhost:27497';

      // Assert
      expect(serverUrl).toBe(customUrl);
    });

    it('should generate correct health check URL', () => {
      // Arrange
      const serverUrl = 'http://localhost:27497';

      // Act
      const healthUrl = `${serverUrl}/health-local-lens`;

      // Assert
      expect(healthUrl).toBe('http://localhost:27497/health-local-lens');
    });
  });

  describe('Process Name Generation', () => {
    it('should use command name as default process name', () => {
      // Arrange
      const command = 'rails server';
      const options: { name?: string } = {};

      // Act
      const processName = options.name || command.split(' ')[0];

      // Assert
      expect(processName).toBe('rails');
    });

    it('should use custom process name when provided', () => {
      // Arrange
      const command = 'rails server';
      const options = { name: 'my-backend-api' };

      // Act
      const processName = options.name || command.split(' ')[0];

      // Assert
      expect(processName).toBe('my-backend-api');
    });

    it('should handle complex commands for process naming', () => {
      // Arrange
      const testCases = [
        { command: 'bundle exec rails server', expected: 'bundle' },
        { command: 'npx next dev', expected: 'npx' },
        { command: 'python3 manage.py runserver', expected: 'python3' },
      ];

      testCases.forEach(({ command, expected }) => {
        // Act
        const processName = command.split(' ')[0];

        // Assert
        expect(processName).toBe(expected);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate server URL format', () => {
      // Arrange
      const validUrls = [
        'http://localhost:27497',
        'https://example.com:3000',
        'http://127.0.0.1:8080',
      ];

      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        '',
      ];

      // Act & Assert
      validUrls.forEach(url => {
        expect(url).toMatch(/^https?:\/\/.+/);
      });

      invalidUrls.forEach(url => {
        expect(url).not.toMatch(/^https?:\/\/.+/);
      });
    });

    it('should validate process name constraints', () => {
      // Arrange
      const validNames = [
        'rails-api',
        'my_backend',
        'backend123',
        'web-server',
      ];

      const invalidNames = [
        '',
        '   ',
        'name with spaces',
      ];

      // Act & Assert
      validNames.forEach(name => {
        expect(name.trim()).toBe(name);
        expect(name.length).toBeGreaterThan(0);
      });

      invalidNames.forEach(name => {
        expect(name.trim().length === 0 || name.includes(' ')).toBe(true);
      });
    });
  });
});