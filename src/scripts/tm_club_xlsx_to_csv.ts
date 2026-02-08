import fs from "fs";
import XLSX from "xlsx";
import path from "path";

/**
 * Transfermarkt コピペExcel（クラブ版） → club_squads_site.csv 互換CSV
 *
 * 入力: _work/Club_update_2025-26.xlsx のシート "RAW"
 * - クラブ見出し行: A列が "### Premier League / アーセナル" 形式
 * - 選手情報が「1選手=2〜3行」に分割されることがある（名前行が別行/国籍が別行 など）
 *
 * 重要:
 * - club_master.csv を読んで league_key / club_key / club(日本語表示) を解決
 *
 * ✅ 追加:
 * - window 列を追加し、値はスクリプト直書きで一律セットする
 *   (winter/summer の2値運用想定)
 */

const WORK_DIR = "_work";
const INPUT = path.join(WORK_DIR, "Club_update_2025-26.xlsx");
const OUTPUT = path.join(WORK_DIR, "club_squads_tm_converted.csv");

const CLUB_MASTER_CSV = (() => {
  const p1 = path.join(process.cwd(), "src", "data", "club_master.csv");
  const p2 = path.join(WORK_DIR, "club_master.csv");
  return fs.existsSync(p1) ? p1 : p2;
})();

const RAW_SHEET = "RAW";
const SEASON = "2025-26";
const SOURCE = "Transfermarkt (copypaste)";

// ✅ window をソース直書きで埋める（夏版を作るときは "summer" に変える）
const WINDOW_DEFAULT: "summer" | "winter" = "winter";

// ===== utils =====
// 文字列キーの正規化（見た目同じでも一致しない問題対策）
// - NBSP/全角スペース/ゼロ幅スペースを除去
// - Unicode NFKC 正規化
// - 連続スペースを1つに
function normalizeKey(v: unknown) {
  const s0 = String(v ?? "");
  // NFKC (Node 16+)
  const s1 = s0.normalize("NFKC");
  const s2 = s1
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "") // NBSP/zero-width
    .replace(/[\u3000]/g, " ") // full-width space
    .replace(/[\s\t\r\n]+/g, " ")
    .trim()
    .toLowerCase();
  return s2;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function keyNormalize(s: unknown) {
  return normalizeKey(s);
}

function toYMD(v: unknown) {
  if (!v) return "";

  // Excel date as Date
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}/${v.getMonth() + 1}/${v.getDate()}`;
  }

  // Excel date as serial number (xlsx library often returns number)
  if (typeof v === "number" && isFinite(v)) {
    // @ts-ignore - SSF is available on XLSX
    const d = (XLSX as any).SSF?.parse_date_code?.(v);
    if (d && d.y && d.m && d.d) return `${d.y}/${Number(d.m)}/${Number(d.d)}`;
  }

  let s = String(v).trim();
  if (!s || s === "-") return "";

  // remove age "(30)"
  s = s.replace(/\s*\(.*?\)\s*/g, "").trim();

  // yyyy/mm/dd
  let m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;

  // yyyy-mm-dd
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;

  // dd/mm/yyyy
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}/${Number(m[2])}/${Number(m[1])}`;

  return "";
}

function parseBirthDate(v: unknown) {
  // RAWは "1995/09/15 (30)" 形式が多い
  return toYMD(v);
}

function parseHeightCm(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // "1,83m" "1.83 m" など
  const m = s.match(/(\d{1})[.,](\d{2})\s*m/i);
  if (m) {
    const meters = Number(m[1]) + Number(m[2]) / 100;
    return String(Math.round(meters * 100));
  }
  // "183cm" など
  const m2 = s.match(/(\d{2,3})\s*cm/i);
  if (m2) return String(Number(m2[1]));
  return "";
}

function normCell(v: unknown) {
  const s = String(v ?? "").trim();
  return s;
}

function isMarkerRow(r: any[]) {
  return typeof r?.[0] === "string" && String(r[0]).trim().startsWith("###");
}

function isHeaderRow(r: any[]) {
  return (
    String(r?.[0] ?? "").trim() === "#" && String(r?.[1] ?? "").includes("選手")
  );
}

