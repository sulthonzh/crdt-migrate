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

