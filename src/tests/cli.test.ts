import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const exec = promisify(execCb);

// Create a test database
async function createTestDatabase(dbPath: string): Promise<void> {
  const sql = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    );

    INSERT INTO users (name, email) VALUES 
    ('John Doe', 'john@example.com'),
    ('Jane Smith', 'jane@example.com');
  `;

  const { Database } = await import('sqlite3');
  const db = new Database(dbPath);
  
  await new Promise<void>((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  await new Promise<void>((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe('CLI Tests', { timeout: 30000 }, () => {
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'cli-test.db');
    // Clean up any leftover database files
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.unlink(path.join(__dirname, 'crdt-cli-test.db')); } catch {}
    await createTestDatabase(testDbPath);
  });

  afterEach(async () => {
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.unlink(path.join(__dirname, 'crdt-cli-test.db')); } catch {}
    try { await fs.rm(path.join(process.cwd(), 'preview'), { recursive: true, force: true }); } catch {}
  });

  it('should show help', async () => {
    const { stdout } = await exec('node dist/index.js --help');
    expect(stdout).toContain('crdt-migrate');
    expect(stdout).toContain('CLI tool for migrating SQLite databases');
  });

  it('should analyze database and show issues', async () => {
    const { stdout } = await exec(`node dist/index.js analyze ${testDbPath}`);
    expect(stdout).toContain('Analyzing database');
    expect(stdout).toContain('Analysis complete');
    expect(stdout).toContain('AUTO_INCREMENT_PRIMARY_KEY');
    expect(stdout).toContain('NON_TEXT_PRIMARY_KEY');
  });

  it('should generate preview of migration', async () => {
    const { stdout } = await exec(`node dist/index.js preview ${testDbPath} --output ./preview`);
    expect(stdout).toContain('Generating preview');
    expect(stdout).toContain('Preview generated');
    expect(stdout).toContain('Migration SQL files');
  });

  it('should handle database that is already CRDT compatible', async () => {
    // Create a CRDT-compatible database
    const crdtDbPath = path.join(__dirname, 'crdt-cli-test.db');
    const sql = `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `;

    const { Database } = await import('sqlite3');
    const db = new Database(crdtDbPath);
    
    await new Promise<void>((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const { stdout } = await exec(`node dist/index.js analyze ${crdtDbPath}`);
    expect(stdout).toContain('Database is CRDT compatible');

    await fs.unlink(crdtDbPath);
  });

  it('should handle missing database file gracefully', async () => {
    try {
      await exec(`node dist/index.js analyze ${path.join(__dirname, 'nonexistent.db')}`);
      expect(true).toBe(false); // Should have thrown
    } catch (err: any) {
      const output = (err.stderr || '') + (err.stdout || '');
      expect(output).toContain('failed');
    }
  });
});