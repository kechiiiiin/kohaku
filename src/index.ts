import { Hono } from "hono";
import type { Context } from "hono";
import type { AssetRow, Env, Finding, PageRow } from "./types.ts";
import { checkBearer } from "./auth.ts";
import { blocking, checkText, hasGpsExif } from "./check.ts";
import {
  getAsset,
  getAssets,
  getPage,
  getRedirect,
  getTags,
  linkRows,
  listAll,
  listPublic,
  sitemapRows,
  tagCounts,
} from "./db.ts";
import { statusPage } from "./layout.ts";
import { listPage, robotsTxt, sitemapXml } from "./pages.ts";
import { buildLinkTable, renderMarkdownPage } from "./render.ts";
import { contentTypeFor, extOf, ORIGIN, sanitizePath, sha256Hex, slugError } from "./util.ts";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_ASSETS = 30;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;
const MAX_TITLE = 120;
const MAX_DESC = 200;

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

function apiError(c: Ctx, status: number, error: string, findings?: Finding[]) {
  return c.json(findings ? { error, findings } : { error }, status as 400);
}

// ---------- 認証（/api/* すべて） ----------

app.use("/api/*", async (c, next) => {
  const r = checkBearer(c.req.header("Authorization"), c.env);
  if (r === "unconfigured") return apiError(c, 503, "API_TOKEN が設定されていません");
  if (r === "unauthorized") return apiError(c, 401, "認証に失敗しました");
  await next();
});

// ---------- 入力の検証 ----------

type PageInput = {
  title: string;
  description: string;
  tags: string[];
  format: "md" | "html";
  body: string;
  sourcePath: string | null;
  listed: boolean;
  assets: string[];
  acknowledge: string[];
};

function validTags(input: unknown): string[] | string {
  if (!Array.isArray(input)) return "tags は配列で指定してください";
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") return "タグは文字列です";
    const s = t.trim();
    if (!s) return "空のタグは使えません";
    if (s.length > MAX_TAG_LEN) return `タグは${MAX_TAG_LEN}文字までです: ${s}`;
    if (/[\/\\?#%\u0000-\u001f\u007f]/.test(s)) return `タグに使えない文字があります: ${s}`;
    if (!out.includes(s)) out.push(s);
  }
  if (out.length === 0) return "タグを1個以上付けてください";
  if (out.length > MAX_TAGS) return `タグは${MAX_TAGS}個までです`;
  return out;
}

function validatePageInput(j: any): PageInput | string {
  if (!j || typeof j !== "object") return "page パートの JSON が不正です";
  const title = typeof j.title === "string" ? j.title.trim() : "";
  if (!title) return "title は必須です";
  if (title.length > MAX_TITLE) return `title は${MAX_TITLE}文字までです`;
  const description = typeof j.description === "string" ? j.description.trim() : "";
  if (description.length > MAX_DESC) return `description は${MAX_DESC}文字までです`;
  const tags = validTags(j.tags);
  if (typeof tags === "string") return tags;
  if (j.format !== "md" && j.format !== "html") return "format は md か html です";
  if (typeof j.body !== "string" || !j.body.trim()) return "body は必須です";
  if (new TextEncoder().encode(j.body).length > MAX_BODY_BYTES) return "body は1MBまでです";
  let sourcePath: string | null = null;
  if (j.sourcePath != null) {
    if (typeof j.sourcePath !== "string" || j.sourcePath.length > 512) return "sourcePath が不正です";
    sourcePath = j.sourcePath;
  }
  if (j.listed != null && typeof j.listed !== "boolean") return "listed は true/false です";
  const assetsIn = j.assets ?? [];
  if (!Array.isArray(assetsIn)) return "assets は配列です";
  if (assetsIn.length > MAX_ASSETS) return `アセットは1ページ${MAX_ASSETS}個までです`;
  const assets: string[] = [];
  for (const a of assetsIn) {
    const p = typeof a === "string" ? sanitizePath(a) : null;
    if (!p) return `アセットのパスが不正です: ${a}`;
    if (!contentTypeFor(p)) return `この種類のアセットは置けません: ${p}`;
    if (assets.includes(p)) return `アセットのパスが重複しています: ${p}`;
    assets.push(p);
  }
  const ack = Array.isArray(j.acknowledge) ? j.acknowledge.filter((x: unknown) => typeof x === "string") : [];
  return {
    title,
    description,
    tags,
    format: j.format,
    body: j.body,
    sourcePath,
    listed: j.listed ?? true,
    assets,
    acknowledge: ack,
  };
}

type Upload = { page: PageInput; files: Map<string, Uint8Array> };

async function parseUpload(c: Ctx): Promise<Upload | string> {
  const ct = c.req.header("Content-Type") ?? "";
  if (!ct.startsWith("multipart/form-data")) return "multipart/form-data で送ってください";
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return "multipart の解析に失敗しました";
  }
  const pagePart = form.get("page");
  if (pagePart == null) return "page パートがありません";
  const pageText = typeof pagePart === "string" ? pagePart : await (pagePart as unknown as Blob).text();
  let json: unknown;
  try {
    json = JSON.parse(pageText);
  } catch {
    return "page パートの JSON が不正です";
  }
  const page = validatePageInput(json);
  if (typeof page === "string") return page;
  const files = new Map<string, Uint8Array>();
  for (const [name, value] of form.entries()) {
    if (name !== "asset" && !name.startsWith("asset:")) continue;
    if (typeof value === "string") return "asset パートはファイルで送ってください";
    const file = value as unknown as File;
    const raw = name === "asset" ? file.name : name.slice("asset:".length);
    const path = sanitizePath(raw ?? "");
    if (!path) return `アセットのパスが不正です: ${raw}`;
    if (!page.assets.includes(path)) return `assets に無いアセットが送られました: ${path}`;
    if (files.has(path)) return `アセットが重複しています: ${path}`;
    if (file.size > MAX_ASSET_BYTES) return `アセットは1個10MBまでです: ${path}`;
    files.set(path, new Uint8Array(await file.arrayBuffer()));
  }
  return { page, files };
}

