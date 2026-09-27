import type { AssetRow, PageRow } from "./types.ts";

export const PAGE_SIZE = 50;

export type ListItem = {
  slug: string;
  title: string;
  description: string;
  updated_at: number;
  tags: string[];
  head: string; // description が空のときの本文の頭（それ以外は空）
};

function splitTags(s: string | null): string[] {
  return s ? s.split("\u001f").filter(Boolean).sort() : [];
}

const TAGS_SUBQ = `(SELECT group_concat(tag, char(31)) FROM page_tags t WHERE t.page_id = p.id)`;

/** 公開中かつ掲載のページ（更新日の新しい順）。tag を渡せば絞り込み */
export async function listPublic(db: D1Database, opts: { tag?: string; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.tag
    ? `p.status = 'published' AND p.listed = 1 AND EXISTS (SELECT 1 FROM page_tags x WHERE x.page_id = p.id AND x.tag = ?1)`
    : `p.status = 'published' AND p.listed = 1`;
  const binds = opts.tag ? [opts.tag] : [];
  const rows = await db
    .prepare(
      `SELECT p.slug, p.title, p.description, p.updated_at, ${TAGS_SUBQ} AS tags,
              CASE WHEN p.description = '' THEN substr(p.body, 1, 2000) ELSE '' END AS head
       FROM pages p WHERE ${where}
       ORDER BY p.updated_at DESC, p.id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`
    )
    .bind(...binds)
    .all<{ slug: string; title: string; description: string; updated_at: number; tags: string | null; head: string | null }>();
  const items: ListItem[] = rows.results.map((r) => ({ ...r, head: r.head ?? "", tags: splitTags(r.tags) }));
  const hasNext = items.length > PAGE_SIZE;
  return { items: items.slice(0, PAGE_SIZE), hasNext, page };
}

/** タグと件数（公開中かつ掲載のページだけを数える。件数の多い順） */
export async function tagCounts(db: D1Database): Promise<{ tag: string; count: number }[]> {
  const r = await db
    .prepare(
      `SELECT t.tag AS tag, COUNT(*) AS count FROM page_tags t JOIN pages p ON p.id = t.page_id
       WHERE p.status = 'published' AND p.listed = 1
       GROUP BY t.tag ORDER BY count DESC, t.tag ASC`
    )
    .all<{ tag: string; count: number }>();
  return r.results.map((x) => ({ tag: x.tag, count: Number(x.count) }));
}

export async function getPage(db: D1Database, slug: string): Promise<PageRow | null> {
  return db.prepare(`SELECT * FROM pages WHERE slug = ?1`).bind(slug).first<PageRow>();
}

export async function getTags(db: D1Database, pageId: number): Promise<string[]> {
  const r = await db.prepare(`SELECT tag FROM page_tags WHERE page_id = ?1 ORDER BY tag`).bind(pageId).all<{ tag: string }>();
  return r.results.map((x) => x.tag);
}

export async function getAssets(db: D1Database, pageId: number): Promise<AssetRow[]> {
  const r = await db.prepare(`SELECT * FROM assets WHERE page_id = ?1 ORDER BY path`).bind(pageId).all<AssetRow>();
  return r.results;
}

export async function getAsset(db: D1Database, pageId: number, path: string): Promise<AssetRow | null> {
  return db.prepare(`SELECT * FROM assets WHERE page_id = ?1 AND path = ?2`).bind(pageId, path).first<AssetRow>();
}

export async function getRedirect(db: D1Database, slug: string): Promise<string | null> {
  const r = await db.prepare(`SELECT to_slug FROM redirects WHERE from_slug = ?1`).bind(slug).first<{ to_slug: string }>();
  return r?.to_slug ?? null;
}

/** [[リンク]] の解決表の元（公開中のページ。非掲載も URL を知れば見えるので含める） */
export async function linkRows(db: D1Database) {
  const r = await db
    .prepare(`SELECT slug, title, source_path FROM pages WHERE status = 'published'`)
    .all<{ slug: string; title: string; source_path: string | null }>();
  return r.results;
}

/** 認証付き一覧（非掲載・削除済みも含む） */
export async function listAll(db: D1Database) {
  const r = await db
    .prepare(
      `SELECT p.slug, p.title, p.listed, p.status, p.updated_at, p.body_hash, p.source_path, ${TAGS_SUBQ} AS tags
       FROM pages p WHERE p.status != 'pending' ORDER BY p.updated_at DESC`
    )
    .all<{
      slug: string;
      title: string;
      listed: number;
      status: string;
      updated_at: number;
      body_hash: string;
      source_path: string | null;
      tags: string | null;
    }>();
  return r.results.map((x) => ({ ...x, listed: x.listed === 1, tags: splitTags(x.tags) }));
}

export async function sitemapRows(db: D1Database) {
  const r = await db
    .prepare(`SELECT slug, updated_at FROM pages WHERE status = 'published' AND listed = 1 ORDER BY updated_at DESC`)
    .all<{ slug: string; updated_at: number }>();
  return r.results;
}
