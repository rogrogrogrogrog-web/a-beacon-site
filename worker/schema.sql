-- Comments storage for the site Worker (D1 / SQLite).
-- Apply with:
--   npx wrangler d1 execute a-beacon-comments --remote --file worker/schema.sql
--   npx wrangler d1 execute a-beacon-comments --local  --file worker/schema.sql

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page       TEXT NOT NULL,                       -- e.g. /posts/devlog-004/
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved')),
  ip_hash    TEXT,                                -- salted hash, only used for rate limiting
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip   ON comments (ip_hash, created_at);
