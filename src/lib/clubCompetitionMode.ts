import { loadClubSquads } from "./clubSquads";
import { hasEuropeanLeaguePhaseClub } from "./europeanLeaguePhase";

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export type EuropeanCompetition = "UCL" | "UEL" | "ECL";

type ClubModeArgs = {
  season: string;
  leagueKey: string;
  clubKey: string;
};

type EuropeanModeArgs = ClubModeArgs & {
  competition: EuropeanCompetition;
};

const EUROPEAN_COMPETITIONS: EuropeanCompetition[] = ["UCL", "UEL", "ECL"];

const LEAGUE_PHASE_FILES: Record<EuropeanCompetition, string> = {
  UCL: "ucl_league_phase.csv",
  UEL: "uel_league_phase.csv",
  ECL: "ecl_league_phase.csv",
};

// ビルド中のCSV読込結果を保持
let scheduleCache: any[] | null = null;

const leaguePhaseCache = new Map<EuropeanCompetition, any[]>();

function loadScheduleRows(): any[] {
  if (scheduleCache !== null) return scheduleCache;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "competition_schedule_and_results.csv",
  );

  if (!fs.existsSync(filePath)) {
    scheduleCache = [];
    return scheduleCache;
  }

  scheduleCache = parseCsv(fs.readFileSync(filePath, "utf-8"));

  return scheduleCache;
}

function loadLeaguePhaseRows(competition: EuropeanCompetition): any[] {
  // UCLは既存の正式ローダーを判定に利用するため、
  // ここではUEL/ECLのCSVを読み込む。
  const cached = leaguePhaseCache.get(competition);
  if (cached) return cached;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    LEAGUE_PHASE_FILES[competition],
  );

  if (!fs.existsSync(filePath)) {
    leaguePhaseCache.set(competition, []);
    return [];
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));

  leaguePhaseCache.set(competition, rows);
  return rows;
}

function hasClubSquad(args: ClubModeArgs): boolean {
  return loadClubSquads().some(
    (r) =>
      String(r.season ?? "").trim() === args.season &&
      String(r.league_key ?? "").trim() === args.leagueKey &&
      String(r.club_key ?? "").trim() === args.clubKey,
  );
}

function hasLeaguePhaseClub(
  competition: EuropeanCompetition,
  season: string,
  clubKey: string,
): boolean {
  return hasEuropeanLeaguePhaseClub(competition, season, clubKey);
}

function hasCompetitionSchedule(
  competition: EuropeanCompetition,
  season: string,
  clubKey: string,
): boolean {
  return loadScheduleRows().some(
    (r) =>
      String(r.competition ?? "")
        .trim()
        .toUpperCase() === competition &&
      String(r.edition ?? "").trim() === season &&
      (String(r.home_key ?? "").trim() === clubKey ||
        String(r.away_key ?? "").trim() === clubKey),
  );
}

// 指定大会のクラブモードが有効か判定
export function hasClubEuropeanMode(args: EuropeanModeArgs): boolean {
  const competition = args.competition;
  const season = String(args.season ?? "").trim();
  const leagueKey = String(args.leagueKey ?? "").trim();
  const clubKey = String(args.clubKey ?? "").trim();

  if (
    !EUROPEAN_COMPETITIONS.includes(competition) ||
    !season ||
    !leagueKey ||
    !clubKey
  ) {
    return false;
  }

  const normalizedArgs = {
    season,
    leagueKey,
    clubKey,
  };

  // ① 国内クラブ選手データが存在
  if (!hasClubSquad(normalizedArgs)) {
    return false;
  }

  // ② 当該大会のリーグフェーズに参加
  if (!hasLeaguePhaseClub(competition, season, clubKey)) {
    return false;
  }

  // ③ 当該大会の試合日程が1件以上存在
  return hasCompetitionSchedule(competition, season, clubKey);
}

// 利用可能な欧州大会モードを列挙
export function getClubEuropeanModes(
  args: ClubModeArgs,
): EuropeanCompetition[] {
  return EUROPEAN_COMPETITIONS.filter((competition) =>
    hasClubEuropeanMode({
      ...args,
      competition,
    }),
  );
}

// 既存UCLコードとの互換性を維持
export function hasClubUclMode(args: ClubModeArgs): boolean {
  return hasClubEuropeanMode({
    ...args,
    competition: "UCL",
  });
}
