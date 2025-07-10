# Browser Relay

**A 100% local Chrome extension and HTTP/MCP server for capturing browser console logs and network requests for LLM analysis.**

> ⚠️ **Important**: This tool is designed for local development use only. It runs entirely on your machine with no external connections or cloud services.

## Features

- **Console Log Capture**: All console.log, warn, error, and info messages from any website
- **Network Request Monitoring**: HTTP requests with headers, request/response bodies, and timing data
- **Response Body Capture**: Full response content for JSON, HTML, XML, and JavaScript requests
- **LLM-Optimized Output**: Structured JSON logs designed for AI assistant analysis
- **Domain Filtering**: Capture logs only from specified domains
- **Local HTTP Server**: Express.js server with SQLite storage (runs on port 27497) - no external connections
- **MCP Integration**: Access logs via Model Context Protocol tools in AI assistants (Claude, Cursor, etc.)
- **Real-time Streaming**: Server-Sent Events for live log monitoring
- **Persistent Storage**: Logs and requests saved to local SQLite database
- **Circular Buffer**: Automatic cleanup keeps only the latest 10k entries
- **Batch Processing**: Efficient batching with retry logic and page load optimization
- **Privacy First**: All data stays on your machine, zero external connections

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
# Development mode with auto-reload (builds everything automatically)
npm run dev
```

The server will start on `http://localhost:27497` (fixed port, not configurable)

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
    "truncated": false,
    "original_length": 2048
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

- **Response Body Capture**: Intercepts and captures response bodies for text-based content types
- **JSON Detection**: Automatically parses and prettifies JSON content
- **Text Handling**: Preserves plain text with truncation info for large content
- **Content Type Filtering**: Only captures response bodies for JSON, HTML, XML, and JavaScript
- **Size Management**: Limits response bodies to 50KB to prevent memory issues
- **Encoded Data**: Detects base64/encoded content and provides metadata instead of raw data
- **Status Categorization**: Maps HTTP status codes to semantic categories

## MCP Integration

### Using with Claude Code

The MCP server allows you to access captured logs directly from Claude Code for analysis and debugging. The MCP server is enabled by default when you start the Browser Relay server and shares the same database as the main server.

**Prerequisites:**

1. Start the server: `npm run dev` (builds everything automatically)
2. Ensure the Chrome extension is capturing data

**Installation:**

Use the Claude Code CLI to add the MCP server:

```bash
claude mcp add browser-relay node ~/console/server/dist-mcp/mcp-standalone.js
```

Replace `~` with your home directory path if needed, or use the full absolute path.

**Alternative Installation Methods:**

For project-specific configuration (shared with team):

```bash
claude mcp add browser-relay node ~/console/server/dist-mcp/mcp-standalone.js --scope project
```

For user-wide configuration (available in all projects):

```bash
claude mcp add browser-relay node ~/console/server/dist-mcp/mcp-standalone.js --scope user
```

**Verify Installation:**

```bash
claude mcp list
```

You should see `browser-relay` in the list of configured servers.

**Remove Server:**

```bash
claude mcp remove browser-relay
```

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

### Architecture

### High-Level Structure

- **Chrome Extension**: Manifest v3 extension with service worker and content scripts
- **Local Server**: HTTP/MCP server running on fixed port 27497
- **SQLite Database**: Local persistence with intelligent filtering and circular buffer (10k entries)
- **Monorepo**: Root workspace managing server and extension subprojects

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

### Key Components

- `extension/`: Chrome extension with background service worker and dual content scripts
- `server/`: Node.js/Express server with MCP integration and SQLite storage
- `server/src/storage/`: Database layer with LogStorage class and schema management
- `server/src/mcp/`: MCP server implementation for AI assistant access
- `server/src/routes/`: HTTP API endpoints for log retrieval and filtering

### Development Commands

```bash
# Install all dependencies
npm install

# Development mode (builds everything automatically, watches files)
npm run dev

# Production mode (builds everything automatically)
npm start

# Build everything manually
npm run build

# Build only MCP server
npm run build:mcp

# Build both HTTP and MCP servers
npm run build:all

# Run all tests
npm test

# Run linting
npm run lint

# Server-specific commands
npm run test:server     # Run server tests only
npm run dev:server      # Start server in development mode
npm run build:server    # Build server only
```

