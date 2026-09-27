import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsJpeg, makeEnv, plainJpeg, put, req } from "./helpers.ts";

test("認証: Bearer なし・誤りは 401、API_TOKEN 未設定は 503", async () => {
  const { env } = makeEnv();
  assert.equal((await req(env, "/api/pages", { auth: false })).status, 401);
  assert.equal((await req(env, "/api/pages", { auth: false, headers: { Authorization: "Bearer " + "wrong" } })).status, 401);
  const { env: noTok } = makeEnv({ API_TOKEN: undefined });
  assert.equal((await req(noTok, "/api/pages")).status, 503);
});

test("PUT: 新規 201・再 PUT 200 で URL 不変・If-None-Match で 412", async () => {
  const { env } = makeEnv();
  const r1 = await put(env, "buta-shabu", { title: "豚しゃぶ", tags: ["レシピ", "豚肉"] }, {}, { "If-None-Match": "*" });
  assert.equal(r1.status, 201);
  const j1 = (await r1.json()) as any;
  assert.equal(j1.url, "https://kohaku.kechiiiiin.com/buta-shabu/");
  assert.equal(j1.created, true);
  const r2 = await put(env, "buta-shabu", { title: "豚しゃぶ", tags: ["レシピ"], body: "# 豚しゃぶ\n改" });
  assert.equal(r2.status, 200);
  assert.equal(((await r2.json()) as any).url, j1.url);
  const r3 = await put(env, "buta-shabu", { title: "x" }, {}, { "If-None-Match": "*" });
  assert.equal(r3.status, 412);
});

test("PUT: 予約語・規則外スラッグは 400、タグ0個も 400", async () => {
  const { env } = makeEnv();
  for (const s of ["api", "Buta_Shabu", "ab", "static", "t"]) {
    assert.equal((await put(env, s, {})).status, 400, s);
  }
  assert.equal((await put(env, "no-tags", { tags: [] })).status, 400);
});

