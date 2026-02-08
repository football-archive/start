// src/lib/urls.ts
// World Football Archive - URL helper (single source of truth)

export type Season = `${number}${number}${number}${number}-${number}${number}`; // e.g. "2025-26"
export type Year = `${number}${number}${number}${number}`; // e.g. "2026"

export type TournamentKey =
  | "wc"
  | "euro"
  | "asian-cup"
  | "ucl"
  | "uel"
  | "uecl"
  // 将来増える前提で自由に追加OK
  | (string & {});

export type ClubUrlArgs = {
  leagueKey: string; // e.g. "PremierLeague"
  clubKey: string; // e.g. "arsenal"
  season?: Season; // optional, default "latest"
};

export type ClubsListUrlArgs = {
  leagueKey?: string;
  season?: Season;
};

export type TeamUrlArgs = {
  tournament: TournamentKey; // "wc" | "euro" | ...
  year: Year; // "2026"
  country: string; // route param (JP name etc). will be encoded
};

export type TournamentTopUrlArgs = {
  tournament: TournamentKey;
  year: Year;
};

export type AwardUrlArgs = {
  awardKey: string; // e.g. "ballon-dor"
  year?: Year;
};

export type PlayerUrlArgs = {
  playerId: string; // e.g. "bukayo-saka-2001-09-05"
};

function enc(v: string): string {
  return encodeURIComponent(v);
}

/**
 * Build query string from key-values (skips undefined / empty string).
 */
function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${enc(k)}=${enc(v!)}`);
  return entries.length ? `?${entries.join("&")}` : "";
}

/**
 * Join paths cleanly (avoid double slashes)
 */
function join(...parts: string[]): string {
  const cleaned = parts.filter(Boolean).map((p) => p.replace(/^\/+|\/+$/g, ""));
  return "/" + cleaned.join("/");
}

/* ---------------------------
 * Clubs
 * ------------------------- */

/** Clubs list (latest default). */
export function clubsListUrl(args: ClubsListUrlArgs = {}): string {
  const base = "/clubs";
  return base + qs({ league: args.leagueKey, season: args.season });
}

/** Club detail (latest default). Season uses query param to avoid breaking canonical URL. */
export function clubUrl({ leagueKey, clubKey, season }: ClubUrlArgs): string {
  const base = join("clubs", leagueKey, clubKey);
  // season omitted = latest (canonical)
  return base + qs({ season });
}

/** Canonical URL for a club page (always latest, no season query). */
export function clubCanonicalUrl(leagueKey: string, clubKey: string): string {
  return join("clubs", leagueKey, clubKey);
}

/* ---------------------------
 * National teams (tournament)
 * ------------------------- */

/** Tournament top page (e.g. /wc/2026, /euro/2024) */
export function tournamentTopUrl({
  tournament,
  year,
}: TournamentTopUrlArgs): string {
  return join(tournament, year);
}

/** Team page under a tournament (e.g. /wc/2026/team/日本) */
export function teamUrl({ tournament, year, country }: TeamUrlArgs): string {
  // IMPORTANT: country can be JP name; encode in route param.
  return join(tournament, year, "team", enc(country));
}

/** Team list page (if you have one): /wc/2026/teams など */
export function teamsListUrl(tournament: TournamentKey, year: Year): string {
  return join(tournament, year, "teams");
}

/* ---------------------------
 * Competitions like UCL/UEL (future)
 * ------------------------- */

/** Competition season top: /ucl/2025-26 */
export function competitionSeasonUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return join(tournament, season);
}

/** Competition clubs list: /ucl/2025-26/clubs */
export function competitionClubsUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return join(tournament, season, "clubs");
}

/** Competition players list: /ucl/2025-26/players */
export function competitionPlayersUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return join(tournament, season, "players");
}

/* ---------------------------
 * Awards (future)
 * ------------------------- */

export function awardsTopUrl(): string {
  return "/awards";
}

export function awardUrl({ awardKey, year }: AwardUrlArgs): string {
  return year ? join("awards", awardKey, year) : join("awards", awardKey);
}

/* ---------------------------
 * Players (future)
 * ------------------------- */

export function playersTopUrl(): string {
  return "/players";
}

export function playerUrl({ playerId }: PlayerUrlArgs): string {
  return join("players", playerId);
}

/* ---------------------------
 * Utilities: constants (optional)
 * ------------------------- */

/**
 * If you want a single place to store "current" defaults (avoid hardcoding all over),
 * keep them here and import where needed.
 */
export const DEFAULTS = {
  currentClubSeason: "2025-26" as Season,
  currentWcYear: "2026" as Year,
  currentWcTournament: "wc" as TournamentKey,
};
