// src/lib/transfers.ts
import fs from "node:fs";
import path from "node:path";

import { loadClubMaster } from "./clubMaster";
import { clubUrl } from "./urls";

export type TransferWindow = "winter" | "summer" | string;

export type MoveType =
  | "transfer"
  | "loan"
  | "free"
  | "retired"
  | "release"
  | "return_loan"
  | string;

export type Importance = "A" | "B" | "C" | string;

export type TransferEvent = {
  season: string;
  window: TransferWindow;

  /** 元CSVの date（そのまま保持） */
  date_raw: string;

  /** 正規化したISO日付（YYYY-MM-DD）。パース不能なら空文字 */
  date_iso: string;

  /** 表示名（正規化済み：trim・NBSP除去・連続空白圧縮） */
  player_name: string;

  /** キー優先。club_masterに無ければその文字列を表示に使う想定 */
  from_club_key: string;
  to_club_key: string;

  move_type: MoveType;

  /** 表示用メモ（赤字表示想定） */
  note: string;

  /** A/B/Cなど */
  importance: Importance;

  /** 参照解決結果（club_masterにあればこちらが埋まる） */
  from_club_display_ja: string;
  from_club_display_en: string;
  to_club_display_ja: string;
  to_club_display_en: string;

  /** club_masterに存在する場合のみリンクを作る（存在しなければ空） */
  from_club_href: string;
  to_club_href: string;
};

type LoadTransfersArgs = {
  season?: string; // e.g. "2025-26"
  window?: string; // "winter" | "summer"
  /** "ja" or "en" を渡すと display_* のどちらを優先表示するかを決めやすい */
  preferLocale?: "ja" | "en";
};

function parseCSVLine(line: string): string[] {
  // 既存libと同じ：軽量CSVパーサ（カンマ＋ダブルクォート対応）
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function readCSV(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCSVLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = (cols[i] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Normalize spaces:
 * - trim
 * - NBSP等を通常スペースへ
 * - 連続空白を1つへ
 */
function normalizeText(v: string): string {
  const s = String(v ?? "");
  return s
    .replace(/[\u00A0\u2007\u202F]/g, " ") // NBSP系
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize date:
 * Accepts:
 * - YYYY-MM-DD
 * - YYYY/M/D
 * - YYYY/MM/DD
 * - YYYY.M.D (念のため)
 * Returns ISO (YYYY-MM-DD) or "" if invalid/empty.
 */
function normalizeDateToISO(v: string): string {
  const s = normalizeText(v);
  if (!s) return "";

  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (!m1) return "";

  const y = Number(m1[1]);
  const mo = Number(m1[2]);
  const d = Number(m1[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return "";

  if (mo < 1 || mo > 12) return "";
  if (d < 1 || d > 31) return "";

  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function buildClubIndex() {
  const clubs = loadClubMaster();
  const byKey = new Map<string, (typeof clubs)[number]>();
  for (const c of clubs) {
    const k = String(c.club_key ?? "").trim();
    if (!k) continue;
    byKey.set(k, c);
  }
  return byKey;
}

function resolveClubDisplay(
  clubKeyOrRaw: string,
  byKey: Map<string, any>,
): { ja: string; en: string; href: string } {
  const raw = normalizeText(clubKeyOrRaw);
  if (!raw) return { ja: "", en: "", href: "" };

  const hit = byKey.get(raw);
  if (!hit) {
    // masterに無い → 値そのまま表示、リンクなし
    return { ja: raw, en: raw, href: "" };
  }

  const ja = normalizeText(hit.club_display_ja) || raw;
  const en = normalizeText(hit.club_display_en) || raw;

  const leagueKey = normalizeText(hit.league_key);
  const clubKey = normalizeText(hit.club_key);
  const href = leagueKey && clubKey ? clubUrl({ leagueKey, clubKey }) : "";

  return { ja, en, href };
}

/**
 * Load transfers.csv (event table).
 * - normalizes player_name (trim/NBSP/space-collapse)
 * - normalizes date to ISO (YYYY-MM-DD)
 * - resolves club display/href via club_master if possible
 */
export function loadTransfers(args: LoadTransfersArgs = {}): TransferEvent[] {
  const csvPath = path.join(process.cwd(), "src", "data", "transfers.csv");
  if (!fs.existsSync(csvPath)) return [];

  const rows = readCSV(csvPath);
  const clubIndex = buildClubIndex();

  const seasonFilter = normalizeText(args.season ?? "");
  const windowFilter = normalizeText(args.window ?? "").toLowerCase();

  const out: TransferEvent[] = [];

  for (const r of rows) {
    const season = normalizeText(r.season ?? "");
    const window = normalizeText(r.window ?? "");
    const date_raw = normalizeText(r.date ?? "");
    const date_iso = normalizeDateToISO(date_raw);

    const player_name = normalizeText(r.player_name ?? "");
    const from_club_key = normalizeText(r.from_club_key ?? "");
    const to_club_key = normalizeText(r.to_club_key ?? "");

    const move_type = normalizeText(r.move_type ?? "");
    const note = normalizeText(r.note ?? "");
    const importance = normalizeText(r.importance ?? "");

    // フィルタ
    if (seasonFilter && season !== seasonFilter) continue;
    if (windowFilter && window.toLowerCase() !== windowFilter) continue;

    // 最低限：名前が無い行は落とす（事故防止）
    if (!player_name) continue;

    const fromRes = resolveClubDisplay(from_club_key, clubIndex);
    const toRes = resolveClubDisplay(to_club_key, clubIndex);

    out.push({
      season,
      window,

      date_raw,
      date_iso,

      player_name,
      from_club_key,
      to_club_key,

      move_type: (move_type || "transfer") as any,
      note,
      importance: (importance || "C") as any,

      from_club_display_ja: fromRes.ja,
      from_club_display_en: fromRes.en,
      to_club_display_ja: toRes.ja,
      to_club_display_en: toRes.en,

      from_club_href: fromRes.href,
      to_club_href: toRes.href,
    });
  }

  // ざっくりおすすめのデフォルト並び：
  // importance(A→B→C) → date_iso desc → player_name
  const impRank = (v: string): number => {
    const s = String(v ?? "")
      .trim()
      .toUpperCase();
    if (s === "A") return 0;
    if (s === "B") return 1;
    if (s === "C") return 2;
    return 9;
  };

  return [...out].sort((a, b) => {
    const ir = impRank(a.importance) - impRank(b.importance);
    if (ir !== 0) return ir;

    // date desc（空は最後）
    const da = a.date_iso || "0000-00-00";
    const db = b.date_iso || "0000-00-00";
    if (da !== db) return db.localeCompare(da);

    return a.player_name.localeCompare(b.player_name, "en");
  });
}

/**
 * Helper: pick display name by locale preference (ja/en).
 * UI側で使うと便利。
 */
export function clubDisplay(
  e: Pick<
    TransferEvent,
    | "from_club_display_ja"
    | "from_club_display_en"
    | "to_club_display_ja"
    | "to_club_display_en"
  >,
  which: "from" | "to",
  prefer: "ja" | "en" = "ja",
): string {
  if (which === "from") {
    return prefer === "en" ? e.from_club_display_en : e.from_club_display_ja;
  }
  return prefer === "en" ? e.to_club_display_en : e.to_club_display_ja;
}
