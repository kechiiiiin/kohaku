import { escapeHtml, jstDate, ORIGIN, SITE_NAME, tagHref } from "./util.ts";
import { layout } from "./layout.ts";
import type { ListItem } from "./db.ts";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function listPage(o: {
  items: ListItem[];
  tags: { tag: string; count: number }[];
  activeTag?: string;
  page: number;
  hasNext: boolean;
}): string {
  const base = o.activeTag ? tagHref(o.activeTag) : "/";
  const tagNav = o.tags.length
    ? `<nav class="tags" aria-label="タグ">${o.tags
        .map(
          (t) =>
            `<a class="tag${t.tag === o.activeTag ? " active" : ""}" href="${escapeHtml(tagHref(t.tag))}">${escapeHtml(t.tag)}<span class="n">${t.count}</span></a>`
        )
        .join("")}</nav>`
    : "";
  const head = o.activeTag ? `<h1 class="list-head">#${escapeHtml(o.activeTag)}</h1>` : "";
  const list = o.items.length
    ? `<ul class="pages">${o.items
        .map(
          (p) => `<li>
<a class="title" href="/${p.slug}/">${escapeHtml(p.title)}</a>
${p.description ? `<p class="desc">${escapeHtml(p.description)}</p>` : ""}
<div class="meta"><span>${jstDate(p.updated_at)}</span>${p.tags
            .map((t) => `<a class="tag" href="${escapeHtml(tagHref(t))}">#${escapeHtml(t)}</a>`)
            .join("")}</div>
</li>`
        )
        .join("\n")}</ul>`
    : `<p class="empty">まだページがありません。</p>`;
  const prev = o.page > 1 ? `<a href="${escapeHtml(base)}${o.page - 1 > 1 ? `?page=${o.page - 1}` : ""}">← 新しいページ</a>` : "<span></span>";
  const next = o.hasNext ? `<a href="${escapeHtml(base)}?page=${o.page + 1}">古いページ →</a>` : "<span></span>";
  const pager = o.page > 1 || o.hasNext ? `<div class="pager">${prev}${next}</div>` : "";
  const canonical = base + (o.page > 1 ? `?page=${o.page}` : "");
  return layout({
    title: o.activeTag ? `#${o.activeTag}` : SITE_NAME,
    description: o.activeTag ? `琥珀の「${o.activeTag}」タグのページ一覧` : "琥珀のページ一覧",
    canonicalPath: canonical,
    ogType: "website",
    body: `${tagNav}\n${head}\n${list}\n${pager}`,
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
