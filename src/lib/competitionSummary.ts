import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export function loadCompetitionSummary() {
  const file = path.join(process.cwd(), "src/data/competition_summary.csv");
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf-8"));
}

export function getCompetitionSummary(competition: string, edition: string) {
  return loadCompetitionSummary().find(
    (r: any) =>
      String(r.competition).toUpperCase() === competition.toUpperCase() &&
      String(r.edition) === String(edition),
  );
}
