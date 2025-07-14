# Local Lens Server

**HTTP/MCP server component for Local Lens - captures console logs and network requests with response bodies for LLM analysis.**

> ⚠️ **Important**: This server is designed for local development use only. It runs entirely on your machine with no external connections.

## Installation

This package provides both HTTP and MCP server functionality for Local Lens.

### As Standalone MCP Server

Install globally via npm to use as MCP server:

```bash
npm install -g local-lens
```

### As Development Dependency

For local development of the Local Lens project:

```bash
git clone https://github.com/aotakeda/local-lens.git
cd local-lens/server
npm install
npm run dev
```

> **Note**: The `local-lens` npm package contains only the MCP server binary. For full Local Lens functionality (browser extension + CLI + server), clone the repository and follow the main README.md setup instructions.

## Quick Start

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Or build and start production
npm run build
npm start
```

Server runs on `http://localhost:27497`

## API Endpoints

### Console Logs

- `POST /logs` - Submit log batches
- `GET /logs` - Query logs with filters
- `DELETE /logs` - Clear all logs
- `GET /logs/stream` - Real-time log stream

### Network Requests

- `POST /network-requests` - Submit request batches
- `GET /network-requests` - Query requests with filters
- `GET /network-requests/:id` - Get specific network request by ID
- `DELETE /network-requests` - Clear all requests
- `GET /network-requests/stream` - Real-time request stream

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

## JSON Output Format

All console logs and network requests are output in structured JSON format:

### Console Logs

```json
{
  "type": "console_log",
  "level": "info|warn|error",
  "hostname": "example.com",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "page_url": "https://example.com/page",
  "message": "Log message",
  "stack_trace": "Error stack (if error)",
  "user_agent": "Browser info (if available)",
  "browser": "Chrome|Firefox|Safari|Edge",
  "metadata": { "custom": "data" }
}
```

### Network Requests

```json
{
  "type": "network_request",
  "method": "GET|POST|...",
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
    "data": "processed response content",
    "truncated": false,
    "original_length": 2048
  },
  "context": {
    "is_api_endpoint": true,
    "is_authenticated": false,
    "user_agent": "Browser user agent",
    "page_url": "https://example.com"
  }
}
```

## Features

### Browser Log Capture
- **Console Logs**: Captures all console.log/warn/error/info from Chrome extension
- **Network Requests**: Full HTTP request/response monitoring with response bodies
- **Response Body Capture**: Full content for JSON, HTML, XML, and JavaScript responses
- **Domain Filtering**: Configurable domain-based capture via extension settings

### Server Log Capture
- **Universal Backend Support**: Works with Rails, Express, Django, FastAPI, Laravel, etc.
- **CLI Integration**: Captures server logs via `local-lens-cli` package
- **Process Identification**: Tags backend logs with `source: "backend-console"` and process names
- **Real-time Forwarding**: Live server log forwarding to Local Lens database

### Data Management
- **SQLite Storage**: Persistent local database with dual tables (logs + network_requests)
- **Settings Storage**: Separate settings database for configuration persistence
- **Circular Buffer**: 10k item limit per table with auto-cleanup
- **Smart Filtering**: Excludes noise (images, tracking, binary content)
- **LLM-Optimized**: Structured JSON output designed for AI analysis

### Integration & Access
- **Real-time Streaming**: Server-Sent Events for live monitoring
- **HTTP API**: RESTful endpoints for all data access and configuration
- **MCP Integration**: Model Context Protocol server for AI assistant access
- **Dual Server Mode**: Both HTTP (port 27497) and MCP servers share same database

## MCP Integration

The server includes a built-in MCP (Model Context Protocol) server that provides AI assistants with access to captured logs and network requests.

### Available MCP Tools

- `get_console_logs` - Retrieve console logs with filtering options
- `get_network_requests` - Retrieve network requests with filtering options
- `search_logs` - Search console logs by text content
- `search_network_requests` - Search network requests by URL/content
- `clear_console_logs` - Clear all stored console logs
- `clear_network_requests` - Clear all stored network requests
- `trace_request` - Trace requests across browser and backend systems using correlation ID

### Usage with Claude Code

```bash
# Install globally first
npm install -g local-lens

# Add to Claude Code
claude mcp add local-lens -- local-lens
```

### Usage with Cursor

First install globally, then add to `~/.cursor/mcp.json`:

