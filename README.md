# Local Lens

**A 100% local development monitoring tool that captures both browser and server logs for LLM analysis.**

> ⚠️ **Important**: This tool is designed for local development use only. It runs entirely on your machine with no external connections or cloud services.

## Features

### 🌐 Browser Monitoring

- **Console Log Capture**: All console.log, warn, error, and info messages from any website
- **Network Request Monitoring**: HTTP requests with headers, request/response bodies, and timing data
- **Response Body Capture**: Full response content for JSON, HTML, XML, and JavaScript requests
- **Domain Filtering**: Capture logs only from specified domains

### 🖥️ Server Log Capture

- **Universal Backend Support**: Works with Rails, Express, Django, FastAPI, Laravel, and any framework
- **Real-time Log Forwarding**: Captures stdout/stderr from any server process
- **Zero Configuration**: No code changes or framework-specific setup required
- **Process Management**: Graceful start/stop with proper signal handling

### 🔧 Development Integration

- **CLI Tool**: Simple `local-lens capture "your-server-command"` wrapper
- **LLM-Optimized Output**: Structured JSON logs designed for AI assistant analysis
- **Local HTTP Server**: Express.js server with SQLite storage (runs on port 27497) - no external connections
- **MCP Integration**: Access logs via Model Context Protocol tools in AI assistants (Claude, Cursor, etc.)
- **Real-time Streaming**: Server-Sent Events for live log monitoring
- **Persistent Storage**: Logs and requests saved to local SQLite database
- **Circular Buffer**: Automatic cleanup keeps only the latest 10k entries
- **Batch Processing**: Efficient batching with retry logic and page load optimization
- **Privacy First**: All data stays on your machine, zero external connections

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **Chrome Browser**: For the browser monitoring extension
- **npm**: Package manager (comes with Node.js)

## Package Structure

Local Lens consists of two main npm packages:

1. **`local-lens`** (Server/MCP Package)
   - Contains the HTTP server and MCP server
   - Binary: `local-lens` (for MCP integration)
   - Used for: MCP integration with Claude Code/Cursor
   - Install: `npm install -g local-lens` (for MCP)

2. **`local-lens-cli`** (CLI Tool Package)  
   - Contains the CLI tool for server log capture
   - Binary: `local-lens` (for CLI commands)
   - Used for: Wrapping backend server commands
   - Install: `npm install -g local-lens-cli` (for CLI)

**Important**: Both packages provide a `local-lens` binary but for different purposes. The server package is for MCP integration, while the CLI package is for capturing server logs.

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
5. Configure domains in the extension popup to start capturing (no domains are captured by default)

### 4. Test Browser Monitoring

1. Click the Local Lens extension icon and add a domain (e.g., `localhost:3000`)
2. Visit that domain
3. Open browser console (F12)
4. Type: `console.log("Hello from Local Lens!")`
5. Check server logs, use MCP tools to see captured logs or hit the API endpoints to see the data

### 5. Test Server Log Capture

1. Install the CLI tool globally (`npm install -g local-lens-cli`) or use with npx
2. Start any server with log capture:

   ```bash
   # Rails server
   local-lens capture "rails server"
   # or with npx
   npx local-lens-cli capture "rails server"

   # Express/Node.js
   local-lens capture "npm start"
   # or with npx
   npx local-lens-cli capture "npm start"

   # Django
   local-lens capture "python manage.py runserver"
   # or with npx
   npx local-lens-cli capture "python manage.py runserver"

   # FastAPI
   local-lens capture "uvicorn main:app --reload"
   # or with npx
   npx local-lens-cli capture "uvicorn main:app --reload"
   ```

   **Note**: The CLI binary is `local-lens` (installed from the `local-lens-cli` package)

3. Your backend server logs will now appear in Local Lens with `source: "backend-console"`

## CLI Tool for Server Log Capture

The Local Lens CLI tool provides universal backend log capture that works with any framework without code modifications.

### Installation

Install the CLI tool globally:

```bash
npm install -g local-lens-cli
```

Or use with npx (no installation required):

```bash
npx local-lens-cli capture "your-server-command"
```

Or build locally:

```bash
npm run build:all
```

### Basic Usage

Wrap any server command with `local-lens capture` (if installed globally) or `npx local-lens-cli capture`:

```bash
# Rails server
local-lens capture "rails server"
# or with npx
npx local-lens-cli capture "rails server"

# Express/Node.js with custom port
local-lens capture "npm start" "--" "--port" "4000"
# or with npx
npx local-lens-cli capture "npm start" "--" "--port" "4000"

# Django development server
local-lens capture "python manage.py runserver"
# or with npx
npx local-lens-cli capture "python manage.py runserver"

# FastAPI with reload
local-lens capture "uvicorn main:app --reload"
# or with npx
npx local-lens-cli capture "uvicorn main:app --reload"

# Any command with custom process name
local-lens capture "rails server" --name "my-api"
# or with npx
npx local-lens-cli capture "rails server" --name "my-api"
```

