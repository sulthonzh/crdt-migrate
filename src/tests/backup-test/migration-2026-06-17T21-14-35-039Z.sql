-- CRDT Migration SQL
-- Generated: 2026-06-17T21-14-35-039Z
-- Database: /Users/sulthonzh/Data/projects/quadbyte/open-source-lab/crdt-migrate/src/tests/test-database.db
-- Total tables: 2
-- Issues found: 7

-- Enable foreign key constraints for better data integrity
PRAGMA foreign_keys = ON;

-- Enable recursive triggers for cascading updates
PRAGMA recursive_triggers = ON;

-- Table: users
CREATE TABLE users (
  id INTEGER DEFAULT 0,
  name TEXT NOT NULL,
  email TEXT DEFAULT "",
  age INTEGER DEFAULT 0,
  created_at DATETIME,
  PRIMARY KEY (id)
);

-- Table: posts
CREATE TABLE posts (
  post_id INTEGER DEFAULT 0,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT "",
  published BOOLEAN,
  created_at DATETIME,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION
);

