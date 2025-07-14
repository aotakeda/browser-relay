# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local Lens is a comprehensive 100% local development monitoring tool that captures both browser and server logs for LLM analysis. It consists of a Chrome extension for browser monitoring, a CLI tool for universal backend log capture, and an HTTP/MCP server for data access. The system is completely local with no external connections.

## Architecture

### High-Level Structure

- **Chrome Extension**: Manifest v3 extension with service worker and content scripts for browser monitoring
- **CLI Tool**: Universal process wrapper for backend log capture (any framework)
- **Local Server**: HTTP/MCP server running on fixed port 27497
- **SQLite Database**: Local persistence with intelligent filtering and circular buffer (10k entries)
- **Monorepo**: Root workspace managing server, extension, and CLI subprojects

### Key Components

- `cli/`: Universal CLI tool for server log capture from any backend framework
- `extension/`: Chrome extension with background service worker and dual content scripts
- `server/`: Node.js/Express server with MCP integration and SQLite storage
- `server/src/storage/`: Database layer with LogStorage class and schema management
- `server/src/mcp/`: MCP server implementation for AI assistant access
- `server/src/routes/`: HTTP API endpoints for log retrieval and filtering

## Development Commands

### Common Operations

```bash
# Install dependencies and build everything
npm install
npm run build

# Development mode (watches files, rebuilds automatically)
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Run single test file
npm test -- --testPathPattern=integration.test.ts
```

### Server-Specific Commands

```bash
# Run server tests only
npm run test:server

# Start server in development mode
npm run dev:server

# Build server only
npm run build:server

# Build MCP server only
npm run build:mcp

# Build both HTTP and MCP servers
npm run build:all

# Build CLI tool only
npm run build:cli
```

### CLI Tool Commands

```bash
# Capture server logs from any backend
local-lens capture "rails server" --name "my-api"
local-lens capture "npm start" --name "frontend"
local-lens capture "python manage.py runserver"

# Check Local Lens server status
local-lens status

# Available options: --name, --server, --silent
```

## Key Technical Details

### Database Schema

- Two main tables: `logs` for console logs and `network_requests` for network data
- Efficient indexing on `timestamp` and `domain` for both tables
- Automatic cleanup maintains 10k most recent entries per table (circular buffer)
- Smart filtering excludes noise (images, tracking, ads, etc.)

### Extension Architecture

- **background.js**: Service worker managing server communication and lifecycle
- **content.js**: Message relay script (ISOLATED world)
- **inject.js**: Console/network capture script (MAIN world)
- **Manifest v3**: Modern Chrome extension with proper permissions and CSP
- **Dual script injection**: Uses both ISOLATED and MAIN worlds for comprehensive capture

### CLI Tool Architecture

- **Universal Process Wrapper**: Works with any backend framework without modifications
- **Process Spawn**: Uses Node.js child_process.spawn for reliable process management
- **Log Forwarding**: Real-time stdout/stderr capture and forwarding to Local Lens server
- **Source Tagging**: All backend logs tagged with `source: "backend-console"` and process metadata
- **Signal Handling**: Proper SIGTERM/SIGINT forwarding for graceful shutdown
- **Framework Agnostic**: Rails, Express, Django, FastAPI, Laravel, etc. - zero configuration required

### MCP Integration

- Server implements MCP protocol for AI assistant access
- Tools available: `get_console_logs`, `get_network_requests`, `search_logs`, `search_network_requests`, `clear_console_logs`, `clear_network_requests`
- Automatic server lifecycle management via extension
- **Full-Stack Monitoring**: MCP tools can filter between browser (`pageUrl: "https://..."`) and backend (`pageUrl: "process://..."`) logs
- **Source Filtering**: Use `url: "process://"` to get only backend logs, or specific process `url: "process://my-api"`
- **Optimized for AI consumption**: Network requests return minimal essential fields only (method, url, statusCode, duration, pageUrl, contentType, truncated bodies)
- **Response size limits**: Default limit reduced to 20 requests per query with 100k token response limit
- **Body truncation**: Request/response bodies limited to 200 characters for debugging context

### Configuration

- Server runs on fixed port 27497 (not configurable)
- Domain filtering configurable via extension options
- Batch processing with retry logic for reliability

## Testing

- **Jest**: TypeScript testing with memory database for isolation
- **Integration Tests**: Full server lifecycle testing
- **Unit Tests**: Storage, routes, and MCP components
- **Test Setup**: Automatic database cleanup and proper async handling

## Important Notes

- Server port 27497 is fixed and not configurable
- All data stays local - no external network connections
- Extension requires manual installation in developer mode
- **Universal Backend Support**: CLI tool works with any framework without code changes
- **Full-Stack Monitoring**: Captures both browser logs (via extension) and server logs (via CLI)
- **Source Identification**: Browser logs have real URLs, backend logs use `process://[name]` format
- Database automatically manages storage limits with circular buffer
- MCP server provides structured access for AI assistants
- Network request capture includes response bodies (up to 50KB limit)
- Both HTTP and MCP servers share the same SQLite database
- Server uses TSX for development with hot reloading
- **MCP responses are optimized for AI consumption**: Network requests return only essential debugging fields to avoid token limits
- **Default MCP limits**: 20 requests per query, 200-char body truncation, 100k token response size limit
