import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";
import { loadClubSquads, type ClubSquadRow } from "./clubSquads";
import { loadCallups } from "./callups";
import { loadClubMaster } from "./clubMaster";
import { awardUrl, clubUrl, type Season, type Year } from "./urls";

export type BallonDorEdition = {
  year: string;
  period: string;
  period_start: string;
  period_end: string;
  ceremony_date: string;
  status: string;
  update_date: string;
  notes: string;
};

export type BallonDorRanking = {
  year: string;
  rank: string;
  player_name_ja: string;
  points: string;
  notes: string;
  competition1: string;
  edition1: string;
  competition2: string;
  edition2: string;
  nationality_override: string;
  position_override: string;
  club1_override: string;
  club1_league_key: string;
  club1_season: string;
  club2_override: string;
  club2_league_key: string;
  club2_season: string;
  _csvOrder: number;
};

export type AwardClub = {
  name: string;
  href: string;
  snapshotDate: string;
};

export type AwardCompetition = {
  label: string;
  href: string;
  country: string;
};

export type BallonDorWinnerRow = {
  year: string;
  href: string;
  status: string;
  statusLabel: string;
  playerName: string;
  nationality: string;
  position: string;
  clubs: AwardClub[];
  competitions: AwardCompetition[];
  points: string;
  isCancelled: boolean;
};

const dataPath = (fileName: string) =>
  path.join(process.cwd(), "src", "data", fileName);

const readRows = (fileName: string) =>
  parseCsv(fs.readFileSync(dataPath(fileName), "utf-8"));

const clean = (value: unknown) => String(value ?? "").trim();

export function loadBallonDorEditions(): BallonDorEdition[] {
  return readRows("ballon-dor_editions.csv")
    .map((row) => ({
      year: clean(row.year),
      period: clean(row.period),
      period_start: clean(row.period_start),
      period_end: clean(row.period_end),
      ceremony_date: clean(row.ceremony_date),
      status: clean(row.status),
      update_date: clean(row.update_date),
      notes: clean(row.notes),
    }))
    .filter((row) => /^\d{4}$/.test(row.year));
}

export function loadBallonDorRankings(): BallonDorRanking[] {
  return readRows("ballon-dor_rankings.csv")
    .map((row, index) => ({
      year: clean(row.year),
      rank: clean(row.rank),
      player_name_ja: clean(row.player_name_ja),
      points: clean(row.points),
      notes: clean(row.notes),
      competition1: clean(row.competition1),
      edition1: clean(row.edition1),
      competition2: clean(row.competition2),
      edition2: clean(row.edition2),
      nationality_override: clean(row.nationality_override),
      position_override: clean(row.position_override),
      club1_override: clean(row.club1_override),
      club1_league_key: clean(row.club1_league_key),
      club1_season: clean(row.club1_season),
      club2_override: clean(row.club2_override),
      club2_league_key: clean(row.club2_league_key),
      club2_season: clean(row.club2_season),
      _csvOrder: index,
    }))
    .filter((row) => /^\d{4}$/.test(row.year) && row.player_name_ja);
}

export function ballonDorStatusLabel(status: string): string {
  const key = clean(status).toLowerCase();
  const labels: Record<string, string> = {
    completed: "結果発表済",
    nominees_announced: "候補者発表済",
    cancelled: "開催中止",
    canceled: "開催中止",
  };
  return labels[key] ?? clean(status) ?? "";
}

function seasonForAward(year: number): Season {
  return `${year - 1}-${String(year).slice(-2)}` as Season;
}

function seasonForCalendarFirstHalf(year: number): Season {
  return `${year - 1}-${String(year).slice(-2)}` as Season;
}

function seasonForCalendarSecondHalf(year: number): Season {
  return `${year}-${String(year + 1).slice(-2)}` as Season;
}

function targetClubWindows(
  edition: BallonDorEdition | undefined,
  year: number,
) {
  const period = clean(edition?.period).toLowerCase();

  // シーズン単位
  // 例：2025年バロンドール
  // → 2024-25 summer
  // → 2024-25 winter
  if (period === "season") {
    const season = seasonForAward(year);

    return [
      { season, window: "summer" },
      { season, window: "winter" },
    ];
  }

  // 暦年単位
  // 例：2008年バロンドール
  // → 2007-08 winter
  // → 2008-09 summer
  return [
    { season: seasonForCalendarFirstHalf(year), window: "winter" },
    { season: seasonForCalendarSecondHalf(year), window: "summer" },
  ];
}

