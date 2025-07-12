// Jest globals are automatically available in Node.js test environment
import { settingsStorage } from '../SettingsStorage';
import { settingsRunAsync, settingsAllAsync, settingsGetAsync } from '../settings-database';

// Mock the database functions
jest.mock('../settings-database', () => ({
  settingsRunAsync: jest.fn(),
  settingsAllAsync: jest.fn(),
  settingsGetAsync: jest.fn()
}));

const mockSettingsRunAsync = settingsRunAsync as jest.MockedFunction<typeof settingsRunAsync>;
const mockSettingsAllAsync = settingsAllAsync as jest.MockedFunction<typeof settingsAllAsync>;
const mockSettingsGetAsync = settingsGetAsync as jest.MockedFunction<typeof settingsGetAsync>;

describe('SettingsStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear internal cache
    (settingsStorage as unknown as { cache: { clear: () => void } }).cache.clear();
    (settingsStorage as unknown as { listeners: unknown[] }).listeners = [];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return default settings when no data exists', async () => {
      mockSettingsAllAsync.mockResolvedValue([]);

      const settings = await settingsStorage.getSettings();

      expect(settings).toEqual({
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });
    });

    it('should return settings from database with proper defaults', async () => {
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'false', updated_at: '2023-01-01' },
        { key: 'specificDomains', value: '["localhost:3000", "localhost:4321"]', updated_at: '2023-01-01' }
      ]);

      const settings = await settingsStorage.getSettings();

      expect(settings).toEqual({
        logsEnabled: false,
        networkEnabled: true, // default
        mcpEnabled: false, // default
        specificDomains: ['localhost:3000', 'localhost:4321']
      });
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'invalid-json', updated_at: '2023-01-01' },
      ]);

      const settings = await settingsStorage.getSettings();

      expect(settings).toEqual({
        logsEnabled: true, // default due to parse error
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse setting logsEnabled:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should cache settings properly', async () => {
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'false', updated_at: '2023-01-01' }
      ]);

      await settingsStorage.getSettings();
      
      // Cache should contain the parsed value
      expect((settingsStorage as unknown as { cache: { get: (key: string) => unknown } }).cache.get('logsEnabled')).toBe(false);
    });
  });

  describe('getSetting', () => {
    it('should return cached value when available', async () => {
      (settingsStorage as unknown as { cache: { set: (key: string, value: unknown) => void } }).cache.set('logsEnabled', false);

      const result = await settingsStorage.getSetting('logsEnabled');

      expect(result).toBe(false);
      expect(mockSettingsGetAsync).not.toHaveBeenCalled();
    });

    it('should fetch from database when not cached', async () => {
      mockSettingsGetAsync.mockResolvedValue({
        value: 'false'
      });

      const result = await settingsStorage.getSetting('logsEnabled');

      expect(result).toBe(false);
      expect(mockSettingsGetAsync).toHaveBeenCalledWith(
        'SELECT value FROM extension_settings WHERE key = ?',
        ['logsEnabled']
      );
      expect((settingsStorage as unknown as { cache: { get: (key: string) => unknown } }).cache.get('logsEnabled')).toBe(false);
    });

    it('should return undefined when setting does not exist', async () => {
      mockSettingsGetAsync.mockResolvedValue(undefined);

      const result = await settingsStorage.getSetting('logsEnabled');

      expect(result).toBeUndefined();
    });
  });

  describe('updateSetting', () => {
    it('should update single setting successfully', async () => {
      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'false', updated_at: '2023-01-01' }
      ]);

      await settingsStorage.updateSetting('logsEnabled', false);

      expect(mockSettingsRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO extension_settings'),
        ['logsEnabled', 'false']
      );
      expect((settingsStorage as unknown as { cache: { get: (key: string) => unknown } }).cache.get('logsEnabled')).toBe(false);
    });

    it('should notify listeners when setting is updated', async () => {
      const listener = jest.fn();
      settingsStorage.onSettingsChange(listener);

      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'false', updated_at: '2023-01-01' }
      ]);

      await settingsStorage.updateSetting('logsEnabled', false);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        logsEnabled: false
      }));
    });
  });

  describe('updateSettings', () => {
    it('should update multiple settings successfully', async () => {
      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'logsEnabled', value: 'false', updated_at: '2023-01-01' },
        { key: 'specificDomains', value: '["localhost:3000"]', updated_at: '2023-01-01' }
      ]);

      const updates = {
        logsEnabled: false,
        specificDomains: ['localhost:3000']
      };

      const result = await settingsStorage.updateSettings(updates);

      expect(mockSettingsRunAsync).toHaveBeenCalledTimes(2);
      expect(result).toEqual(expect.objectContaining({
        logsEnabled: false,
        specificDomains: ['localhost:3000']
      }));
    });

    it('should skip undefined values', async () => {
      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });
      mockSettingsAllAsync.mockResolvedValue([]);

      const updates = {
        logsEnabled: false,
        specificDomains: ['localhost:3000']
      };

      await settingsStorage.updateSettings(updates);

      expect(mockSettingsRunAsync).toHaveBeenCalledTimes(2); // Only for defined values
    });
  });

  describe('resetSettings', () => {
    it('should reset all settings to defaults', async () => {
      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });

      const result = await settingsStorage.resetSettings();

      expect(mockSettingsRunAsync).toHaveBeenCalledWith('DELETE FROM extension_settings');
      expect(result).toEqual({
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });
    });

    it('should clear cache when resetting', async () => {
      (settingsStorage as unknown as { cache: { set: (key: string, value: unknown) => void } }).cache.set('logsEnabled', false);
      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });

      await settingsStorage.resetSettings();

      expect((settingsStorage as unknown as { cache: { get: (key: string) => unknown } }).cache.get('logsEnabled')).toBe(true); // Reset to default
    });
  });

  describe('domain filtering logic', () => {
    it('should handle specific domains mode correctly', async () => {
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'specificDomains', value: '["localhost:3000", "localhost:4321"]', updated_at: '2023-01-01' }
      ]);

      const settings = await settingsStorage.getSettings();

      expect(settings.specificDomains).toEqual(['localhost:3000', 'localhost:4321']);
    });

    it('should handle empty domains list correctly', async () => {
      mockSettingsAllAsync.mockResolvedValue([
        { key: 'specificDomains', value: '[]', updated_at: '2023-01-01' }
      ]);

      const settings = await settingsStorage.getSettings();

      expect(settings.specificDomains).toEqual([]);
    });
  });

  describe('event system', () => {
    it('should add and remove listeners correctly', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      settingsStorage.onSettingsChange(listener1);
      settingsStorage.onSettingsChange(listener2);

      expect((settingsStorage as unknown as { listeners: unknown[] }).listeners).toHaveLength(2);

      settingsStorage.offSettingsChange(listener1);
      
      expect((settingsStorage as unknown as { listeners: unknown[] }).listeners).toHaveLength(1);
      expect((settingsStorage as unknown as { listeners: unknown[] }).listeners).toContain(listener2);
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      settingsStorage.onSettingsChange(errorListener);
      settingsStorage.onSettingsChange(goodListener);

      mockSettingsRunAsync.mockResolvedValue({ changes: 1, lastID: 1 });
      mockSettingsAllAsync.mockResolvedValue([]);

      await settingsStorage.updateSetting('logsEnabled', false);

      expect(consoleSpy).toHaveBeenCalledWith('Error in settings listener:', expect.any(Error));
      expect(goodListener).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});