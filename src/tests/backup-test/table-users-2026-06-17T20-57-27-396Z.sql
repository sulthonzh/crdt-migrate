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

