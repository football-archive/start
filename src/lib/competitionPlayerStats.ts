import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export function loadCompetitionPlayerStats() {
  const file = path.join(
    process.cwd(),
    "src/data/competition_player_stats.csv",
  );
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf-8"));
}

export function getCompetitionPlayerStats(
  competition: string,
  edition: string,
  rankType: "goals" | "assists",
) {
  return loadCompetitionPlayerStats()
    .filter(
      (r: any) =>
        String(r.competition).toUpperCase() === competition.toUpperCase() &&
        String(r.edition) === String(edition) &&
        String(r.rank_type) === rankType,
    )
    .sort((a: any, b: any) => Number(a.rank || 999) - Number(b.rank || 999));
}
