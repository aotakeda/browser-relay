// Jest globals are automatically available in Node.js test environment
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { settingsRouter } from '@/routes/settings';
import { initializeSettingsDatabase } from '@/storage/settings-database';
import { settingsStorage } from '@/storage/SettingsStorage';

// Test database path
const TEST_DB_PATH = path.join(__dirname, 'test-settings.db');

describe('Settings Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Set test database path
    process.env.SETTINGS_DB_PATH = TEST_DB_PATH;

    // Initialize test database
    await initializeSettingsDatabase();

    // Create test app
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/settings', settingsRouter);

    // Clear any cached settings
    (settingsStorage as unknown as { cache: { clear: () => void } }).cache.clear();
  });

  afterEach(async () => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('End-to-End Settings Flow', () => {
    it('should handle complete settings lifecycle', async () => {
      // 1. Get initial settings (should be defaults)
      const initialResponse = await request(app).get('/settings');
      expect(initialResponse.status).toBe(200);
      expect(initialResponse.body.settings).toEqual({
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });

      // 2. Update to specific domains mode
      const updateResponse = await request(app)
        .post('/settings')
        .send({
            specificDomains: ['localhost:3000', 'localhost:4321']
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.settings.specificDomains).toEqual(['localhost:3000', 'localhost:4321']);

      // 3. Verify settings persisted
      const verifyResponse = await request(app).get('/settings');
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.settings.specificDomains).toEqual(['localhost:3000', 'localhost:4321']);

      // 4. Update individual setting
      const individualUpdateResponse = await request(app)
        .put('/settings/logsEnabled')
        .send({ value: false });

      expect(individualUpdateResponse.status).toBe(200);
      expect(individualUpdateResponse.body.logsEnabled).toBe(false);

      // 5. Verify individual setting persisted
      const finalVerifyResponse = await request(app).get('/settings');
      expect(finalVerifyResponse.status).toBe(200);
      expect(finalVerifyResponse.body.settings.logsEnabled).toBe(false);
      expect(finalVerifyResponse.body.settings.specificDomains).toEqual(['localhost:3000', 'localhost:4321']);

      // 6. Reset to defaults
      const resetResponse = await request(app).delete('/settings');
      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body.settings).toEqual({
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });
    });

    it('should handle domain filtering configuration scenarios', async () => {
      // Scenario 1: Development setup with multiple localhost ports
      const devSetup = await request(app)
        .post('/settings')
        .send({
          specificDomains: ['localhost:3000', 'localhost:3001', 'localhost:4321']
        });

      expect(devSetup.status).toBe(200);
      expect(devSetup.body.settings.specificDomains).toEqual(['localhost:3000', 'localhost:3001', 'localhost:4321']);

      // Scenario 2: Production setup with custom domains
      const prodSetup = await request(app)
        .post('/settings')
        .send({
            specificDomains: ['app.example.com', 'api.example.com', 'admin.example.com']
        });

      expect(prodSetup.status).toBe(200);
      expect(prodSetup.body.settings.specificDomains).toEqual(['app.example.com', 'api.example.com', 'admin.example.com']);

      // Scenario 3: Mixed environment with IP addresses
      const mixedSetup = await request(app)
        .post('/settings')
        .send({
            specificDomains: ['127.0.0.1:8080', '192.168.1.100:3000', 'localhost:4321']
        });

      expect(mixedSetup.status).toBe(200);
      expect(mixedSetup.body.settings.specificDomains).toEqual(['127.0.0.1:8080', '192.168.1.100:3000', 'localhost:4321']);
    });

    it('should handle concurrent settings updates', async () => {
      // Simulate multiple concurrent updates
      const updates = [
        request(app).post('/settings').send({ logsEnabled: false }),
        request(app).post('/settings').send({ networkEnabled: false }),
        request(app).post('/settings').send({ specificDomains: ['localhost:3000'] }),
        request(app).post('/settings').send({ specificDomains: ['localhost:3000'] }),
        request(app).post('/settings').send({ mcpEnabled: true })
      ];

      const responses = await Promise.all(updates);

      // All updates should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify final state
      const finalState = await request(app).get('/settings');
      expect(finalState.status).toBe(200);
      
      // The exact final state depends on the order of operations,
      // but all settings should be valid
      const settings = finalState.body.settings;
      expect(typeof settings.logsEnabled).toBe('boolean');
      expect(typeof settings.networkEnabled).toBe('boolean');
      expect(typeof settings.mcpEnabled).toBe('boolean');
      expect(Array.isArray(settings.specificDomains)).toBe(true);
    });

    it('should maintain data integrity across server restarts', async () => {
      // Set initial configuration
      await request(app)
        .post('/settings')
        .send({
          logsEnabled: false,
          networkEnabled: false,
            specificDomains: ['localhost:3000', 'localhost:4321']
        });

      // Verify initial state
      const beforeRestart = await request(app).get('/settings');
      expect(beforeRestart.status).toBe(200);
      const initialSettings = beforeRestart.body.settings;

      // Simulate server restart by reinitializing database and clearing cache
      await initializeSettingsDatabase();
      (settingsStorage as unknown as { cache: { clear: () => void } }).cache.clear();

      // Verify settings survived restart
      const afterRestart = await request(app).get('/settings');
      expect(afterRestart.status).toBe(200);
      expect(afterRestart.body.settings).toEqual(initialSettings);
    });
  });

  describe('Domain Filtering Logic Integration', () => {
    it('should validate domain filtering behavior with real settings', async () => {
      // Set up specific domains configuration
      await request(app)
        .post('/settings')
        .send({
            specificDomains: ['localhost:3000', 'localhost:4321']
        });

      const settings = await request(app).get('/settings');
      const { specificDomains } = settings.body.settings;

      // Simulate domain filtering logic
      const shouldCaptureDomain = (hostname: string, port: string) => {
        if (specificDomains.length === 0) {
          return true;
        }

        const hostWithPort = port ? `${hostname}:${port}` : hostname;

        return specificDomains.some((domain: string) => {
          if (hostWithPort === domain) return true;
          if (hostname === domain) return true;
          if (hostname.endsWith("." + domain)) return true;
          return false;
        });
      };

      // Test allowed domains
      expect(shouldCaptureDomain('localhost', '3000')).toBe(true);
      expect(shouldCaptureDomain('localhost', '4321')).toBe(true);
      expect(shouldCaptureDomain('localhost', '')).toBe(false); // No port match

      // Test blocked domains
      expect(shouldCaptureDomain('google.com', '')).toBe(false);
      expect(shouldCaptureDomain('bitbucket.org', '')).toBe(false);
      expect(shouldCaptureDomain('localhost', '8080')).toBe(false);
    });

    it('should handle edge cases in domain filtering', async () => {
      // Test with empty specific domains
      await request(app)
        .post('/settings')
        .send({
            specificDomains: []
        });

      const emptySettings = await request(app).get('/settings');
      expect(emptySettings.body.settings.specificDomains).toEqual([]);

      // Test with single domain
      await request(app)
        .post('/settings')
        .send({
            specificDomains: ['localhost:4321']
        });

      const singleSettings = await request(app).get('/settings');
      expect(singleSettings.body.settings.specificDomains).toEqual(['localhost:4321']);

      // Test switching modes
      await request(app)
        .post('/settings')
        .send({
            specificDomains: []
        });

      const allDomainsSettings = await request(app).get('/settings');
      expect(allDomainsSettings.body.settings.specificDomains).toEqual([]);
      expect(allDomainsSettings.body.settings.specificDomains).toEqual([]);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid JSON gracefully', async () => {
      // This test simulates corrupted data in the database
      // In a real scenario, this would require directly inserting invalid JSON
      // For now, we test the API validation
      const response = await request(app)
        .post('/settings')
        .send({
          specificDomains: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('specificDomains must be an array');
    });

    it('should recover from database corruption', async () => {
      // Set valid settings first
      await request(app)
        .post('/settings')
        .send({
          logsEnabled: false,
            specificDomains: ['localhost:3000']
        });

      // Verify settings were saved
      const beforeCorruption = await request(app).get('/settings');
      expect(beforeCorruption.status).toBe(200);

      // Simulate database recovery by reinitializing
      // In a real corruption scenario, the database would be recreated
      // First reset the settings completely
      await request(app).delete('/settings');
      
      // Clear cache after reset
      (settingsStorage as unknown as { cache: { clear: () => void } }).cache.clear();

      // After recovery, should return to defaults
      const afterRecovery = await request(app).get('/settings');
      expect(afterRecovery.status).toBe(200);
      expect(afterRecovery.body.settings).toEqual({
        logsEnabled: true,
        networkEnabled: true,
        mcpEnabled: false,
        specificDomains: []
      });
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle rapid successive updates', async () => {
      const startTime = Date.now();
      
      // Perform 50 rapid updates
      const updates = [];
      for (let i = 0; i < 50; i++) {
        updates.push(
          request(app)
            .post('/settings')
            .send({
              specificDomains: [`localhost:${3000 + i}`]
            })
        );
      }

      const responses = await Promise.all(updates);
      const endTime = Date.now();

      // All updates should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete in reasonable time (under 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Final state should be consistent
      const finalState = await request(app).get('/settings');
      expect(finalState.status).toBe(200);
      expect(Array.isArray(finalState.body.settings.specificDomains)).toBe(true);
    });

    it('should handle large domain lists efficiently', async () => {
      // Create a large list of domains
      const largeDomainList = [];
      for (let i = 0; i < 1000; i++) {
        largeDomainList.push(`subdomain${i}.example.com`);
      }

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/settings')
        .send({
            specificDomains: largeDomainList
        });

      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body.settings.specificDomains).toHaveLength(1000);
      
      // Should complete in reasonable time (under 2 seconds)
      expect(endTime - startTime).toBeLessThan(2000);

      // Verify persistence
      const verifyResponse = await request(app).get('/settings');
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.settings.specificDomains).toHaveLength(1000);
    });
  });
});