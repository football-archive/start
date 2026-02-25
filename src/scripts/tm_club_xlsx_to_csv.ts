import fs from "fs";
import XLSX from "xlsx";
import path from "path";

/**
 * Transfermarkt コピペExcel（クラブ版） → club_squads_site.csv 互換CSV
 *
 * ✅ 修正ポイント
 * - RAWヘッダー行から列indexを自動推定（「現在のクラブ」列が入ってもズレない）
 * - club_master 解決はリーグ不一致でもクラブ名で拾える（Premire League typo等に耐える）
 * - 出力は Excel で文字化けしない UTF-8 BOM + CRLF
 * - markerに season があれば season列に反映
 *    - "### Premier League / アーセナル"
 *    - "### 2024-25 / Premier League / アーセナル"
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
const SEASON_DEFAULT = "2025-26";
const SOURCE = "Transfermarkt (copypaste)";
const WINDOW_DEFAULT: "summer" | "winter" = "winter";

// ===== utils =====
function seasonToSnapshotDate(season: string) {
  const s = String(season ?? "").trim();
  if (!s) return "";

  // 例: "2017-18" "1992-93" "2024-25"
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";

  const y1 = Number(m[1]);
  const yy2 = Number(m[2]); // 0-99
  if (!Number.isFinite(y1) || !Number.isFinite(yy2)) return "";

  // 終わり年を推定
  // 2017-18 -> 2018
  // 1999-00 -> 2000
  let y2 = Math.floor(y1 / 100) * 100 + yy2; // 1900 + 93, 2000 + 25 など
  if (y2 < y1) y2 += 100; // 世紀跨ぎ対策（1999-00）

  return `${y2}-02-01`;
}

function cleanPlayerName(name: string) {
  let s = String(name ?? "").trim();
  if (!s) return "";

  // 例:
  // "山田太郎（1998年生のサッカー選手）" -> "山田太郎"
  // "山田太郎 (1998年生のサッカー選手)" -> "山田太郎"
  s = s
    .replace(/[（(]\s*\d{4}\s*年\s*生(?:まれ)?のサッカー選手\s*[）)]\s*$/u, "")
    .trim();

  return s;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (
    s.includes('"') ||
    s.includes(",") ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// 文字列キーの正規化（見た目同じでも一致しない問題対策）
function keyNormalize(v: unknown) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ") // NBSP
    .replace(/\u3000/g, " ") // 全角スペース
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // ゼロ幅など
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function toYMD(v: unknown) {
  if (!v) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return "";
  const m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    const dd = String(Number(m[3])).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return "";
}

function toShirtNo(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s === "-") return ""; // 空扱い
  if (/^\d+$/.test(s)) return s;
  return s;
}

function parseBirthDate(v: unknown) {
  // "1995/09/15 (29)" みたいな形式 → YYYY-MM-DD
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
  return String(v ?? "").trim();
}

function isMarkerRow(r: any[]) {
  return typeof r?.[0] === "string" && String(r[0]).trim().startsWith("###");
}

function isHeaderRow(r: any[]) {
  // RAWのヘッダー行（例）
  // ['#','選手',null,'生年月日/年齢','国籍','現在のクラブ','身長','利き足','加入日','前所属',...]
  return (
    String(r?.[0] ?? "").trim() === "#" && String(r?.[1] ?? "").includes("選手")
  );
}

function isPlayerStartRow(r: any[]) {
  const v = String(r?.[0] ?? "").trim();
  return v !== "" && (v === "-" || /^\d+$/.test(v));
}

// 日本語/英語ポジを GK/DF/MF/FW に寄せる（代表側から転用）
function mapPosLabelToPrimary(label: string) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();

  // ---- 日本語（TM日本語表記） ----
  if (raw.includes("ゴールキーパー")) return "GK";

  // FW（“ウイング”/“ウィンガー”両対応）
  if (
    raw.includes("センターフォワード") ||
    raw.includes("フォワード") ||
    raw.includes("ストライカー") ||
    raw.includes("ウイング") ||
    raw.includes("ウィンガー")
  )
    return "FW";

  // MF（“フィルダー/フィールダー”両対応。日本語は「ミッド」を見ればほぼ拾える）
  if (
    raw.includes("守備的ミッド") ||
    raw.includes("セントラルミッド") ||
    raw.includes("攻撃的ミッド") ||
    raw.includes("ミッド") ||
    raw.includes("中盤")
  )
    return "MF";

  // DF
  if (
    raw.includes("センターバック") ||
    raw.includes("右サイドバック") ||
    raw.includes("左サイドバック") ||
    raw.includes("サイドバック") ||
    raw.includes("ウイングバック") ||
    raw.includes("ディフェンダー") ||
    raw.includes("バック")
  )
    return "DF";

  // ---- 英語（既存互換） ----
  if (s.includes("goalkeeper")) return "GK";

  if (
    s.includes("back") ||
    s.includes("centre-back") ||
    s.includes("center-back") ||
    s.includes("defender") ||
    s.includes("wing-back")
  )
    return "DF";

  if (s.includes("midfield")) return "MF";

  if (
    s.includes("winger") ||
    s.includes("forward") ||
    s.includes("striker") ||
    s.includes("second striker") ||
    s.includes("centre-forward") ||
    s.includes("center forward")
  )
    return "FW";

  return "";
}

// ===== club master =====
type ClubMasterRow = {
  league_key: string;
  club_key: string;
  league_display: string;
  club_display_ja: string;
  club_display_en: string;
  aliases?: string;
  club_alias_en?: string;
  club_alias_ja?: string;
};

function loadClubMasterLookup() {
  const csv = fs.readFileSync(CLUB_MASTER_CSV, "utf-8");
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",");
  // ✅ BOM除去（club_master.csv が UTF-8 BOM 付きのため）
  header[0] = header[0].replace(/^\uFEFF/, "");

  const idxOf = (k: string) => header.indexOf(k);

  const pick = (cols: string[], ...keys: string[]) => {
    for (const k of keys) {
      const j = idxOf(k);
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
    return cands.some((x) => x && (x === c || x.includes(c) || c.includes(x)));
  };

  // ✅ リーグが一致しない（Premire League typo等）場合でも、クラブ名で全体から拾う
  const hit = (leagueMatches.length ? leagueMatches : masters).find(findClub);
  if (!hit) return null;

  return {
    league_key: hit.league_key,
    club_key: hit.club_key,
    club_display_ja: hit.club_display_ja,
    league_display: hit.league_display,
  };
}

// ===== header index (AUTO) =====
type HeaderIndex = {
  name1: number; // 選手（英語名など）
  name2: number; // 選手（もう1列）
  birth: number; // 生年月日/年齢
  nat: number; // 国籍
  height: number; // 身長
  foot: number; // 利き足
  join: number; // 加入日
  prev: number; // 前所属
  contract: number; // 契約終了（あれば）
};

function buildHeaderIndex(headerRow: any[]): HeaderIndex {
  const find = (pred: (s: string) => boolean, fallback: number) => {
    for (let i = 0; i < headerRow.length; i++) {
      const s = String(headerRow[i] ?? "").trim();
      if (s && pred(s)) return i;
    }
    return fallback;
  };

  // RAWの典型（あなたのExcel）
  // 0 '#', 1 '選手', 2 null, 3 '生年月日/年齢', 4 '国籍', 5 '現在のクラブ', 6 '身長', 7 '利き足', 8 '加入日', 9 '前所属', ...
  const name1 = 1;
  const name2 = 2;

  const birth = find((s) => s.includes("生年月日"), 3);
  const nat = find((s) => s.includes("国籍"), 4);
  const height = find((s) => s.includes("身長"), 6);
  const foot = find((s) => s.includes("利き足"), 7);
  const join = find((s) => s.includes("加入日"), 8);
  const prev = find((s) => s.includes("前所属"), 9);
  const contract = find(
    (s) => s.includes("契約") || s.includes("満了") || s.includes("終了"),
    -1,
  );

  return { name1, name2, birth, nat, height, foot, join, prev, contract };
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

let curSeason = SEASON_DEFAULT;
let curLeague = "";
let curClub = "";
let curLeagueKey = "";
let curClubKey = "";
let curClubDisplayJa = "";

// ヘッダー列index（クラブごと/シート全体で共通でもOKだが安全に更新できるように）
let hix: HeaderIndex = buildHeaderIndex(rows.find(isHeaderRow) ?? []);

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
})();

function setClubFromMarker(marker: string) {
  // "### Premier League / アーセナル"
  // "### 2024-25 / Premier League / アーセナル"
  const s = marker.replace(/^###\s*/, "").trim();
  const parts = s
    .split(" / ")
    .map((x) => x.trim())
    .filter(Boolean);

  let season = "";
  let league = "";
  let club = s;

  if (parts.length >= 3 && /^\d{4}-\d{2}$/.test(parts[0])) {
    season = parts[0];
    league = parts[1] ?? "";
    club = parts.slice(2).join(" / ").trim();
  } else if (parts.length >= 2) {
    league = parts[0] ?? "";
    club = parts.slice(1).join(" / ").trim();
  }

  if (season) curSeason = season;
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
  const getFirst = (col: number) => {
    if (col < 0) return "";
    for (const r of block) {
      const v = r?.[col];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };

  const shirtNo = toShirtNo(getFirst(0));

  const nameA = cleanPlayerName(normCell(getFirst(hix.name1)));
  const nameB = cleanPlayerName(normCell(getFirst(hix.name2)));
  const name_en = nameB || nameA;

  const birth_date = parseBirthDate(getFirst(hix.birth));

  // nationality: 複数国籍が別行に来ることがあるので、ブロック全行から拾ってユニーク結合
  const nats: string[] = [];
  for (const r of block) {
    const v = normCell(r?.[hix.nat]);
    if (v && !nats.includes(v)) nats.push(v);
  }
  const nationality = nats.join(" / ");

  const height_cm = parseHeightCm(getFirst(hix.height));

  // foot / prev_club は「現状使ってないので空でもOK」方針ならここを "" にしてOK
  // ただ、ズレ検知のために正しく拾っておく（不要なら後で空にできます）
  const foot = normCell(getFirst(hix.foot));
  const join_date = toYMD(getFirst(hix.join));
  const prev_club = normCell(getFirst(hix.prev));
  const contract_until = toYMD(getFirst(hix.contract));

  // position: 典型は「補助行のどこかに 'ゴールキーパー' 等が入る」
  // position: ブロック内のどこに来ても拾う（細区分も mapPosLabelToPrimary が吸収）
  let posPrimary = "";
  outer: for (const r of block) {
    for (let k = 0; k < (r?.length ?? 0); k++) {
      const v = normCell(r?.[k]);
      if (!v) continue;
      const p = mapPosLabelToPrimary(v);
      if (p) {
        posPrimary = p;
        break outer;
      }
    }
  }

  const snap = seasonToSnapshotDate(curSeason) || toYMD(new Date());

  return {
    season: curSeason,
    league: curLeague,
    club: curClubDisplayJa || curClub,
    club_key: curClubKey,
    league_key: curLeagueKey,
    club_shirt_no: shirtNo,
    position_primary: posPrimary,
    name_en,
    birth_date,
    height_cm,
    snapshot_date: snap,
    name_ja: name_en, // 未整備なら仮で name_en
    nationality,
    foot,
    join_date,
    prev_club,
    contract_until,
    source: SOURCE,
    notes: "",
  };
}

