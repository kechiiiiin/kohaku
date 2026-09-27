import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, put, req } from "./helpers.ts";
import { hasGpsExif, isHighEntropyToken } from "../src/check.ts";
import { gpsJpeg, plainJpeg } from "./helpers.ts";

const RICH = `---
title: 豚しゃぶ
tags: [cooking]
---
# 豚しゃぶ

> [!tip] コツ
> 茹ですぎない ==強調==

> [!warning]
> 熱い

**前の晩（10分）**

- [ ] 豚肉
- [x] ポン酢

| 材料 | 量 |
|---|---|
| 豚肉 | 200g |

\`\`\`
[[コード内]] ==そのまま==
\`\`\`

==大事== な点。[[鶏むね作り置き弁当]] と [[非公開ページ|ひみつ]] と [[鶏むね作り置き弁当#仕込み|仕込み]]。
%%内緒のメモ%%
<!-- kohaku:omit -->
外す段落
<!-- /kohaku:omit -->
おわり
`;

test("md ページ: head 一式・コールアウト・タスク・表・コード・ハイライト・リンク解決", async () => {
  const { env } = makeEnv();
  await put(env, "torimune-bento", { title: "鶏むね作り置き弁当", sourcePath: "hestia/recipes/鶏むね作り置き弁当.md" });
  await put(env, "buta-shabu", { title: "豚しゃぶ", description: "ごま油とポン酢で。", body: RICH, tags: ["レシピ", "豚肉"] });
  const r = await req(env, "/buta-shabu/", { auth: false });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const h = await r.text();
  assert.match(h.slice(0, 200), /<meta charset="utf-8">/);
  assert.match(h, /<link rel="canonical" href="https:\/\/kohaku\.kechiiiiin\.com\/buta-shabu\/">/);
  for (const p of ["og:title", "og:description", "og:url", "og:type", "og:site_name", "og:image"]) {
    assert.match(h, new RegExp(`property="${p}"`), p);
  }
  assert.match(h, /name="twitter:card" content="summary"/);
  assert.match(h, /<meta name="description" content="ごま油とポン酢で。">/);
  assert.doesNotMatch(h, /noindex/);
  assert.match(h, /<div class="aside"><span class="h">コツ<\/span>/);
  assert.match(h, /<mark>強調<\/mark>/);
  assert.match(h, /<span class="h">注意<\/span>/);
  assert.match(h, /<p class="lead">前の晩（10分）<\/p>/);
  assert.match(h, /<ul class="task">\n<li><label><input type="checkbox" class="task-check"><span>豚肉<\/span><\/label><\/li>/);
  assert.match(h, /<h1>豚しゃぶ<\/h1>\n<div class="dateline">\d{4}年\d{1,2}月\d{1,2}日<\/div>/);
  assert.match(h, /<a class="back" href="\/">目次へ<\/a>/);
  assert.doesNotMatch(h, /prefers-color-scheme/);
  assert.match(h, /kohaku-check:/);
  assert.match(h, /<div class="tbl"><table>/);
  assert.match(h, /<mark>大事<\/mark>/);
  assert.match(h, /\[\[コード内\]\] ==そのまま==/);
  assert.match(h, /<a href="\/torimune-bento\/">鶏むね作り置き弁当<\/a>/);
  assert.match(h, /<a href="\/torimune-bento\/">仕込み<\/a>/);
  assert.match(h, /と ひみつ と/);
  assert.doesNotMatch(h, /非公開ページ/);
  assert.doesNotMatch(h, /内緒のメモ/);
  assert.doesNotMatch(h, /外す段落/);
  assert.doesNotMatch(h, /cooking/);
});

test("非掲載ページ: noindex・一覧/sitemap に出ない", async () => {
  const { env } = makeEnv();
  await put(env, "shown-page", { title: "見える" });
  await put(env, "hidden-page", { title: "隠れる", listed: false });
  const h = await (await req(env, "/hidden-page/", { auth: false })).text();
  assert.match(h, /<meta name="robots" content="noindex">/);
  const top = await (await req(env, "/", { auth: false })).text();
  assert.match(top, /見える/);
  assert.doesNotMatch(top, /隠れる/);
  const sm = await req(env, "/sitemap.xml", { auth: false });
  assert.equal(sm.headers.get("content-type"), "application/xml; charset=utf-8");
  const x = await sm.text();
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(x, /<loc>https:\/\/kohaku\.kechiiiiin\.com\/shown-page\/<\/loc><lastmod>\d{4}-\d\d-\d\dT/);
  assert.doesNotMatch(x, /hidden-page/);
  assert.match(x, /\/t\/%E3%83%AC%E3%82%B7%E3%83%94\//);
  const robots = await (await req(env, "/robots.txt", { auth: false })).text();
  assert.match(robots, /Sitemap: https:\/\/kohaku\.kechiiiiin\.com\/sitemap\.xml/);
});

test("html ページは無加工で nosniff 付き", async () => {
  const { env } = makeEnv();
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>生</title></head><body><script>1</script></body></html>`;
  await put(env, "raw-html", { format: "html", body });
  const r = await req(env, "/raw-html/", { auth: false });
  assert.equal(await r.text(), body);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("スラッシュ無しは 301・未知は 404", async () => {
  const { env } = makeEnv();
  await put(env, "some-page", {});
  const r = await req(env, "/some-page", { auth: false });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/some-page/");
  assert.equal((await req(env, "/nothing-here/", { auth: false })).status, 404);
  assert.equal((await req(env, "/t/%E3%81%AA%E3%81%84/", { auth: false })).status, 404);
});

test("EXIF GPS 検出と高エントロピー判定", () => {
  assert.equal(hasGpsExif(gpsJpeg()), true);
  assert.equal(hasGpsExif(plainJpeg()), false);
  assert.equal(isHighEntropyToken("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"), false);
  assert.equal(isHighEntropyToken("Zq8vK2mN4pR7tX1wB5yC9dF3gH6jL0sA"), true);
});

test("目次: タグが上・各行に本文の頭（description が空なら本文先頭）・アイコンの link", async () => {
  const { env } = makeEnv();
  await put(env, "with-desc", { title: "説明あり", description: "短い説明です。" });
  await put(env, "no-desc", { title: "説明なし", body: "# 説明なし\n\n本文の頭がここに出る。" });
  const top = await (await req(env, "/", { auth: false })).text();
  assert.ok(top.indexOf('<nav class="tags"') < top.indexOf('<p class="kicker">目次'));
  assert.match(top, /<p class="ex">短い説明です。<\/p>/);
  assert.match(top, /<p class="ex">本文の頭がここに出る。<\/p>/);
  // 各行のタグ（行リンクの外・兄弟に置く）
  assert.match(top, /<\/a><p class="tl"><a href="\/t\/%E3%83%AC%E3%82%B7%E3%83%94\/">レシピ<\/a><\/p><\/li>/);
  assert.doesNotMatch(top, /<a class="row"(?:(?!<\/a>).)*<a /s); // 行リンクの中にリンクが無い
  assert.match(top, /<link rel="apple-touch-icon" href="\/apple-touch-icon.png">/);
  assert.match(top, /<link rel="icon" href="\/favicon.ico" sizes="32x32">/);
});
