import { escapeHtml, ORIGIN, SITE_NAME } from "./util.ts";

/**
 * 見た目: C案（ノート）2026-09-27 Keisuke 決定。
 * 見本は vault の hestia/projects/kohaku-design/kohaku-design-c.html。
 * 白い紙に墨の明朝、差し色は琥珀だけ。罫線と余白で組む。ダークモードは持たない。
 */
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap";

export const CSS = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  --paper: #ffffff; --ink: #1e1e1e; --sub: #6d675d; --faint: #8a8478; --rule: #e2ded5; --dot: #b5afa4;
  --amber: #b06a10; --tint: #f3f0e9;
  color-scheme: light;
}
html { -webkit-text-size-adjust: 100%; background: var(--paper); }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: "Shippori Mincho", serif; }
.pg { max-width: 640px; margin: 0 auto; padding: 40px 24px 48px; }
a { color: inherit; }

/* ヘッダ：サイト名だけ */
.site { text-align: center; margin-bottom: 34px; }
.site.top { margin-bottom: 22px; }
.site a { text-decoration: none; font-size: 22px; letter-spacing: .5em; padding-left: .5em; }
.site.small a { font-size: 16.5px; }

.kicker { text-align: center; font-size: 12.5px; color: var(--faint); letter-spacing: .3em; margin: 0 0 8px; }
.kicker .x { color: var(--sub); letter-spacing: .1em; }

