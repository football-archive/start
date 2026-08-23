import {
  loadCtSeasonMeta,
  findCtSeasonMeta,
  isCtSeasonMetaUcl,
} from "./ctSeasonMeta";

import { hasUclLeaguePhaseClub } from "./ucl";

import { loadClubSquads } from "./clubSquads";
import { toYMD } from "./rosterFormat";

function hasPublishedUefaStats(args: {
  season: string;
  leagueKey: string;
  clubKey: string;
}): boolean {
  const season = String(args.season ?? "").trim();
  const leagueKey = String(args.leagueKey ?? "").trim();
  const clubKey = String(args.clubKey ?? "").trim();

  if (!season || !leagueKey || !clubKey) return false;

  const rows = loadClubSquads().filter(
    (r) =>
      String(r.season ?? "").trim() === season &&
      String(r.league_key ?? "").trim() === leagueKey &&
      String(r.club_key ?? "").trim() === clubKey,
  );

  if (!rows.length) return false;

  // CLページ本体と同じく、そのseasonの最新snapshotを判定対象にする
  let latestSnapshot = "";

  for (const r of rows) {
    const snap = toYMD(String(r.snapshot_date ?? ""));

    if (snap && snap > latestSnapshot) {
      latestSnapshot = snap;
    }
  }

  if (!latestSnapshot) return false;

  const latestRows = rows.filter(
    (r) => toYMD(String(r.snapshot_date ?? "")) === latestSnapshot,
  );

  // "0" も入力済みとみなす。
  // 少なくとも誰か1人に出場数が入力されていれば公開可能。
  return latestRows.some((r) => String(r.uefa_apps ?? "").trim() !== "");
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

  return hasPublishedUefaStats({
    season,
    leagueKey,
    clubKey,
  });

  return hasUclLeaguePhaseClub(season, clubKey);
}
