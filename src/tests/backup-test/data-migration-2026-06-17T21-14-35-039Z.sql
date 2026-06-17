-- CRDT Data Migration Script
-- Generated: 2026-06-17T21-14-35-039Z

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Convert users data to UUID
INSERT INTO users (id, SELECT  FROM users;

-- Convert posts data to UUID
INSERT INTO posts (id, SELECT  FROM posts;

