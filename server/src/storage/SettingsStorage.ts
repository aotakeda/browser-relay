import { 
  settingsRunAsync, 
  settingsAllAsync, 
  settingsGetAsync 
} from './settings-database';

export interface ExtensionSettings {
  logsEnabled: boolean;
  networkEnabled: boolean;
  mcpEnabled: boolean;
  specificDomains: string[];
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

class SettingsStorage {
  private cache: Map<string, unknown> = new Map();
  private listeners: Array<(settings: ExtensionSettings) => void> = [];

  async getSettings(): Promise<ExtensionSettings> {
    try {
      const rows = await settingsAllAsync<SettingRow>('SELECT key, value FROM extension_settings');
      
      const settings: Partial<ExtensionSettings> = {};
      
      for (const row of rows) {
        try {
          const parsedValue = JSON.parse(row.value);
          settings[row.key as keyof ExtensionSettings] = parsedValue;
          this.cache.set(row.key, parsedValue);
        } catch (parseError) {
          console.warn(`Failed to parse setting ${row.key}:`, parseError);
        }
      }

      // Ensure all required settings are present with defaults
      const defaultSettings: ExtensionSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      };

      return { ...defaultSettings, ...settings } as ExtensionSettings;
    } catch (error) {
      console.error('Failed to get settings:', error);
      throw error;
    }
  }

  async getSetting<T>(key: keyof ExtensionSettings): Promise<T | undefined> {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key) as T;
      }

      const row = await settingsGetAsync<SettingRow>('SELECT value FROM extension_settings WHERE key = ?', [key]);
      
      if (row) {
        try {
          const parsedValue = JSON.parse(row.value);
          this.cache.set(key, parsedValue);
          return parsedValue;
        } catch (parseError) {
          console.warn(`Failed to parse setting ${key}:`, parseError);
        }
      }
      
      return undefined;
    } catch (error) {
      console.error(`Failed to get setting ${key}:`, error);
      throw error;
    }
  }

  async updateSetting(key: keyof ExtensionSettings, value: unknown): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      
      await settingsRunAsync(`
        INSERT OR REPLACE INTO extension_settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [key, jsonValue]);

      // Update cache
      this.cache.set(key, value);

      // Notify listeners
      const settings = await this.getSettings();
      this.notifyListeners(settings);
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      throw error;
    }
  }

  async updateSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    try {
      // Update each setting
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) {
          const jsonValue = JSON.stringify(value);
          
          await settingsRunAsync(`
            INSERT OR REPLACE INTO extension_settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
          `, [key, jsonValue]);

          // Update cache
          this.cache.set(key, value);
        }
      }

      // Get updated settings
      const updatedSettings = await this.getSettings();
      
      // Notify listeners
      this.notifyListeners(updatedSettings);
      
      return updatedSettings;
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  async resetSettings(): Promise<ExtensionSettings> {
    try {
      // Clear all settings
      await settingsRunAsync('DELETE FROM extension_settings');
      
      // Clear cache
      this.cache.clear();

      // Insert default settings
      const defaultSettings: ExtensionSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      };

      for (const [key, value] of Object.entries(defaultSettings)) {
        await settingsRunAsync(`
          INSERT INTO extension_settings (key, value) 
          VALUES (?, ?)
        `, [key, JSON.stringify(value)]);

        this.cache.set(key, value);
      }

      // Notify listeners
      this.notifyListeners(defaultSettings);
      
      return defaultSettings;
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  }

  // Event system for real-time updates
  onSettingsChange(listener: (settings: ExtensionSettings) => void): void {
    this.listeners.push(listener);
  }

  offSettingsChange(listener: (settings: ExtensionSettings) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(settings: ExtensionSettings): void {
    this.listeners.forEach(listener => {
      try {
        listener(settings);
      } catch (error) {
        console.error('Error in settings listener:', error);
      }
    });
  }
}

// Export singleton instance
export const settingsStorage = new SettingsStorage();