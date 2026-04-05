import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

// ===== 設定：データファイル =====
const CALLUPS = path.join(ROOT, "src", "data", "callups_site.csv");
const CLUBS = path.join(ROOT, "src", "data", "club_squads_site.csv");

// ===== util =====
const norm = (s) => String(s ?? "").trim();
const enc = (s) => encodeURIComponent(s);

function listHtmlFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.isFile() && ent.name.endsWith(".html")) out.push(p);
    }
  }
  return out;
}

function relToDist(p) {
  // Windows: "C:\...\dist\wc\2026\team\日本\index.html"
  // -> "/wc/2026/team/日本/index.html"
  return p.replace(DIST, "").replaceAll("\\", "/");
}

function readCsv(filePath) {
  const csv = fs.readFileSync(filePath, "utf-8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  return parsed.data ?? [];
}

function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

// directory形式とfile形式の両方を許容 + encoded/decoded の両方を許容
function candidates(routePathNoExt) {
  // routePathNoExt examples:
  // "/wc/2026/team/%E6%97%A5%E6%9C%AC"
  // "/clubs/Premier%20League/Arsenal"
  const base = String(routePathNoExt || "");
  const decoded = safeDecodeURIComponent(base);

  // 重複除去しつつ順序維持
  const bases = [];
  for (const b of [base, decoded]) {
    if (b && !bases.includes(b)) bases.push(b);
  }

  const out = [];
  for (const b of bases) {
    out.push(`${b}/index.html`); // directory format
    out.push(`${b}.html`); // file format
  }
  return out;
}

function expectedTeamRoutes(callupsRows) {
  const rows = callupsRows.filter(
    (r) => norm(r.competition) === "WC" && norm(r.edition) === "2026",
  );
  const countries = [
    ...new Set(rows.map((r) => norm(r.country)).filter(Boolean)),
  ];
  // 期待側は従来通り encode してOK（candidates側で decoded を見に行く）
  return countries.map((c) => `/wc/2026/team/${enc(c)}`);
}

function expectedClubRoutes(clubRows) {
  // 新ルーティング：/clubs/[league_key]/[club_key]
  const rows = clubRows.filter((r) => norm(r.league_key) && norm(r.club_key));

  const keys = new Set();
  for (const r of rows) keys.add(`${norm(r.league_key)}|||${norm(r.club_key)}`);

  // league_key/club_key は基本ASCII slugなので encode は不要（念のため enc してもOK）
  return [...keys].map((k) => {
    const [leagueKey, clubKey] = k.split("|||");
    return `/clubs/${leagueKey}/club/${clubKey}`;
  });
}

if (!fs.existsSync(DIST)) {
  console.error("[ERR] dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

const html = new Set(listHtmlFiles(DIST).map(relToDist));

const callups = readCsv(CALLUPS);
const clubs = readCsv(CLUBS);

const expectedTeams = expectedTeamRoutes(callups);
const expectedClubs = expectedClubRoutes(clubs);

function missing(expectedNoExtList) {
  const miss = [];
  for (const base of expectedNoExtList) {
    const ok = candidates(base).some((p) => html.has(p));
    if (!ok) miss.push(base);
  }
  return miss;
}

const missingTeams = missing(expectedTeams);
const missingClubs = missing(expectedClubs);

console.log(
  "=== route generation check (dir+file format + encoded/decoded) ===",
);
console.log("dist html:", html.size);
console.log(
  "expected teams:",
  expectedTeams.length,
  "missing:",
  missingTeams.length,
);
console.log(
  "expected clubs:",
  expectedClubs.length,
  "missing:",
  missingClubs.length,
);

if (missingTeams.length) {
  console.log("\n-- missing team routes (first 50) --");
  missingTeams.slice(0, 50).forEach((p) => console.log(p));
}

if (missingClubs.length) {
  console.log("\n-- missing club routes (first 50) --");
  missingClubs.slice(0, 50).forEach((p) => console.log(p));
}

if (!missingTeams.length && !missingClubs.length) {
  console.log("\nOK: no missing routes 🎉");
}
