// 琥珀の印（favicon）を作る。2026-09-27 Keisuke 決定の「案2」: 琥珀色 #b06a10 の角丸四角に白抜きの明朝「琥」。
// SVG の <text> は閲覧端末のフォント頼みになるので、Shippori Mincho SemiBold の「琥」をパスにして埋め込む。
// 使い方（リポジトリ外の作業ディレクトリで）:
//   npm i opentype.js
//   curl -LO https://github.com/google/fonts/raw/main/ofl/shipporimincho/ShipporiMincho-SemiBold.ttf   # SIL OFL 1.1
//   node make-favicon.mjs   → favicon.svg（角丸）・touch.svg（全面・apple-touch-icon 用）
//   magick -background none -density 1200 touch.svg -resize 180x180 apple-touch-icon.png
//   for s in 16 32 48; do magick -background none -density 600 favicon.svg -resize ${s}x${s} f$s.png; done
//   magick f16.png f32.png f48.png favicon.ico
import opentype from "opentype.js";
import { readFileSync, writeFileSync } from "node:fs";
const buf = readFileSync("ShipporiMincho-SemiBold.ttf");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const g = font.charToGlyph("琥");
const size = 23, cx = 16, base = 25;
const adv = g.advanceWidth * size / font.unitsPerEm;
const p = g.getPath(cx - adv / 2, base, size);
const d = p.toPathData(2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#b06a10"/><path fill="#fff" d="${d}"/></svg>\n`;
writeFileSync("favicon.svg", svg);
// 角丸なしの全面版（apple-touch-icon 用。iOS が自前で角を丸めるため）
writeFileSync("touch.svg", svg.replace('rx="3" ', ""));
console.log(g.name, g.unicode?.toString(16), d.length, JSON.stringify(p.getBoundingBox()));
