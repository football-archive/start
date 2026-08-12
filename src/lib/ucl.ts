// src/lib/ucl.ts
// UEFA Champions League (UCL) helpers / loaders

import fs from "node:fs";
import path from "node:path";
import type { Season } from "./urls";

export type UclLeaguePhaseRow = {
  season: Season | string;
  club_key: string;
  rank: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  qualified: "R16" | "PO" | "OUT" | string;
  updated_at: string;
  club_name_raw?: string;

  pot: number | null;
  league_name_override?: string;
  league_rank_override: number | null;
};

function parseCSVLine(line: string): string[] {
  // ultra-light CSV parser (comma + double quotes)
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

function toNum(v: any, fallback = 0): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNum(v: any): number | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function loadUclLeaguePhaseAll(): UclLeaguePhaseRow[] {
  const csvPath = path.join(
    process.cwd(),
    "src",
    "data",
    "ucl_league_phase.csv",
  );
  const rows = readCSV(csvPath) as any[];

  return rows
    .map((r) => {
      const season = (r.season ?? "").trim();
      const rank = toOptionalNum(r.rank);

      if (!season) return null;

      return {
        season,
        club_key: (r.club_key ?? "").trim(),
        rank,
        played: toNum(r.played),
        won: toNum(r.won),
        draw: toNum(r.draw),
        lost: toNum(r.lost),
        gf: toNum(r.gf),
        ga: toNum(r.ga),
        gd: toNum(r.gd),
        pts: toNum(r.pts),
        qualified: (r.qualified ?? "").trim(),
        updated_at: (r.updated_at ?? "").trim(),
        club_name_raw: (r.club_name_raw ?? "").trim() || undefined,

        pot: toOptionalNum(r.pot),
        league_name_override:
          (r.league_name_override ?? "").trim() || undefined,
        league_rank_override: toOptionalNum(r.league_rank_override),
      } as UclLeaguePhaseRow;
    })
    .filter(Boolean) as UclLeaguePhaseRow[];
}

export function getUclSeasons(): string[] {
  const rows = loadUclLeaguePhaseAll();
  const set = new Set(rows.map((r) => String(r.season)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function loadUclLeaguePhaseBySeason(
  season: string,
): UclLeaguePhaseRow[] {
  const rows = loadUclLeaguePhaseAll().filter(
    (r) => String(r.season) === String(season),
  );
  // stable sort
  rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return rows;
}
