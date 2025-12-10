import { describe, it, expect } from 'vitest';

// Note: These tests are for the exported API types and structure
// Actual browser API tests would require a browser environment

describe('Browser API Types', () => {
  it('should have correct module structure', async () => {
    // This test verifies that the module can be imported
    // In a real browser environment, you would test actual functionality
    
    const browserModule = await import('../../src/browser');
    
    expect(browserModule).toBeDefined();
    expect(typeof browserModule.read).toBe('function');
    expect(typeof browserModule.write).toBe('function');
    expect(typeof browserModule.convert).toBe('function');
    expect(typeof browserModule.merge).toBe('function');
    expect(typeof browserModule.isGpuAvailable).toBe('function');
    expect(typeof browserModule.getGpuAdapters).toBe('function');
    expect(typeof browserModule.setQuiet).toBe('function');
  });

  it('should export DataTable and Column classes', async () => {
    const browserModule = await import('../../src/browser');
    
    expect(browserModule.DataTable).toBeDefined();
    expect(browserModule.Column).toBeDefined();
  });
});

describe('API Function Signatures', () => {
  it('should have correct read function signature', async () => {
    const { read } = await import('../../src/browser');
    
    // read takes (input, options?) where options is optional
    expect(read.length).toBe(1); // Only required param counts
  });

  it('should have correct write function signature', async () => {
    const { write } = await import('../../src/browser');
    
    // write takes (dataTable, format, options?) where options is optional
    expect(write.length).toBe(2); // Only required params count
  });

  it('should have correct convert function signature', async () => {
    const { convert } = await import('../../src/browser');
    
    // Check that function accepts correct parameters
    expect(convert.length).toBe(2); // input, options
  });
});
