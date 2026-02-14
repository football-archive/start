// src/scripts/generate_sitemap.mjs
import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const OUT_FILE = path.resolve("dist", "sitemap.xml");

// Netlify本番 / ローカル両対応（必要なら package.json で SITE_URL を渡す）
const SITE_URL = (
  process.env.SITE_URL || "https://world-football-archive.netlify.app"
).replace(/\/$/, "");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function toUrlPath(filePath) {
  // dist からの相対パス
  let rel = path.relative(DIST_DIR, filePath).replaceAll("\\", "/");

  // html以外は対象外
  if (!rel.endsWith(".html")) return null;

  // 除外（好みで追加）
  if (rel === "404.html") return null;

  // index.html はディレクトリURLに
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html"))
    rel = rel.slice(0, -"/index.html".length) + "/";
  // 末尾の .html は消す（/foo.html -> /foo）
  else rel = rel.slice(0, -".html".length);

  // 先頭に /
  if (!rel.startsWith("/")) rel = "/" + rel;

  return rel;
}

function isoDate(d) {
  // lastmod は日付だけで十分
  return d.toISOString().slice(0, 10);
}

const files = walk(DIST_DIR);
const urls = [];

for (const f of files) {
  const p = toUrlPath(f);
  if (!p) continue;

  const lastmod = isoDate(fs.statSync(f).mtime);
  // ★ここが重要：rel の中に %E3... が含まれても、そのまま <loc> に入れてOK
  urls.push({ loc: SITE_URL + p.replace(/\/$/, ""), lastmod });
}

// できればトップだけ末尾 / を付けたい派なら好みで調整OK
// urls のソート（任意）
urls.sort((a, b) => a.loc.localeCompare(b.loc));

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n` +
        `    <loc>${u.loc}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n` +
        `  </url>`,
    )
    .join("\n") +
  `\n</urlset>\n`;

fs.writeFileSync(OUT_FILE, xml, "utf-8");
console.log(`[sitemap] ${urls.length} urls -> ${OUT_FILE}`);
