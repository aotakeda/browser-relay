# Console Relay

**A 100% local Chrome extension and HTTP/MCP server for capturing and managing browser console logs.**

> ⚠️ **Important**: This tool is designed for local development use only. It runs entirely on your machine with no external connections or cloud services.

## Features

- **Chrome Extension**: Captures all console.log, warn, error, and info messages from any website
- **Local HTTP Server**: Express.js server with SQLite storage (port 8765) - no external connections
- **MCP Integration**: Access logs via Model Context Protocol tools in AI assistants
- **Real-time Streaming**: Server-Sent Events for live log monitoring
- **Persistent Storage**: Logs saved to local SQLite database file
- **Circular Buffer**: Automatic cleanup keeps only the latest 10k logs
- **Batch Processing**: Efficient log batching with retry logic
- **Type Safe**: Built with TypeScript for reliability
- **Privacy First**: All data stays on your machine

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Or build and start production mode
npm run build
npm start
```

The server will start on `http://localhost:8765`

### 3. Install Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` directory from this project
5. The extension will now capture console logs from all websites

### 4. Test the Setup

1. Visit any website
2. Open browser console (F12)
3. Type: `console.log("Hello from console logger!")`
4. Check server logs or use MCP tools to see captured logs

## HTTP API Endpoints

- `POST /logs` - Submit log batches from extension
- `GET /logs` - Query logs with filters (limit, offset, level, url, time range)
- `DELETE /logs` - Clear all stored logs
- `GET /logs/stream` - Real-time log stream via Server-Sent Events
- `GET /health` - Server health check

### API Examples

```bash
# Get recent logs
curl "http://localhost:8765/logs?limit=10"

# Get error logs only
curl "http://localhost:8765/logs?level=error"

# Get logs from specific URL
curl "http://localhost:8765/logs?url=example.com"

# Clear all logs
curl -X DELETE "http://localhost:8765/logs"
```

## MCP Integration

### Installing MCP in Claude Code, Cursor, etc.

**Option 1: Simple Installation in Claude Code:**

```bash
claude mcp add console-relay -- npx -y console-relay
```

**Manual Installation:**

1. Build the server:

   ```bash
   npm run build
   ```

2. Add to your Claude Code MCP configuration:

   ```json
   {
     "mcpServers": {
       "console-relay": {
         "command": "node",
         "args": ["path/to/console/server/dist/index.js"],
         "env": {
           "MCP_MODE": "true"
         }
       }
     }
   }
   ```

3. Restart Claude Code to load the MCP server.

### Available MCP Tools

Once the MCP server is running, you can use these tools:

#### `get_console_logs`

Retrieve console logs with optional filters.

**Parameters:**

- `limit` (number, default: 100) - Maximum number of logs to return
- `offset` (number, default: 0) - Number of logs to skip
- `level` (string) - Filter by log level: "log", "warn", "error", "info"
- `url` (string) - Filter by page URL (partial match)
- `startTime` (string) - Filter logs after this timestamp (ISO string)
- `endTime` (string) - Filter logs before this timestamp (ISO string)

**Examples:**

```javascript
// Get recent 50 logs
get_console_logs({ limit: 50 });

// Get only error logs
get_console_logs({ level: "error", limit: 100 });

// Get logs from specific website
get_console_logs({ url: "github.com" });

// Get logs from last hour
get_console_logs({
  startTime: "2025-01-01T10:00:00.000Z",
  endTime: "2025-01-01T11:00:00.000Z",
});
```

#### `search_logs`

Search console logs by text content.

**Parameters:**

- `query` (string, required) - Text to search for in log messages and stack traces
- `limit` (number, default: 100) - Maximum results to return

**Examples:**

```javascript
// Search for specific errors
search_logs({ query: "TypeError" });

// Search for function names
search_logs({ query: "handleClick" });
```

#### `clear_console_logs`

Clear all stored console logs.

**Parameters:** None

**Example:**

```javascript
clear_console_logs();
```

## Development

### Project Structure

```
console/
├── server/                 # HTTP/MCP Server
│   ├── src/               # TypeScript source code
│   │   ├── index.ts       # Main server entry point
│   │   ├── mcp/          # MCP server implementation
│   │   ├── routes/       # Express.js routes
│   │   ├── storage/      # Database and storage logic
│   │   └── types.ts      # TypeScript type definitions
│   ├── dist/             # Compiled JavaScript
│   ├── package.json      # Server dependencies
│   └── tsconfig.json     # TypeScript configuration
├── extension/            # Chrome Extension
│   ├── manifest.json     # Extension manifest (v3)
│   ├── content.js        # Console log capture script
│   ├── background.js     # Service worker for HTTP requests
│   └── icons/            # Extension icons and generation tools
├── package.json          # Root workspace configuration
└── README.md             # This file
```

### Development Commands

```bash
# Install all dependencies
npm install

# Run server in development mode (auto-reload)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Run tests
npm test
```

### Environment Variables

- `PORT` - Server port (default: 8765)
- `MCP_MODE` - Set to "true" to enable MCP server mode

## How It Works

1. **Chrome Extension** injects a content script that wraps `console.log`, `console.warn`, `console.error`, and `console.info`
2. **Log Capture** includes timestamp, message, stack trace, page URL, and log level
3. **Batching** collects logs and sends them every 5 seconds or when 50 logs are accumulated
4. **HTTP Server** receives log batches via POST requests and stores them in SQLite
5. **Circular Buffer** automatically removes old logs when storage exceeds 10,000 entries
6. **MCP Tools** provide programmatic access to query, search, and manage logs

## Troubleshooting

### Chrome Extension Issues

1. **Extension not capturing logs**

   - Check that the extension is enabled in `chrome://extensions/`
   - Reload the webpage after installing the extension
   - Check browser console for extension errors

2. **Server connection errors**
   - Ensure server is running on `http://localhost:8765`
   - Check for CORS errors in browser console
   - Verify no firewall is blocking the connection

### MCP Server Issues

1. **MCP tools not available**

   - Ensure `MCP_MODE=true` environment variable is set
   - Check that the server built successfully (`npm run build`)
   - Verify the path in Claude config is correct

2. **Connection errors**
   - Restart Claude Code after configuration changes
   - Check server logs for MCP initialization messages
   - Ensure server is running when Claude Code starts

### Server Issues

1. **Port already in use**

   ```bash
   PORT=3001 npm run dev
   ```

2. **TypeScript errors**

   ```bash
   npm run build
   ```

3. **Database issues**
   - Server uses persistent SQLite database in `data/console-logs.db`
   - Check server logs for database initialization errors
   - Use `DELETE /logs` endpoint to clear logs without restarting

## Privacy & Security

This tool is designed with privacy in mind:

- **100% Local**: No external servers, APIs, or cloud services
- **No Authentication**: Since it's local-only, no auth is needed
- **No Tracking**: Zero telemetry or usage tracking
- **Your Data**: All logs stored locally in `data/console-logs.db`
- **Port 8765**: Runs only on localhost, not accessible externally

## License

MIT License - see LICENSE file for details.
