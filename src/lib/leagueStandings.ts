import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export type LeagueStandingRow = {
  league_key: string;
  season: string;
  rank: number;
  club_key: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  status_code: string;
  status_note: string;
  updated_at: string;
};

let cache: LeagueStandingRow[] | null = null;

const toNum = (v: any) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function loadLeagueStandings(): LeagueStandingRow[] {
  if (cache) return cache;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "league_standings.csv",
  );
  const text = fs.readFileSync(filePath, "utf-8");
  const rows = parseCsv(text);

  cache = rows.map((r: any) => ({
    league_key: String(r.league_key ?? "").trim(),
    season: String(r.season ?? "").trim(),
    rank: toNum(r.rank),
    club_key: String(r.club_key ?? "").trim(),
    played: toNum(r.played),
    win: toNum(r.win),
    draw: toNum(r.draw),
    loss: toNum(r.loss),
    gf: toNum(r.gf),
    ga: toNum(r.ga),
    gd: toNum(r.gd),
    points: toNum(r.points),
    status_code: String(r.status_code ?? "").trim(),
    status_note: String(r.status_note ?? "").trim(),
    updated_at: String(r.updated_at ?? "").trim(),
  }));

  return cache;
}
