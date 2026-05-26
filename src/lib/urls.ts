// src/lib/urls.ts
// World Football Archive - URL helper (single source of truth)

export type Season = `${number}${number}${number}${number}-${number}${number}`;
export type Year = `${number}${number}${number}${number}`;

export type TournamentKey =
  | "wc"
  | "euro"
  | "asian-cup"
  | "ucl"
  | "uel"
  | "uecl"
  | (string & {});

export type ClubUrlArgs = {
  leagueKey: string;
  clubKey: string;
  season?: Season;
};

export type ClubsListUrlArgs = {
  leagueKey?: string;
  season?: Season;
};

export type TeamUrlArgs = {
  tournament: TournamentKey;
  year: Year;
  country: string;
};

export type TournamentTopUrlArgs = {
  tournament: TournamentKey;
  year: Year;
};

export type AwardUrlArgs = {
  awardKey: string;
  year?: Year;
};

export type PlayerUrlArgs = {
  playerId: string;
};

function enc(v: string): string {
  return encodeURIComponent(v);
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${enc(k)}=${enc(v!)}`);

  return entries.length ? `?${entries.join("&")}` : "";
}

function join(...parts: string[]): string {
  const cleaned = parts.filter(Boolean).map((p) => p.replace(/^\/+|\/+$/g, ""));
  return "/" + cleaned.join("/");
}

function withSlash(path: string): string {
  const [base, query = ""] = path.split("?");
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return query ? `${normalized}?${query}` : normalized;
}

/* ---------------------------
 * Clubs
 * ------------------------- */

export function clubsListUrl(args: ClubsListUrlArgs = {}): string {
  const base = args.leagueKey
    ? withSlash(join("clubs", args.leagueKey))
    : withSlash(join("clubs"));

  return base + qs({ season: args.season });
}

export function clubUrl({ leagueKey, clubKey, season }: ClubUrlArgs): string {
  return season
    ? withSlash(join("clubs", leagueKey, "club", clubKey, season))
    : withSlash(join("clubs", leagueKey, "club", clubKey));
}

export function clubCanonicalUrl(
  leagueKey: string,
  clubKey: string,
  season?: Season,
): string {
  return clubUrl({ leagueKey, clubKey, season });
}

/* ---------------------------
 * National teams / tournaments
 * ------------------------- */

export function tournamentTopUrl({
  tournament,
  year,
}: TournamentTopUrlArgs): string {
  return `/${tournament}/${year}/`;
}

export function teamUrl({ tournament, year, country }: TeamUrlArgs): string {
  return withSlash(join(tournament, year, "team", enc(country)));
}

export function teamsListUrl(tournament: TournamentKey, year: Year): string {
  return withSlash(join(tournament, year, "teams"));
}

/* ---------------------------
 * Competitions
 * ------------------------- */

export function competitionSeasonUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return withSlash(join(tournament, season));
}

export function competitionClubsUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return withSlash(join(tournament, season, "clubs"));
}

export function competitionPlayersUrl(
  tournament: TournamentKey,
  season: Season,
): string {
  return withSlash(join(tournament, season, "players"));
}

/* ---------------------------
 * Awards
 * ------------------------- */

export function awardsTopUrl(): string {
  return withSlash(join("awards"));
}

export function awardUrl({ awardKey, year }: AwardUrlArgs): string {
  return year
    ? withSlash(join("awards", awardKey, year))
    : withSlash(join("awards", awardKey));
}

/* ---------------------------
 * Players
 * ------------------------- */

export function playersTopUrl(): string {
  return withSlash(join("players"));
}

export function playerUrl({ playerId }: PlayerUrlArgs): string {
  return withSlash(join("players", playerId));
}

/* ---------------------------
 * Utilities
 * ------------------------- */

export const DEFAULTS = {
  currentClubSeason: "2025-26" as Season,
  currentWcYear: "2026" as Year,
  currentWcTournament: "wc" as TournamentKey,
};
