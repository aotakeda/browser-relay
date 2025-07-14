# Local Lens CLI

Universal CLI tool to capture server logs from any backend framework and forward them to Local Lens.

## Features

- **Framework-agnostic**: Works with any backend (Rails, Express, Django, FastAPI, Laravel, etc.)
- **Zero configuration**: No setup required, just wrap your server command
- **Real-time forwarding**: Logs appear immediately in Local Lens MCP tools
- **Process management**: Graceful start/stop with proper signal handling

## Installation

Install globally via npm:

```bash
npm install -g @local-lens/cli
```

Or build locally with Local Lens:

```bash
npm run build:all
```

## Usage

### Basic Usage

Wrap any server command with `local-lens capture`:

```bash
# Rails server
local-lens capture "rails server"

# Express/Node.js
local-lens capture "npm start"

# Django
local-lens capture "python manage.py runserver"

# FastAPI
local-lens capture "uvicorn main:app --reload"

# Any command with arguments
local-lens capture "rails server" "-p" "4000"
```

### Options

```bash
# Custom process name for logs
local-lens capture "rails server" --name "my-api"

# Custom Local Lens server URL
local-lens capture "npm start" --server "http://localhost:27497"

# Silent mode (suppress Local Lens output)
local-lens capture "rails server" --silent
```

### Status Check

Check if Local Lens server is running:

```bash
local-lens status
```

## Examples

### Rails Development

```bash
# Start Rails server with log capture
local-lens capture "rails server" --name "rails-api"
```

Your Rails logs (including ActiveRecord queries) will now appear in Local Lens with source: `backend-console`.

### Express Development

```bash
# Start Express server with log capture
local-lens capture "npm run dev" --name "express-server"
```

### Django Development

```bash
# Start Django server with log capture
local-lens capture "python manage.py runserver" --name "django-api"
```

## Integration with Local Lens

Once your server is running with Local Lens CLI, you can query the logs using MCP tools:

```javascript
// Get all backend console logs
get_console_logs({ source: "backend-console" })

// Search for specific logs from your process
search_logs({ query: "error", source: "backend-console", backendProcess: "rails-api" })

// Get logs from a specific process
get_console_logs({ backendProcess: "express-server" })
```

## How It Works

1. **Process Wrapping**: CLI spawns your server process and captures stdout/stderr
2. **Log Formatting**: Formats logs according to Local Lens schema with metadata
3. **Real-time Forwarding**: Sends logs to Local Lens server via HTTP API
4. **Source Tagging**: Tags all logs with `source: "backend-console"` for filtering

## Process Management

- **Graceful Shutdown**: Ctrl+C properly terminates the wrapped process
- **Signal Forwarding**: SIGTERM and SIGINT are forwarded to your server
- **Exit Codes**: Preserves original process exit codes
- **Error Handling**: Captures and reports process startup errors

This allows you to capture server logs from any backend framework without modifying your application code.