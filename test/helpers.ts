// テスト用: D1（node:sqlite）と R2（メモリ）を差した Env と、API を叩く小道具
import { makeDb } from "./d1shim.ts";
import app from "../src/index.ts";
import type { Env } from "../src/types.ts";

export const TOKEN = "test-token-0123456789";

export class FakeR2 {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  async put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { bytes: value, contentType: opts?.httpMetadata?.contentType });
    return {};
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) return null;
    return { body: new Blob([o.bytes as unknown as ArrayBuffer]).stream() };
  }
  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }
}

export function makeEnv(over: Partial<Env> = {}) {
  const { raw, db } = makeDb();
  const r2 = new FakeR2();
  const env = { DB: db, BUCKET: r2 as unknown as R2Bucket, API_TOKEN: TOKEN, DENYLIST: "秘密町1丁目\n# コメント\n", ...over } as Env;
  return { env, raw, r2 };
}

export function req(env: Env, path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth !== false) headers.set("Authorization", `Bearer ${TOKEN}`);
  return app.request(`https://kohaku.kechiiiiin.com${path}`, { ...init, headers }, env);
}

export type PageJson = {
  title?: string;
  description?: string;
  tags?: string[];
  format?: "md" | "html";
  body?: string;
  sourcePath?: string;
  listed?: boolean;
  assets?: string[];
  acknowledge?: string[];
};

export function form(page: PageJson, files: Record<string, Uint8Array> = {}) {
  const fd = new FormData();
  const full = { title: "テスト", tags: ["レシピ"], format: "md", body: "# テスト\n本文", ...page };
  fd.append("page", new Blob([JSON.stringify(full)], { type: "application/json" }));
  for (const [path, bytes] of Object.entries(files)) {
    fd.append("asset", new Blob([bytes as unknown as ArrayBuffer], { type: "application/octet-stream" }), path);
  }
  return fd;
}

export function put(env: Env, slug: string, page: PageJson, files: Record<string, Uint8Array> = {}, headers: Record<string, string> = {}) {
  return req(env, `/api/pages/${slug}`, { method: "PUT", body: form(page, files), headers });
}

/** GPS IFD ポインタ（0x8825）入りの最小 JPEG */
export function gpsJpeg(): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II*\0 + IFD0 offset 8
    0x01, 0x00, // 1 entry
    0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, // 0x8825 LONG 1 → 26
    0x00, 0x00, 0x00, 0x00, // next IFD
    0x00, 0x00, // GPS IFD: 0 entries
  ];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]);
}

/** EXIF なしの最小 JPEG もどき（中身の違いで sha を変えられる） */
export function plainJpeg(seed = 0): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, seed & 0xff, 0x00, 0xff, 0xd9]);
}