function runChecks(env: Env, page: PageInput, files: Map<string, Uint8Array>): Finding[] {
  const findings = checkText({
    title: page.title,
    description: page.description,
    body: page.body,
    apiToken: env.API_TOKEN,
    denylist: env.DENYLIST,
  });
  for (const [path, bytes] of files) {
    if (hasGpsExif(bytes)) findings.push({ rule: "exif-gps", line: 0, excerpt: path });
    const ct = contentTypeFor(path) ?? "";
    if (/^(text|application\/json|image\/svg)/.test(ct)) {
      const text = new TextDecoder().decode(bytes);
      for (const f of checkText({ title: "", description: "", body: text, apiToken: env.API_TOKEN, denylist: env.DENYLIST })) {
        findings.push({ ...f, excerpt: `${path}: ${f.excerpt}` });
      }
    }
  }
  return findings;
}

// ---------- API ----------

app.get("/api/tags", async (c) => c.json(await tagCounts(c.env.DB)));

app.get("/api/pages", async (c) => c.json(await listAll(c.env.DB)));

async function livePage(c: Ctx): Promise<PageRow | null> {
  const p = await getPage(c.env.DB, c.req.param("slug") ?? "");
  return p && p.status !== "pending" ? p : null;
}

app.get("/api/pages/:slug", async (c) => {
  const p = await livePage(c);
  if (!p) return apiError(c, 404, "ページがありません");
  const [tags, assets] = await Promise.all([getTags(c.env.DB, p.id), getAssets(c.env.DB, p.id)]);
  return c.json({
    slug: p.slug,
    url: `${ORIGIN}/${p.slug}/`,
    title: p.title,
    description: p.description,
    format: p.format,
    tags,
    listed: p.listed === 1,
    status: p.status,
    bodyHash: p.body_hash,
    sourcePath: p.source_path,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at,
    assets: assets.map((a) => ({ path: a.path, sha256: a.sha256, size: a.size, contentType: a.content_type })),
  });
});

