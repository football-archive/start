// src/lib/competitionSchedule.ts
import csvText from "../data/competition_schedule_and_results.csv?raw";
import { parseCsv } from "./csvSimple";

export type MatchRow = {
  matchId: string;
  competition: string;
  edition: string;
  md: string;
  stage: string;
  group: string;
  sec: string;
  datetimeLocal: string;
  home: string;
  away: string;
  stadium: string;
  homeScore: string; // 空あり
  awayScore: string; // 空あり
  homeScorePk: string; // 空あり
  awayScorePk: string; // 空あり
  note: string; // 空あり
  updatedAt: string; // "2026/2/11" など
};

const norm = (v: any) => String(v ?? "").trim();

export function loadCompetitionSchedule(): MatchRow[] {
  const rows = parseCsv(csvText);

  return rows.map((r) => ({
    matchId: norm(r["match-id"]),
    competition: norm(r["competition"]),
    edition: norm(r["edition"]),
    md: norm(r["md"]),
    stage: norm(r["stage"]),
    group: norm(r["group"]),
    sec: norm(r["sec"]),
    datetimeLocal: norm(r["datetime-local"]),
    home: norm(r["home"]),
    away: norm(r["away"]),
    stadium: norm(r["stadium"]),
    homeScore: norm(r["home_score"]),
    awayScore: norm(r["away_score"]),
    homeScorePk: norm(r["home_score_pk"]),
    awayScorePk: norm(r["away_score_pk"]),
    note: norm(r["note"]),
    updatedAt: norm(r["updated_at"]),
  }));
}

export function filterMatches(rows: MatchRow[], comp: string, edition: string) {
  return rows.filter(
    (r) =>
      norm(r.competition).toUpperCase() === norm(comp).toUpperCase() &&
      norm(r.edition) === norm(edition),
  );
}

export function mdNum(md: string): number {
  const m = norm(md).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function formatScore(r: MatchRow): string {
  const hs = norm(r.homeScore);
  const as = norm(r.awayScore);
  const hasScore = hs !== "" && as !== "";

  if (!hasScore) return "—";

  const base = `${hs}-${as}`;

  const hpk = norm(r.homeScorePk);
  const apk = norm(r.awayScorePk);
  if (hpk !== "" && apk !== "") {
    return `${base} (PK ${hpk}-${apk})`;
  }
  return base;
}

export function isPlayed(r: MatchRow): boolean {
  return norm(r.homeScore) !== "" && norm(r.awayScore) !== "";
}
