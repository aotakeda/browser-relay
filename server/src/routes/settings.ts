import { Router } from "express";
import { settingsStorage, ExtensionSettings } from "@/storage/SettingsStorage";
import { logger } from "@/index";

export const settingsRouter: Router = Router();

// GET /settings - Retrieve all extension settings
settingsRouter.get("/", async (req, res) => {
  try {
    const settings = await settingsStorage.getSettings();
    res.json({ settings });
  } catch (error) {
    logger.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /settings - Update extension settings
settingsRouter.post("/", async (req, res) => {
  try {
    const updates: Partial<ExtensionSettings> = req.body;

    // Validate the updates
    const validKeys = ['logsEnabled', 'networkEnabled', 'mcpEnabled', 'specificDomains'];
    const invalidKeys = Object.keys(updates).filter(key => !validKeys.includes(key));
    
    if (invalidKeys.length > 0) {
      return res.status(400).json({ 
        error: `Invalid setting keys: ${invalidKeys.join(', ')}` 
      });
    }

    // Type validation
    if (updates.logsEnabled !== undefined && typeof updates.logsEnabled !== 'boolean') {
      return res.status(400).json({ error: 'logsEnabled must be a boolean' });
    }
    
    if (updates.networkEnabled !== undefined && typeof updates.networkEnabled !== 'boolean') {
      return res.status(400).json({ error: 'networkEnabled must be a boolean' });
    }
    
    if (updates.mcpEnabled !== undefined && typeof updates.mcpEnabled !== 'boolean') {
      return res.status(400).json({ error: 'mcpEnabled must be a boolean' });
    }
    
    if (updates.specificDomains !== undefined) {
      if (!Array.isArray(updates.specificDomains)) {
        return res.status(400).json({ error: 'specificDomains must be an array' });
      }
      
      // Validate each domain is a string
      for (const domain of updates.specificDomains) {
        if (typeof domain !== 'string') {
          return res.status(400).json({ error: 'All domains must be strings' });
        }
      }
      
      // Warn if no domains specified
      if (updates.specificDomains.length === 0) {
        logger.warn("No domains specified in settings - extension will not capture any logs or network requests. User should add domains through the extension popup.");
      }
    }

    const updatedSettings = await settingsStorage.updateSettings(updates);
    
    logger.info("Settings updated:", updates);
    res.json({ 
      settings: updatedSettings,
      message: "Settings updated successfully" 
    });
  } catch (error) {
    logger.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// DELETE /settings - Reset settings to defaults
settingsRouter.delete("/", async (req, res) => {
  try {
    const defaultSettings = await settingsStorage.resetSettings();
    
    logger.info("Settings reset to defaults");
    res.json({ 
      settings: defaultSettings,
      message: "Settings reset to defaults" 
    });
  } catch (error) {
    logger.error("Error resetting settings:", error);
    res.status(500).json({ error: "Failed to reset settings" });
  }
});

// GET /settings/:key - Get a specific setting
settingsRouter.get("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    
    const validKeys = ['logsEnabled', 'networkEnabled', 'mcpEnabled', 'specificDomains'];
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid setting key: ${key}` });
    }

    const value = await settingsStorage.getSetting(key as keyof ExtensionSettings);
    
    if (value === undefined) {
      return res.status(404).json({ error: `Setting '${key}' not found` });
    }

    res.json({ [key]: value });
  } catch (error) {
    logger.error(`Error fetching setting ${req.params.key}:`, error);
    res.status(500).json({ error: "Failed to fetch setting" });
  }
});

// PUT /settings/:key - Update a specific setting
settingsRouter.put("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const validKeys = ['logsEnabled', 'networkEnabled', 'mcpEnabled', 'specificDomains'];
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid setting key: ${key}` });
    }

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Type validation based on key
    if (['logsEnabled', 'networkEnabled', 'mcpEnabled'].includes(key)) {
      if (typeof value !== 'boolean') {
        return res.status(400).json({ error: `${key} must be a boolean` });
      }
    }

    if (key === 'specificDomains') {
      if (!Array.isArray(value)) {
        return res.status(400).json({ error: 'specificDomains must be an array' });
      }
      
      for (const domain of value) {
        if (typeof domain !== 'string') {
          return res.status(400).json({ error: 'All domains must be strings' });
        }
      }
      
      // Warn if no domains specified
      if (value.length === 0) {
        logger.warn("No domains specified in settings - extension will not capture any logs or network requests. User should add domains through the extension popup.");
      }
    }

    await settingsStorage.updateSetting(key as keyof ExtensionSettings, value);
    
    logger.info(`Setting ${key} updated:`, value);
    res.json({ 
      [key]: value,
      message: `Setting '${key}' updated successfully` 
    });
  } catch (error) {
    logger.error(`Error updating setting ${req.params.key}:`, error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});