// src/lib/strongTeams.ts
export const STRONG_TEAMS = [
  "brazil",
  "germany",
  "argentina",
  "france",
  "spain",
  "england",
  "italy",
  "netherlands",
  "portugal",
] as const;

export type StrongTeamSlug = (typeof STRONG_TEAMS)[number];