function latestRowsByWindow(
  playerName: string,
  edition: BallonDorEdition | undefined,
  year: number,
): ClubSquadRow[] {
  const targets = targetClubWindows(edition, year);
  const all = loadClubSquads();
  const picked: ClubSquadRow[] = [];

  for (const target of targets) {
    const matches = all
      .filter(
        (row) =>
          clean(row.name_ja) === playerName &&
          clean(row.season) === target.season &&
          clean(row.window).toLowerCase() === target.window,
      )
      .sort((a, b) =>
        clean(a.snapshot_date).localeCompare(clean(b.snapshot_date)),
      );

    picked.push(...matches);
  }

  return picked;
}

function distinctLatestClubs(rows: ClubSquadRow[]): AwardClub[] {
  const byClub = new Map<string, ClubSquadRow>();
  for (const row of rows) {
    const key = `${clean(row.league_key)}|||${clean(row.club_key)}`;
    if (!clean(row.club) || !clean(row.league_key) || !clean(row.club_key))
      continue;
    const prev = byClub.get(key);
    if (!prev || clean(row.snapshot_date) >= clean(prev.snapshot_date)) {
      byClub.set(key, row);
    }
  }

  return [...byClub.values()]
    .sort((a, b) =>
      clean(a.snapshot_date).localeCompare(clean(b.snapshot_date)),
    )
    .map((row) => ({
      name: clean(row.club),
      href: clubUrl({
        leagueKey: clean(row.league_key),
        clubKey: clean(row.club_key),
        season: clean(row.season) as Season,
      }),
      snapshotDate: clean(row.snapshot_date),
    }));
}

function fallbackClubs(row: BallonDorRanking): AwardClub[] {
  const items = [
    {
      name: row.club1_override,
      leagueKey: row.club1_league_key,
      season: row.club1_season,
    },
    {
      name: row.club2_override,
      leagueKey: row.club2_league_key,
      season: row.club2_season,
    },
  ];

  const masters = loadClubMaster();

  return items
    .filter((item) => item.name)
    .map((item) => {
      const master = masters.find((club) => {
        if (item.leagueKey && clean(club.league_key) !== item.leagueKey) {
          return false;
        }
        const aliases = clean(club.aliases)
          .split(/[|｜]/)
          .map((value) => value.trim())
          .filter(Boolean);
        return [
          clean(club.club_key),
          clean(club.club_display_ja),
          clean(club.club_display_en),
          ...aliases,
        ].includes(item.name);
      });

      return {
        name: item.name,
        href:
          master && item.season
            ? clubUrl({
                leagueKey: clean(master.league_key),
                clubKey: clean(master.club_key),
                season: item.season as Season,
              })
            : "",
        snapshotDate: "",
      };
    });
}

function competitionInfo(
  competition: string,
  edition: string,
  playerName: string,
): Pick<AwardCompetition, "href" | "country"> {
  const match = loadCallups().find(
    (row) =>
      clean(row.competition) === competition &&
      clean(row.edition) === edition &&
      clean(row.name_ja) === playerName,
  );

  if (!match) {
    return {
      href: "",
      country: "",
    };
  }

  const country = clean(match.country);

  if (!country) {
    return {
      href: "",
      country: "",
    };
  }

  if (competition === "WC") {
    return {
      href: `/wc/${encodeURIComponent(edition)}/team/${encodeURIComponent(country)}/`,
      country,
    };
  }

  const segmentByCompetition: Record<string, string> = {
    EURO: "euro",
    COPA: "copa",
    AFC: "afc",
    AFCON: "afcon",
    GC: "gold-cup",
    OFC: "ofc",
    UNL: "unl",
  };

  const segment = segmentByCompetition[competition];

  return {
    href: segment
      ? `/continental/${segment}/${encodeURIComponent(edition)}/team/${encodeURIComponent(country)}/`
      : "",
    country,
  };
}

function competitionsFor(row: BallonDorRanking): AwardCompetition[] {
  return [
    [row.competition1, row.edition1],
    [row.competition2, row.edition2],
  ]
    .filter(([competition, edition]) => competition && edition)
    .map(([competition, edition]) => {
      const info = competitionInfo(competition, edition, row.player_name_ja);

      return {
        label: `${competition}${edition}`,
        href: info.href,
        country: info.country,
      };
    });
}