app.get("/api/pages/:slug/source", async (c) => {
  const p = await livePage(c);
  if (!p) return apiError(c, 404, "ページがありません");
  return new Response(p.body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});

app.post("/api/check", async (c) => {
  const up = await parseUpload(c);
  if (typeof up === "string") return apiError(c, 400, up);
  const findings = runChecks(c.env, up.page, up.files);
  const block = blocking(findings, up.page.acknowledge);
  return c.json({ ok: block.length === 0, findings, blocking: block });
});

app.put("/api/pages/:slug", async (c) => {
  const db = c.env.DB;
  const slug = c.req.param("slug");
  const se = slugError(slug);
  if (se) return apiError(c, 400, se);
  const up = await parseUpload(c);
  if (typeof up === "string") return apiError(c, 400, up);
  const { page, files } = up;

  const found = await getPage(db, slug);
  const existing = found && found.status !== "pending" ? found : null;
  if (existing && c.req.header("If-None-Match")?.trim() === "*") {
    return apiError(c, 412, `スラッグ ${slug} は既に使われています`);
  }
  if (existing?.status === "deleted") return apiError(c, 409, "削除済みのスラッグです。先に restore か purge をしてください");
  if (!existing && (await getRedirect(db, slug))) return apiError(c, 409, "旧スラッグ（転送元）には置けません");

  const oldAssets: AssetRow[] = found ? await getAssets(db, found.id) : [];
  const oldByPath = new Map(oldAssets.map((a) => [a.path, a]));
  for (const p of page.assets) {
    if (!files.has(p) && !oldByPath.has(p)) return apiError(c, 400, `アセットが送られていません: ${p}`);
  }

  const findings = runChecks(c.env, page, files);
  const block = blocking(findings, page.acknowledge);
  if (block.length) return apiError(c, 422, "公開前チェックで止まりました", block);

  const now = Date.now();
  const bodyHash = await sha256Hex(page.body);
  let id: number;
  let createdRow = false;
  if (found) {
    id = found.id;
  } else {
    // 新規は先に pending 行で id を取る（R2 キーに使う）。公開側は pending を見せない
    const r = await db
      .prepare(
        `INSERT INTO pages (slug, title, description, format, body, body_hash, source_path, listed, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9) RETURNING id`
      )
      .bind(slug, page.title, page.description, page.format, page.body, bodyHash, page.sourcePath, page.listed ? 1 : 0, now)
      .first<{ id: number }>();
    id = r!.id;
    createdRow = true;
  }

  // アセット: 送られたものを R2 へ
  const newRows: AssetRow[] = [];
  const putKeys: string[] = [];
  try {
    for (const [path, bytes] of files) {
      const sha = await sha256Hex(bytes);
      const key = `${id}/${sha}.${extOf(path)}`;
      const ct = contentTypeFor(path)!;
      const old = oldByPath.get(path);
      if (!old || old.r2_key !== key) {
        await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: ct } });
        putKeys.push(key);
      }
      newRows.push({ page_id: id, path, r2_key: key, content_type: ct, size: bytes.byteLength, sha256: sha });
    }

    const oldTags = found ? await getTags(db, id) : [];
    const removed = oldAssets.filter((a) => !page.assets.includes(a.path));
    const assetsChanged =
      removed.length > 0 || newRows.some((r) => oldByPath.get(r.path)?.sha256 !== r.sha256);
    const changed =
      !existing ||
      existing.body_hash !== bodyHash ||
      existing.title !== page.title ||
      existing.description !== page.description ||
      existing.format !== page.format ||
      existing.listed !== (page.listed ? 1 : 0) ||
      existing.source_path !== page.sourcePath ||
      [...oldTags].sort().join("\u001f") !== [...page.tags].sort().join("\u001f") ||
      assetsChanged;
    const updatedAt = changed ? now : existing!.updated_at;

    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE pages SET title = ?2, description = ?3, format = ?4, body = ?5, body_hash = ?6, source_path = ?7,
           listed = ?8, status = 'published', updated_at = ?9, deleted_at = NULL WHERE id = ?1`
        )
        .bind(id, page.title, page.description, page.format, page.body, bodyHash, page.sourcePath, page.listed ? 1 : 0, updatedAt),
      db.prepare(`DELETE FROM page_tags WHERE page_id = ?1`).bind(id),
      ...page.tags.map((t) => db.prepare(`INSERT INTO page_tags (page_id, tag) VALUES (?1, ?2)`).bind(id, t)),
      ...newRows.map((r) =>
        db
          .prepare(
            `INSERT OR REPLACE INTO assets (page_id, path, r2_key, content_type, size, sha256) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          )
          .bind(id, r.path, r.r2_key, r.content_type, r.size, r.sha256)
      ),
      ...removed.map((r) => db.prepare(`DELETE FROM assets WHERE page_id = ?1 AND path = ?2`).bind(id, r.path)),
    ];
    await db.batch(stmts);

    // 参照されなくなった R2 オブジェクトを消す
    const finalRows = await getAssets(db, id);
    const live = new Set(finalRows.map((r) => r.r2_key));
    const stale = [...new Set(oldAssets.map((a) => a.r2_key))].filter((k) => !live.has(k));
    if (stale.length) await c.env.BUCKET.delete(stale);

    return c.json(
      { slug, url: `${ORIGIN}/${slug}/`, updatedAt, bodyHash, created: !existing },
      existing ? 200 : 201
    );
  } catch (e) {
    if (putKeys.length) await c.env.BUCKET.delete(putKeys).catch(() => {});
    if (createdRow) await db.prepare(`DELETE FROM pages WHERE id = ?1 AND status = 'pending'`).bind(id).run().catch(() => {});
    throw e;
  }
});