/* 目次（トップ・タグ一覧）：タグを上に、各行にタイトル…日付と本文の頭2行 */
.tags { text-align: center; font-size: 13.5px; color: var(--sub); line-height: 2.2; border-bottom: 1px solid var(--rule); padding-bottom: 14px; margin: 0 0 22px; }
.tags a { text-decoration: none; margin: 0 7px; white-space: nowrap; }
.tags a.on { color: var(--ink); border-bottom: 1px solid var(--amber); }
.tags a:hover { color: var(--amber); }
.toc { list-style: none; padding: 0; margin: 0 0 30px; }
.toc li { border-bottom: 1px solid #efece6; padding: 14px 0; }
.toc li:last-child { border-bottom: none; }
.toc li > a.row { display: block; text-decoration: none; }
.toc .ln { display: flex; align-items: baseline; gap: 6px; font-size: 17px; line-height: 1.6; }
.toc .t { flex: 0 1 auto; overflow-wrap: anywhere; }
.toc .dots { flex: 1 1 24px; border-bottom: 1px dotted var(--dot); transform: translateY(-5px); }
.toc .d { flex: none; font-size: 12px; color: var(--faint); font-family: "Zen Kaku Gothic New", sans-serif; }
.toc .ex { font-size: 14.5px; line-height: 1.85; color: #555; margin: 4px 0 0; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
           -webkit-box-orient: vertical; overflow: hidden; }
.toc li > a.row:hover .t { color: var(--amber); }
.toc .tl { margin: 4px 0 0; font-size: 12px; line-height: 1.8; color: var(--sub); font-family: "Zen Kaku Gothic New", sans-serif; }
.toc .tl a { color: var(--sub); text-decoration: none; }
.toc .tl a:hover { color: var(--amber); }
.toc .tl .sep { color: var(--dot); margin: 0 .15em; }
.empty { text-align: center; color: var(--faint); font-size: 15.5px; margin: 0 0 30px; }
.pager { display: flex; justify-content: space-between; font-size: 14px; color: var(--sub); margin: -10px 0 26px;
         font-family: "Zen Kaku Gothic New", sans-serif; }
.pager a { text-decoration: none; }

/* 個別ページ */
article { overflow-wrap: break-word; }
article h1 { font-size: 24px; font-weight: 600; line-height: 1.6; margin: 0 0 6px; text-align: center; }
.dateline { text-align: center; font-size: 12.5px; color: var(--faint); font-family: "Zen Kaku Gothic New", sans-serif; margin-bottom: 28px; }
article p { font-size: 17px; line-height: 2; margin: 0 0 1em; text-indent: 1em; }
article p:has(> img:only-child) { text-indent: 0; }
article h2 { font-size: 18.5px; font-weight: 600; margin: 40px 0 14px; text-align: center; letter-spacing: .08em; line-height: 1.6; }
article h2::before, article h2::after { content: "—"; color: var(--dot); font-weight: 400; margin: 0 .6em; }
article h3 { font-size: 17px; font-weight: 600; margin: 28px 0 8px; line-height: 1.7; }
article h3::before { content: ""; display: inline-block; width: 1em; border-top: 1px solid var(--amber); margin-right: .5em; vertical-align: middle; }
article h4, article h5, article h6 { font-size: 16px; font-weight: 600; margin: 22px 0 6px; }
article strong { font-weight: 600; background: linear-gradient(transparent 62%, #f1e2c4 62%); }
article mark { background: #f1e2c4; color: inherit; padding: 0 .1em; }
article ul, article ol { font-size: 16.5px; line-height: 1.9; margin: 0 0 1.2em; padding-left: 1.4em; }
article ul { list-style: none; padding-left: 1em; }
article ul li { position: relative; }
article ul li::before { content: "・"; position: absolute; left: -1em; color: var(--faint); }
article ol li::marker { font-size: 13px; color: var(--faint); font-family: "Zen Kaku Gothic New", sans-serif; }
article li { margin-bottom: .35em; }
article li p { font-size: inherit; line-height: inherit; text-indent: 0; margin: 0 0 .4em; }
article li > ul, article li > ol { margin: .3em 0 .3em; }
.lead { font-weight: 600; font-size: 16px; margin: 20px 0 6px; text-indent: 0 !important; }
article a { color: var(--ink); text-decoration-color: var(--amber); text-underline-offset: 3px; }
article a:hover { color: var(--amber); }
article hr { border: none; border-top: 1px solid var(--rule); margin: 32px 0; }
article img { display: block; max-width: 100%; height: auto; margin: 1.2em auto; }
article code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .86em; background: var(--tint); padding: .1em .35em; }
article pre { background: var(--tint); border-left: 1px solid var(--amber); padding: 12px 16px; overflow-x: auto; margin: 0 0 1.4em; line-height: 1.7; }
article pre code { background: none; padding: 0; font-size: 14px; }
article blockquote { margin: 0 0 1.4em; padding: 2px 0 2px 16px; border-left: 1px solid var(--rule); color: var(--sub); }
article blockquote p { font-size: 16px; text-indent: 0; }

/* 表：罫線は横だけ、塗りなし */
.tbl { overflow-x: auto; margin: 0 0 1.2em; }
table { border-collapse: collapse; width: 100%; font-size: 15px; min-width: 460px; }
th, td { padding: 8px 8px; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: top; line-height: 1.7; }
thead th { font-weight: 400; color: var(--faint); font-size: 12.5px; font-family: "Zen Kaku Gothic New", sans-serif; border-bottom: 1px solid var(--ink); }
tbody tr:last-child td { border-bottom: 1px solid var(--ink); }

/* 注記（コールアウト）：色の箱にせず、細い琥珀色の縦線と小さなラベル */
.aside { margin: 0 0 1.4em; padding: 2px 0 2px 16px; border-left: 1px solid var(--amber); font-size: 15.5px; line-height: 1.9; color: #3b372f; }
.aside .h { display: block; font-size: 12px; letter-spacing: .25em; color: var(--amber); font-family: "Zen Kaku Gothic New", sans-serif; margin-bottom: 2px; }
.aside p { font-size: 15.5px; line-height: 1.9; text-indent: 0; margin: 0 0 .5em; }
.aside > :last-child, .aside p:last-child { margin-bottom: 0; }
.aside ul, .aside ol { font-size: 15.5px; }

/* チェックリスト */
article ul.task { list-style: none; padding-left: 0; }
article ul.task > li::before { content: none; }
.task label { display: flex; gap: 10px; align-items: baseline; cursor: pointer; }
.task input { appearance: none; -webkit-appearance: none; width: 14px; height: 14px; border: 1px solid var(--sub); border-radius: 0;
              flex: none; transform: translateY(1px); margin: 0; background: var(--paper); cursor: pointer; }
.task input:checked { background: var(--ink); box-shadow: inset 0 0 0 2px var(--paper); }
.task input:checked + span { color: var(--faint); text-decoration: line-through; text-decoration-color: var(--dot); }

.foot { margin-top: 44px; border-top: 1px solid var(--rule); padding-top: 18px; text-align: center; font-size: 13px; color: var(--sub);
        font-family: "Zen Kaku Gothic New", sans-serif; line-height: 2.2; }
.foot a { text-decoration: none; margin: 0 6px; }
.foot a:hover { color: var(--amber); }
.foot .back { display: block; margin-top: 6px; font-family: "Shippori Mincho", serif; font-size: 15px; color: var(--ink); }

/* 404・410 */
.status { text-align: center; padding: 24px 0 8px; }
.status .code { font-size: 13px; color: var(--faint); letter-spacing: .3em; font-family: "Zen Kaku Gothic New", sans-serif; margin: 0 0 10px; }
.status p.msg { font-size: 17px; line-height: 2; margin: 0 0 30px; }
`;

export type LayoutOpts = {
  title: string; // <title> に入れる（サイト名は付け足す）
  description?: string;
  canonicalPath?: string; // "/" や "/buta-shabu/"
  ogImage?: string | null; // 絶対 URL
  ogType?: "article" | "website";
  noindex?: boolean;
  body: string;
  smallHeader?: boolean; // トップ以外はサイト名を小さく
  topHeader?: boolean; // トップ: 下にタグが来るので余白を詰める
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
    `<meta name="color-scheme" content="light">`,
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
  head.push(`<link rel="icon" href="/favicon.ico" sizes="32x32">`);
  head.push(`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">`);
  head.push(`<link rel="apple-touch-icon" href="/apple-touch-icon.png">`);
  head.push(`<link rel="preconnect" href="https://fonts.googleapis.com">`);
  head.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
  head.push(`<link rel="stylesheet" href="${FONTS_HREF}">`);
  if (o.extraHead) head.push(o.extraHead);
  return `<!doctype html>
<html lang="ja">
<head>
${head.join("\n")}
<style>${CSS}</style>
</head>
<body>
<div class="pg">
<div class="site${o.smallHeader ? " small" : ""}${o.topHeader ? " top" : ""}"><a href="/">${SITE_NAME}</a></div>
<main>
${o.body}
</main>
</div>
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>`;
}

export function statusPage(code: 404 | 410, message: string): string {
  return layout({
    title: code === 404 ? "見つかりません" : "削除されました",
    noindex: true,
    smallHeader: true,
    body: `<div class="status"><p class="code">${code}</p><p class="msg">${escapeHtml(message)}</p></div>
<div class="foot"><a class="back" href="/">目次へ</a></div>`,
  });
}