function isPlayerStartRow(r: any[]) {
  const c0 = r?.[0];
  if (typeof c0 === "number") return true;
  if (typeof c0 === "string" && c0.trim() !== "" && /^\d+$/.test(c0.trim()))
    return true;
  return false;
}

function toShirtNo(v: unknown) {
  if (typeof v === "number") return String(v);
  const s = String(v ?? "").trim();
  if (/^\d+$/.test(s)) return s;
  return "";
}

function isPositionText(s: string) {
  const t = keyNormalize(s);
  if (!t) return false;
  // 日本語/英語ざっくり（RAWは日本語が多い）
  return (
    t.includes("ゴール") ||
    t.includes("gk") ||
    t.includes("keeper") ||
    t.includes("キーパー") ||
    t.includes("センターバック") ||
    t.includes("cb") ||
    t.includes("back") ||
    t.includes("sb") ||
    t.includes("サイドバック") ||
    t.includes("ウィングバック") ||
    t.includes("ボランチ") ||
    t.includes("ミッド") ||
    t.includes("mf") ||
    t.includes("wing") ||
    t.includes("ウィンガー") ||
    t.includes("fw") ||
    t.includes("フォワード") ||
    t.includes("ストライカー") ||
    t.includes("cf")
  );
}

function guessPrimaryPos(posText: string) {
  const t = keyNormalize(posText);
  if (!t) return "";
  if (
    t.includes("gk") ||
    t.includes("keeper") ||
    t.includes("ゴール") ||
    t.includes("キーパー")
  )
    return "GK";
  if (
    t.includes("back") ||
    t.includes("cb") ||
    t.includes("センターバック") ||
    t.includes("sb") ||
    t.includes("サイドバック") ||
    t.includes("wb") ||
    t.includes("ウィングバック") ||
    t.includes("df")
  )
    return "DF";
  if (
    t.includes("mid") ||
    t.includes("mf") ||
    t.includes("ミッド") ||
    t.includes("ボランチ")
  )
    return "MF";
  if (
    t.includes("wing") ||
    t.includes("fw") ||
    t.includes("cf") ||
    t.includes("striker") ||
    t.includes("フォワード") ||
    t.includes("ウィンガー") ||
    t.includes("ストライカー")
  )
    return "FW";
  return "";
}

// ===== club master =====
type ClubMasterRow = {
  club_key: string;
  league_key: string;
  // display names (either old schema or current schema)
  league_display: string;
  club_display_ja: string;
  club_display_en: string;
  // optional aliases column in current schema
  aliases?: string;
  // optional legacy aliases
  club_alias_en?: string;
  club_alias_ja?: string;
};

function loadClubMasterLookup(): ClubMasterRow[] {
  if (!fs.existsSync(CLUB_MASTER_CSV)) return [];
  const txt = fs.readFileSync(CLUB_MASTER_CSV, "utf-8");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length <= 1) return [];

  // NOTE:
  // 現行の club_master.csv は以下の列を持つ（あなたのリポジトリ実体）:
  // club_key, league_key, league_display, club_display_ja, club_display_en, sort_ja, aliases, status, notes
  // ただし過去チャットで作った旧スキーマ（league_name_en 等）も想定し、両対応にする。
  const header = lines[0]
    .split(",")
    .map((h) => h.replace(/^\uFEFF/, "").trim());
  const idx = (name: string) => header.indexOf(name);
  const pick = (cols: string[], ...names: string[]) => {
    for (const n of names) {
      const j = idx(n);
      if (j >= 0) return cols[j] ?? "";
    }
    return "";
  };

  const out: ClubMasterRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const league_key = pick(cols, "league_key");
    const club_key = pick(cols, "club_key");

    const league_display = pick(
      cols,
      "league_display",
      "league_name_en",
      "league_name_ja",
    );
    const club_display_ja = pick(cols, "club_display_ja", "club_name_ja");
    const club_display_en = pick(cols, "club_display_en", "club_name_en");
    const aliases = pick(cols, "aliases");
    const club_alias_en = pick(cols, "club_alias_en");
    const club_alias_ja = pick(cols, "club_alias_ja");

    out.push({
      league_key,
      club_key,
      league_display,
      club_display_ja,
      club_display_en,
      aliases: aliases || undefined,
      club_alias_en: club_alias_en || undefined,
      club_alias_ja: club_alias_ja || undefined,
    });
  }
  return out;
}

