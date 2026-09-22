-- Classics Counsel MCP
-- D1 / SQLite schema
-- 设计目标：新增典籍时只增加数据，不修改核心表结构。

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 程序内部使用的唯一名称，例如 shiji / zizhi-tongjian
  slug TEXT NOT NULL UNIQUE,

  -- 书名，例如 史记
  title TEXT NOT NULL,

  -- 作者 / 编者，例如 司马迁
  author TEXT,

  -- 时代，例如 西汉
  era TEXT,

  -- 原文来源
  source_name TEXT,
  source_url TEXT,

  -- 版本、整理方式等说明
  edition_note TEXT,

  -- 简短介绍
  description TEXT,

  -- 是否启用。以后可以暂时停用一本书而不用删除数据
  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);


CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  book_id INTEGER NOT NULL,

  -- 卷、篇、章等一级定位
  chapter TEXT,

  -- 更细一级的小节名称，可为空
  section TEXT,

  -- 原文
  text TEXT NOT NULL,

  -- 在整本书中的排列顺序
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- 可选：以后人工或 AI 生成的简短摘要
  summary TEXT,

  -- 可选：存一些扩展信息。
  -- 例如人物、地点、事件等；第一版暂时不用。
  metadata_json TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (book_id)
    REFERENCES books(id)
    ON DELETE CASCADE
);


-- 标签本身单独保存。
-- 以后可以有：师生关系、职场、选择与取舍、识人、风险……
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);


-- 一段原文可以有多个标签，一个标签也可以属于很多段原文。
CREATE TABLE IF NOT EXISTS passage_tags (
  passage_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,

  PRIMARY KEY (passage_id, tag_id),

  FOREIGN KEY (passage_id)
    REFERENCES passages(id)
    ON DELETE CASCADE,

  FOREIGN KEY (tag_id)
    REFERENCES tags(id)
    ON DELETE CASCADE
);


-- 常用查询索引

CREATE INDEX IF NOT EXISTS idx_books_title
ON books(title);

CREATE INDEX IF NOT EXISTS idx_books_enabled
ON books(enabled);

CREATE INDEX IF NOT EXISTS idx_passages_book
ON passages(book_id);

CREATE INDEX IF NOT EXISTS idx_passages_book_order
ON passages(book_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_passages_chapter
ON passages(chapter);

CREATE INDEX IF NOT EXISTS idx_passage_tags_tag
ON passage_tags(tag_id);
