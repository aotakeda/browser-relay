import chalk from 'chalk';

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  stackTrace?: string;
  pageUrl: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface LogForwarderState {
  serverUrl: string;
  processName: string;
  verbose: boolean;
  logMessages: string[];
  flushInterval: NodeJS.Timeout | null;
  maxBufferSize: number;
  flushIntervalMs: number;
}

export function createLogForwarder(serverUrl: string, processName: string, verbose = true) {
  const state: LogForwarderState = {
    serverUrl,
    processName,
    verbose,
    logMessages: [],
    flushInterval: null,
    maxBufferSize: 1000,
    flushIntervalMs: 5000
  };

  const flushLogs = async () => {
    if (state.logMessages.length === 0) {
      return;
    }

    const messagesToSend = [...state.logMessages];
    state.logMessages = [];

    // Combine all messages into a single log entry
    const combinedMessage = messagesToSend.join('\n');
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'log',
      message: combinedMessage,
      pageUrl: `process://${state.processName}`,
      userAgent: 'local-lens-cli',
      metadata: {
        source: 'backend-console',
        backendProcess: state.processName,
        pid: process.pid,
        captureMethod: 'local-lens-cli',
        messageCount: messagesToSend.length
      }
    };

    try {
      const response = await fetch(`${state.serverUrl}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logs: [logEntry],
          sessionId: `local-lens-cli-${state.processName}-${Date.now()}`
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      if (state.verbose && messagesToSend.length > 0) {
        console.log(chalk.gray(`[Local Lens] Sent batched log with ${messagesToSend.length} messages`));
      }

    } catch (error) {
      if (state.verbose) {
        console.error(chalk.red(`[Local Lens] Failed to send logs: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
      
      // Put messages back in buffer for retry (but limit total buffer size)
      state.logMessages = [...messagesToSend.slice(-state.maxBufferSize), ...state.logMessages];
      if (state.logMessages.length > state.maxBufferSize) {
        state.logMessages = state.logMessages.slice(-state.maxBufferSize);
      }
    }
  };

  const forwardLog = (_level: 'log' | 'warn' | 'error' | 'info', message: string) => {
    const lines = message.trim().split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        state.logMessages.push(line.trim());

        // Flush if buffer is full
        if (state.logMessages.length >= state.maxBufferSize) {
          flushLogs();
        }
      }
    }
  };

  const stop = async () => {
    if (state.flushInterval) {
      clearInterval(state.flushInterval);
      state.flushInterval = null;
    }
    await flushLogs();
  };

  // Set up periodic flushing
  state.flushInterval = setInterval(flushLogs, state.flushIntervalMs);

  // Flush on process exit
  process.on('beforeExit', () => {
    flushLogs();
    if (state.flushInterval) {
      clearInterval(state.flushInterval);
    }
  });

  return {
    forwardLog,
    stop
  };
}