```bash
# Install globally first
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

## Development

```bash
npm test              # Run all tests
npm run dev           # Development with auto-reload (builds and starts with tsx watch)
npm run build         # Compile TypeScript (HTTP server)
npm run build:mcp     # Compile TypeScript (MCP server) 
npm run build:all     # Build both HTTP and MCP servers
npm start             # Start production server (builds and runs from dist/)
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix linting issues
```

### Project Structure

```
server/
├── src/
│   ├── index.ts              # HTTP server entry point
│   ├── mcp-standalone.ts     # MCP server entry point
│   ├── mcp.ts               # MCP server setup
│   ├── types.ts             # TypeScript definitions
│   ├── __tests__/           # Test files
│   ├── mcp/                 # MCP server implementation
│   ├── routes/              # HTTP API routes
│   ├── storage/             # Database and storage logic
│   ├── services/            # Business logic services
│   └── utils/               # Utility functions
├── dist/                    # Compiled HTTP server
├── dist-mcp/               # Compiled MCP server
├── data/                   # SQLite databases
│   ├── browserrelay.db     # Main data storage
│   └── browserrelay-settings.db # Settings storage
├── package.json            # Dependencies and scripts
├── tsconfig.json          # TypeScript config (HTTP server)
└── tsconfig.mcp.json      # TypeScript config (MCP server)
```

### Database Initialization

The server automatically creates the database files and directory structure on first startup:

- **Directory**: `server/data/` (created automatically)
- **Main Database**: `server/data/browserrelay.db` (console logs and network requests)
- **Settings Database**: `server/data/browserrelay-settings.db` (extension configuration)

**Automatic Setup**: No manual database setup required. The server handles:
- Directory creation with proper permissions
- Database file creation with correct SQLite format
- Table schema initialization
- Concurrent access handling for multiple server instances

**Troubleshooting Database Issues**:
```bash
# If database errors occur, reset databases:
rm -rf server/data/
npm run dev  # Databases will be recreated automatically
```

### Database Schema

#### Console Logs Table (`logs`)
- `id` - Auto-incrementing primary key
- `timestamp` - ISO 8601 timestamp string
- `level` - Log level (info, warn, error, log)
- `message` - Log message content
- `stackTrace` - Error stack trace (if applicable)
- `pageUrl` - Page URL (or `process://name` for backend)
- `userAgent` - Browser user agent
- `metadata` - JSON metadata object (includes source, backendProcess, etc.)
- `created_at` - Database insertion timestamp

#### Network Requests Table (`network_requests`)
- `id` - Auto-incrementing primary key
- `requestId` - Unique request identifier
- `timestamp` - ISO 8601 timestamp string
- `method` - HTTP method (GET, POST, etc.)
- `url` - Request URL
- `requestHeaders` - JSON request headers
- `responseHeaders` - JSON response headers
- `requestBody` - Request body as text (truncated if > 1MB)
- `responseBody` - Response body as text (truncated if > 1MB)
- `statusCode` - HTTP status code
- `duration` - Request duration in milliseconds
- `responseSize` - Response size in bytes
- `pageUrl` - Source page URL (or `process://name` for backend)
- `userAgent` - Browser user agent
- `metadata` - JSON metadata object (includes source, backendProcess, correlationId, etc.)
- `created_at` - Database insertion timestamp

## Environment Variables

The server supports these optional environment variables:

- `NODE_ENV` - Set to `production` for production mode (affects logging)
- `LOG_CONSOLE_MESSAGES` - Set to `false` to disable console log JSON output (default: `true`)
- `LOG_NETWORK_REQUESTS` - Set to `false` to disable network request JSON output (default: `true`) 
- `SETTINGS_DB_PATH` - Custom path for settings database (default: `data/browserrelay-settings.db`)

## Database Locations

- **Main Database**: `server/data/browserrelay.db` (logs and network requests)
- **Settings Database**: `server/data/browserrelay-settings.db` (extension configuration)
- **Test Database**: `:memory:` (in-memory for tests)

Databases are automatically created in the `data/` directory when the server starts.

## Performance Notes

- **Circular Buffer**: Each table maintains a maximum of 10,000 entries with automatic cleanup
- **Body Truncation**: Request/response bodies are truncated at 1MB during storage
- **MCP Optimization**: Network request responses are heavily truncated (200 chars) for AI consumption
- **Indexing**: Automatic indexes on timestamp, URL, method, and other frequently queried fields

## License

MIT License - see LICENSE file for details.