**Package Distinction**: The CLI binary is named `local-lens` but comes from the `local-lens-cli` npm package.

### CLI Options

- `--name <name>`: Custom process name for logs (default: command name)
- `--server <url>`: Local Lens server URL (default: http://localhost:27497)
- `--silent`: Suppress Local Lens output messages

### Status Check

Check if Local Lens server is running:

```bash
local-lens status
# or with npx
npx local-lens-cli status
```

**Note**: The `local-lens` binary is provided by the `local-lens-cli` package.

### How It Works

1. **Process Wrapping**: CLI spawns your server process and captures stdout/stderr
2. **Log Formatting**: Formats logs with Local Lens schema and metadata
3. **Real-time Forwarding**: Sends logs to Local Lens server via HTTP API
4. **Source Tagging**: Tags all logs with `source: "backend-console"` for filtering

### Process Management

- **Graceful Shutdown**: Ctrl+C properly terminates the wrapped process
- **Signal Forwarding**: SIGTERM and SIGINT are forwarded to your server
- **Exit Codes**: Preserves original process exit codes
- **Error Handling**: Captures and reports process startup errors

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
- `GET /health-local-lens` - Special health check for extension port detection
- `GET /config` - Get server configuration for extension
- `POST /mcp-config` - Update MCP server configuration

### Settings

- `GET /settings` - Retrieve extension settings
- `POST /settings` - Update extension settings
- `DELETE /settings` - Reset settings to defaults
- `GET /settings/:key` - Get specific setting value
- `PUT /settings/:key` - Update specific setting value

### Network Configuration

- `GET /network-config` - Get network capture configuration
- `POST /network-config` - Update network capture configuration
- `POST /network-config/reset` - Reset network config to defaults

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

# Settings
curl "http://localhost:27497/settings"                       # Get all settings
curl -X POST "http://localhost:27497/settings" \             # Update settings
  -H "Content-Type: application/json" \
  -d '{"specificDomains": ["localhost:3000"]}'
curl "http://localhost:27497/settings/specificDomains"       # Get specific setting
curl -X DELETE "http://localhost:27497/settings"             # Reset to defaults
```

## JSON Output Format

Local Lens outputs all logs and network requests in structured JSON format for easy programmatic analysis. This enables AI assistants and other tools to effectively parse and understand the captured data.

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

**Package Distinction**: MCP integration uses the `local-lens` package (server/MCP), NOT the `local-lens-cli` package (CLI tool).

<details>
<summary><strong>Using with Claude Code</strong></summary>

First install the MCP server package globally, then add it to Claude Code:

```bash
# Install the MCP server package (not the CLI package)
npm install -g local-lens

# Add to Claude Code
claude mcp add local-lens -- local-lens
```

**Verify Installation:**

```bash
claude mcp list
```

You should see `local-lens` in the list of configured servers.

**Remove Server:**

```bash
claude mcp remove local-lens
```

**Important**: This uses the `local-lens` package (server with MCP support), not `local-lens-cli`.

</details>

<details>
<summary><strong>Using with Cursor</strong></summary>

First install the MCP server package globally, then add the following to your `~/.cursor/mcp.json` file:

```bash
# Install the MCP server package (not the CLI package)
npm install -g local-lens
```

```json
{
  "mcpServers": {
    "local-lens": {
      "command": "local-lens"
    }
  }
}
```

**Important**: This uses the `local-lens` package (server with MCP support), not `local-lens-cli`.

</details>

The MCP server allows you to access captured logs directly from Claude Code or Cursor for analysis and debugging. The MCP server is enabled by default when you start the Local Lens server and shares the same database as the main server.

**Prerequisites:**

1. Start the server: `npm run dev` (builds everything automatically)
2. Ensure the Chrome extension is capturing data

### How to trigger the MCP server

`Check the console logs in local-lens and fix the errors being triggered`
`Check the network requests in local-lens and fix the errors being triggered`

### Available MCP Tools

Once the MCP server is running, you can use these tools to analyze captured data:

#### `get_console_logs`

Retrieve console logs with optional filters.

```javascript
// Get recent error logs from browser
get_console_logs({ level: "error", limit: 50 });

// Get logs from specific website
get_console_logs({ url: "github.com" });

// Get backend server logs only
get_console_logs({ url: "process://" });

// Get logs from specific backend process
get_console_logs({ url: "process://rails-api" });

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
// Search for specific errors across all sources
search_logs({ query: "TypeError" });

// Search for function names in browser logs
search_logs({ query: "handleClick" });

// Search for database queries in backend logs
search_logs({ query: "SELECT" });

// Search for errors in a specific backend process
search_logs({ query: "error", url: "process://rails-api" });
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

## Combined Browser & Server Monitoring

Local Lens provides comprehensive full-stack development monitoring by capturing both browser-side and server-side activity:

### Complete Development Workflow

1. **Start Local Lens Server**:

   ```bash
   npm run dev
   ```

2. **Configure Browser Monitoring**:

   - Install the Chrome extension
   - Add your frontend domains (e.g., `localhost:3000`)
   - Browser console logs and network requests will be captured

3. **Start Backend with Log Capture**:

   ```bash
   # Build CLI tool first
   npm run build:all

   # Start your backend with log capture
   local-lens capture "rails server" --name "backend-api"
   # or with npx (no installation required)
   npx local-lens-cli capture "rails server" --name "backend-api"
   ```

   **Note**: The `local-lens` binary is provided by the `local-lens-cli` package.

4. **Full-Stack Debugging with MCP Tools**:

   ```javascript
   // Get all recent errors from both frontend and backend
   get_console_logs({ level: "error", limit: 20 });

   // Search for API-related issues across both sides
   search_logs({ query: "api" });
   search_network_requests({ query: "/api/" });

   // Monitor specific backend process logs
   get_console_logs({ url: "process://backend-api" });

   // Track frontend network requests to your API
   get_network_requests({ url: "localhost:3000" });
   ```

### Data Source Identification

All captured data is tagged with source information for easy filtering:

- **Browser Logs**: `pageUrl` contains the actual website URL
- **Server Logs**: `pageUrl` contains `process://[process-name]`
- **Network Requests**: Captured only from browser (server HTTP calls would need separate tooling)

### AI-Powered Analysis

Use the MCP tools with AI assistants to:

- Correlate frontend errors with backend logs
- Identify API call failures and their server-side causes
- Debug full-stack workflows end-to-end
- Monitor performance across both client and server

## Development

### Architecture

### High-Level Structure

- **Chrome Extension**: Manifest v3 extension with service worker and content scripts
- **Local Server**: HTTP/MCP server running on fixed port 27497
- **SQLite Database**: Local persistence with intelligent filtering and circular buffer (10k entries)
- **Monorepo**: Root workspace managing server and extension subprojects

### Project Structure

```
local-lens/
├── server/                    # HTTP/MCP Server
│   ├── src/                  # TypeScript source code
│   │   ├── index.ts          # Main server entry point
│   │   ├── mcp-standalone.ts # MCP standalone entry
│   │   ├── mcp.ts           # MCP server setup
│   │   ├── types.ts         # TypeScript type definitions
│   │   ├── __tests__/       # Server test files
│   │   ├── mcp/             # MCP server implementation
│   │   │   └── server.ts
│   │   ├── routes/          # Express.js routes
│   │   │   ├── logs.ts      # Console log endpoints
│   │   │   ├── network-requests.ts # Network request endpoints
│   │   │   ├── network-config.ts # Network configuration endpoints
│   │   │   ├── settings.ts  # Settings management endpoints
│   │   │   └── __tests__/   # Route test files
│   │   ├── storage/         # Database and storage logic
│   │   │   ├── database.ts  # SQLite setup
│   │   │   ├── LogStorage.ts # Console log storage
│   │   │   ├── NetworkStorage.ts # Network request storage
│   │   │   ├── SettingsStorage.ts # Settings storage
│   │   │   ├── settings-database.ts # Settings database
│   │   │   └── __tests__/   # Storage test files
│   │   ├── services/        # Service layer
│   │   └── utils/           # Utility functions
│   │       ├── colorizer.ts # Log colorization
│   │       └── logger.ts    # Logging utilities
│   ├── dist/               # Compiled JavaScript (HTTP server)
│   ├── dist-mcp/           # Compiled JavaScript (MCP server)
│   ├── data/               # SQLite database files
│   │   ├── browserrelay.db # Main database
│   │   └── browserrelay-settings.db # Settings database
│   ├── package.json        # Server dependencies
│   ├── package.mcp.json    # MCP package configuration
│   ├── tsconfig.json       # TypeScript configuration
│   ├── tsconfig.mcp.json   # MCP TypeScript configuration
│   └── jest.config.js      # Jest test configuration
├── cli/                    # CLI Tool for Server Log Capture
│   ├── src/                # TypeScript source code
│   │   ├── index.ts        # CLI main entry point
│   │   └── log-forwarder.ts # Log forwarding logic
│   ├── dist/               # Compiled JavaScript
│   │   ├── index.js        # CLI executable
│   │   └── log-forwarder.js # Compiled forwarder
│   ├── package.json        # CLI dependencies
│   ├── tsconfig.json       # TypeScript configuration
│   └── README.md           # CLI documentation
├── extension/              # Chrome Extension
│   ├── manifest.json       # Extension manifest (v3)
│   ├── inject.js          # Console log capture (MAIN world)
│   ├── content.js         # Message relay (ISOLATED world)
│   ├── background.js      # Service worker + network capture
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Extension popup logic
│   ├── icons/             # Extension icons
│   ├── package.json       # Extension dependencies
│   ├── jest.config.js     # Jest test configuration
│   ├── jest.setup.js      # Jest test setup
│   └── tests/             # Extension test files
│       ├── domain-filtering.test.js
│       └── race-condition.test.js
├── package.json            # Root workspace configuration
├── CLAUDE.md               # Project instructions for AI assistants
├── eslint.config.js        # ESLint configuration
└── README.md               # This file
```

### Key Components

- `cli/`: Universal CLI tool for server log capture from any backend framework
- `extension/`: Chrome extension with background service worker, dual content scripts, and popup UI
- `server/`: Node.js/Express server with MCP integration and SQLite storage
- `server/src/storage/`: Database layer with LogStorage, NetworkStorage, and SettingsStorage classes
- `server/src/mcp/`: MCP server implementation for AI assistant access
- `server/src/routes/`: HTTP API endpoints for logs, network requests, settings, and configuration
- `server/src/services/`: Service layer for business logic
- `server/src/utils/`: Utility functions for logging and colorization
- `extension/popup.*`: Extension popup interface for configuration and data management

### Development Commands

```bash
# Install all dependencies
npm install

# Development mode (builds everything automatically, watches files)
npm run dev

# Build everything manually
npm run build

# Build only MCP server
npm run build:mcp

# Build both HTTP and MCP servers
npm run build:all

# Run linting
npm run lint

# Server-specific commands
npm run test:server     # Run server tests only
npm run dev:server      # Start server in development mode
npm run build:server    # Build server only

# CLI-specific commands
npm run build:cli       # Build CLI tool only
local-lens status       # Check CLI tool status (binary from local-lens-cli package)

# Run all tests
npm test

# Extension-specific commands
npm run test:extension  # Run extension tests only

# Specialized test commands
npm run test:settings           # Settings-specific tests
npm run test:domain-filtering   # Domain filtering tests
npm run test:race-condition     # Race condition tests

# Linting with auto-fix
npm run lint:fix        # Auto-fix linting issues
```

### UI Configuration

All Local Lens settings are managed through the extension popup interface:

#### Domain Configuration

- **Specific Domains Only**: Captures only from domains you explicitly specify in the extension popup
- **Add/Remove Domains**: Use the extension popup to manage your domain list
- **Subdomain Support**: Specified domains automatically include subdomains (e.g., `github.com` includes `gist.github.com`)
- **Default Behavior**: No domains are captured by default - you must explicitly add domains to start capturing

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
2. **Smart Filtering** automatically excludes Local Lens's own logs
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

### Database Issues

1. **SQLITE_READONLY or database creation errors**

   - The server automatically creates the `/server/data/` directory and database files on first run
   - If you encounter database errors, ensure the server has write permissions to the project directory
   - Check server logs for specific database initialization messages
   - The server creates two databases: `browserrelay.db` (main) and `browserrelay-settings.db` (settings)

2. **Database corruption or connection issues**

   - Stop the server: `Ctrl+C`
   - Remove database files: `rm -rf server/data/`
   - Restart the server: `npm run dev`
   - The databases will be recreated automatically

### Chrome Extension Issues

1. **Extension not capturing logs**

   - Check that the extension is enabled in `chrome://extensions/`
   - Reload the webpage after installing the extension
   - Check browser console for extension errors
   - Look for `[Local Lens]` debug messages in the browser console
   - Check the extension popup to ensure console logs are enabled
   - Verify the current domain is included in your capture scope (check the popup "Capture Scope" section)

2. **Debug logging not working**

   - Open Chrome DevTools (F12) and go to the Console tab
   - You should see `[Local Lens] Initialized on domain.com` messages
   - Try running `console.log("test")` - you should see capture messages
   - Check the Extensions page and click "service worker" next to Local Lens to see background script logs

3. **Server connection errors**

   - Ensure server is running on `http://localhost:27497`
   - Check for CORS errors in browser console
   - Verify no firewall is blocking the connection
   - Check server logs for incoming requests

4. **Domain filtering issues**
   - Open the Local Lens extension popup
   - Check your configured domains list to see your current configuration
   - Verify the current domain is in your explicitly configured domains list
   - Add domains using the input field in the popup
   - Subdomains are automatically included (e.g., `github.com` includes `gist.github.com`)
   - Note: The extension only captures from explicitly listed domains - no "All Domains" mode exists

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
   - Server uses persistent SQLite database in `server/data/browserrelay.db` and `server/data/browserrelay-settings.db` (both are ignored by git)
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
