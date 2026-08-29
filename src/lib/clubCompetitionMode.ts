import { loadClubSquads } from "./clubSquads";
import { hasUclLeaguePhaseClub } from "./ucl";

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

// ビルド中のCL試合日程読込結果を保持
let uclScheduleCache: any[] | null = null;

function loadUclScheduleRows(): any[] {
  if (uclScheduleCache !== null) {
    return uclScheduleCache;
  }

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "competition_schedule_and_results.csv",
  );

  if (!fs.existsSync(filePath)) {
    uclScheduleCache = [];
    return uclScheduleCache;
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));

  // hasUclSchedule() が必要とするUCL行だけ保持
  uclScheduleCache = rows.filter(
    (r: any) =>
      String(r.competition ?? "")
        .trim()
        .toUpperCase() === "UCL",
  );

  return uclScheduleCache;
}

function hasUclSchedule(args: { season: string; clubKey: string }): boolean {
  const season = String(args.season ?? "").trim();
  const clubKey = String(args.clubKey ?? "").trim();

  if (!season || !clubKey) return false;

  const rows = loadUclScheduleRows();

  return rows.some(
    (r: any) =>
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

  // 国内クラブページが存在すること
  const squadRows = loadClubSquads();

  const hasClubSquad = squadRows.some(
    (r: any) =>
      String(r.season ?? "").trim() === season &&
      String(r.league_key ?? "").trim() === leagueKey &&
      String(r.club_key ?? "").trim() === clubKey,
  );

  if (!hasClubSquad) {
    return false;
  }

  // UCLリーグフェーズ参加クラブ
  if (!hasUclLeaguePhaseClub(season, clubKey)) {
    return false;
  }

  // UCL日程が存在
  return hasUclSchedule({
    season,
    clubKey,
  });
}
