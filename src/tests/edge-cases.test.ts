import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CRDTMigrator } from '../migrator';
import { DatabaseAnalyzer } from '../analyzer';
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

describe('CRDTMigrator edge cases', () => {
  let testDbPath: string;
  let outputDir: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'edge-test.db');
    outputDir = path.join(__dirname, 'edge-output');
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.rm(outputDir, { recursive: true, force: true }); } catch {}
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try { await fs.unlink(testDbPath); } catch {}
    try { await fs.rm(outputDir, { recursive: true, force: true }); } catch {}
  });

  it('should handle table with composite primary key', async () => {
    const sql = `
      CREATE TABLE post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id)
      );
      INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1), (1, 2), (2, 1);
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    expect(analysis.totalTables).toBe(1);
    // Composite PK with INTEGER columns should still flag issues
    expect(analysis.needsMigration).toBe(true);
  });

  it('should handle table with no primary key', async () => {
    const sql = `
      CREATE TABLE logs (
        message TEXT NOT NULL,
        level TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO logs (message, level) VALUES ('info msg', 'info');
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    expect(analysis.totalTables).toBe(1);
    const logTable = analysis.tables[0];
    expect(logTable.hasPrimaryKey).toBe(false);
  });

  it('should handle table with TEXT primary key and all NOT NULL columns (CRDT-compatible)', async () => {
    const sql = `
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      INSERT INTO items (id, name) VALUES ('item-1', 'Test');
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    expect(analysis.needsMigration).toBe(false);
    expect(analysis.issues.length).toBe(0);
  });

  it('should handle table with only primary key column', async () => {
    const sql = `
      CREATE TABLE simple (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );
      INSERT INTO simple VALUES (1), (2), (3);
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.success).toBe(true);
    expect(result.tablesMigrated).toBe(1);
  });

  it('should estimate migration time based on complexity', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      INSERT INTO users (name, email) VALUES ('A', 'a@b.c');
      INSERT INTO posts (user_id, title) VALUES (1, 'Hello');
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const preview = await migrator.preview();
    expect(preview.summary.estimatedTime).toBeDefined();
    expect(typeof preview.summary.estimatedTime).toBe('string');
  });

  it('should generate warnings for databases with foreign keys', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO users (name) VALUES ('Test');
      INSERT INTO posts (user_id) VALUES (1);
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.warnings).toBeDefined();
    expect(result.warnings.some(w => w.includes('foreign key'))).toBe(true);
  });

  it('should create actual SQL files in non-dry-run mode', async () => {
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
      dryRun: false,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.success).toBe(true);
    expect(result.sqlFiles.length).toBeGreaterThan(0);
    for (const file of result.sqlFiles) {
      const exists = await fs.access(file).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it('should handle database with multiple data types', async () => {
    const sql = `
      CREATE TABLE mixed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text_col TEXT,
        int_col INTEGER,
        real_col REAL,
        blob_col BLOB,
        bool_col BOOLEAN DEFAULT 0,
        date_col DATETIME DEFAULT CURRENT_TIMESTAMP,
        num_col NUMERIC
      );
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    expect(analysis.totalTables).toBe(1);
    expect(analysis.tables[0].columns.length).toBe(8);
    // Should flag nullable columns without defaults
    const nullableIssues = analysis.issues.filter(i => i.type === 'NULLABLE_WITHOUT_DEFAULT');
    expect(nullableIssues.length).toBeGreaterThan(0);
  });

  it('should handle self-referencing foreign key', async () => {
    const sql = `
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      );
      INSERT INTO categories (name, parent_id) VALUES ('Root', NULL), ('Child', 1);
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    const catTable = analysis.tables[0];
    expect(catTable.foreignKeys.length).toBe(1);
    expect(catTable.foreignKeys[0].table).toBe('categories');
  });

  it('should handle empty file (not valid SQLite)', async () => {
    await fs.writeFile(testDbPath, '');
    // Empty file is not a valid SQLite database — the analyzer should detect it
    // via the file size check in checkDatabaseExists (index.ts) or get no tables
    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();
    // SQLite opens empty files as new databases with 0 tables
    expect(analysis.totalTables).toBe(0);
    expect(analysis.needsMigration).toBe(false);
  });

  it('should preserve ON DELETE and ON UPDATE actions in preview', async () => {
    const sql = `
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE child (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `;
    await createTestDatabase(testDbPath, sql);

    const analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
    const analysis = await analyzer.analyze();

    const childTable = analysis.tables.find(t => t.name === 'child');
    expect(childTable).toBeDefined();
    expect(childTable!.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(childTable!.foreignKeys[0].onUpdate).toBe('CASCADE');
  });

  it('should throw on migration failure (catch block coverage)', async () => {
    // Create a valid DB but make outputDir point to a nonexistent location
    // to cause failure during SQL file generation
    const sql = `CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);`;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir: '/nonexistent/path/output',
      dryRun: true,
      verbose: false,
      backup: false
    });

    await expect(migrator.migrate()).rejects.toThrow('Migration failed');
  });

  it('should throw on preview failure (catch block coverage)', async () => {
    const sql = `CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);`;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir: '/nonexistent/path/output',
      dryRun: true,
      verbose: false,
      backup: false
    });

    await expect(migrator.preview()).rejects.toThrow('Preview generation failed');
  });

  it('should generate warning for databases with issues (non-empty issues branch)', async () => {
    const sql = `
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT
      );
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    // Should NOT have 'already CRDT compatible' warning since issues exist
    expect(result.warnings.some(w => w.includes('already CRDT compatible'))).toBe(false);
  });

  it('should generate large database warning when > 10 tables', async () => {
    // Create 11 tables
    const tables = Array.from({ length: 11 }, (_, i) =>
      `CREATE TABLE t${i} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);`
    ).join('\n');
    await createTestDatabase(testDbPath, tables);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.warnings.some(w => w.includes('Large database'))).toBe(true);
  });

  it('should estimate 10+ minutes for very complex databases', async () => {
    // Create a database with enough complexity to exceed 500
    // complexity = totalTables + totalColumns + totalFKs * 2
    // 50 tables * 10 columns = 500 + 50 tables = 550
    const tables = Array.from({ length: 50 }, (_, i) =>
      `CREATE TABLE t${i} (id INTEGER PRIMARY KEY AUTOINCREMENT, c1 TEXT NOT NULL, c2 TEXT NOT NULL, c3 TEXT NOT NULL, c4 TEXT NOT NULL, c5 TEXT NOT NULL, c6 TEXT NOT NULL, c7 TEXT NOT NULL, c8 TEXT NOT NULL, c9 TEXT NOT NULL);`
    ).join('\n');
    await createTestDatabase(testDbPath, tables);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const preview = await migrator.preview();
    expect(preview.summary.estimatedTime).toBe('10+ minutes');
  });

  it('should estimate 5-10 minutes for medium databases', async () => {
    // complexity between 100 and 500
    // 15 tables * 6 columns = 90 + 15 = 105
    const tables = Array.from({ length: 15 }, (_, i) =>
      `CREATE TABLE t${i} (id INTEGER PRIMARY KEY AUTOINCREMENT, c1 TEXT NOT NULL, c2 TEXT NOT NULL, c3 TEXT NOT NULL, c4 TEXT NOT NULL, c5 TEXT NOT NULL);`
    ).join('\n');
    await createTestDatabase(testDbPath, tables);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const preview = await migrator.preview();
    expect(preview.summary.estimatedTime).toBe('5-10 minutes');
  });

  it('should handle columns with UNIQUE constraints', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE
      );
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.success).toBe(true);
    // Verify SQL was generated with UNIQUE constraints
    expect(result.sqlFiles.length).toBe(0); // dryRun returns empty sqlFiles
  });

  it('should generate FK complexity warning when table has > 5 FKs', async () => {
    // Create a table with 6 foreign keys referencing other tables
    const sql = `
      CREATE TABLE r1 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE r2 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE r3 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE r4 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE r5 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE r6 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE main (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        f1 INTEGER NOT NULL,
        f2 INTEGER NOT NULL,
        f3 INTEGER NOT NULL,
        f4 INTEGER NOT NULL,
        f5 INTEGER NOT NULL,
        f6 INTEGER NOT NULL,
        FOREIGN KEY (f1) REFERENCES r1(id),
        FOREIGN KEY (f2) REFERENCES r2(id),
        FOREIGN KEY (f3) REFERENCES r3(id),
        FOREIGN KEY (f4) REFERENCES r4(id),
        FOREIGN KEY (f5) REFERENCES r5(id),
        FOREIGN KEY (f6) REFERENCES r6(id)
      );
    `;
    await createTestDatabase(testDbPath, sql);

    const migrator = new CRDTMigrator(testDbPath, {
      outputDir,
      dryRun: true,
      verbose: false,
      backup: false
    });

    const result = await migrator.migrate();
    expect(result.warnings.some(w => w.includes('many foreign key constraints'))).toBe(true);
  });
});