// header
const out: string[] = [];
out.push(
  [
    "season",
    "window",
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

// main scan
for (let i = 0; i < rows.length; i++) {
  const r = rows[i] ?? [];

  if (isMarkerRow(r)) {
    setClubFromMarker(String(r[0]));
    continue;
  }

  if (isHeaderRow(r)) {
    // ✅ ヘッダー行から列indexを更新（過去シーズンでレイアウトが違っても追随）
    hix = buildHeaderIndex(r);
    continue;
  }

  if (!isPlayerStartRow(r)) continue;

  // collect block
  const block: any[][] = [r];
  let j = i + 1;
  while (j < rows.length) {
    const rr = rows[j] ?? [];
    if (isMarkerRow(rr) || isHeaderRow(rr) || isPlayerStartRow(rr)) break;
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

  if (!rec.club_key || !rec.league_key) {
    console.error("⚠️ missing club_key/league_key:", curLeague, "/", curClub);
  }

  out.push(
    [
      csvEscape(rec.season),
      csvEscape(WINDOW_DEFAULT),
      csvEscape(rec.league),
      csvEscape(rec.club),
      csvEscape(rec.club_key),
      csvEscape(rec.club_shirt_no),
      csvEscape(rec.position_primary),
      "", // is_star（手入力運用）
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

// ✅ Excel文字化け対策：UTF-8 BOM + CRLF
const csvText = out.join("\n").replace(/\n/g, "\r\n");
fs.writeFileSync(OUTPUT, "\uFEFF" + csvText, "utf-8");

console.log("✅ wrote:", OUTPUT, "rows=", out.length - 1);

if (missingClubs.size) {
  console.log("⚠️ missing clubs in club_master:");
  for (const s of Array.from(missingClubs)) console.log(" -", s);
}