app.patch("/api/pages/:slug", async (c) => {
  const db = c.env.DB;
  const p = await livePage(c);
  if (!p) return apiError(c, 404, "ページがありません");
  let j: any;
  try {
    j = await c.req.json();
  } catch {
    return apiError(c, 400, "JSON が不正です");
  }
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  const stmts: D1PreparedStatement[] = [];
  if (j.title !== undefined) {
    const t = typeof j.title === "string" ? j.title.trim() : "";
    if (!t || t.length > MAX_TITLE) return apiError(c, 400, `title は1〜${MAX_TITLE}文字です`);
    sets.push("title"), binds.push(t);
  }
  if (j.description !== undefined) {
    const d = typeof j.description === "string" ? j.description.trim() : null;
    if (d === null || d.length > MAX_DESC) return apiError(c, 400, `description は${MAX_DESC}文字までです`);
    sets.push("description"), binds.push(d);
  }
  if (j.listed !== undefined) {
    if (typeof j.listed !== "boolean") return apiError(c, 400, "listed は true/false です");
    sets.push("listed"), binds.push(j.listed ? 1 : 0);
  }
  if (j.tags !== undefined) {
    const tags = validTags(j.tags);
    if (typeof tags === "string") return apiError(c, 400, tags);
    stmts.push(db.prepare(`DELETE FROM page_tags WHERE page_id = ?1`).bind(p.id));
    for (const t of tags) stmts.push(db.prepare(`INSERT INTO page_tags (page_id, tag) VALUES (?1, ?2)`).bind(p.id, t));
  }
  let slug = p.slug;
  const now = Date.now();
  if (j.newSlug !== undefined && j.newSlug !== p.slug) {
    const ns = typeof j.newSlug === "string" ? j.newSlug : "";
    const se = slugError(ns);
    if (se) return apiError(c, 400, se);
    if (await getPage(db, ns)) return apiError(c, 409, `スラッグ ${ns} は既に使われています`);
    sets.push("slug"), binds.push(ns);
    stmts.push(
      db.prepare(`DELETE FROM redirects WHERE from_slug = ?1`).bind(ns),
      db.prepare(`UPDATE redirects SET to_slug = ?1 WHERE to_slug = ?2`).bind(ns, p.slug),
      db.prepare(`INSERT OR REPLACE INTO redirects (from_slug, to_slug, created_at) VALUES (?1, ?2, ?3)`).bind(p.slug, ns, now)
    );
    slug = ns;
  }
  if (!sets.length && !stmts.length) return apiError(c, 400, "変更する項目がありません");
  const assign = sets.map((s, i) => `${s} = ?${i + 2}`).concat(`updated_at = ?${sets.length + 2}`).join(", ");
  // slug 変更の UPDATE を redirects より先に流す
  await db.batch([db.prepare(`UPDATE pages SET ${assign} WHERE id = ?1`).bind(p.id, ...binds, now), ...stmts]);
  return c.json({ slug, url: `${ORIGIN}/${slug}/`, updatedAt: now });
});

app.delete("/api/pages/:slug", async (c) => {
  const db = c.env.DB;
  const found = await getPage(db, c.req.param("slug"));
  if (!found) return apiError(c, 404, "ページがありません");
  if (c.req.query("purge") === "1") {
    const assets = await getAssets(db, found.id);
    const keys = [...new Set(assets.map((a) => a.r2_key))];
    if (keys.length) await c.env.BUCKET.delete(keys);
    await db.batch([
      db.prepare(`DELETE FROM assets WHERE page_id = ?1`).bind(found.id),
      db.prepare(`DELETE FROM page_tags WHERE page_id = ?1`).bind(found.id),
      db.prepare(`DELETE FROM redirects WHERE to_slug = ?1`).bind(found.slug),
      db.prepare(`DELETE FROM pages WHERE id = ?1`).bind(found.id),
    ]);
    return c.json({ slug: found.slug, purged: true });
  }
  if (found.status === "pending") return apiError(c, 404, "ページがありません");
  const now = Date.now();
  await db.prepare(`UPDATE pages SET status = 'deleted', deleted_at = ?2 WHERE id = ?1`).bind(found.id, now).run();
  return c.json({ slug: found.slug, status: "deleted", deletedAt: now });
});

