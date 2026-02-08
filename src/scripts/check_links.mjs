import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function isInternalHref(href) {
  if (!href) return false;
  if (href.startsWith("http://") || href.startsWith("https://")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (href.startsWith("#")) return false;
  return href.startsWith("/");
}

function stripHashQuery(href) {
  return href.split("#")[0].split("?")[0];
}

function candidatePathsFromHref(href) {
  // /clubs -> dist/clubs/index.html
  // /clubs/aaa -> dist/clubs/aaa/index.html (Astroは基本これ)
  // /foo.html -> dist/foo.html
  const h = stripHashQuery(href);
  const decoded = (() => {
    try {
      return decodeURIComponent(h);
    } catch {
      return h;
    }
  })();

  // 末尾スラなしでも同じ扱いに
  const norm = decoded.endsWith("/") ? decoded.slice(0, -1) : decoded;

  const p1 = path.join(dist, norm, "index.html");
  const p2 = path.join(dist, norm + ".html");

  // ルート /
  const p0 = path.join(dist, "index.html");

  if (norm === "" || norm === "/") return [p0];
  return [p1, p2];
}

if (!fs.existsSync(dist)) {
  console.error(
    "[ERR] dist/ が見つかりません。先に npm run build してください。",
  );
  process.exit(1);
}

const htmlFiles = walk(dist).filter((p) => p.endsWith(".html"));
const links = new Map(); // href -> [fromFiles...]

const hrefRe = /href\s*=\s*["']([^"']+)["']/g;

for (const f of htmlFiles) {
  const rel = path.relative(dist, f);
  const s = fs.readFileSync(f, "utf-8");
  let m;
  while ((m = hrefRe.exec(s))) {
    const href = m[1].trim();
    if (!isInternalHref(href)) continue;

    // 正規化（/clubs?league=... のようなクエリは存在確認には不要）
    const key = stripHashQuery(href);
    if (!links.has(key)) links.set(key, []);
    links.get(key).push(rel);
  }
}

const broken = [];

for (const href of links.keys()) {
  const candidates = candidatePathsFromHref(href);
  // allowlist: Astro build assets & favicon
  const hrefPath = String(href ?? "")
    .split("?")[0]
    .split("#")[0];

  if (hrefPath === "/favicon.png") continue;
  if (hrefPath.startsWith("/_astro/")) continue;

  const ok = candidates.some((p) => fs.existsSync(p));
  if (!ok) broken.push(href);
}

broken.sort((a, b) => a.localeCompare(b, "ja"));

console.log("=== internal link check ===");
console.log("html files:", htmlFiles.length);
console.log("unique internal links:", links.size);
console.log("broken:", broken.length);

if (broken.length) {
  console.log("\n--- broken list ---");
  for (const href of broken) {
    const from = links.get(href) ?? [];
    console.log(href);
    console.log(
      "  from:",
      from.slice(0, 3).join(", ") + (from.length > 3 ? " ..." : ""),
    );
  }
  process.exitCode = 1;
} else {
  console.log("OK: broken links not found");
}
