import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

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

describe('CLI Tests', () => {
  let testDbPath: string;
  let buildDir: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'cli-test.db');
    buildDir = path.join(__dirname, 'dist');
    
    await fs.mkdir(buildDir, { recursive: true });
    await createTestDatabase(testDbPath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should show help', async () => {
    const result = await exec('node dist/index.js --help');
    expect(result.stdout).toContain('crdt-migrate');
    expect(result.stdout).toContain('CLI tool for migrating SQLite databases');
  });

  it('should analyze database and show issues', async () => {
    const result = await exec(`node dist/index.js analyze ${testDbPath}`);
    expect(result.stdout).toContain('Analyzing database');
    expect(result.stdout).toContain('Analysis complete');
    expect(result.stdout).toContain('AUTO_INCREMENT_PRIMARY_KEY');
    expect(result.stdout).toContain('NON_TEXT_PRIMARY_KEY');
  });

  it('should generate preview of migration', async () => {
    const result = await exec(`node dist/index.js preview ${testDbPath} --output ./preview`);
    expect(result.stdout).toContain('Generating preview');
    expect(result.stdout).toContain('Preview generated');
    expect(result.stdout).toContain('Migration SQL files');
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

    const result = await exec(`node dist/index.js analyze ${crdtDbPath}`);
    expect(result.stdout).toContain('Database is CRDT compatible');

    await fs.unlink(crdtDbPath);
  });

  it('should handle missing database file gracefully', async () => {
    const result = await exec(`node dist/index.js analyze nonexistent.db`);
    expect(result.stderr).toContain('failed');
  });
});