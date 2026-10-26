import { getGoalRanking, getAssistRanking } from "./matchEvents";

type GARow = {
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
};

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/　/g, " ")
    .replace(/\s+/g, " ");

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

  // 代表メンバー未登録の国は処理しない
  if (rows.length === 0) {
    return rows;
  }

  // イベント側とメンバー側の選手名を照合
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

  // 未照合があれば安全のため元データを維持
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

  const goals = new Map<string, number>();
  const assists = new Map<string, number>();

  if (coverage.goals) {
    for (const r of getGoalRanking(competition, edition)) {
      if (norm(r.team) !== norm(team)) continue;
      goals.set(norm(r.player), r.goals);
    }
  }

  if (coverage.assists) {
    for (const r of getAssistRanking(competition, edition)) {
      if (norm(r.team) !== norm(team)) continue;
      assists.set(norm(r.player), r.assists);
    }
  }

  return rows.map((row) => {
    const name = norm(row.name_ja);

    return {
      ...row,
      goals: coverage.goals ? String(goals.get(name) ?? 0) : row.goals,
      assists: coverage.assists ? String(assists.get(name) ?? 0) : row.assists,
    };
  });
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

  const names = new Map<string, number>();

  for (const row of rows) {
    const name = norm(row.name_ja);
    if (!name) continue;

    names.set(name, (names.get(name) ?? 0) + 1);
  }

  const check = (player: string, count: number, stat: "G" | "A") => {
    const matches = names.get(norm(player)) ?? 0;

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
