import { Router } from "express";
import { logStorage } from "@/storage/LogStorage";
import { ConsoleLog, LogBatch } from "@/types";
import { logger } from "@/index";

// Helper function to extract browser info from user agent
function extractBrowserInfo(userAgent: string): string {
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
    return "Safari";
  if (userAgent.includes("Edge")) return "Edge";
  return "Unknown";
}

export const logsRouter: Router = Router();

logsRouter.post("/", async (req, res) => {
  try {
    const batch: LogBatch = req.body;

    if (!batch.logs || !Array.isArray(batch.logs)) {
      logger.warn("Invalid log batch format:", batch);
      return res.status(400).json({ error: "Invalid log batch format" });
    }

    // Filter out Browser Relay's own logs and log remaining for LLM visibility (if enabled)
    const filteredLogs = batch.logs.filter(
      (log) =>
        !log.message.includes("[Browser Relay]") &&
        !log.message.includes("[Network Debug]") &&
        !log.message.includes("browser-relay")
    );

    if (process.env.LOG_CONSOLE_MESSAGES !== "false") {
      filteredLogs.forEach((log) => {
        const url = new URL(log.pageUrl);
        const hostname = url.hostname;
        const timestamp = new Date(log.timestamp).toLocaleTimeString();

        // Create LLM-friendly structured log message
        let logMessage = `=====================\n`;
        logMessage += `🖥️  CONSOLE ${log.level.toUpperCase()} | ${hostname} | ${timestamp}\n`;
        logMessage += `📄 Page: ${log.pageUrl}\n`;
        logMessage += `💬 Message: ${log.message}`;

        if (log.stackTrace) {
          logMessage += `\n📍 Stack Trace:\n${log.stackTrace}`;
        }

        if (log.userAgent) {
          const browser = extractBrowserInfo(log.userAgent);
          logMessage += `\n🌐 Browser: ${browser}`;
        }

        logMessage += `\n=====================`;

        // Use appropriate log level
        if (log.level === "error") {
          logger.error(logMessage);
        } else if (log.level === "warn") {
          logger.warn(logMessage);
        } else {
          logger.info(logMessage);
        }
      });
    }

    // Only store non-Browser Relay logs in database
    const insertedLogs = await logStorage.insertLogs(filteredLogs);

    res.json({
      received: batch.logs.length,
      stored: insertedLogs.length,
    });
  } catch (error) {
    logger.error("Error processing logs:", error);
    res.status(500).json({ error: "Failed to process logs" });
  }
});

logsRouter.get("/", async (req, res) => {
  try {
    const {
      limit = "100",
      offset = "0",
      level,
      url,
      startTime,
      endTime,
    } = req.query;

    const filters = {
      level: level as string,
      url: url as string,
      startTime: startTime as string,
      endTime: endTime as string,
    };

    const logs = await logStorage.getLogs(
      parseInt(limit as string),
      parseInt(offset as string),
      filters
    );

    res.json({ logs });
  } catch (error) {
    logger.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

logsRouter.delete("/", async (req, res) => {
  try {
    const count = await logStorage.clearLogs();
    logger.info(`Cleared ${count} logs`);
    res.json({ cleared: count });
  } catch (error) {
    logger.error("Error clearing logs:", error);
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

logsRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendLog = (log: ConsoleLog) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logStorage.onNewLog(sendLog);

  req.on("close", () => {
    logStorage.offNewLog(sendLog);
  });
});
