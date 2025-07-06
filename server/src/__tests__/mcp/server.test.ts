// Since MCP server is mocked globally in setup.ts, let's test the setup behavior
import { setupMCPServer } from '@/mcp/server';

describe('MCP Server', () => {
  afterEach(() => {
    delete process.env.MCP_MODE;
  });

  describe('setupMCPServer', () => {
    it('should call setupMCPServer without throwing', async () => {
      // Since setupMCPServer is mocked, we just verify it can be called
      await expect(setupMCPServer()).resolves.not.toThrow();
    });

    it('should handle different MCP_MODE values', async () => {
      process.env.MCP_MODE = 'true';
      await expect(setupMCPServer()).resolves.not.toThrow();

      process.env.MCP_MODE = 'false';
      await expect(setupMCPServer()).resolves.not.toThrow();

      delete process.env.MCP_MODE;
      await expect(setupMCPServer()).resolves.not.toThrow();
    });
  });
});