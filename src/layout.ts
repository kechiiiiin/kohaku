import { escapeHtml, ORIGIN, SITE_NAME } from "./util.ts";

/** 共通 CSS（泡沫 render.ts の CSS を琥珀色に） */
export const CSS = `
:root {
  --bg: #fffdf8; --fg: #3d3428; --head: #2b2217; --muted: #7a6a55; --line: #efe3cc;
  --accent: #a8651a; --accent-bg: #fbf1df; --code-bg: #f6eee0; --pre-bg: #2b2217; --pre-fg: #f3e9d8;
  --th-bg: #f8efdf; --quote: #d9bf8f;
  --blue-b: #7ba7cc; --blue-bg: #edf4fa; --blue-t: #4a6f96;
  --green-b: #a3be8c; --green-bg: #f1f6ec; --green-t: #5f7a4a;
  --yellow-b: #e0c580; --yellow-bg: #fbf6e9; --yellow-t: #93763a;
  --red-b: #d08a92; --red-bg: #faf0f1; --red-t: #a04b56;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1712; --fg: #e8dfd0; --head: #f6ecdb; --muted: #a8977f; --line: #3a3126;
    --accent: #e8a94f; --accent-bg: #2e2518; --code-bg: #2c251c; --pre-bg: #110e0a; --pre-fg: #efe4d2;
    --th-bg: #2a2219; --quote: #6e5a3d;
    --blue-bg: #1c2631; --blue-t: #9cc0e0; --green-bg: #1f2a1b; --green-t: #b6d09f;
    --yellow-bg: #2d2717; --yellow-t: #e6cf8f; --red-bg: #2f1d20; --red-t: #e6a2aa;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { max-width: 760px; margin: 0 auto; padding: 1.25rem 1.25rem 4rem;
       font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
       line-height: 1.8; color: var(--fg); background: var(--bg); overflow-wrap: anywhere; }
header.site { display: flex; align-items: center; padding-bottom: .75rem; margin-bottom: 1.5rem;
              border-bottom: 1px solid var(--line); }
header.site a.brand { color: var(--accent); text-decoration: none; font-weight: 700; font-size: 1.15rem;
                      letter-spacing: .12em; display: inline-flex; align-items: center; gap: .45rem; }
header.site a.brand::before { content: ""; width: .8rem; height: .8rem; border-radius: 50%;
                              background: radial-gradient(circle at 35% 35%, #ffd98a, #c77d1a 70%, #8a4f0d); }
h1, h2, h3, h4 { line-height: 1.4; color: var(--head); }
h1 { border-bottom: 2px solid var(--line); padding-bottom: .4rem; font-size: 1.6rem; }
h2 { border-bottom: 1px solid var(--line); padding-bottom: .3rem; }
a { color: var(--accent); }
mark { background: #ffe29a; color: #3d3428; padding: 0 .15em; border-radius: 2px; }
code { background: var(--code-bg); padding: .15em .4em; border-radius: 4px; font-size: .9em; }
pre { background: var(--pre-bg); color: var(--pre-fg); padding: 1rem 1.2rem; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; color: inherit; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid var(--line); padding: .4rem .8rem; overflow-wrap: normal; }
th { white-space: nowrap; }
td { min-width: 4.5em; }
th { background: var(--th-bg); }
blockquote { border-left: 4px solid var(--quote); margin-left: 0; padding-left: 1rem; color: var(--muted); }
img { max-width: 100%; height: auto; }
ul.contains-task-list, li.task-list-item { list-style: none; }
input.task-check { transform: scale(1.15); margin-right: .3rem; }
.callout { border-radius: 8px; padding: .8rem 1rem; margin: 1rem 0; border-left: 4px solid; }
.callout-title { font-weight: 600; display: flex; align-items: baseline; gap: .5em; }
.callout-icon { flex: none; }
.callout-body { margin-top: .4rem; }
.callout-body > :first-child { margin-top: 0; }
.callout-body > :last-child { margin-bottom: 0; }
.callout-blue { border-color: var(--blue-b); background: var(--blue-bg); }
.callout-blue > .callout-title { color: var(--blue-t); }
.callout-green { border-color: var(--green-b); background: var(--green-bg); }
.callout-green > .callout-title { color: var(--green-t); }
.callout-yellow { border-color: var(--yellow-b); background: var(--yellow-bg); }
.callout-yellow > .callout-title { color: var(--yellow-t); }
.callout-red { border-color: var(--red-b); background: var(--red-bg); }
.callout-red > .callout-title { color: var(--red-t); }
footer.page-foot { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line);
                   color: var(--muted); font-size: .88rem; display: flex; flex-wrap: wrap; gap: .4rem .9rem; }
a.tag { display: inline-block; text-decoration: none; background: var(--accent-bg); color: var(--accent);
        border-radius: 999px; padding: .05rem .65rem; font-size: .85rem; line-height: 1.7; }
a.tag.active { background: var(--accent); color: var(--bg); }
a.tag .n { opacity: .7; margin-left: .3em; font-size: .8em; }
nav.tags { display: flex; flex-wrap: wrap; gap: .45rem; margin: 0 0 1.5rem; }
ul.pages { list-style: none; padding: 0; margin: 0; }
ul.pages li { padding: 1rem 0; border-bottom: 1px solid var(--line); }
ul.pages a.title { font-size: 1.1rem; font-weight: 600; text-decoration: none; color: var(--head); }
ul.pages a.title:hover { color: var(--accent); }
ul.pages p.desc { margin: .25rem 0 .4rem; color: var(--fg); font-size: .95rem; }
ul.pages .meta { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .5rem; font-size: .85rem; color: var(--muted); }
h1.list-head { font-size: 1.25rem; border: none; margin: 0 0 1rem; }
.pager { display: flex; justify-content: space-between; margin-top: 1.5rem; }
.empty { color: var(--muted); }
.status { text-align: center; padding: 3rem 0; }
.status h1 { border: none; font-size: 3rem; margin: 0; color: var(--muted); }
`;

