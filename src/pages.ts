import { escapeHtml, jstDate, ORIGIN, SITE_NAME, tagHref } from "./util.ts";
import { layout } from "./layout.ts";
import { autoDescription } from "./render.ts";
import type { ListItem } from "./db.ts";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** 目次の日付: 今年なら M.D、それ以外は YYYY.M.D（日本時間） */
export function tocDate(ms: number, now = Date.now()): string {
  const [y, m, d] = jstDate(ms).split("-").map(Number);
  const thisYear = Number(jstDate(now).slice(0, 4));
  return y === thisYear ? `${m}.${d}` : `${y}.${m}.${d}`;
}

export function listPage(o: {
  items: ListItem[];
  tags: { tag: string; count: number }[];
  activeTag?: string;
  page: number;
  hasNext: boolean;
}): string {
  const base = o.activeTag ? tagHref(o.activeTag) : "/";
  // タグを上に（サイト名の下・罫線で区切る）
  const tags = o.tags.length
    ? `<nav class="tags" aria-label="タグ">${o.tags
        .map((t) => `<a${t.tag === o.activeTag ? ' class="on"' : ""} href="${escapeHtml(tagHref(t.tag))}">${escapeHtml(t.tag)}</a>`)
        .join("")}</nav>`
    : "";
  const kicker = `<p class="kicker">目次${o.activeTag ? ` <span class="x">— ${escapeHtml(o.activeTag)}</span>` : ""}</p>`;
  const toc = o.items.length
    ? `<ul class="toc">\n${o.items
        .map((p) => {
          const ex = p.description || autoDescription(p.head);
          // 行のリンク（タイトル…日付・本文の頭）とタグのリンクは兄弟に置く（リンクを入れ子にしない）
          const tl = p.tags.length
            ? `<p class="tl">${p.tags.map((t) => `<a href="${escapeHtml(tagHref(t))}">${escapeHtml(t)}</a>`).join("<span class=\"sep\">・</span>")}</p>`
            : "";
          return `<li><a class="row" href="/${p.slug}/"><div class="ln"><span class="t">${escapeHtml(p.title)}</span><span class="dots"></span><span class="d">${tocDate(p.updated_at)}</span></div>${
            ex ? `<p class="ex">${escapeHtml(ex)}</p>` : ""
          }</a>${tl}</li>`;
        })
        .join("\n")}\n</ul>`
    : `<p class="empty">まだページがありません。</p>`;
  const prev = o.page > 1 ? `<a href="${escapeHtml(base)}${o.page - 1 > 1 ? `?page=${o.page - 1}` : ""}">← 新しい方</a>` : "<span></span>";
  const next = o.hasNext ? `<a href="${escapeHtml(base)}?page=${o.page + 1}">古い方 →</a>` : "<span></span>";
  const pager = o.page > 1 || o.hasNext ? `<div class="pager">${prev}${next}</div>` : "";
  const canonical = base + (o.page > 1 ? `?page=${o.page}` : "");
  return layout({
    title: o.activeTag ? `目次 — ${o.activeTag}` : SITE_NAME,
    description: o.activeTag ? `琥珀の「${o.activeTag}」のページの目次` : "琥珀の目次",
    canonicalPath: canonical,
    ogType: "website",
    topHeader: true,
    body: `${tags}\n${kicker}\n${toc}\n${pager}`,
  });
}

export function sitemapXml(pages: { slug: string; updated_at: number }[], tags: string[]): string {
  const latest = pages.length ? pages[0].updated_at : null;
  const urls: string[] = [];
  urls.push(`<url><loc>${ORIGIN}/</loc>${latest ? `<lastmod>${new Date(latest).toISOString()}</lastmod>` : ""}</url>`);
  for (const t of tags) urls.push(`<url><loc>${xmlEscape(ORIGIN + tagHref(t))}</loc></url>`);
  for (const p of pages) {
    urls.push(`<url><loc>${xmlEscape(`${ORIGIN}/${p.slug}/`)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}