function resolveClubFromMaster(
  masters: ClubMasterRow[],
  leagueDisp: string,
  clubDisp: string,
) {
  const l = keyNormalize(leagueDisp);
  const c = keyNormalize(clubDisp);

  const leagueMatches = masters.filter(
    (m) => keyNormalize(m.league_display) === l,
  );

  const expandAliases = (m: ClubMasterRow) => {
    const a: string[] = [];
    if (m.aliases) a.push(...m.aliases.split(/[|/;,]/g));
    if (m.club_alias_en) a.push(...m.club_alias_en.split("|"));
    if (m.club_alias_ja) a.push(...m.club_alias_ja.split("|"));
    return a.map((x) => x.trim()).filter(Boolean);
  };

  const findClub = (m: ClubMasterRow) => {
    const cands = [
      m.club_display_en,
      m.club_display_ja,
      ...expandAliases(m),
    ].map((x) => keyNormalize(x));

    // 完全一致 or 部分一致（RAW側が「FC」付き/なし等のゆらぎがあるため）
    return cands.some((x) => x && (x === c || x.includes(c) || c.includes(x)));
  };

  const hit = (leagueMatches.length ? leagueMatches : masters).find(findClub);
  if (!hit) return null;

  return {
    league_key: hit.league_key,
    club_key: hit.club_key,
    club_display_ja: hit.club_display_ja,
    league_display: hit.league_display,
  };
}

// ===== main =====
if (!fs.existsSync(INPUT)) {
  console.error("❌ Excel not found:", INPUT);
  process.exit(1);
}

const wb = XLSX.readFile(INPUT, { cellDates: true });
const rawSheet = wb.Sheets[RAW_SHEET];
if (!rawSheet) {
  console.error(`❌ RAW sheet not found: ${RAW_SHEET}`);
  console.error("sheets=", wb.SheetNames.join(", "));
  process.exit(1);
}

const rows: any[][] = XLSX.utils.sheet_to_json(rawSheet, { header: 1 });

const clubMasterLookup = loadClubMasterLookup();
const missingClubs = new Set<string>();

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
})();

// header
const out: string[] = [];
out.push(
  [
    "season",
    "window", // ✅ 追加：seasonの次
    "league",
    "club",
    "club_key",
    "club_shirt_no",
    "position_primary",
    "is_star",
    "name_en",
    "birth_date",
    "height_cm",
    "snapshot_date",
    "name_ja",
    "nationality",
    "foot",
    "join_date",
    "prev_club",
    "contract_until",
    "source",
    "notes",
    "league_key",
  ].join(","),
);

let curLeague = "";
let curClub = "";
let curLeagueKey = "";
let curClubKey = "";
let curClubDisplayJa = "";

