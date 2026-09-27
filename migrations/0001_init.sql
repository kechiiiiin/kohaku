-- 琥珀（kohaku）初期スキーマ（設計書 3章）
CREATE TABLE pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  format       TEXT NOT NULL,                 -- 'md' | 'html'
  body         TEXT NOT NULL,                 -- 生ソース（md は配信時にレンダリング）
  body_hash    TEXT NOT NULL,                 -- sha256(body)
  source_path  TEXT,                          -- vault 内の相対パス（認証付き API でのみ返す）
  listed       INTEGER NOT NULL DEFAULT 1,    -- 0 = 一覧・sitemap に出さない＋noindex
  status       TEXT NOT NULL DEFAULT 'published', -- 'published' | 'deleted' | 'pending'（新規作成の途中）
  created_at   INTEGER NOT NULL,              -- epoch ms
  updated_at   INTEGER NOT NULL,              -- 本文・メタデータが変わった時刻
  deleted_at   INTEGER
);
CREATE INDEX idx_pages_list ON pages(status, listed, updated_at DESC);

CREATE TABLE page_tags (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (page_id, tag)
);
CREATE INDEX idx_tags_tag ON page_tags(tag);

CREATE TABLE assets (
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,                 -- ページ内の相対パス（例 img/01.jpg）
  r2_key       TEXT NOT NULL,                 -- <page_id>/<sha256>.<ext>
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  PRIMARY KEY (page_id, path)
);

CREATE TABLE redirects (
  from_slug  TEXT PRIMARY KEY,               -- 旧スラッグ
  to_slug    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
