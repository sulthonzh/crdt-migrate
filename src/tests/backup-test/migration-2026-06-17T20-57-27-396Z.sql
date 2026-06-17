-- CRDT Migration SQL
-- Generated: 2026-06-17T20-57-27-396Z
-- Database: /Users/sulthonzh/Data/projects/quadbyte/open-source-lab/crdt-migrate/src/tests/test-database.db
-- Total tables: 2
-- Issues found: 7

-- Enable foreign key constraints for better data integrity
PRAGMA foreign_keys = ON;

-- Enable recursive triggers for cascading updates
PRAGMA recursive_triggers = ON;


-- Table: users

-- Create new table with UUID primary key
CREATE TABLE users_new (
  id INTEGER TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  email TEXT NULL DEFAULT NULL,
  age INTEGER NULL DEFAULT NULL,
  created_at DATETIME NULL
);

-- Copy data and generate UUIDs
INSERT INTO users_new (name, email, age, created_at)
SELECT name, email, age, created_at FROM users;

-- Replace the old table
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Table: posts

-- Create new table with UUID primary key
CREATE TABLE posts_new (
  post_id INTEGER TEXT PRIMARY KEY,
  user_id INTEGER DEFAULT 0,
  title TEXT DEFAULT '',
  content TEXT NULL DEFAULT NULL,
  published BOOLEAN NULL,
  created_at DATETIME NULL
);

-- Copy data and generate UUIDs
INSERT INTO posts_new (user_id, title, content, published, created_at)
SELECT user_id, title, content, published, created_at FROM posts;

-- Create foreign key constraints
CREATE TABLE posts_new AS
SELECT t.*, r.uuid as id_ref
FROM posts t
LEFT JOIN users r ON t.user_id = r.id
WHERE TRUE;

-- Replace the old table
DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

-- Recreate foreign key constraints
ALTER TABLE posts
ADD CONSTRAINT fk_posts_user_id_users
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE ON UPDATE NO ACTION;

-- Data Migration SQL

-- Generate UUIDs for users primary keys
UPDATE users SET id = LOWER(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)));

-- Generate UUIDs for posts primary keys
UPDATE posts SET id = LOWER(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)));

-- Update foreign key references in posts
UPDATE posts
SET user_id = (SELECT id FROM users WHERE id = posts.user_id);

-- Cleanup

-- Reindex all tables
REINDEX;

-- Analyze database for better performance
ANALYZE;

-- Update statistics
UPDATE sqlite_master SET sql = NULL WHERE name IN (SELECT name FROM sqlite_master WHERE type = 'index');
