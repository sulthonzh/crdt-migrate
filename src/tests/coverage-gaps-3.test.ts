import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CRDTMigrator } from '../migrator';
import fs from 'fs/promises';
import path from 'path';

async function createTestDatabase(dbPath: string, sql: string): Promise<void> {
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

describe('Coverage Gaps Round 3 (2026-08-01)', () => {
  let testDbPath: string;
  let outputDir: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'gap3-test.db');
    outputDir = path.join(__dirname, 'gap3-output');
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.rm(outputDir, { recursive: true, force: true }); } catch {}
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Lines 276-277: SQLite PRAGMA foreign_key_list always returns 'NO ACTION' as
  // default for on_delete/on_update, so fk.onDelete/onUpdate are always truthy strings.
  // This test verifies that FKs without explicit actions get 'NO ACTION' in the output,
  // confirming lines 276-277 sub-expression paths are exercised with 'NO ACTION' values.
  it('should include ON DELETE NO ACTION for FKs without explicit actions', async () => {
    const sql = `
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE child (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent(id)
      );

      INSERT INTO parent (name) VALUES ('A');
      INSERT INTO child (parent_id) VALUES (1);
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false,
    });

    const preview = await migrator.preview();
    expect(preview.sqlFiles.length).toBeGreaterThan(0);

    // Read the generated migration SQL
    const files = await fs.readdir(outputDir);
    const migrationFile = files.find((f) => f.startsWith('migration-'));
    expect(migrationFile).toBeDefined();
    const content = await fs.readFile(path.join(outputDir, migrationFile!), 'utf-8');

    // SQLite always returns 'NO ACTION' — verify it appears in the FK clause
    const fkLines = content.split('\n').filter((l) => l.includes('FOREIGN KEY'));
 expect(fkLines.length).toBeGreaterThan(0);
    // SQLite PRAGMA returns 'NO ACTION' which is truthy, so ON DELETE is always emitted
    expect(fkLines.some((l) => l.includes('ON DELETE'))).toBe(true);
  });

  // Line 173: table with hasPrimaryKey=true but no individual column has primaryKey=true
  // This happens with composite PKs in some SQLite PRAGMA table_info interpretations
  it('should handle composite PK table where pkColumn lookup returns undefined', async () => {
    // SQLite PRAGMA table_info marks composite PK columns with pk=1, pk=2 etc.
    // The analyzer sets col.primaryKey = (pk > 0), so both columns get primaryKey=true.
    // However, table.primaryKeyType is detected from the first PK column's type.
    // For a table with composite PK where both cols are INTEGER:
    const sql = `
      CREATE TABLE junction (
        a_id INTEGER NOT NULL,
        b_id INTEGER NOT NULL,
        extra TEXT,
        PRIMARY KEY (a_id, b_id)
      );
      INSERT INTO junction (a_id, b_id, extra) VALUES (1, 1, 'x');
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false,
    });

    // Preview should work without crashing even with composite PK
    const preview = await migrator.preview();
    expect(preview.sqlFiles).toBeDefined();
  });

  // Line 218: databasePath || 'unknown.db' — falsy databasePath
  // The analyzer always sets databasePath from constructor arg, so this is defensive.
  // We can verify the path appears correctly in generated SQL.
  it('should include correct database path in SQL comment', async () => {
    const sql = `
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      INSERT INTO items (name) VALUES ('test');
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false,
    });

    const preview = await migrator.preview();
    const mainSqlFile = preview.sqlFiles.find((f) => f.includes('migration-') && !f.includes('data-'));
    expect(mainSqlFile).toBeDefined();
    const content = await fs.readFile(mainSqlFile!, 'utf-8');
    // Should contain the database path (not 'unknown.db')
    expect(content).toContain('-- Database:');
    expect(content).toContain('gap3-test.db');
  });
});
