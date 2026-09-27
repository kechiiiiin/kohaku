import { Marked } from "marked";
import type { Tokens, TokenizerAndRendererExtension } from "marked";
import { escapeHtml, jstDate, ORIGIN, tagHref } from "./util.ts";
import { layout } from "./layout.ts";

/**
 * Obsidian コールアウト（> [!note] タイトル …）対応（泡沫 render.ts の骨格から）。
 * C案（ノート）では色の箱にせず「細い琥珀色の縦線＋小さなラベル」。タイプごとの色分けはしない。
 * ラベルはタイトル指定があればそれ、無ければタイプの日本語名。未知のタイプは「メモ」。
 * 折りたたみ記法（[!note]- / [!note]+）は通常表示。
 */
const CALLOUT_LABELS: Record<string, string> = {
  note: "メモ",
  info: "情報",
  abstract: "要約",
  summary: "要約",
  tldr: "要約",
  todo: "やること",
  question: "問い",
  help: "問い",
  faq: "問い",
  quote: "引用",
  cite: "引用",
  example: "例",
  tip: "ヒント",
  hint: "ヒント",
  success: "できた",
  check: "できた",
  done: "できた",
  warning: "注意",
  caution: "注意",
  attention: "注意",
  important: "重要",
  danger: "危険",
  error: "危険",
  failure: "失敗",
  fail: "失敗",
  missing: "失敗",
  bug: "不具合",
};

// 1行目: [!type] / [!type]- / [!type]+ （後ろにタイトル任意）、2行目以降が本文
const CALLOUT_RE = /^\[!([\w-]+)\][+-]?(?:[ \t]+([^\n]*))?[ \t]*(?:\n([\s\S]*))?$/;