export type LayoutOpts = {
  title: string; // <title> に入れる（サイト名は付け足す）
  description?: string;
  canonicalPath?: string; // "/" や "/buta-shabu/"
  ogImage?: string | null; // 絶対 URL
  ogType?: "article" | "website";
  noindex?: boolean;
  body: string;
  extraHead?: string;
  script?: string;
};

export function layout(o: LayoutOpts): string {
  const fullTitle = o.title === SITE_NAME ? SITE_NAME : `${o.title} | ${SITE_NAME}`;
  const desc = o.description ?? "";
  const url = o.canonicalPath ? ORIGIN + o.canonicalPath : null;
  const image = o.ogImage ?? `${ORIGIN}/static/og-default.png`;
  const head: string[] = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(fullTitle)}</title>`,
  ];
  if (desc) head.push(`<meta name="description" content="${escapeHtml(desc)}">`);
  if (o.noindex) head.push(`<meta name="robots" content="noindex">`);
  if (url) {
    head.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
    head.push(`<meta property="og:title" content="${escapeHtml(o.title)}">`);
    if (desc) head.push(`<meta property="og:description" content="${escapeHtml(desc)}">`);
    head.push(`<meta property="og:url" content="${escapeHtml(url)}">`);
    head.push(`<meta property="og:type" content="${o.ogType ?? "article"}">`);
    head.push(`<meta property="og:site_name" content="${SITE_NAME}">`);
    head.push(`<meta property="og:locale" content="ja_JP">`);
    head.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    head.push(`<meta name="twitter:card" content="${o.ogImage ? "summary_large_image" : "summary"}">`);
  }
  head.push(`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">`);
  if (o.extraHead) head.push(o.extraHead);
  return `<!doctype html>
<html lang="ja">
<head>
${head.join("\n")}
<style>${CSS}</style>
</head>
<body>
<header class="site"><a class="brand" href="/">${SITE_NAME}</a></header>
<main>
${o.body}
</main>
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>`;
}

export function statusPage(code: 404 | 410, message: string): string {
  return layout({
    title: code === 404 ? "見つかりません" : "削除されました",
    noindex: true,
    body: `<div class="status"><h1>${code}</h1><p>${escapeHtml(message)}</p><p><a href="/">琥珀のトップへ</a></p></div>`,
  });
}