export function buildBallonDorWinnerRows(): BallonDorWinnerRow[] {
  const editions = loadBallonDorEditions();
  const rankings = loadBallonDorRankings();
  const editionByYear = new Map(editions.map((row) => [row.year, row]));
  const winnerByYear = new Map<string, BallonDorRanking>();

  for (const row of rankings) {
    if (row.rank !== "1" || winnerByYear.has(row.year)) continue;
    winnerByYear.set(row.year, row);
  }

  const years = new Set<string>([
    ...editions.map((row) => row.year),
    ...rankings.map((row) => row.year),
  ]);

  return [...years]
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => {
      const edition = editionByYear.get(year);
      const winner = winnerByYear.get(year);
      const status = clean(edition?.status);
      const isCancelled = ["cancelled", "canceled"].includes(
        status.toLowerCase(),
      );

      if (!winner) {
        return {
          year,
          href: awardUrl({ awardKey: "ballon-dor", year: year as Year }),
          status,
          statusLabel: ballonDorStatusLabel(status),
          playerName: isCancelled ? "受賞者なし" : ballonDorStatusLabel(status),
          nationality: "",
          position: "",
          clubs: [],
          competitions: [],
          points: "",
          isCancelled,
        };
      }

      const clubRows = latestRowsByWindow(
        winner.player_name_ja,
        edition,
        Number(year),
      );
      const latestAttributeRow = [...clubRows].sort((a, b) =>
        clean(b.snapshot_date).localeCompare(clean(a.snapshot_date)),
      )[0];
      const autoClubs = distinctLatestClubs(clubRows);

      return {
        year,
        href: awardUrl({ awardKey: "ballon-dor", year: year as Year }),
        status,
        statusLabel: ballonDorStatusLabel(status),
        playerName: winner.player_name_ja,
        nationality:
          clean(latestAttributeRow?.nationality) || winner.nationality_override,
        position:
          clean(latestAttributeRow?.position_primary) ||
          winner.position_override,
        clubs: autoClubs.length ? autoClubs : fallbackClubs(winner),
        competitions: competitionsFor(winner),
        points: winner.points,
        isCancelled: false,
      };
    });
}

export function formatAwardPoints(value: string): string {
  const raw = clean(value);
  if (!raw) return "";
  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;
  return Number.isInteger(number) ? number.toLocaleString("ja-JP") : raw;
}

export type BallonDorCandidateRow = {
  rank: string;
  playerName: string;
  nationality: string;
  position: string;
  clubs: AwardClub[];
  competitions: AwardCompetition[];
  points: string;
  notes: string;
};

export type BallonDorYearPage = {
  year: string;
  edition?: BallonDorEdition;
  statusLabel: string;
  isCancelled: boolean;
  candidates: BallonDorCandidateRow[];
  previousYear: string;
  nextYear: string;
};

export function getBallonDorYears(): string[] {
  const years = new Set<string>([
    ...loadBallonDorEditions().map((row) => row.year),
    ...loadBallonDorRankings().map((row) => row.year),
  ]);
  return [...years].sort((a, b) => Number(a) - Number(b));
}

export function buildBallonDorYearPage(year: string): BallonDorYearPage | null {
  const editions = loadBallonDorEditions();
  const rankings = loadBallonDorRankings();
  const edition = editions.find((row) => row.year === year);
  const yearRankings = rankings
    .filter((row) => row.year === year)
    .sort((a, b) => a._csvOrder - b._csvOrder);

  if (!edition && !yearRankings.length) return null;

  const status = clean(edition?.status);
  const isCancelled = ["cancelled", "canceled"].includes(status.toLowerCase());

  const candidates = yearRankings.map((row) => {
    const clubRows = latestRowsByWindow(
      row.player_name_ja,
      edition,
      Number(year),
    );
    const latestAttributeRow = [...clubRows].sort((a, b) =>
      clean(b.snapshot_date).localeCompare(clean(a.snapshot_date)),
    )[0];
    const autoClubs = distinctLatestClubs(clubRows);

    return {
      rank: row.rank,
      playerName: row.player_name_ja,
      nationality:
        clean(latestAttributeRow?.nationality) || row.nationality_override,
      position:
        clean(latestAttributeRow?.position_primary) || row.position_override,
      clubs: autoClubs.length ? autoClubs : fallbackClubs(row),
      competitions: competitionsFor(row),
      points: row.points,
      notes: row.notes,
    };
  });

  const years = getBallonDorYears();
  const index = years.indexOf(year);

  return {
    year,
    edition,
    statusLabel: ballonDorStatusLabel(status),
    isCancelled,
    candidates,
    previousYear: index > 0 ? years[index - 1] : "",
    nextYear: index >= 0 && index < years.length - 1 ? years[index + 1] : "",
  };
}
