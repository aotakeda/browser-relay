# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser Relay is a privacy-focused Chrome extension that captures console logs and network requests from web pages and exposes them via a local HTTP server and MCP (Model Context Protocol) server. The system is 100% local with no external connections.

## Architecture

### High-Level Structure
- **Chrome Extension**: Manifest v3 extension with service worker and content scripts
- **Local Server**: HTTP/MCP server running on fixed port 27497
- **SQLite Database**: Local persistence with intelligent filtering and circular buffer (10k entries)
- **Monorepo**: Root workspace managing server and extension subprojects

### Key Components
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
```

## Key Technical Details

### Database Schema
- Single `logs` table with efficient indexing on `timestamp` and `domain`
- Automatic cleanup maintains 10k most recent entries
- Smart filtering excludes noise (images, tracking, ads, etc.)

### Extension Architecture
- **background.js**: Service worker managing server communication and lifecycle
- **content.js**: Injected script capturing console logs and network requests
- **Manifest v3**: Modern Chrome extension with proper permissions and CSP

### MCP Integration
- Server implements MCP protocol for AI assistant access
- Tools available: `get_logs`, `get_domains`, `stream_logs`
- Automatic server lifecycle management via extension

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
- Database automatically manages storage limits with circular buffer
- MCP server provides structured access for AI assistants