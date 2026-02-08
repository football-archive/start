// src/lib/leagueMaster.ts
import fs from "node:fs";
import path from "node:path";

export type LeagueMasterRow = {
  league: string;
  league_key: string;
  league_display_ja: string;
  league_display_en: string;
  sort_rank: number;
  is_public: boolean; // ★追加
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
    for (let i = 0; i < header.length; i++)
      row[header[i]] = (cols[i] ?? "").trim();
    rows.push(row);
  }
  return rows;
}

export function loadLeagueMaster(): LeagueMasterRow[] {
  const csvPath = path.join(process.cwd(), "src", "data", "league_master.csv");
  const rows = readCSV(csvPath) as any[];

  return rows.map((r) => {
    const n = Number(String(r.sort_rank ?? "").trim());
    const sort_rank = Number.isFinite(n) ? n : 999;
    const is_public =
      String(r.is_public ?? "")
        .trim()
        .toLowerCase() === "true";

    return {
      league: r.league ?? "",
      league_key: r.league_key ?? "",
      league_display_ja: r.league_display_ja ?? "",
      league_display_en: r.league_display_en ?? "",
      sort_rank,
      is_public, // ★追加
      notes: r.notes ?? "",
    };
  });
}
