-- Classics Counsel MCP
-- Legacy D1 / SQLite schema
-- v1.0 已不再使用此方案作为正文主存储。

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  era TEXT,
  source_name TEXT,
  source_url TEXT,
  edition_note TEXT,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter TEXT,
  section TEXT,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS passage_tags (
  passage_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (passage_id, tag_id),
  FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_enabled ON books(enabled);
CREATE INDEX IF NOT EXISTS idx_passages_book ON passages(book_id);
CREATE INDEX IF NOT EXISTS idx_passages_book_order ON passages(book_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_passages_chapter ON passages(chapter);
CREATE INDEX IF NOT EXISTS idx_passage_tags_tag ON passage_tags(tag_id);
