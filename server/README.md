# Browser Relay Server

**HTTP/MCP server component for Browser Relay - captures console logs and network requests for LLM analysis.**

> ⚠️ **Important**: This server is designed for local development use only. It runs entirely on your machine with no external connections.

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

## Environment Variables

Create a `.env` file:

```bash
# Server configuration
MCP_MODE=true

# Domain filtering (optional)
ALLOWED_DOMAINS=localhost,github.com

# LLM logging control
LOG_CONSOLE_MESSAGES=true
LOG_NETWORK_REQUESTS=true
```

**Note:** Restart server after changing environment variables.

## API Endpoints

### Console Logs

- `POST /logs` - Submit log batches
- `GET /logs` - Query logs with filters
- `DELETE /logs` - Clear all logs
- `GET /logs/stream` - Real-time log stream

### Network Requests

- `POST /network-requests` - Submit request batches
- `GET /network-requests` - Query requests with filters
- `DELETE /network-requests` - Clear all requests
- `GET /network-requests/stream` - Real-time request stream

### System

- `GET /health` - Health check
- `GET /allowed-domains` - Domain configuration

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
  "request_body": {
    "type": "json|text|encoded_data",
    "data": "processed content",
    "truncated": false
  },
  "context": {
    "is_api_endpoint": true,
    "is_authenticated": false
  }
}
```

## Features

- **🖥️ Console Logs**: Captures all console.log/warn/error/info
- **🌐 Network Requests**: Full HTTP request/response monitoring
- **🤖 LLM-Optimized**: Structured JSON output for AI analysis
- **🧹 Smart Filtering**: Excludes noise (images, tracking, encoded data)
- **💾 SQLite Storage**: Persistent local database
- **🔄 Circular Buffer**: 10k item limit with auto-cleanup
- **⚡ Real-time**: Server-Sent Events streaming
- **🔌 MCP Integration**: AI assistant tool access

## Development

```bash
npm test        # Run tests
npm run build   # Compile TypeScript
npm run dev     # Development with auto-reload
```

## License

MIT License - see LICENSE file for details.