function setClubFromMarker(marker: string) {
  const s = marker.replace(/^###\s*/, "").trim();
  let league = "";
  let club = s;
  const parts = s.split(" / ");
  if (parts.length >= 2) {
    league = parts[0].trim();
    club = parts.slice(1).join(" / ").trim();
  }

  curLeague = league || curLeague;
  curClub = club || curClub;

  const resolved = resolveClubFromMaster(clubMasterLookup, curLeague, curClub);
  if (resolved) {
    curLeagueKey = resolved.league_key;
    curClubKey = resolved.club_key;
    curClubDisplayJa = resolved.club_display_ja;
  } else {
    curLeagueKey = "";
    curClubKey = "";
    curClubDisplayJa = "";
    missingClubs.add(`${curLeague} / ${curClub}`);
  }
}

function mergePlayerBlock(block: any[][]) {
  // block: 先頭行は背番号あり。以降は補助行
  const getFirst = (col: number) => {
    for (const r of block) {
      const v = r?.[col];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };

  const shirtNo = toShirtNo(getFirst(0));

  // name: col2 or col3 に来ることがある（RAWの揺れ吸収）
  const name2 = normCell(getFirst(1));
  const name3 = normCell(getFirst(2));
  const name_en = name3 || name2;

  const birth_date = parseBirthDate(getFirst(3));

  // nationality: block内の col4 をユニーク結合（複数国籍対策）
  const nats: string[] = [];
  for (const r of block) {
    const v = normCell(r?.[4]);
    if (v && !nats.includes(v)) nats.push(v);
  }
  const nationality = nats.join(" / ");

  const height_cm = parseHeightCm(getFirst(5));
  const foot = normCell(getFirst(6));
  const join_date = toYMD(getFirst(7));
  const prev_club = normCell(getFirst(8));
  const contract_until = toYMD(getFirst(9));

  // position: 典型行は (col1=null,col2=null,col3=pos) だが、国籍2つ等で崩れるので全文走査
  let posText = "";
  for (const r of block) {
    const v = normCell(r?.[2]);
    if (v && isPositionText(v)) {
      posText = v;
      break;
    }
  }
  const posPrimary = guessPrimaryPos(posText);

  return {
    league: curLeague,
    club: curClubDisplayJa || curClub,
    club_key: curClubKey,
    league_key: curLeagueKey,
    club_shirt_no: shirtNo,
    position_primary: posPrimary,
    name_en,
    birth_date,
    height_cm,
    snapshot_date: today,
    name_ja: name_en, // name_ja未整備なら name_en を代替
    nationality,
    foot,
    join_date,
    prev_club,
    contract_until,
    source: SOURCE,
    notes: "",
  };
}

// main scan
for (let i = 0; i < rows.length; i++) {
  const r = rows[i] ?? [];

  if (isMarkerRow(r)) {
    setClubFromMarker(String(r[0]));
    continue;
  }
  if (isHeaderRow(r)) continue;

  if (!isPlayerStartRow(r)) continue;

  // collect block
  const block: any[][] = [r];
  let j = i + 1;
  while (j < rows.length) {
    const rr = rows[j] ?? [];
    if (isMarkerRow(rr) || isHeaderRow(rr) || isPlayerStartRow(rr)) break;
    // 空行はスキップせずブロックに入れても害はないが、軽くする
    if (
      rr.some(
        (x: any) => x !== null && x !== undefined && String(x).trim() !== "",
      )
    ) {
      block.push(rr);
    }
    j++;
  }
  i = j - 1;

  const rec = mergePlayerBlock(block);

  // 必須キーが無い場合でも出力はするが、後で気づけるように stderr へ
  if (!rec.club_key || !rec.league_key) {
    // eslint-disable-next-line no-console
    console.error("⚠️ missing club_key/league_key:", curLeague, "/", curClub);
  }

  out.push(
    [
      csvEscape(SEASON),
      csvEscape(WINDOW_DEFAULT), // ✅ 追加：window（固定値）
      csvEscape(rec.league),
      csvEscape(rec.club),
      csvEscape(rec.club_key),
      csvEscape(rec.club_shirt_no),
      csvEscape(rec.position_primary),
      ,
      csvEscape(rec.name_en),
      csvEscape(rec.birth_date),
      csvEscape(rec.height_cm),
      csvEscape(rec.snapshot_date),
      csvEscape(rec.name_ja),
      csvEscape(rec.nationality),
      csvEscape(rec.foot),
      csvEscape(rec.join_date),
      csvEscape(rec.prev_club),
      csvEscape(rec.contract_until),
      csvEscape(rec.source),
      csvEscape(rec.notes),
      csvEscape(rec.league_key),
    ].join(","),
  );
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const csvText = out.join("\n");
const csvCrlf = csvText.replace(/\r?\n/g, "\r\n");
const BOM = "\uFEFF";
fs.writeFileSync(OUTPUT, BOM + csvCrlf, { encoding: "utf8" });

console.log("✅ wrote:", OUTPUT, "rows=", out.length - 1);