app.post("/api/pages/:slug/restore", async (c) => {
  const p = await livePage(c);
  if (!p) return apiError(c, 404, "ページがありません");
  if (p.status !== "deleted") return apiError(c, 409, "削除されていません");
  await c.env.DB.prepare(`UPDATE pages SET status = 'published', deleted_at = NULL WHERE id = ?1`).bind(p.id).run();
  return c.json({ slug: p.slug, url: `${ORIGIN}/${p.slug}/`, status: "published" });
});

app.all("/api/*", (c) => apiError(c, 404, "API がありません"));

// ---------- 公開側 ----------

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=60, no-transform",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const MD_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'";

function html(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...PAGE_HEADERS, "Content-Security-Policy": MD_CSP, ...extra } });
}

function notFound() {
  return html(statusPage(404, "このページは見つかりませんでした。"), 404, { "Cache-Control": "no-store" });
}

function redirect(location: string) {
  return new Response(null, { status: 301, headers: { Location: location, "Cache-Control": "public, max-age=300" } });
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

app.get("*", async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const path = url.pathname;
  const pageNo = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  if (path === "/") {
    const [list, tags] = await Promise.all([listPublic(db, { page: pageNo }), tagCounts(db)]);
    return html(listPage({ ...list, tags }));
  }
  if (path === "/robots.txt") {
    return new Response(robotsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  if (path === "/sitemap.xml") {
    const [pages, tags] = await Promise.all([sitemapRows(db), tagCounts(db)]);
    return new Response(sitemapXml(pages, tags.map((t) => t.tag)), {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }
  const tm = path.match(/^\/t\/([^/]+)(\/?)$/);
  if (tm) {
    if (!tm[2]) return redirect(`/t/${tm[1]}/${url.search}`);
    const tag = safeDecode(tm[1]);
    if (!tag) return notFound();
    const [list, tags] = await Promise.all([listPublic(db, { tag, page: pageNo }), tagCounts(db)]);
    if (!list.items.length && pageNo === 1) return notFound();
    return html(listPage({ ...list, tags, activeTag: tag }));
  }

  const segs = path.slice(1).split("/");
  const slug = segs[0];
  if (slugError(slug)) return notFound();
  const restRaw = segs.slice(1).join("/");
  const found = await getPage(db, slug);
  if (!found || found.status === "pending") {
    const to = await getRedirect(db, slug);
    if (to) return redirect(`/${to}/${restRaw}${url.search}`);
    return notFound();
  }
  if (found.status === "deleted") {
    return html(statusPage(410, "このページは削除されました。"), 410, { "Cache-Control": "no-store" });
  }
  if (segs.length === 1) return redirect(`/${slug}/${url.search}`);

  if (restRaw === "") {
    if (found.format === "html") {
      return new Response(found.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60, no-transform",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      });
    }
    const [tags, assets, links] = await Promise.all([getTags(db, found.id), getAssets(db, found.id), linkRows(db)]);
    const out = await renderMarkdownPage(
      {
        slug: found.slug,
        title: found.title,
        description: found.description,
        body: found.body,
        listed: found.listed === 1,
        updated_at: found.updated_at,
        tags,
      },
      buildLinkTable(links),
      assets
    );
    return html(out);
  }

  // アセット
  const rest = safeDecode(restRaw);
  const ap = rest ? sanitizePath(rest) : null;
  if (!ap) return notFound();
  const asset = await getAsset(db, found.id, ap);
  if (!asset) return notFound();
  const obj = await c.env.BUCKET.get(asset.r2_key);
  if (!obj) return notFound();
  return new Response(obj.body, {
    headers: {
      "Content-Type": asset.content_type,
      "Content-Length": String(asset.size),
      "Cache-Control": url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      ETag: `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.notFound(() => notFound());

app.onError((err, c) => {
  console.error(err);
  if (new URL(c.req.url).pathname.startsWith("/api/")) return c.json({ error: "サーバでエラーが起きました" }, 500);
  return new Response("Internal Server Error", { status: 500 });
});

export default app;