### UI Configuration

All Browser Relay settings are managed through the extension popup interface:

#### Domain Configuration

- **All Domains Mode**: Captures from all websites (default)
- **Specific Domains Mode**: Only captures from domains you specify
- **Add/Remove Domains**: Use the extension popup to manage your domain list
- **Subdomain Support**: Specified domains automatically include subdomains (e.g., `github.com` includes `gist.github.com`)

#### Capture Controls

- **Console Logs**: Toggle console log capture on/off
- **Network Requests**: Toggle network request monitoring on/off
- **MCP Server**: Enable/disable Model Context Protocol for AI assistants

#### Data Management

- **Clear Console Logs**: Remove all stored console logs
- **Clear Network Requests**: Remove all stored network requests

All settings are saved automatically and persist across browser sessions. No server restart required for configuration changes.

## How It Works

### Console Log Capture

1. **Extension** injects scripts that wrap `console.log`, `console.warn`, `console.error`, and `console.info`
2. **Smart Filtering** automatically excludes Browser Relay's own logs
3. **Page Load Optimization** buffers logs during page load, sends after completion
4. **Structured Data** includes timestamp, message, stack trace, page URL, and browser info

### Network Request Monitoring

1. **JavaScript Interception** captures fetch() and XMLHttpRequest calls in the page's main context
2. **Response Body Capture** reads full response content for text-based requests (JSON, HTML, XML, JS)
3. **Comprehensive Data** records method, URL, headers, request/response bodies, status codes, and timing
4. **Intelligent Filtering** excludes images, fonts, analytics, tracking, and binary content
5. **Memory Optimization** limits response bodies to 50KB with truncation indicators
6. **Request Correlation** tracks full request lifecycle from start to completion

### Data Processing

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
   - Check the extension popup to ensure console logs are enabled
   - Verify the current domain is included in your capture scope (check the popup "Capture Scope" section)

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

4. **Domain filtering issues**
   - Open the Browser Relay extension popup
   - Check the "Capture Scope" section to see your current configuration
   - If using "Specific Domains" mode, verify the current domain is in your list
   - Add domains using the input field in the popup
   - Subdomains are automatically included (e.g., `github.com` includes `gist.github.com`)
   - Switch to "All Domains" mode if you want to capture from all websites

### MCP Server Issues

1. **MCP tools not available**

   - Check that the MCP server is enabled in the extension popup
   - Check that the server built successfully (`npm run build`)
   - Verify the path in Claude config is correct
   - Check that the server is running and accessible at `http://localhost:27497`

2. **Connection errors**
   - Check that the server is running and accessible at `http://localhost:27497`
   - Check that the MCP server is enabled in the extension popup
   - Check server logs for MCP initialization messages
   - Ensure server is running when Claude Code starts
   - Restart Claude Code after configuration changes

### Server Issues

1. **Port already in use**

   - The server runs on port 27497 and is not configurable
   - Stop any other service using port 27497

2. **TypeScript errors**

   ```bash
   npm run build
   ```

3. **Database issues**
   - Server uses persistent SQLite database in `server/data/browserrelay.db`
   - Check server logs for database initialization errors
   - Use `DELETE /logs` endpoint to clear logs without restarting

### Testing

- **Jest**: TypeScript testing with memory database for isolation
- **Integration Tests**: Full server lifecycle testing
- **Unit Tests**: Storage, routes, and MCP components
- **Test Setup**: Automatic database cleanup and proper async handling

## Privacy & Security

This tool is designed with privacy in mind:

- **100% Local**: No external servers, APIs, or cloud services
- **No Authentication**: Since it's local-only, no auth is needed
- **No Tracking**: Zero telemetry or usage tracking
- **Your Data**: All logs stored locally in `server/data/browserrelay.db`
- **Port 27497**: Runs only on localhost, not accessible externally

## License

MIT License - see LICENSE file for details.