/** ==ハイライト== → <mark> */
const markExtension: TokenizerAndRendererExtension = {
  name: "mark",
  level: "inline",
  start(src: string) {
    const i = src.indexOf("==");
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^==(?=\S)([\s\S]*?\S)==(?!=)/.exec(src);
    if (!m) return undefined;
    return { type: "mark", raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

export type AssetRef = { path: string; sha256: string; content_type: string };

function makeMarked(assets: AssetRef[]): Marked {
  const byPath = new Map(assets.map((a) => [a.path, a]));
  const md = new Marked({ gfm: true, breaks: false });
  md.use({
    extensions: [markExtension],
    renderer: {
      // GFM のタスクリスト。押せるようにし、状態は閲覧端末の localStorage にだけ残す
      checkbox({ checked }: Tokens.Checkbox): string {
        return `<input type="checkbox" class="task-check"${checked ? " checked" : ""}> `;
      },
      image({ href, title, text }: Tokens.Image): string {
        let src = href;
        const a = byPath.get(href.replace(/^\.\//, ""));
        if (a) src = `${a.path}?v=${a.sha256.slice(0, 8)}`;
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${t} loading="lazy">`;
      },
      blockquote(token: Tokens.Blockquote): string {
        const m = token.text.match(CALLOUT_RE);
        if (!m) {
          return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
        }
        const type = m[1].toLowerCase();
        const titleMd = (m[2] ?? "").trim();
        const label = titleMd
          ? (md.parseInline(titleMd, { async: false }) as string)
          : escapeHtml(CALLOUT_LABELS[type] ?? CALLOUT_LABELS.note);
        const bodyMd = m[3] ?? "";
        // 自前の拡張（==ハイライト== など）を効かせるため、このインスタンスの lexer で読む
        const bodyHtml = bodyMd.trim() ? this.parser.parse(md.lexer(bodyMd)) : "";
        return `<div class="aside"><span class="h">${label}</span>${bodyHtml}</div>\n`;
      },
    },
  });
  return md;
}

// ---------- 前処理 ----------

export function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
}

export function stripOmitted(md: string): string {
  return md.replace(/<!--\s*kohaku:omit\s*-->[\s\S]*?<!--\s*\/kohaku:omit\s*-->/g, "");
}

/** コードブロックの外側だけに変換をかける */
function outsideCode(md: string, fn: (s: string) => string): string {
  const out: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence === null && m) {
      out.push(fn(buf.join("\n")));
      buf = [];
      fence = m[1];
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    buf.push(line);
  }
  if (buf.length) out.push(fn(buf.join("\n")));
  return out.join("\n");
}

/** [[リンク]] の解決表: キー（小文字）→ slug */
export type LinkTable = Map<string, string>;

export function buildLinkTable(rows: { slug: string; title: string; source_path: string | null }[]): LinkTable {
  const t: LinkTable = new Map();
  for (const r of rows) {
    t.set(r.title.trim().toLowerCase(), r.slug);
    if (r.source_path) {
      const base = r.source_path.split("/").pop()!.replace(/\.(md|html?)$/i, "");
      if (!t.has(base.toLowerCase())) t.set(base.toLowerCase(), r.slug);
    }
  }
  return t;
}

/**
 * Obsidian 記法の前処理:
 * - frontmatter・kohaku:omit 区間・%%コメント%% を除去
 * - ![[画像]] は同じページのアセットにファイル名で一致すれば ![](path)、無ければ消す
 * - [[X]] / [[X|表示]] / [[X#見出し]] は公開中ページに一致すればリンク、無ければ表示名をただの文字に
 */
export function preprocess(md: string, links: LinkTable, assets: AssetRef[]): string {
  let s = stripOmitted(stripFrontmatter(md));
  const byName = new Map<string, string>();
  for (const a of assets) byName.set(a.path.split("/").pop()!.toLowerCase(), a.path);
  return outsideCode(s, (chunk) =>
    chunk
      .replace(/%%[\s\S]*?%%/g, "")
      .replace(/!\[\[([^\[\]|#]+)(?:[|#][^\[\]]*)?\]\]/g, (_m, target: string) => {
        const name = target.trim().split("/").pop()!.toLowerCase();
        const hit = byName.get(name) ?? assets.find((a) => a.path.toLowerCase() === target.trim().toLowerCase())?.path;
        return hit ? `![](${hit})` : "";
      })
      .replace(/\[\[([^\[\]|#]+)(?:#([^\[\]|]*))?(?:\|([^\[\]]+))?\]\]/g, (_m, target: string, _h, alias?: string) => {
        const label = (alias ?? target).trim();
        const slug = links.get(target.trim().toLowerCase()) ?? links.get(target.trim().split("/").pop()!.toLowerCase());
        return slug ? `[${label}](/${slug}/)` : label;
      })
  );
}

/** 本文先頭から description を自動生成（120字） */
export function autoDescription(md: string): string {
  const text = stripOmitted(stripFrontmatter(md))
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => l.trim() && !/^\s*(#|\||>|---|!\[)/.test(l))
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`=~]/g, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 120 ? text.slice(0, 119) + "…" : text;
}

/** 本文中で最初に参照されている画像アセット（og:image 用） */
export function firstImage(preprocessed: string, assets: AssetRef[]): AssetRef | null {
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g;
  for (const m of preprocessed.matchAll(re)) {
    const a = assets.find((x) => x.path === m[1].replace(/^\.\//, ""));
    if (a && a.content_type.startsWith("image/") && !a.content_type.startsWith("image/svg")) return a;
  }
  return null;
}

const TASK_SCRIPT = `(function(){
  var boxes=[].slice.call(document.querySelectorAll('input.task-check'));
  if(!boxes.length) return;
  var KEY='kohaku-check:'+location.pathname;
  var saved={};
  try{ saved=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  function save(){
    var o={};
    boxes.forEach(function(b,i){ if(b.checked) o[i]=1; });
    try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){}
  }
  boxes.forEach(function(b,i){
    b.disabled=false;
    if(saved[i]) b.checked=true;
    b.addEventListener('change',save);
  });
})();`;

export type RenderPage = {
  slug: string;
  title: string;
  description: string;
  body: string;
  listed: boolean;
  updated_at: number;
  tags: string[];
};

/** h1 の末尾の（…）は改行して2行目に（見本どおり） */
function breakTitle(inner: string): string {
  return inner.replace(/^(.+?)(（[^（）]+）)$/, "$1<br>$2");
}

/** 日本時間の YYYY年M月D日 */
export function jaDate(ms: number): string {
  const [y, m, d] = jstDate(ms).split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** marked の出力を C案の組みに整える */
export function shapeHtml(html: string, title: string, updatedAt: number): string {
  let out = html
    // 表は枠内で横スクロール
    .replace(/<table>/g, '<div class="tbl"><table>')
    .replace(/<\/table>/g, "</table></div>")
    // タスク: 四角い枠＋ラベル（済みは取り消し線）
    .replace(
      /<li>(?:<p>)?<input type="checkbox" class="task-check"( checked)?> ?([\s\S]*?)(<\/p>\n?)?<\/li>/g,
      (_m, ck: string | undefined, text: string) =>
        `<li><label><input type="checkbox" class="task-check"${ck ?? ""}><span>${text.trim()}</span></label></li>`
    )
    .replace(/<ul>(\s*<li><label><input type="checkbox" class="task-check")/g, '<ul class="task">$1')
    // 太字だけの段落は小見出し（lead）
    .replace(/<p><strong>([^<]*)<\/strong>:?<\/p>/g, '<p class="lead">$1</p>');
  const dateline = `<div class="dateline">${jaDate(updatedAt)}</div>`;
  const m = out.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\n?/);
  if (m) {
    out = `<h1>${breakTitle(m[1])}</h1>\n${dateline}\n` + out.slice(m[0].length);
  } else {
    out = `<h1>${breakTitle(escapeHtml(title))}</h1>\n${dateline}\n` + out;
  }
  return out;
}

export async function renderMarkdownPage(p: RenderPage, links: LinkTable, assets: AssetRef[]): Promise<string> {
  const pre = preprocess(p.body, links, assets);
  const md = makeMarked(assets);
  const html = shapeHtml(await md.parse(pre), p.title, p.updated_at);
  const img = firstImage(pre, assets);
  const desc = p.description || autoDescription(p.body);
  const tags = p.tags.map((t) => `<a href="${escapeHtml(tagHref(t))}">${escapeHtml(t)}</a>`).join("");
  const body = `<article>
${html}
</article>
<div class="foot">${tags}<a class="back" href="/">目次へ</a></div>`;
  return layout({
    title: p.title,
    description: desc,
    canonicalPath: `/${p.slug}/`,
    ogImage: img ? `${ORIGIN}/${p.slug}/${img.path.split("/").map(encodeURIComponent).join("/")}` : null,
    ogType: "article",
    noindex: !p.listed,
    smallHeader: true,
    body,
    script: html.includes("task-check") ? TASK_SCRIPT : undefined,
  });
}
