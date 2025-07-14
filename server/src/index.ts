import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import pino from "pino";
import { formatLogEntry } from "@/utils/colorizer";
import { logsRouter } from "@/routes/logs";
import { networkRequestsRouter } from "@/routes/network-requests";
import { networkConfigRouter } from "@/routes/network-config";
import { settingsRouter } from "@/routes/settings";
import { initializeDatabase } from "@/storage/database";
import { initializeSettingsDatabase } from "@/storage/settings-database";
import { setupMCPServer } from "@/mcp/server";

const app = express();
const httpServer = createServer(app);
const PORT = 27497;

// MCP state - controlled by UI, enabled by default
let mcpEnabled = true;

// Custom logger that uses our colorizer in development
const createLogger = () => {
  if (process.env.NODE_ENV === "production") {
    return pino({ level: "info" });
  }

  // Development logger with custom colorization
  const logWithLevel = (
    level: string,
    message: unknown,
    ...args: unknown[]
  ) => {
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    // Handle string messages
    if (typeof message === "string") {
      const data =
        args.length > 0 && typeof args[0] === "object" && args[0] !== null
          ? { message, ...(args[0] as Record<string, unknown>) }
          : { message };
      console.log(formatLogEntry(level, timestamp, data));
    } else {
      console.log(formatLogEntry(level, timestamp, message));
    }
  };

  return {
    info: (message: unknown, ...args: unknown[]) =>
      logWithLevel("info", message, ...args),
    warn: (message: unknown, ...args: unknown[]) =>
      logWithLevel("warn", message, ...args),
    error: (message: unknown, ...args: unknown[]) =>
      logWithLevel("error", message, ...args),
    debug: (message: unknown, ...args: unknown[]) =>
      logWithLevel("debug", message, ...args),
  };
};

const logger = createLogger();

app.use(
  cors({
    origin: true, // Allow all origins for content scripts
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.use("/logs", logsRouter);
app.use("/network-requests", networkRequestsRouter);
app.use("/network-config", networkConfigRouter);
app.use("/settings", settingsRouter);

// Health check endpoint for Local Lens extension port detection
app.get("/health-local-lens", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// Keep the standard health endpoint for general use
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Configuration endpoint for extension
app.get("/config", (_req, res) => {
  res.json({
    port: PORT,
    mcpEnabled,
  });
});

// MCP configuration endpoint
app.post("/mcp-config", (req, res) => {
  try {
    const { mcpEnabled: newMcpEnabled } = req.body;

    if (typeof newMcpEnabled === "boolean") {
      mcpEnabled = newMcpEnabled;

      if (mcpEnabled) {
        // Initialize MCP server if not already done
        setupMCPServer().catch((error) => {
          logger.error("Failed to setup MCP server:", error);
        });
      }

      logger.info(`MCP mode ${mcpEnabled ? "enabled" : "disabled"} via UI`);
      res.json({ success: true, mcpEnabled });
    } else {
      res.status(400).json({ error: "Invalid mcpEnabled value" });
    }
  } catch (error) {
    logger.error("Error updating MCP config:", error);
    res.status(500).json({ error: "Failed to update MCP config" });
  }
});

async function start() {
  try {
    await initializeDatabase();
    logger.info("Database initialized");

    await initializeSettingsDatabase();
    logger.info("Settings database initialized");

    // Setup MCP server by default, can be disabled via UI
    if (mcpEnabled) {
      await setupMCPServer();
      logger.info("MCP server initialized");
    } else {
      logger.info("MCP server disabled - can be enabled via UI");
    }

    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

// Type guard for SQLite errors
function isSQLiteError(err: Error): err is Error & { code: string } {
  return (
    "code" in err && typeof (err as Record<string, unknown>).code === "string"
  );
}

// Graceful shutdown
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  logger.info("Shutting down gracefully...");

  // Close HTTP server
  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      logger.info("HTTP server closed");
      resolve();
    });
  });

  // Close database connections with proper error handling
  try {
    const { db } = await import("@/storage/database");
    const { settingsDb } = await import("@/storage/settings-database");

    // Close main database if it exists
    if (db) {
      await new Promise<void>((resolve) => {
        db.close((err) => {
          if (err && (!isSQLiteError(err) || err.code !== "SQLITE_MISUSE")) {
            logger.error("Error closing database:", err);
          } else if (!err) {
            logger.info("Database connection closed");
          }
          resolve();
        });
      });
    }

    // Close settings database if it exists
    if (settingsDb) {
      await new Promise<void>((resolve) => {
        settingsDb.close((err) => {
          if (err && (!isSQLiteError(err) || err.code !== "SQLITE_MISUSE")) {
            logger.error("Error closing settings database:", err);
          } else if (!err) {
            logger.info("Settings database connection closed");
          }
          resolve();
        });
      });
    }
  } catch (error) {
    logger.error("Error during database cleanup:", error);
  }

  process.exit(0);
}

export { logger };
