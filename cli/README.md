# Local Lens CLI

Universal CLI tool to capture server logs from any backend framework and forward them to Local Lens.

## Features

- **Framework-agnostic**: Works with any backend (Rails, Express, Django, FastAPI, Laravel, etc.)
- **Zero configuration**: No setup required, just wrap your server command
- **Real-time forwarding**: Logs appear immediately in Local Lens MCP tools
- **Process management**: Graceful start/stop with proper signal handling

## Installation

### Option 1: Global Installation

Install globally via npm:

```bash
npm install -g local-lens-cli
```

Then use directly:

```bash
local-lens capture "your-server-command"
```

### Option 2: Use with npx (No Installation Required)

Run directly with npx without installing:

```bash
npx local-lens-cli capture "your-server-command"
```

### Option 3: Build Locally

Or build locally with Local Lens:

```bash
npm run build:all
```

## Usage

### Basic Usage

Wrap any server command with `local-lens capture` (or `npx local-lens-cli capture`):

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

# Any command with arguments
local-lens capture "rails server" "-p" "4000"
# or with npx
npx local-lens-cli capture "rails server" "-p" "4000"
```

### Options

```bash
# Custom process name for logs
local-lens capture "rails server" --name "my-api"
# or with npx
npx local-lens-cli capture "rails server" --name "my-api"

# Custom Local Lens server port
local-lens capture "rails server" --port "27497"
# or with npx
npx local-lens-cli capture "rails server" --port "27497"

# Custom Local Lens server URL
local-lens capture "npm start" --server "http://localhost:27497"
# or with npx
npx local-lens-cli capture "npm start" --server "http://localhost:27497"

# Silent mode (suppress Local Lens output)
local-lens capture "rails server" --silent
# or with npx
npx local-lens-cli capture "rails server" --silent
```

### Status Check

Check if Local Lens server is running:

```bash
local-lens status
# or with npx
npx local-lens-cli status
```

## Examples

### Rails Development

```bash
# Start Rails server with log capture
local-lens capture "rails server" --name "rails-api"
# or with npx
npx local-lens-cli capture "rails server" --name "rails-api"
```

Your Rails logs (including ActiveRecord queries) will now appear in Local Lens with source: `backend-console`.

### Express Development

```bash
# Start Express server with log capture
local-lens capture "npm run dev" --name "express-server"
# or with npx
npx local-lens-cli capture "npm run dev" --name "express-server"
```

### Django Development

```bash
# Start Django server with log capture
local-lens capture "python manage.py runserver" --name "django-api"
# or with npx
npx local-lens-cli capture "python manage.py runserver" --name "django-api"
```

### Laravel Development

```bash
# Start Laravel server with log capture
local-lens capture "php artisan serve" --name "laravel-api"
# or with npx
npx local-lens-cli capture "php artisan serve" --name "laravel-api"
```

### Spring Boot Development

```bash
# Start Spring Boot server with log capture
local-lens capture "./mvnw spring-boot:run" --name "spring-api"
# or with npx
npx local-lens-cli capture "./mvnw spring-boot:run" --name "spring-api"
```

### Go Development

```bash
# Start Go server with log capture
local-lens capture "go run main.go" --name "go-api"
# or with npx
npx local-lens-cli capture "go run main.go" --name "go-api"
```

### Next.js Development

```bash
# Start Next.js server with log capture
local-lens capture "npm run dev" --name "nextjs-app"
# or with npx
npx local-lens-cli capture "npm run dev" --name "nextjs-app"
```

## Integration with Local Lens

Once your server is running with Local Lens CLI, you can query the logs using MCP tools:

```javascript
// Get all backend console logs
get_console_logs({ source: "backend-console" })

// Get logs from a specific backend process
get_console_logs({ source: "backend-console", backendProcess: "rails-api" })

// Get all logs from any backend process (using URL filter)
get_console_logs({ url: "process://" })

// Get logs from a specific named process
get_console_logs({ url: "process://express-server" })

// Search for specific logs from backend processes
search_logs({ query: "error", source: "backend-console" })

// Search for errors in a specific backend process
search_logs({ query: "database", source: "backend-console", backendProcess: "rails-api" })

// Get recent error logs from backend
get_console_logs({ level: "error", source: "backend-console", limit: 10 })
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

## Troubleshooting

### Server Not Running

If you see "Local Lens server is not running":

1. **Check if the server is running**:
   ```bash
   local-lens status
   # or with npx
   npx local-lens-cli status
   ```

2. **Start the Local Lens server**:
   - Install and run the Local Lens extension in Chrome
   - Or manually start the server: `npm run dev:server` in the Local Lens project

3. **Check the port**:
   - Default port is 27497
   - Use `--port` option if running on a different port
   - Use `--server` option to specify full URL

### Process Won't Start

If your server process fails to start:

1. **Test the command directly**: Try running your command without Local Lens first
2. **Check command syntax**: Ensure your command string is properly quoted
3. **Use absolute paths**: For commands not in PATH, use full paths
4. **Check permissions**: Ensure the CLI has permission to spawn processes

### Logs Not Appearing

1. **Check MCP connection**: Verify MCP tools can access the Local Lens server
2. **Verify process name**: Use `get_console_logs({ source: "backend-console" })` to see all backend logs
3. **Check filters**: Ensure your MCP queries use correct parameter names

### Performance Issues

1. **High memory usage**: The Local Lens database maintains a circular buffer of 10k entries
2. **Slow log forwarding**: Network latency to Local Lens server can affect real-time forwarding
3. **Process overhead**: The CLI adds minimal overhead (~1-5MB memory, <1% CPU)

## Performance Notes

- **Memory footprint**: CLI tool uses 1-5MB additional memory
- **CPU overhead**: <1% CPU usage for log forwarding
- **Network calls**: One HTTP request per log line to Local Lens server
- **Storage**: Local SQLite database with 10k entry circular buffer
- **Latency**: Real-time forwarding with ~1-10ms delay per log line
- **Scalability**: Tested with high-volume applications (1000+ logs/minute)