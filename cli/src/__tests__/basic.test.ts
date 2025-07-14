/**
 * Basic test to verify Jest setup
 */

describe('Basic Test Suite', () => {
  it('should run basic test', () => {
    // Arrange
    const input = 2 + 2;
    
    // Act
    const result = input;
    
    // Assert
    expect(result).toBe(4);
  });
  
  it('should handle async operations', async () => {
    // Arrange
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Act
    const start = Date.now();
    await delay(10);
    const end = Date.now();
    
    // Assert
    expect(end - start).toBeGreaterThanOrEqual(10);
  });
});