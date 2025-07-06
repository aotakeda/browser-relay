# Browser Relay

**A 100% local Chrome extension and HTTP/MCP server for capturing browser console logs and network requests for LLM analysis.**

> ⚠️ **Important**: This tool is designed for local development use only. It runs entirely on your machine with no external connections or cloud services.

## Features

- **🖥️ Console Log Capture**: All console.log, warn, error, and info messages from any website
- **🌐 Network Request Monitoring**: HTTP requests with headers, payloads, responses, and timing
- **🤖 LLM-Optimized Output**: Structured JSON logs designed for AI assistant analysis
- **🧹 Smart Noise Filtering**: Automatically filters out images, tracking, and irrelevant requests
- **🎯 Domain Filtering**: Capture logs only from specified domains
- **📊 Local HTTP Server**: Express.js server with SQLite storage (runs on port 27497) - no external connections
- **🔌 MCP Integration**: Access logs via Model Context Protocol tools in AI assistants (Claude, Cursor, etc.)
- **⚡ Real-time Streaming**: Server-Sent Events for live log monitoring
- **💾 Persistent Storage**: Logs and requests saved to local SQLite database
- **🔄 Circular Buffer**: Automatic cleanup keeps only the latest 10k entries
- **📦 Batch Processing**: Efficient batching with retry logic and page load optimization
- **🔒 Privacy First**: All data stays on your machine, zero external connections

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

The server will start on `http://localhost:27497`

### 3. Install Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` directory from this project
5. The extension will now capture console logs from all websites

### 4. Test the Setup

1. Visit any website
2. Open browser console (F12)
3. Type: `console.log("Hello from Browser Relay!")`
4. Check server logs or use MCP tools to see captured logs

## HTTP API Endpoints

### Console Logs

- `POST /logs` - Submit log batches from extension
- `GET /logs` - Query logs with filters (limit, offset, level, url, time range)
- `DELETE /logs` - Clear all stored logs
- `GET /logs/stream` - Real-time log stream via Server-Sent Events

### Network Requests

- `POST /network-requests` - Submit network request batches from extension
- `GET /network-requests` - Query network requests with filters (limit, offset, method, url, status, time range)
- `GET /network-requests/:id` - Get specific network request by ID
- `DELETE /network-requests` - Clear all stored network requests
- `GET /network-requests/stream` - Real-time network request stream via Server-Sent Events

### System

- `GET /health` - Server health check
- `GET /allowed-domains` - Check domain filtering configuration

### API Examples

```bash
# Console Logs
curl "http://localhost:27497/logs?limit=10"                    # Recent logs
curl "http://localhost:27497/logs?level=error"                # Error logs only
curl "http://localhost:27497/logs?url=example.com"            # Logs from specific site
curl -X DELETE "http://localhost:27497/logs"                  # Clear all logs

# Network Requests
curl "http://localhost:27497/network-requests?limit=10"       # Recent requests
curl "http://localhost:27497/network-requests?method=POST"    # POST requests only
curl "http://localhost:27497/network-requests?status=404"     # Failed requests
curl -X DELETE "http://localhost:27497/network-requests"      # Clear all requests
```

## JSON Output Format

Browser Relay outputs all logs and network requests in structured JSON format for easy programmatic analysis. This enables AI assistants and other tools to effectively parse and understand the captured data.

### Console Logs JSON Structure

```json
{
  "type": "console_log",
  "level": "info|warn|error",
  "hostname": "example.com", 
  "timestamp": "2023-01-01T00:00:00.000Z",
  "page_url": "https://example.com/page",
  "message": "Log message content",
  "stack_trace": "Error stack trace (if error)",
  "user_agent": "Browser user agent string (if available)",
  "browser": "Chrome|Firefox|Safari|Edge (if user_agent available)",
  "metadata": { "custom": "data objects (if available)" }
}
```

### Network Requests JSON Structure

