import type { Finding } from "./types.ts";

/**
 * サーバ側の公開前チェック（設計書 7章）。狭く・確実に。
 * - secret / denylist / exif-gps は上書き不可
 * - coords だけ acknowledge: ["coords"] で通せる
 */

export const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE[ ]KEY-----/g,
  /\bghp_[A-Za-z0-9]{36}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}/g,
  /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
];

const LAT_RE = /(?<![\d.])[23][0-9]\.\d{4,}/;
const LON_RE = /(?<![\d.])1[23][0-9]\.\d{4,}/;
const LONG_TOKEN_RE = /[A-Za-z0-9_+/=-]{32,}/g;

/** シャノンエントロピー（bit/文字） */
function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** 高エントロピーの長い英数字列（大文字・小文字・数字が混ざるもの。16進ハッシュは対象外） */
export function isHighEntropyToken(s: string): boolean {
  if (s.length < 32) return false;
  if (!/[A-Z]/.test(s) || !/[a-z]/.test(s) || !/[0-9]/.test(s)) return false;
  return entropy(s) > 4.2;
}

function excerptOf(line: string, matches: string[]): string {
  let out = line;
  for (const m of matches) out = out.split(m).join("***");
  out = out.trim();
  return out.length > 120 ? out.slice(0, 117) + "..." : out;
}

export function parseDenylist(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

export type CheckInput = {
  title: string;
  description: string;
  body: string;
  apiToken?: string;
  denylist?: string;
};

export function checkText(input: CheckInput): Finding[] {
  const findings: Finding[] = [];
  const deny = parseDenylist(input.denylist).map((w) => w.toLowerCase());
  // 行0 = タイトル・description（メタデータも公開されるため）
  const lines: [number, string][] = [
    [0, `${input.title} ${input.description}`],
    ...input.body.split(/\r?\n/).map((l, i) => [i + 1, l] as [number, string]),
  ];
  for (const [no, line] of lines) {
    // secret
    const secretHits: string[] = [];
    for (const re of SECRET_PATTERNS) {
      for (const m of line.matchAll(re)) secretHits.push(m[0]);
    }
    for (const m of line.matchAll(LONG_TOKEN_RE)) {
      if (isHighEntropyToken(m[0]) && !secretHits.some((h) => h.includes(m[0]))) secretHits.push(m[0]);
    }
    if (input.apiToken && input.apiToken.length >= 8 && line.includes(input.apiToken)) {
      secretHits.push(input.apiToken);
    }
    if (secretHits.length) findings.push({ rule: "secret", line: no, excerpt: excerptOf(line, secretHits) });

    // denylist
    if (deny.length) {
      const lower = line.toLowerCase();
      const hits: string[] = [];
      for (const w of deny) {
        const idx = lower.indexOf(w);
        if (idx >= 0) hits.push(line.slice(idx, idx + w.length));
      }
      if (hits.length) findings.push({ rule: "denylist", line: no, excerpt: excerptOf(line, hits) });
    }

    // coords（同じ行に緯度らしい数値と経度らしい数値の組）
    const lat = line.match(LAT_RE);
    const lon = line.match(LON_RE);
    if (lat && lon) findings.push({ rule: "coords", line: no, excerpt: excerptOf(line, [lat[0], lon[0]]) });
  }
  return findings;
}

// ---------- EXIF GPS ----------

/** TIFF（EXIF 本体）の IFD0 に GPS IFD ポインタ（0x8825）があるか */
function tiffHasGps(b: Uint8Array, start: number, end: number): boolean {
  if (end - start < 8) return false;
  const le = b[start] === 0x49 && b[start + 1] === 0x49;
  const be = b[start] === 0x4d && b[start + 1] === 0x4d;
  if (!le && !be) return false;
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    le
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ifd0 = start + u32(start + 4);
  if (ifd0 + 2 > end) return false;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x8825) return true;
  }
  return false;
}

/** JPEG / PNG / WebP の EXIF に GPS 情報が残っているか */
export function hasGpsExif(b: Uint8Array): boolean {
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) return false;
      const marker = b[o + 1];
      if (marker === 0xd9 || marker === 0xda) return false; // EOI / SOS 以降は画像データ
      if (marker === 0xff) {
        o += 1;
        continue;
      }
      const len = (b[o + 2] << 8) | b[o + 3];
      const segStart = o + 4;
      const segEnd = Math.min(o + 2 + len, b.length);
      if (
        marker === 0xe1 &&
        b[segStart] === 0x45 && // "Exif\0\0"
        b[segStart + 1] === 0x78 &&
        b[segStart + 2] === 0x69 &&
        b[segStart + 3] === 0x66 &&
        tiffHasGps(b, segStart + 6, segEnd)
      ) {
        return true;
      }
      o = o + 2 + len;
    }
    return false;
  }
  // PNG（eXIf チャンク）
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    let o = 8;
    while (o + 8 <= b.length) {
      const len = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (type === "eXIf" && tiffHasGps(b, o + 8, Math.min(o + 8 + len, b.length))) return true;
      if (type === "IEND") return false;
      o += 12 + len;
    }
    return false;
  }
  // WebP（RIFF の EXIF チャンク）
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    let o = 12;
    while (o + 8 <= b.length) {
      const type = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
      const len = (b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24)) >>> 0;
      if (type === "EXIF") {
        let s = o + 8;
        // "Exif\0\0" 接頭辞付きの実装もある
        if (b[s] === 0x45 && b[s + 1] === 0x78) s += 6;
        if (tiffHasGps(b, s, Math.min(o + 8 + len, b.length))) return true;
      }
      o += 8 + len + (len % 2);
    }
  }
  return false;
}

export const ACKNOWLEDGEABLE = new Set(["coords"]);

/** acknowledge を適用して、止めるべき指摘だけを返す */
export function blocking(findings: Finding[], acknowledge: string[]): Finding[] {
  const ack = new Set(acknowledge.filter((a) => ACKNOWLEDGEABLE.has(a)));
  return findings.filter((f) => !ack.has(f.rule));
}