test("アセット: リストから外すと D1・R2 から消え、送らずリストに残すと維持", async () => {
  const { env, r2, raw } = makeEnv();
  const a = plainJpeg(1), b = plainJpeg(2);
  let r = await put(env, "img-page", { body: "![](img/01.jpg)\n![](img/02.jpg)", assets: ["img/01.jpg", "img/02.jpg"] }, { "img/01.jpg": a, "img/02.jpg": b });
  assert.equal(r.status, 201);
  assert.equal(r2.objects.size, 2);
  // 01 だけ残す（送らない）・02 を外す
  r = await put(env, "img-page", { body: "![](img/01.jpg)", assets: ["img/01.jpg"] });
  assert.equal(r.status, 200);
  assert.equal(r2.objects.size, 1);
  const rows = raw.prepare("SELECT path FROM assets").all() as { path: string }[];
  assert.deepEqual(rows.map((x) => x.path), ["img/01.jpg"]);
  // 公開側で取れる
  const img = await req(env, "/img-page/img/01.jpg", { auth: false });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  // 差し替えで新しい中身が見え、古い R2 オブジェクトは消える
  r = await put(env, "img-page", { body: "![](img/01.jpg)", assets: ["img/01.jpg"] }, { "img/01.jpg": plainJpeg(9) });
  assert.equal(r.status, 200);
  assert.equal(r2.objects.size, 1);
  const img2 = new Uint8Array(await (await req(env, "/img-page/img/01.jpg", { auth: false })).arrayBuffer());
  assert.equal(img2[6], 9);
  // リストにあるのに送られず既存にも無い → 400
  assert.equal((await put(env, "img-page", { assets: ["img/03.jpg"] })).status, 400);
  // 本文の画像 URL に ?v= が付く
  const html = await (await req(env, "/img-page/", { auth: false })).text();
  assert.match(html, /src="img\/01\.jpg\?v=[0-9a-f]{8}"/);
  assert.match(html, /og:image" content="https:\/\/kohaku\.kechiiiiin\.com\/img-page\/img\/01\.jpg"/);
});

test("タグ一覧: /api/tags の件数とトップのタグ一覧が一致", async () => {
  const { env } = makeEnv();
  await put(env, "p-one", { title: "一", tags: ["レシピ", "豚肉"] });
  await put(env, "p-two", { title: "二", tags: ["レシピ"] });
  await put(env, "p-hidden", { title: "隠", tags: ["レシピ"], listed: false });
  const tags = (await (await req(env, "/api/tags")).json()) as any[];
  assert.deepEqual(tags, [
    { tag: "レシピ", count: 2 },
    { tag: "豚肉", count: 1 },
  ]);
  const top = await (await req(env, "/", { auth: false })).text();
  // 目次の下のタグ（件数の多い順・件数は出さない）
  assert.match(top, /<nav class="tags"[^>]*><a href="\/t\/%E3%83%AC%E3%82%B7%E3%83%94\/">レシピ<\/a><a href="\/t\/%E8%B1%9A%E8%82%89\/">豚肉<\/a><\/nav>/);
  assert.doesNotMatch(top, /隠/);
  const tagPage = await req(env, "/t/%E3%83%AC%E3%82%B7%E3%83%94/", { auth: false });
  assert.equal(tagPage.status, 200);
  const tp = await tagPage.text();
  assert.match(tp, /p-one/);
  assert.match(tp, /<a class="on" href="\/t\/%E3%83%AC%E3%82%B7%E3%83%94\/">レシピ<\/a>/);
  assert.match(tp, /目次 <span class="x">— レシピ<\/span>/);
  assert.doesNotMatch(tp, /p-hidden/);
});

test("GET /api/pages・/:slug・/:slug/source", async () => {
  const { env } = makeEnv();
  const body = "---\ntitle: x\n---\n# 生\n**そのまま**";
  await put(env, "src-page", { body, sourcePath: "hestia/recipes/生.md" });
  const list = (await (await req(env, "/api/pages")).json()) as any[];
  assert.equal(list[0].slug, "src-page");
  assert.equal(list[0].source_path, "hestia/recipes/生.md");
  const one = (await (await req(env, "/api/pages/src-page")).json()) as any;
  assert.deepEqual(one.tags, ["レシピ"]);
  const src = await req(env, "/api/pages/src-page/source");
  assert.equal(src.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await src.text(), body);
});

test("PATCH newSlug で旧 URL が 301", async () => {
  const { env } = makeEnv();
  await put(env, "old-slug", {});
  const r = await req(env, "/api/pages/old-slug", {
    method: "PATCH",
    body: JSON.stringify({ newSlug: "new-slug", title: "新" }),
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(r.status, 200);
  const old = await req(env, "/old-slug/", { auth: false });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get("location"), "/new-slug/");
  assert.equal((await req(env, "/new-slug/", { auth: false })).status, 200);
  // 旧スラッグへの PUT は 409
  assert.equal((await put(env, "old-slug", {})).status, 409);
});

test("DELETE → 410・restore → 200・purge で D1 と R2 から消える", async () => {
  const { env, r2, raw } = makeEnv();
  await put(env, "del-page", { body: "![](a.png)", assets: ["a.png"] }, { "a.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
  assert.equal((await req(env, "/api/pages/del-page", { method: "DELETE" })).status, 200);
  assert.equal((await req(env, "/del-page/", { auth: false })).status, 410);
  assert.equal((await put(env, "del-page", {})).status, 409);
  assert.equal((await req(env, "/api/pages/del-page/restore", { method: "POST" })).status, 200);
  assert.equal((await req(env, "/del-page/", { auth: false })).status, 200);
  assert.equal((await req(env, "/api/pages/del-page?purge=1", { method: "DELETE" })).status, 200);
  assert.equal(r2.objects.size, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM pages").get() as any).n, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM assets").get() as any).n, 0);
  assert.equal((await req(env, "/del-page/", { auth: false })).status, 404);
});

test("サーバ側チェック: secret・denylist・coords・GPS", async () => {
  const { env } = makeEnv();
  const ghp = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
  let r = await put(env, "chk-a", { body: `鍵 ${ghp}`, acknowledge: ["secret", "coords"] });
  assert.equal(r.status, 422);
  const j = (await r.json()) as any;
  assert.equal(j.findings[0].rule, "secret");
  assert.doesNotMatch(JSON.stringify(j), /ghp_/);
  r = await put(env, "chk-b", { body: "住所は秘密町1丁目です" });
  assert.equal(r.status, 422);
  assert.equal(((await r.json()) as any).findings[0].rule, "denylist");
  r = await put(env, "chk-c", { body: "山頂 35.36062, 138.72743" });
  assert.equal(r.status, 422);
  r = await put(env, "chk-c", { body: "山頂 35.36062, 138.72743", acknowledge: ["coords"] });
  assert.equal(r.status, 201);
  r = await put(env, "chk-d", { body: "![](p.jpg)", assets: ["p.jpg"] }, { "p.jpg": gpsJpeg() });
  assert.equal(r.status, 422);
  assert.equal(((await r.json()) as any).findings[0].rule, "exif-gps");
  // API_TOKEN の値そのもの
  r = await put(env, "chk-e", { body: "test-token-0123456789" });
  assert.equal(r.status, 422);
});

test("POST /api/check は公開せずに findings を返す", async () => {
  const { env } = makeEnv();
  const fd = new FormData();
  fd.append("page", JSON.stringify({ title: "t", tags: ["x"], format: "md", body: "35.12345 135.12345" }));
  const r = await req(env, "/api/check", { method: "POST", body: fd });
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  assert.equal(j.ok, false);
  assert.equal(j.findings[0].rule, "coords");
  assert.equal(((await (await req(env, "/api/pages")).json()) as any[]).length, 0);
});