```json
{
  "type": "network_request",
  "method": "GET|POST|PUT|DELETE|...",
  "url": "https://api.example.com/endpoint",
  "hostname": "api.example.com",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "status": {
    "code": 200,
    "category": "success|client_error|server_error|redirect|pending|unknown"
  },
  "duration_ms": 150,
  "request_headers": { "Content-Type": "application/json" },
  "request_body": {
    "type": "json|text|encoded_data",
    "data": "processed content",
    "truncated": false,
    "original_length": 1024
  },
  "response_headers": { "Content-Type": "application/json" },
  "response_body": {
    "type": "json|text|encoded_data", 
    "data": "processed content",
    "truncated": false
  },
  "response_size": 2048,
  "context": {
    "is_api_endpoint": true,
    "is_authenticated": false,
    "user_agent": "Browser user agent",
    "page_url": "https://example.com"
  }
}
```

### Smart Content Processing

- **JSON Detection**: Automatically parses and prettifies JSON content
- **Text Handling**: Preserves plain text with truncation info for large content
- **Encoded Data**: Detects base64/encoded content and provides metadata instead of raw data
- **Size Management**: Intelligently truncates large content while preserving structure
- **Status Categorization**: Maps HTTP status codes to semantic categories

## MCP Integration

### Installing MCP in Claude Code, Cursor, etc.

**Option 1: Simple Installation in Claude Code:**

```bash
claude mcp add browser-relay -- npx -y browser-relay
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
       "browser-relay": {
         "command": "node",
         "args": ["path/to/browser-relay/server/dist/index.js"],
         "env": {
           "MCP_MODE": "true"
         }
       }
     }
   }
   ```

3. Restart Claude Code to load the MCP server.

### Available MCP Tools

Once the MCP server is running, you can use these tools to analyze captured data:

#### `get_console_logs`

Retrieve console logs with optional filters.

```javascript
// Get recent error logs
get_console_logs({ level: "error", limit: 50 });

// Get logs from specific website
get_console_logs({ url: "github.com" });

// Get logs from time range
get_console_logs({
  startTime: "2025-01-01T10:00:00.000Z",
  endTime: "2025-01-01T11:00:00.000Z",
});
```

#### `get_network_requests`

Retrieve network requests with optional filters.

```javascript
// Get recent API calls
get_network_requests({ url: "/api/", limit: 20 });

// Get failed requests
get_network_requests({ statusCode: 404 });

// Get POST requests
get_network_requests({ method: "POST" });
```

#### `search_logs`

Search console logs by text content.

```javascript
// Search for specific errors
search_logs({ query: "TypeError" });

// Search for function names
search_logs({ query: "handleClick" });
```

#### `search_network_requests`

Search network requests by URL, headers, or body content.

```javascript
// Search for API endpoints
search_network_requests({ query: "graphql" });

// Search for authentication requests
search_network_requests({ query: "authorization" });
```

#### `clear_console_logs` / `clear_network_requests`

Clear all stored data.

```javascript
clear_console_logs();
clear_network_requests();
```

## Development

### Project Structure

