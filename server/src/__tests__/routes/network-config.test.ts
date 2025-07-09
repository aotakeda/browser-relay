import request from 'supertest';
import express from 'express';
import { networkConfigRouter } from '../../routes/network-config';

const app = express();
app.use(express.json());
app.use('/network-config', networkConfigRouter);

describe('Network Config Routes', () => {
  describe('GET /network-config', () => {
    it('should return default configuration', async () => {
      const response = await request(app)
        .get('/network-config')
        .expect(200);

      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toMatchObject({
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        statusCodes: []
      });
    });
  });

  describe('POST /network-config', () => {
    it('should update network configuration', async () => {
      const newConfig = {
        enabled: false,
        captureMode: 'include',
        urlPatterns: ['api.*', '*.json'],
        includeHeaders: false,
        maxResponseBodySize: 100000
      };

      const response = await request(app)
        .post('/network-config')
        .send(newConfig)
        .expect(200);

      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toMatchObject(newConfig);
      expect(response.body).toHaveProperty('message');
    });

    it('should validate capture mode', async () => {
      const invalidConfig = {
        captureMode: 'invalid'
      };

      await request(app)
        .post('/network-config')
        .send(invalidConfig)
        .expect(400);
    });

    it('should validate boolean fields', async () => {
      const invalidConfig = {
        enabled: 'not-a-boolean'
      };

      await request(app)
        .post('/network-config')
        .send(invalidConfig)
        .expect(400);
    });

    it('should validate array fields', async () => {
      const invalidConfig = {
        urlPatterns: 'not-an-array'
      };

      await request(app)
        .post('/network-config')
        .send(invalidConfig)
        .expect(400);
    });

    it('should validate numeric fields', async () => {
      const invalidConfig = {
        maxResponseBodySize: -1
      };

      await request(app)
        .post('/network-config')
        .send(invalidConfig)
        .expect(400);
    });
  });

  describe('POST /network-config/reset', () => {
    it('should reset configuration to defaults', async () => {
      // First modify the configuration
      await request(app)
        .post('/network-config')
        .send({
          enabled: false,
          captureMode: 'exclude',
          urlPatterns: ['test.*']
        });

      // Then reset it
      const response = await request(app)
        .post('/network-config/reset')
        .expect(200);

      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toMatchObject({
        enabled: true,
        captureMode: 'all',
        urlPatterns: [],
        includeHeaders: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeQueryParams: true,
        maxResponseBodySize: 50000,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        statusCodes: []
      });
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Configuration persistence', () => {
    it('should persist configuration changes across requests', async () => {
      const newConfig = {
        enabled: false,
        captureMode: 'include',
        urlPatterns: ['api.*'],
        includeHeaders: false
      };

      // Update configuration
      await request(app)
        .post('/network-config')
        .send(newConfig)
        .expect(200);

      // Verify it persists
      const response = await request(app)
        .get('/network-config')
        .expect(200);

      expect(response.body.config).toMatchObject(newConfig);
    });
  });
});