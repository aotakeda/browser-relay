// Jest globals are automatically available in Node.js test environment
import request from 'supertest';
import express from 'express';
import { settingsRouter } from '../settings';
import { settingsStorage } from '@/storage/SettingsStorage';

// Mock the settings storage
jest.mock('@/storage/SettingsStorage', () => ({
  settingsStorage: {
    getSettings: jest.fn(),
    getSetting: jest.fn(),
    updateSetting: jest.fn(),
    updateSettings: jest.fn(),
    resetSettings: jest.fn()
  }
}));

// Mock the logger
jest.mock('@/index', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockSettingsStorage = settingsStorage as jest.Mocked<typeof settingsStorage>;

describe('Settings Router', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/settings', settingsRouter);
    jest.clearAllMocks();
  });

  describe('GET /settings', () => {
    it('should return all settings successfully', async () => {
      const mockSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: ['localhost:3000', 'localhost:4321']
      };

      mockSettingsStorage.getSettings.mockResolvedValue(mockSettings);

      const response = await request(app).get('/settings');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ settings: mockSettings });
      expect(mockSettingsStorage.getSettings).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when fetching settings', async () => {
      mockSettingsStorage.getSettings.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/settings');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch settings' });
    });
  });

  describe('POST /settings', () => {
    it('should update settings successfully', async () => {
      const updates = {
        logsEnabled: false,
        specificDomains: ['localhost:3000']
      };

      const mockUpdatedSettings = {
        logsEnabled: false,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: ['localhost:3000']
      };

      mockSettingsStorage.updateSettings.mockResolvedValue(mockUpdatedSettings);

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        settings: mockUpdatedSettings,
        message: 'Settings updated successfully'
      });
      expect(mockSettingsStorage.updateSettings).toHaveBeenCalledWith(updates);
    });

    it('should reject invalid setting keys', async () => {
      const updates = {
        logsEnabled: true,
        invalidKey: 'value'
      };

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid setting keys: invalidKey'
      });
    });

    it('should validate boolean types', async () => {
      const updates = {
        logsEnabled: 'not-a-boolean'
      };

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'logsEnabled must be a boolean'
      });
    });

    it('should validate specificDomains array', async () => {
      const updates = {
        specificDomains: 'not-an-array'
      };

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'specificDomains must be an array'
      });
    });

    it('should validate specificDomains contains only strings', async () => {
      const updates = {
        specificDomains: ['localhost:3000', 123, 'localhost:4321']
      };

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'All domains must be strings'
      });
    });

    it('should handle database errors', async () => {
      const updates = { logsEnabled: false };
      mockSettingsStorage.updateSettings.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to update settings'
      });
    });
  });

  describe('DELETE /settings', () => {
    it('should reset settings to defaults successfully', async () => {
      const mockDefaultSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      };

      mockSettingsStorage.resetSettings.mockResolvedValue(mockDefaultSettings);

      const response = await request(app).delete('/settings');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        settings: mockDefaultSettings,
        message: 'Settings reset to defaults'
      });
      expect(mockSettingsStorage.resetSettings).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when resetting settings', async () => {
      mockSettingsStorage.resetSettings.mockRejectedValue(new Error('Database error'));

      const response = await request(app).delete('/settings');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to reset settings'
      });
    });
  });

  describe('GET /settings/:key', () => {
    it('should return specific setting successfully', async () => {
      mockSettingsStorage.getSetting.mockResolvedValue(['localhost:3000', 'localhost:4321']);

      const response = await request(app).get('/settings/specificDomains');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        specificDomains: ['localhost:3000', 'localhost:4321']
      });
      expect(mockSettingsStorage.getSetting).toHaveBeenCalledWith('specificDomains');
    });

    it('should reject invalid setting keys', async () => {
      const response = await request(app).get('/settings/invalidKey');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid setting key: invalidKey'
      });
    });

    it('should return 404 for non-existent settings', async () => {
      mockSettingsStorage.getSetting.mockResolvedValue(undefined);

      const response = await request(app).get('/settings/logsEnabled');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "Setting 'logsEnabled' not found"
      });
    });

    it('should handle database errors', async () => {
      mockSettingsStorage.getSetting.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/settings/logsEnabled');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch setting'
      });
    });
  });

  describe('PUT /settings/:key', () => {
    it('should update specific boolean setting successfully', async () => {
      mockSettingsStorage.updateSetting.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/settings/logsEnabled')
        .send({ value: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        logsEnabled: false,
        message: "Setting 'logsEnabled' updated successfully"
      });
      expect(mockSettingsStorage.updateSetting).toHaveBeenCalledWith('logsEnabled', false);
    });

    it('should update specificDomains array successfully', async () => {
      const domains = ['localhost:3000', 'localhost:4321'];
      mockSettingsStorage.updateSetting.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/settings/specificDomains')
        .send({ value: domains });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        specificDomains: domains,
        message: "Setting 'specificDomains' updated successfully"
      });
      expect(mockSettingsStorage.updateSetting).toHaveBeenCalledWith('specificDomains', domains);
    });

    it('should reject invalid setting keys', async () => {
      const response = await request(app)
        .put('/settings/invalidKey')
        .send({ value: true });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid setting key: invalidKey'
      });
    });

    it('should require value in request body', async () => {
      const response = await request(app)
        .put('/settings/logsEnabled')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Value is required'
      });
    });

    it('should validate boolean values for boolean settings', async () => {
      const response = await request(app)
        .put('/settings/logsEnabled')
        .send({ value: 'not-a-boolean' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'logsEnabled must be a boolean'
      });
    });

    it('should validate specificDomains array format', async () => {
      const response = await request(app)
        .put('/settings/specificDomains')
        .send({ value: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'specificDomains must be an array'
      });
    });

    it('should validate specificDomains contains only strings', async () => {
      const response = await request(app)
        .put('/settings/specificDomains')
        .send({ value: ['localhost:3000', 123] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'All domains must be strings'
      });
    });

    it('should handle database errors', async () => {
      mockSettingsStorage.updateSetting.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/settings/logsEnabled')
        .send({ value: false });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to update setting'
      });
    });
  });

  describe('Domain filtering scenarios', () => {
    it('should handle switching from all domains to specific domains', async () => {
      const updates = {
        specificDomains: ['localhost:3000', 'localhost:4321']
      };

      const mockUpdatedSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: ['localhost:3000', 'localhost:4321']
      };

      mockSettingsStorage.updateSettings.mockResolvedValue(mockUpdatedSettings);

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.settings.specificDomains).toEqual(['localhost:3000', 'localhost:4321']);
    });

    it('should handle clearing specific domains list', async () => {
      const updates = {
        specificDomains: []
      };

      const mockUpdatedSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      };

      mockSettingsStorage.updateSettings.mockResolvedValue(mockUpdatedSettings);

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.settings.specificDomains).toEqual([]);
    });

    it('should handle complex domain patterns', async () => {
      const domains = [
        'localhost:3000',
        'localhost:4321', 
        '127.0.0.1:8080',
        'dev.example.com',
        'staging.example.com:3000'
      ];

      const updates = {
        specificDomains: domains
      };

      const mockUpdatedSettings = {
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: domains
      };

      mockSettingsStorage.updateSettings.mockResolvedValue(mockUpdatedSettings);

      const response = await request(app)
        .post('/settings')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.settings.specificDomains).toEqual(domains);
    });
  });
});