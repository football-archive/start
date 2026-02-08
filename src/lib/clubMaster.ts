// src/lib/clubMaster.ts
import fs from "node:fs";
import path from "node:path";

export type ClubMasterRow = {
  club_key: string;
  league_key: string;
  league_display: string;
  club_display_ja: string;
  club_display_en: string;
  sort_ja: string;
  aliases: string;
  status: "active" | "inactive" | string;
  notes: string;
};

function parseCSVLine(line: string): string[] {
  // 超軽量CSVパーサ（カンマ＋ダブルクォート対応）
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
    for (let i = 0; i < header.length; i++)
      row[header[i]] = (cols[i] ?? "").trim();
    rows.push(row);
  }
  return rows;
}

export function loadClubMaster(): ClubMasterRow[] {
  const csvPath = path.join(process.cwd(), "src", "data", "club_master.csv");
  const rows = readCSV(csvPath) as any[];

  return rows.map((r) => ({
    club_key: r.club_key ?? "",
    league_key: r.league_key ?? "",
    league_display: r.league_display ?? "",
    club_display_ja: r.club_display_ja ?? "",
    club_display_en: r.club_display_en ?? "",
    sort_ja: r.sort_ja ?? "",
    aliases: r.aliases ?? "",
    status: (r.status ?? "active") as any,
    notes: r.notes ?? "",
  }));
}
