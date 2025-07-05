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

Server runs on `http://localhost:8765`

## Environment Variables

Create a `.env` file:

```bash
# Server configuration
PORT=8765
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

## Features

- **🖥️ Console Logs**: Captures all console.log/warn/error/info
- **🌐 Network Requests**: Full HTTP request/response monitoring
- **🤖 LLM-Optimized**: Structured output with emojis for AI analysis
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
