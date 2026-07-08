import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../logger';

describe('Logger', () => {
  let logger: Logger;
  const originalLog = console.log;
  const originalError = console.error;
  const originalTable = console.table;
  let logOutput: string[];
  let errorOutput: string[];
  let tableOutput: unknown[][];

  beforeEach(() => {
    logOutput = [];
    errorOutput = [];
    tableOutput = [];
    console.log = (...args: unknown[]) => { logOutput.push(args.join(' ')); };
    console.error = (...args: unknown[]) => { errorOutput.push(args.join(' ')); };
    console.table = (data: unknown[]) => { tableOutput.push(data); };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.table = originalTable;
  });

  it('should log info messages with ℹ symbol', () => {
    logger = new Logger(false);
    logger.info('test message');
    expect(logOutput[0]).toContain('ℹ');
    expect(logOutput[0]).toContain('test message');
  });

  it('should log success messages with ✓ symbol', () => {
    logger = new Logger(false);
    logger.success('done');
    expect(logOutput[0]).toContain('✓');
    expect(logOutput[0]).toContain('done');
  });

  it('should log warn messages with ⚠ symbol', () => {
    logger = new Logger(false);
    logger.warn('careful');
    expect(logOutput[0]).toContain('⚠');
    expect(logOutput[0]).toContain('careful');
  });

  it('should log error messages with ✗ symbol to stderr', () => {
    logger = new Logger(false);
    logger.error('broken');
    expect(errorOutput[0]).toContain('✗');
    expect(errorOutput[0]).toContain('broken');
  });

  it('should not log debug messages when verbose is false', () => {
    logger = new Logger(false);
    logger.debug('secret');
    expect(logOutput.length).toBe(0);
  });

  it('should log debug messages when verbose is true', () => {
    logger = new Logger(true);
    logger.debug('secret');
    expect(logOutput[0]).toContain('🔍');
    expect(logOutput[0]).toContain('secret');
  });

  it('should not call console.table when verbose is false', () => {
    logger = new Logger(false);
    logger.table([{ a: 1 }]);
    expect(tableOutput.length).toBe(0);
  });

  it('should call console.table when verbose is true', () => {
    logger = new Logger(true);
    logger.table([{ a: 1 }]);
    expect(tableOutput.length).toBe(1);
    expect(tableOutput[0]).toEqual([{ a: 1 }]);
  });

  it('should handle empty string messages', () => {
    logger = new Logger(false);
    logger.info('');
    logger.success('');
    logger.warn('');
    logger.error('');
    expect(logOutput.length).toBe(3);
    expect(errorOutput.length).toBe(1);
  });

  it('should handle special characters in messages', () => {
    logger = new Logger(false);
    logger.info('message with "quotes" and \\backslashes\\');
    expect(logOutput[0]).toContain('quotes');
    expect(logOutput[0]).toContain('backslashes');
  });

  it('should handle Unicode messages', () => {
    logger = new Logger(false);
    logger.info('日本語テスト 🎉');
    expect(logOutput[0]).toContain('日本語テスト');
    expect(logOutput[0]).toContain('🎉');
  });

  it('should accept empty array for table()', () => {
    logger = new Logger(true);
    logger.table([]);
    expect(tableOutput.length).toBe(1);
    expect(tableOutput[0]).toEqual([]);
  });
});
