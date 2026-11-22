// src/lib/europeanLeaguePhase.ts
// Shared league-phase loader for UCL / UEL / ECL

import fs from "node:fs";
import path from "node:path";
import type { Season } from "./urls";

export type EuropeanCompetition = "UCL" | "UEL" | "ECL";

export type EuropeanLeaguePhaseRow = {
  competition: EuropeanCompetition;
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

    for (let i = 0; i < header.length; i++) {
      row[header[i]] = (cols[i] ?? "").trim();
    }

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

// ビルド中の読込結果を保持
let europeanLeaguePhaseCache: EuropeanLeaguePhaseRow[] | null = null;

export function loadEuropeanLeaguePhaseAll(): EuropeanLeaguePhaseRow[] {
  if (europeanLeaguePhaseCache !== null) {
    return europeanLeaguePhaseCache;
  }

  const csvPath = path.join(
    process.cwd(),
    "src",
    "data",
    "european_league_phase.csv",
  );

  const rows = readCSV(csvPath) as any[];

  europeanLeaguePhaseCache = rows
    .map((r) => {
      const competition = String(r.competition ?? "").trim().toUpperCase();
      const season = (r.season ?? "").trim();
      const rank = toOptionalNum(r.rank);

      if (!season || !["UCL", "UEL", "ECL"].includes(competition)) return null;

      return {
        competition: competition as EuropeanCompetition,
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
      } as EuropeanLeaguePhaseRow;
    })
    .filter(Boolean) as EuropeanLeaguePhaseRow[];

  return europeanLeaguePhaseCache;
}

export function getEuropeanSeasons(competition: EuropeanCompetition): string[] {
  const rows = loadEuropeanLeaguePhaseAll().filter((r) => r.competition === competition);
  const set = new Set(rows.map((r) => String(r.season)));
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function loadEuropeanLeaguePhaseBySeason(
  competition: EuropeanCompetition,
  season: string,
): EuropeanLeaguePhaseRow[] {
  const rows = loadEuropeanLeaguePhaseAll().filter(
    (r) => r.competition === competition && String(r.season) === String(season),
  );

  // stable sort
  rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return rows;
}

export function hasEuropeanLeaguePhaseClub(
  competition: EuropeanCompetition,
  season: string,
  clubKey: string,
): boolean {
  const targetSeason = String(season ?? "").trim();
  const targetClubKey = String(clubKey ?? "").trim();

  if (!targetSeason || !targetClubKey) return false;

  return loadEuropeanLeaguePhaseAll().some(
    (r) =>
      r.competition === competition &&
      String(r.season ?? "").trim() === targetSeason &&
      String(r.club_key ?? "").trim() === targetClubKey,
  );
}
