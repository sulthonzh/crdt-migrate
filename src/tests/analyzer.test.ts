import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseAnalyzer, AnalyzerOptions } from '../analyzer';
import { DatabaseAnalysis } from '../types';
import fs from 'fs/promises';
import path from 'path';

// Create a test database with various schema issues
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

    CREATE TABLE comments (
      comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Insert some test data
    INSERT INTO users (name, email, age) VALUES 
    ('John Doe', 'john@example.com', 30),
    ('Jane Smith', 'jane@example.com', 25);

    INSERT INTO posts (user_id, title, content, published) VALUES 
    (1, 'First Post', 'This is my first post', 1),
    (2, 'Second Post', 'This is another post', 0);

    INSERT INTO comments (post_id, user_id, comment) VALUES
    (1, 1, 'Great post!'),
    (2, 1, 'Interesting take');
  `;

  // Create a temporary database file
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

describe('DatabaseAnalyzer', () => {
  let testDbPath: string;
  let analyzer: DatabaseAnalyzer;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, 'test-database.db');
    await createTestDatabase(testDbPath);
    analyzer = new DatabaseAnalyzer(testDbPath, { verbose: false });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should analyze database and identify CRDT compatibility issues', async () => {
    const analysis = await analyzer.analyze();

    expect(analysis.databasePath).toBe(testDbPath);
    expect(analysis.totalTables).toBe(3);
    expect(analysis.needsMigration).toBe(true);
    expect(analysis.issues.length).toBeGreaterThan(0);

    // Check for auto-increment primary keys
    const autoIncrementIssues = analysis.issues.filter(issue => 
      issue.type === 'AUTO_INCREMENT_PRIMARY_KEY'
    );
    expect(autoIncrementIssues.length).toBe(3); // users, posts, comments

    // Check for non-TEXT primary keys
    const nonTextIssues = analysis.issues.filter(issue => 
      issue.type === 'NON_TEXT_PRIMARY_KEY'
    );
    expect(nonTextIssues.length).toBe(3); // users, posts, comments

    // Check for nullable columns without defaults
    const nullableIssues = analysis.issues.filter(issue => 
      issue.type === 'NULLABLE_WITHOUT_DEFAULT'
    );
    expect(nullableIssues.length).toBeGreaterThan(0); // age, content, published, comment

    // Check for foreign key constraints
    const fkIssues = analysis.issues.filter(issue => 
      issue.type === 'FOREIGN_KEY_CONSTRAINTS'
    );
    expect(fkIssues.length).toBe(2); // users and posts (comments FKs are not directly on comments table)
  });

  it('should generate accurate summary', async () => {
    const analysis = await analyzer.analyze();
    expect(analysis.summary).toContain('Migration required');
    expect(analysis.summary).toContain('AUTO_INCREMENT_PRIMARY_KEY');
    expect(analysis.summary).toContain('NON_TEXT_PRIMARY_KEY');
    expect(analysis.summary).toContain('NULLABLE_WITHOUT_DEFAULT');
    expect(analysis.summary).toContain('FOREIGN_KEY_CONSTRAINTS');
  });

  it('should analyze table schema correctly', async () => {
    const analysis = await analyzer.analyze();
    const usersTable = analysis.tables.find(t => t.name === 'users');
    
    expect(usersTable).toBeDefined();
    expect(usersTable.hasPrimaryKey).toBe(true);
    expect(usersTable.primaryKeyType).toBe('INTEGER');
    expect(usersTable.hasAutoIncrement).toBe(true);
    expect(usersTable.nullableColumns).toContain('age');
    expect(usersTable.foreignKeys).toEqual([]);
    expect(usersTable.issues.length).toBeGreaterThan(0);
  });

  it('should analyze foreign key constraints correctly', async () => {
    const analysis = await analyzer.analyze();
    const postsTable = analysis.tables.find(t => t.name === 'posts');
    
    expect(postsTable).toBeDefined();
    expect(postsTable.foreignKeys.length).toBe(1);
    expect(postsTable.foreignKeys[0].from).toBe('user_id');
    expect(postsTable.foreignKeys[0].table).toBe('users');
    expect(postsTable.foreignKeys[0].to).toBe('id');
  });

  it('should handle database with no issues (CRDT compatible)', async () => {
    // Create a CRDT-compatible database
    const crdtDbPath = path.join(__dirname, 'crdt-database.db');
    const sql = `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;

    const db = new (require('sqlite3').Database)(crdtDbPath);
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

    const crdtAnalyzer = new DatabaseAnalyzer(crdtDbPath, { verbose: false });
    const analysis = await crdtAnalyzer.analyze();

    expect(analysis.needsMigration).toBe(false);
    expect(analysis.issues.length).toBe(0);
    expect(analysis.summary).toBe('Database schema is CRDT compatible');

    // Cleanup
    await fs.unlink(crdtDbPath);
  });

  it('should handle empty database', async () => {
    const emptyDbPath = path.join(__dirname, 'empty-database.db');
    const db = new (require('sqlite3').Database)(emptyDbPath);
    await new Promise<void>((resolve, reject) => {
      db.exec('', (err) => {
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

    const emptyAnalyzer = new DatabaseAnalyzer(emptyDbPath, { verbose: false });
    const analysis = await emptyAnalyzer.analyze();

    expect(analysis.totalTables).toBe(0);
    expect(analysis.needsMigration).toBe(false);
    expect(analysis.issues.length).toBe(0);

    // Cleanup
    await fs.unlink(emptyDbPath);
  });
});