```
browser-relay/
├── server/                    # HTTP/MCP Server
│   ├── src/                  # TypeScript source code
│   │   ├── index.ts          # Main server entry point
│   │   ├── mcp/             # MCP server implementation
│   │   ├── routes/          # Express.js routes
│   │   │   ├── logs.ts      # Console log endpoints
│   │   │   └── network-requests.ts # Network request endpoints
│   │   ├── storage/         # Database and storage logic
│   │   │   ├── database.ts  # SQLite setup
│   │   │   ├── LogStorage.ts # Console log storage
│   │   │   └── NetworkStorage.ts # Network request storage
│   │   └── types.ts         # TypeScript type definitions
│   ├── dist/               # Compiled JavaScript
│   ├── data/               # SQLite database files
│   ├── package.json        # Server dependencies
│   └── tsconfig.json       # TypeScript configuration
├── extension/              # Chrome Extension
│   ├── manifest.json       # Extension manifest (v3)
│   ├── inject.js          # Console log capture (MAIN world)
│   ├── content.js         # Message relay (ISOLATED world)
│   ├── background.js      # Service worker + network capture
│   └── icons/             # Extension icons
├── package.json            # Root workspace configuration
└── README.md               # This file
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

- `MCP_MODE` - Set to "true" to enable MCP server mode
- `ALLOWED_DOMAINS` - Comma-separated list of domains to capture from (if not set, captures from all domains)
- `LOG_CONSOLE_MESSAGES` - Set to "false" to disable console message logging to server output (default: true)
- `LOG_NETWORK_REQUESTS` - Set to "false" to disable network request logging to server output (default: true)

**Note:** The server runs on port 27497 and is not configurable. You must restart the server after changing environment variables for changes to take effect.

### Example Environment Configuration

Create a `.env` file in the server directory:

```bash
# Server configuration
MCP_MODE=true

# Only capture from these domains (optional) - supports subdomains
ALLOWED_DOMAINS=localhost,github.com,stackoverflow.com

# Control what gets logged to server output for LLM visibility
LOG_CONSOLE_MESSAGES=true  # Show console logs in server output
LOG_NETWORK_REQUESTS=true  # Show network requests in server output
```

If `ALLOWED_DOMAINS` is not set, the extension will capture from all websites. When set, it only captures from specified domains and their subdomains.

## How It Works

### 🖥️ Console Log Capture

1. **Extension** injects scripts that wrap `console.log`, `console.warn`, `console.error`, and `console.info`
2. **Smart Filtering** automatically excludes Browser Relay's own logs and noise
3. **Page Load Optimization** buffers logs during page load, sends after completion
4. **Structured Data** includes timestamp, message, stack trace, page URL, and browser info

### 🌐 Network Request Monitoring

1. **webRequest API** intercepts all HTTP requests from websites
2. **Comprehensive Capture** records method, URL, headers, payloads, responses, timing
3. **Intelligent Filtering** excludes images, fonts, analytics, tracking, and encoded noise
4. **Request Correlation** tracks full request lifecycle from start to completion

### 📊 Data Processing

1. **Batching** efficiently collects 50 items or 5-second intervals
2. **Local Storage** saves everything to SQLite database (10k item circular buffer)
3. **LLM-Optimized Output** structures logs as JSON with intelligent content processing
4. **Real-time Streaming** provides live updates via Server-Sent Events
5. **MCP Integration** enables AI assistant access for analysis and debugging

## Troubleshooting

### Chrome Extension Issues

1. **Extension not capturing logs**

   - Check that the extension is enabled in `chrome://extensions/`
   - Reload the webpage after installing the extension
   - Check browser console for extension errors
   - Look for `[Browser Relay]` debug messages in the browser console
   - Verify the current domain is in your allow-list (if configured)

2. **Debug logging not working**

   - Open Chrome DevTools (F12) and go to the Console tab
   - You should see `[Browser Relay] Initialized on domain.com` messages
   - Try running `console.log("test")` - you should see capture messages
   - Check the Extensions page and click "service worker" next to Browser Relay to see background script logs

3. **Server connection errors**

   - Ensure server is running on `http://localhost:27497`
   - Check for CORS errors in browser console
   - Verify no firewall is blocking the connection
   - Check server logs for incoming requests

4. **Domain allow-list issues**
   - Check if `ALLOWED_DOMAINS` environment variable is set
   - Verify the current domain matches your allow-list
   - Subdomains are automatically included (e.g., `github.com` includes `gist.github.com`)

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

   - The server runs on port 27497 and is not configurable
   - Stop any other service using port 27497

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
- **Port 27497**: Runs only on localhost, not accessible externally

## License

MIT License - see LICENSE file for details.
