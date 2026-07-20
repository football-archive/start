// src/lib/competitionAwards.ts
import { readFileSync } from "node:fs";
import { parseCsv } from "./csvSimple";

export type CompetitionAwardRow = {
  competition: string;
  edition: string;
  award_key: string;
  award_name: string;
  sort: number;
  player: string;
  team: string;
  note: string;
};

const norm = (v: unknown) => String(v ?? "").trim();

export function loadCompetitionAwards(): AwardRow[] {
  const csv = readFileSync("src/data/competition_awards.csv", "utf-8");
  const rows = parseCsv(csv) as any[];
  return rows.map((r) => ({
    competition: norm(r.competition),
    edition: norm(r.edition),
    award_key: norm(r.award_key),
    award_name: norm(r.award_name),
    rank: norm(r.rank),
    player: norm(r.player),
    team: norm(r.team),
    note: norm(r.note),
  }));
}

export function getAwards(
  competition: string,
  edition: string,
): CompetitionAwardRow[] {
  return loadCompetitionAwards()
    .filter(
      (r) =>
        String(r.competition ?? "").trim() === String(competition).trim() &&
        String(r.edition ?? "").trim() === String(edition).trim(),
    )
    .map((r, sourceIndex) => ({
      competition: String(r.competition ?? "").trim(),
      edition: String(r.edition ?? "").trim(),
      award_key: String(r.award_key ?? "").trim(),
      award_name: String(r.award_name ?? "").trim(),
      sort: Number(String(r.sort ?? "").trim()) || 9999,
      player: String(r.player ?? "").trim(),
      team: String(r.team ?? "").trim(),
      note: String(r.note ?? "").trim(),
      sourceIndex,
    }))
    .filter((r) => r.award_name && r.player)
    .sort((a, b) => a.sort - b.sort || a.sourceIndex - b.sourceIndex);
}
