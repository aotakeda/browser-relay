import { Router } from "express";
import { NetworkCaptureConfig } from "@/types";

// Create a simple logger to avoid circular imports
const logger = {
  info: (message: string, ...args: unknown[]) => console.log(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
};

export const networkConfigRouter: Router = Router();

// Default configuration
const defaultConfig: NetworkCaptureConfig = {
  enabled: true,
  captureMode: "all",
  urlPatterns: [],
  includeHeaders: true,
  includeRequestBody: true,
  includeResponseBody: true,
  includeQueryParams: true,
  maxResponseBodySize: 50000,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  statusCodes: [],
};

// In-memory storage for configuration (could be moved to database later)
let currentConfig: NetworkCaptureConfig = { ...defaultConfig };

networkConfigRouter.get("/", async (req, res) => {
  try {
    res.json({ config: currentConfig });
  } catch (error) {
    logger.error("Error fetching network config:", error);
    res.status(500).json({ error: "Failed to fetch network config" });
  }
});

networkConfigRouter.post("/", async (req, res) => {
  try {
    const newConfig: Partial<NetworkCaptureConfig> = req.body;

    // Validate required fields
    if (
      typeof newConfig.enabled !== "undefined" &&
      typeof newConfig.enabled !== "boolean"
    ) {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    if (
      newConfig.captureMode &&
      !["all", "include", "exclude"].includes(newConfig.captureMode)
    ) {
      return res
        .status(400)
        .json({ error: "captureMode must be 'all', 'include', or 'exclude'" });
    }

    if (newConfig.urlPatterns && !Array.isArray(newConfig.urlPatterns)) {
      return res.status(400).json({ error: "urlPatterns must be an array" });
    }

    if (newConfig.methods && !Array.isArray(newConfig.methods)) {
      return res.status(400).json({ error: "methods must be an array" });
    }

    if (newConfig.statusCodes && !Array.isArray(newConfig.statusCodes)) {
      return res.status(400).json({ error: "statusCodes must be an array" });
    }

    if (
      newConfig.maxResponseBodySize &&
      (typeof newConfig.maxResponseBodySize !== "number" ||
        newConfig.maxResponseBodySize < 0)
    ) {
      return res
        .status(400)
        .json({ error: "maxResponseBodySize must be a non-negative number" });
    }


    // Merge with current config
    currentConfig = { ...currentConfig, ...newConfig };

    res.json({
      config: currentConfig,
      message: "Network capture configuration updated successfully",
    });
  } catch (error) {
    logger.error("Error updating network config:", error);
    res.status(500).json({ error: "Failed to update network config" });
  }
});

networkConfigRouter.post("/reset", async (req, res) => {
  try {
    currentConfig = { ...defaultConfig };

    logger.info("Network capture configuration reset to defaults");

    res.json({
      config: currentConfig,
      message: "Network capture configuration reset to defaults",
    });
  } catch (error) {
    logger.error("Error resetting network config:", error);
    res.status(500).json({ error: "Failed to reset network config" });
  }
});

// Export the current config for use in other modules
export const getCurrentNetworkConfig = (): NetworkCaptureConfig => {
  return { ...currentConfig };
};
