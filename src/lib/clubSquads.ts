// src/lib/clubSquads.ts
import fs from "node:fs";
import path from "node:path";

export type ClubWindow = "summer" | "winter";

export type ClubSquadRow = {
  season: string;
  window: ClubWindow;

  // 表示名（既存互換）
  league: string;
  club: string;

  // ✅ 固定キー（これが正）
  league_key: string;
  club_key: string;

  club_shirt_no: string;
  position_primary: string;
  is_star?: string;
  name_en: string;
  birth_date: string;
  height_cm: number | null;
  snapshot_date: string;

  name_ja: string;
  nationality: string;
  foot: string;
  join_date: string;
  prev_club: string;
  contract_until: string;

  source: string;
  notes: string;
};

function parseCSVLine(line: string): string[] {
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

function numOrNull(s: string): number | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function normalizeWindow(v: any): ClubWindow {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "winter") return "winter";
  // それ以外（summer/空/ゴミ）は summer 扱いにして落とさない
  return "summer";
}

export function loadClubSquads(): ClubSquadRow[] {
  const csvPath = path.join(
    process.cwd(),
    "src",
    "data",
    "club_squads_site.csv",
  );
  const rows = readCSV(csvPath);

  const out: ClubSquadRow[] = [];

  for (const r of rows) {
    const league_key = (r.league_key ?? "").trim();
    const club_key = (r.club_key ?? "").trim();

    // ✅ keyが無い行は落とす（データ正規化を強制）
    if (!league_key || !club_key) continue;

    out.push({
      season: (r.season ?? "").trim(),
      window: normalizeWindow(r.window),

      league: r.league ?? "",
      club: r.club ?? "",

      league_key,
      club_key,

      club_shirt_no: r.club_shirt_no ?? "",
      position_primary: r.position_primary ?? "",
      is_star: r.is_star ?? "",
      name_en: r.name_en ?? "",
      birth_date: r.birth_date ?? "",
      height_cm: numOrNull(r.height_cm ?? ""),
      snapshot_date: r.snapshot_date ?? "",

      name_ja: r.name_ja ?? "",
      nationality: r.nationality ?? "",
      foot: r.foot ?? "",
      join_date: r.join_date ?? "",
      prev_club: r.prev_club ?? "",
      contract_until: r.contract_until ?? "",

      source: r.source ?? "",
      notes: r.notes ?? "",
    });
  }

  return out;
}

// 追加：クラブ表示用の並び順
export function sortClubRoster(rows?: ClubSquadRow[] | null): ClubSquadRow[] {
  // ✅ 防御：undefined / null / 配列でない場合でも落とさない
  if (!Array.isArray(rows)) return [];

  const posRank = (p?: string): number => {
    const s = String(p ?? "")
      .trim()
      .toUpperCase();
    if (s === "GK") return 0;
    if (s === "DF") return 1;
    if (s === "MF") return 2;
    if (s === "FW") return 3;
    return 9; // 不明/その他は最後
  };

  const shirtNo = (v?: string): number => {
    const s = String(v ?? "").trim();
    if (!s) return Number.POSITIVE_INFINITY; // 背番号なしは最後
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };

  const nameKey = (r: ClubSquadRow): string => {
    const ja = String(r.name_ja ?? "").trim();
    const en = String(r.name_en ?? "").trim();
    return ja || en || "";
  };

  return [...rows].sort((a, b) => {
    // 1) ポジション（GK→DF→MF→FW→その他）
    const pr = posRank(a.position_primary) - posRank(b.position_primary);
    if (pr !== 0) return pr;

    // 2) 背番号（昇順、未取得は最後）
    const nr = shirtNo(a.club_shirt_no) - shirtNo(b.club_shirt_no);
    if (nr !== 0) return nr;

    // 3) 同一条件の安定化（名前）
    return nameKey(a).localeCompare(nameKey(b), "ja");
  });
}
