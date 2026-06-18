import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CRDTMigrator } from '../migrator';
import { DatabaseAnalyzer } from '../analyzer';
import fs from 'fs/promises';
import path from 'path';

// Create a test database with schema issues
async function createTestDatabase(dbPath: string): Promise<void> {
  const sql = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      age INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE posts (
      post_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Insert some test data
    INSERT INTO users (name, email, age) VALUES 
    ('John Doe', 'john@example.com', 30),
    ('Jane Smith', 'jane@example.com', 25);

    INSERT INTO posts (user_id, title, content, published) VALUES 
    (1, 'First Post', 'This is my first post', 1),
    (2, 'Second Post', 'This is another post', 0);
  `;

  const db = new (require('sqlite3').Database)(dbPath);
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

describe('CRDTMigrator', () => {
  let testDbPath: string;
  let outputDir: string;
  let migrator: CRDTMigrator;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'migrator-test.db');
    outputDir = path.join(__dirname, 'output');
    
    // Clean up any leftover files
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.unlink(path.join(__dirname, 'migrator-crdt.db')); } catch {}
    try { await fs.unlink(path.join(__dirname, 'migrator-complex.db')); } catch {}
    try { await fs.unlink(path.join(__dirname, 'migrator-empty.db')); } catch {}
    try { await fs.rm(outputDir, { recursive: true, force: true }); } catch {}
    
    await fs.mkdir(outputDir, { recursive: true });
    await createTestDatabase(testDbPath);
    
    migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: false,
      verbose: false,
      backup: false
    });
  });

  afterEach(async () => {
    try {
      // Clean up test database and output files
      await fs.unlink(testDbPath);
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should generate migration preview', async () => {
    const preview = await migrator.preview();

    expect(preview.sqlFiles.length).toBeGreaterThan(0); // SQL files generated for preview
    expect(preview.summary.tablesToMigrate).toBe(2); // users and posts tables
    expect(preview.summary.primaryKeysToConvert).toBe(2);
    expect(preview.summary.foreignKeysToUpdate).toBe(1);
    expect(preview.summary.columnsToModify).toBeGreaterThan(0);
    expect(preview.warnings).toBeDefined();
  });

  it('should generate migration SQL files in dry run mode', async () => {
    const migratorWithDryRun = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migratorWithDryRun.migrate();

    expect(result.success).toBe(true);
    expect(result.sqlFiles).toHaveLength(0); // No files actually created in dry run
    expect(result.tablesMigrated).toBe(2);
    expect(result.issuesResolved).toBeGreaterThan(0);
    expect(result.warnings).toBeDefined();
  });

  it('should create backup file when requested', async () => {
    const backupDir = path.join(__dirname, 'backup-test');
    await fs.mkdir(backupDir, { recursive: true });

    const migratorWithBackup = new CRDTMigrator(testDbPath, {
      outputDir: backupDir,
      dryRun: false,
      verbose: false,
      backup: true
    });

    const result = await migratorWithBackup.migrate();

    expect(result.backupFile).toBeDefined();
    await fs.access(result.backupFile!); // Throws if doesn't exist

    // Cleanup
    await fs.rm(backupDir, { recursive: true, force: true });
  });

  it('should handle database that is already CRDT compatible', async () => {
    // Create a CRDT-compatible database
    const crdtDbPath = path.join(__dirname, 'migrator-crdt.db');
    try { await fs.unlink(crdtDbPath); } catch {}
    const crdtSql = `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (id, name, email) VALUES 
      ('550e8400-e29b-41d4-a716-446655440000', 'John Doe', 'john@example.com');
    `;

    const db = new (require('sqlite3').Database)(crdtDbPath);
    await new Promise<void>((resolve, reject) => {
      db.exec(crdtSql, (err) => {
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

    const crdtMigrator = new CRDTMigrator(crdtDbPath, {
      outputDir,
      dryRun: false,
      verbose: false,
      backup: false
    });

    const result = await crdtMigrator.migrate();

    expect(result.success).toBe(true);
    expect(result.message).toBe('Database is already CRDT compatible');
    expect(result.tablesMigrated).toBe(0);
    expect(result.issuesResolved).toBe(0);

    // Cleanup
    await fs.unlink(crdtDbPath);
  });

  it('should handle empty database', async () => {
    const emptyDbPath = path.join(__dirname, 'migrator-empty.db');
    try { await fs.unlink(emptyDbPath); } catch {}
    const db = new (require('sqlite3').Database)(emptyDbPath);
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const emptyMigrator = new CRDTMigrator(emptyDbPath, {
      outputDir,
      dryRun: false,
      verbose: false,
      backup: false
    });

    const result = await emptyMigrator.migrate();

    expect(result.success).toBe(true);
    expect(result.tablesMigrated).toBe(0);
    expect(result.issuesResolved).toBe(0);

    // Cleanup
    await fs.unlink(emptyDbPath);
  });

  it('should generate warnings for complex schemas', async () => {
    // Create a database with complex foreign key relationships
    const complexDbPath = path.join(__dirname, 'migrator-complex.db');
    try { await fs.unlink(complexDbPath); } catch {}
    const complexSql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE posts (
        post_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE comments (
        comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        comment TEXT,
        FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE tags (
        tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
      );

      INSERT INTO users (name) VALUES ('John'), ('Jane');
      INSERT INTO posts (user_id, title) VALUES (1, 'First'), (2, 'Second');
      INSERT INTO comments (post_id, user_id, comment) VALUES (1, 1, 'Good');
      INSERT INTO tags (name) VALUES ('tech'), ('news');
      INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1), (2, 2);
    `;

    const db = new (require('sqlite3').Database)(complexDbPath);
    await new Promise<void>((resolve, reject) => {
      db.exec(complexSql, (err) => {
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

    const complexMigrator = new CRDTMigrator(complexDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await complexMigrator.migrate();

    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('foreign key'))).toBe(true);

    // Cleanup
    await fs.unlink(complexDbPath);
  });
});