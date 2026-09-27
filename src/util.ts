/** 公開オリジン（canonical・OGP・sitemap はリクエストの Host から作らない） */
export const ORIGIN = "https://kohaku.kechiiiiin.com";
export const SITE_NAME = "琥珀";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ファイルパスの正規化と検証。不正なら null（泡沫 util.ts から） */
export function sanitizePath(p: string): string | null {
  const cleaned = p.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!cleaned || cleaned.length > 512) return null;
  const parts = cleaned.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return null;
  }
  return cleaned;
}

/** md の最初の見出し → タイトル（泡沫 util.ts の deriveTitle を md/html 両用に） */
export function deriveTitle(format: "md" | "html", content: string): string | null {
  if (format === "md") {
    const m = content.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim();
  } else {
    const m = content.match(/<title>([^<]*)<\/title>/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

// ---------- スラッグ ----------

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set([
  "api",
  "c",
  "t",
  "s",
  "assets",
  "static",
  "og",
  "admin",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
]);

/** スラッグの検証。問題があれば日本語の理由、無ければ null */
export function slugError(slug: string): string | null {
  if (slug.startsWith("_") || RESERVED_SLUGS.has(slug)) return `予約語のスラッグは使えません: ${slug}`;
  if (slug.length < 3 || slug.length > 64) return "スラッグは3〜64文字です";
  if (!SLUG_RE.test(slug)) return "スラッグは小文字英数字とハイフンだけです（例 buta-shabu）";
  return null;
}

// ---------- アセット ----------

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
};

export function extOf(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** 拡張子から Content-Type を決める（送られてきたものは信用しない）。許さない種類は null */
export function contentTypeFor(path: string): string | null {
  return CONTENT_TYPES[extOf(path)] ?? null;
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** epoch ms → 日本時間の YYYY-MM-DD */
export function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function tagHref(tag: string): string {
  return `/t/${encodeURIComponent(tag)}/`;
}
