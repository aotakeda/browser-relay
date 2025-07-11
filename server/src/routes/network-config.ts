import { Router } from "express";
import { NetworkCaptureConfig } from "@/types";
import { info, error } from '@/utils/logger';

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
  } catch (fetchError) {
    error("Error fetching network config:", fetchError);
    res.status(500).json({ error: "Failed to fetch network config" });
  }
});

networkConfigRouter.post("/", async (req, res) => {
  try {
    const newConfig: Partial<NetworkCaptureConfig> = req.body;

    // Validate boolean fields
    const booleanFields = ['enabled', 'includeHeaders', 'includeRequestBody', 'includeResponseBody', 'includeQueryParams'] as const;
    for (const field of booleanFields) {
      if (
        typeof newConfig[field] !== "undefined" &&
        typeof newConfig[field] !== "boolean"
      ) {
        return res.status(400).json({ error: `${field} must be a boolean` });
      }
    }

    if (
      newConfig.captureMode &&
      !["all", "include", "exclude"].includes(newConfig.captureMode)
    ) {
      return res
        .status(400)
        .json({ error: "captureMode must be 'all', 'include', or 'exclude'" });
    }

    // Validate array fields
    const arrayFields = ['urlPatterns', 'methods', 'statusCodes'] as const;
    for (const field of arrayFields) {
      if (newConfig[field] && !Array.isArray(newConfig[field])) {
        return res.status(400).json({ error: `${field} must be an array` });
      }
    }

    if (
      typeof newConfig.maxResponseBodySize !== "undefined" &&
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
  } catch (updateError) {
    error("Error updating network config:", updateError);
    res.status(500).json({ error: "Failed to update network config" });
  }
});

networkConfigRouter.post("/reset", async (req, res) => {
  try {
    currentConfig = { ...defaultConfig };

    info("Network capture configuration reset to defaults");

    res.json({
      config: currentConfig,
      message: "Network capture configuration reset to defaults",
    });
  } catch (resetError) {
    error("Error resetting network config:", resetError);
    res.status(500).json({ error: "Failed to reset network config" });
  }
});

// Export the current config for use in other modules
export const getCurrentNetworkConfig = (): NetworkCaptureConfig => {
  return { ...currentConfig };
};
