import {
  loadCtSeasonMeta,
  findCtSeasonMeta,
  isCtSeasonMetaUcl,
} from "./ctSeasonMeta";

import { hasUclLeaguePhaseClub } from "./ucl";

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

function hasUclSchedule(args: { season: string; clubKey: string }): boolean {
  const season = String(args.season ?? "").trim();
  const clubKey = String(args.clubKey ?? "").trim();

  if (!season || !clubKey) return false;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "competition_schedule_and_results.csv",
  );

  if (!fs.existsSync(filePath)) return false;

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));

  return rows.some(
    (r: any) =>
      String(r.competition ?? "")
        .trim()
        .toUpperCase() === "UCL" &&
      String(r.edition ?? "").trim() === season &&
      (String(r.home_key ?? "").trim() === clubKey ||
        String(r.away_key ?? "").trim() === clubKey),
  );
}

export function hasClubUclMode(args: {
  season: string;
  leagueKey: string;
  clubKey: string;
}): boolean {
  const season = String(args.season ?? "").trim();
  const leagueKey = String(args.leagueKey ?? "").trim();
  const clubKey = String(args.clubKey ?? "").trim();

  if (!season || !leagueKey || !clubKey) return false;

  const metaAll = loadCtSeasonMeta();

  const meta = findCtSeasonMeta(metaAll, {
    season,
    league_key: leagueKey,
    club_key: clubKey,
  });

  if (!isCtSeasonMetaUcl(meta)) {
    return false;
  }

  if (!hasUclLeaguePhaseClub(season, clubKey)) {
    return false;
  }

  return hasUclSchedule({
    season,
    clubKey,
  });
}
