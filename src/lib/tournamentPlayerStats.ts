import { getGoalRanking, getAssistRanking } from "./matchEvents";

type GARow = {
  name_en?: string;
  name_ja?: string;
  goals?: string;
  assists?: string;
};

type StatsCoverage = {
  goals: boolean;
  assists: boolean;
};

// match_events の整備が完了した大会だけ登録する
const COVERAGE: Record<string, StatsCoverage> = {
  "AFC:2023": { goals: true, assists: true },
  "AFC:2019": { goals: true, assists: true },
  "AFC:2015": { goals: true, assists: true },
  "AFC:2011": { goals: true, assists: true },
  "AFC:2007": { goals: true, assists: true },
  "AFC:2004": { goals: true, assists: true },
  "AFC:2000": { goals: true, assists: true },
  "WC:2026": { goals: true, assists: true },
  "WC:2022": { goals: true, assists: true },
  "WC:2018": { goals: true, assists: true },
};

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

// 英字名・日本語名の両方から照合用インデックスを作成
// 同じ選手のname_en/name_jaが同じ文字列でも重複扱いしない
function buildPlayerIndex<T extends GARow>(rows: T[]) {
  const index = new Map<string, Set<number>>();

  rows.forEach((row, i) => {
    const names = new Set([norm(row.name_en), norm(row.name_ja)]);

    for (const name of names) {
      if (!name) continue;

      if (!index.has(name)) {
        index.set(name, new Set<number>());
      }

      index.get(name)!.add(i);
    }
  });

  return index;
}

export type TournamentGAIssue = {
  team: string;
  player: string;
  stat: "G" | "A";
  count: number;
  reason: "PLAYER_NOT_FOUND" | "DUPLICATE_NAME";
};

export function checkTournamentGAMatching<T extends GARow>(
  rows: T[],
  competition: string,
  edition: string,
  team: string,
): TournamentGAIssue[] {
  const issues: TournamentGAIssue[] = [];
  const index = buildPlayerIndex(rows);

  const check = (player: string, count: number, stat: "G" | "A") => {
    const matches = index.get(norm(player))?.size ?? 0;

    if (matches === 1) return;

    issues.push({
      team,
      player,
      stat,
      count,
      reason: matches === 0 ? "PLAYER_NOT_FOUND" : "DUPLICATE_NAME",
    });
  };

  for (const row of getGoalRanking(competition, edition)) {
    if (norm(row.team) !== norm(team)) continue;
    check(row.player, row.goals, "G");
  }

  for (const row of getAssistRanking(competition, edition)) {
    if (norm(row.team) !== norm(team)) continue;
    check(row.player, row.assists, "A");
  }

  return issues;
}

export function applyTournamentGA<T extends GARow>(
  rows: T[],
  competition: string,
  edition: string,
  team: string,
): T[] {
  const key = `${competition.toUpperCase()}:${edition}`;
  const coverage = COVERAGE[key];

  if (!coverage?.goals && !coverage?.assists) {
    return rows;
  }

  if (rows.length === 0) {
    return rows;
  }

  const issues = checkTournamentGAMatching(
    rows,
    competition,
    edition,
    team,
  ).filter(
    (issue) =>
      (issue.stat === "G" && coverage.goals) ||
      (issue.stat === "A" && coverage.assists),
  );

  // 未照合があれば従来どおり元データを維持
  if (issues.length > 0) {
    console.warn(
      `[TournamentGA] ${key} ${team}: ` +
        `${issues.length}件の未照合があります。` +
        `GAはcallupの値を維持します。`,
    );

    for (const issue of issues) {
      console.warn(
        `  ${issue.stat} ${issue.player} ` + `(${issue.count}) ${issue.reason}`,
      );
    }

    return rows;
  }

  const index = buildPlayerIndex(rows);
  const goals = new Map<number, number>();
  const assists = new Map<number, number>();

  if (coverage.goals) {
    for (const r of getGoalRanking(competition, edition)) {
      if (norm(r.team) !== norm(team)) continue;

      const playerIndex = [...(index.get(norm(r.player)) ?? [])][0];
      if (playerIndex === undefined) continue;

      goals.set(playerIndex, r.goals);
    }
  }

  if (coverage.assists) {
    for (const r of getAssistRanking(competition, edition)) {
      if (norm(r.team) !== norm(team)) continue;

      const playerIndex = [...(index.get(norm(r.player)) ?? [])][0];
      if (playerIndex === undefined) continue;

      assists.set(playerIndex, r.assists);
    }
  }

  return rows.map((row, i) => ({
    ...row,
    goals: coverage.goals ? String(goals.get(i) ?? 0) : row.goals,
    assists: coverage.assists ? String(assists.get(i) ?? 0) : row.assists,
  }));
}
