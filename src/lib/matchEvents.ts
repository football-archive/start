// src/lib/matchEvents.ts
import { readFileSync } from "node:fs";
import { parseCsv } from "./csvSimple";

export type MatchEvent = {
  competition: string;
  edition: string;
  match_id: string;
  event_id?: string;
  event_type: string; // GOAL / OG / YC / ...
  team: string;
  player: string;
  assist?: string;
  minute?: string;
  period?: string; // 1H / 2H / ET / PSO(想定)
  vs?: string; // ★追加：対戦国（表示用）
  note?: string; // PK / (将来) PK戦 など
};

export type GoalRankRow = { player: string; team: string; goals: number };
export type AssistRankRow = { player: string; team: string; assists: number };

const norm = (v: unknown) => String(v ?? "").trim();
const upper = (v: unknown) => norm(v).toUpperCase();

function isShootout(e: MatchEvent) {
  const p = upper(e.period);
  const n = norm(e.note);
  // PK戦の結果は入れない方針：将来 period=PSO 等で入ったら除外
  return p === "PSO" || p === "PKSO" || n.includes("PK戦");
}

function isGoalEvent(e: MatchEvent) {
  const t = upper(e.event_type);
  return t === "GOAL" || t === "PK";
}

export function loadMatchEvents(): MatchEvent[] {
  const csv = readFileSync("src/data/match_events.csv", "utf-8");
  const rows = parseCsv(csv);

  return rows.map((r: any) => ({
    competition: norm(r.competition),
    edition: norm(r.edition),
    match_id: norm(r.match_id),
    event_id: norm(r.event_id),
    event_type: upper(r.event_type),
    team: norm(r.team),
    player: norm(r.player),
    assist: norm(r.assist),
    minute: norm(r.minute),
    period: norm(r.period),
    round: norm(r.round),
    vs: norm(r.vs), // ★追加
    note: norm(r.note),
  }));
}

export function getGoalRanking(
  competition: string,
  edition: string,
): GoalRankRow[] {
  const events = loadMatchEvents();

  const map = new Map<string, GoalRankRow>();

  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.edition) !== edition) continue;

    if (isShootout(e)) continue;

    // GOALだけ集計（OGは除外）
    if (!isGoalEvent(e)) continue;

    if (!e.player || !e.team) continue;

    const key = `${e.player}__${e.team}`;
    if (!map.has(key))
      map.set(key, { player: e.player, team: e.team, goals: 0 });
    map.get(key)!.goals += 1;
  }

  return [...map.values()].sort((a, b) => b.goals - a.goals);
}

export function getAssistRanking(
  competition: string,
  edition: string,
): AssistRankRow[] {
  const events = loadMatchEvents();

  const map = new Map<string, AssistRankRow>();

  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.edition) !== edition) continue;

    if (isShootout(e)) continue;

    // 今のCSVは assist 列に入ってるので、GOAL行のassistを拾う
    if (!isGoalEvent(e)) continue;

    const a = norm(e.assist);
    if (!a) continue;

    const team = norm(e.team);
    const key = `${a}__${team}`;
    if (!map.has(key)) map.set(key, { player: a, team, assists: 0 });
    map.get(key)!.assists += 1;
  }

  return [...map.values()].sort((a, b) => b.assists - a.assists);
}

/** ★追加：その大会の match_events に含まれる team のユニーク数（ゴールイベントのみ） */
export function getEventTeamCount(
  competition: string,
  edition: string,
): number {
  const events = loadMatchEvents();
  const set = new Set<string>();

  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.edition) !== edition) continue;
    if (isShootout(e)) continue;
    if (!isGoalEvent(e)) continue;

    const team = norm(e.team);
    if (team) set.add(team);
  }
  return set.size;
}

export type PlayerGARow = {
  player: string;
  goals: number;
  assists: number;
  ga: number;
};
export type EditionSubtotalRow = {
  edition: string;
  goals: number;
  assists: number;
  ga: number;
};

/** ★追加：通算（選手別）G/A：データがある分だけ集計 */
export function getTeamCareerGA(
  competition: string,
  team: string,
): PlayerGARow[] {
  const events = loadMatchEvents();
  const map = new Map<string, PlayerGARow>();

  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.team) !== team) continue;
    if (isShootout(e)) continue;
    if (!isGoalEvent(e)) continue;

    const p = norm(e.player);
    if (!p) continue;

    if (!map.has(p)) map.set(p, { player: p, goals: 0, assists: 0, ga: 0 });
    map.get(p)!.goals += 1;

    const a = norm(e.assist);
    if (a) {
      if (!map.has(a)) map.set(a, { player: a, goals: 0, assists: 0, ga: 0 });
      map.get(a)!.assists += 1;
    }
  }

  const rows = [...map.values()].map((r) => ({
    ...r,
    ga: r.goals + r.assists,
  }));
  rows.sort(
    (x, y) =>
      y.goals - x.goals ||
      y.assists - x.assists ||
      x.player.localeCompare(y.player, "ja"),
  );
  return rows;
}

export type TeamEventRow = {
  edition: string;
  match_id: string;
  event_id: number;
  event_type: string;
  player: string;
  assist?: string;
  minute?: number;
  round?: string;
  vs?: string;
  note?: string;
};

export function getTeamEventsByEdition(
  competition: string,
  team: string,
  edition: string,
): TeamEventRow[] {
  const events = loadMatchEvents();

  const rows: TeamEventRow[] = [];
  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.team) !== team) continue;
    if (norm(e.edition) !== edition) continue;

    // PK戦は除外（あなたの方針どおり）
    if (isShootout(e)) continue;

    // “得点イベントだけ”に絞る（GOAL/PK）
    if (!isGoalEvent(e)) continue;

    rows.push({
      edition: norm(e.edition),
      match_id: norm(e.match_id),
      event_id: Number(e.event_id ?? 0),
      event_type: norm(e.event_type),
      player: norm(e.player),
      assist: norm(e.assist),
      minute: e.minute != null ? Number(e.minute) : undefined,
      round: norm(e.round),
      vs: norm(e.vs),
      note: norm(e.note),
    });
  }

  // match_id → event_id の順で安定ソート
  rows.sort(
    (a, b) =>
      a.match_id.localeCompare(b.match_id) ||
      a.event_id - b.event_id ||
      a.player.localeCompare(b.player, "ja"),
  );

  return rows;
}

/** ★追加：大会別中計（チーム×大会）：データがある分だけ集計 */
export function getTeamEditionSubtotals(
  competition: string,
  team: string,
): EditionSubtotalRow[] {
  const events = loadMatchEvents();
  const map = new Map<string, { goals: number; assists: number }>();

  for (const e of events) {
    if (norm(e.competition) !== competition) continue;
    if (norm(e.team) !== team) continue;
    if (isShootout(e)) continue;
    if (!isGoalEvent(e)) continue;

    const ed = norm(e.edition);
    if (!ed) continue;

    if (!map.has(ed)) map.set(ed, { goals: 0, assists: 0 });
    map.get(ed)!.goals += 1;

    const a = norm(e.assist);
    if (a) map.get(ed)!.assists += 1;
  }

  return [...map.entries()]
    .map(([edition, v]) => ({
      edition,
      goals: v.goals,
      assists: v.assists,
      ga: v.goals + v.assists,
    }))
    .sort((a, b) => Number(a.edition) - Number(b.edition));
}

// 同順位：1,1,3方式
export function addRank<T extends Record<string, any>>(
  rows: T[],
  scoreKey: keyof T,
): (T & { rank: number })[] {
  const out: (T & { rank: number })[] = [];
  let lastScore: number | null = null;
  let rank = 0;
  let i = 0;

  for (const r of rows) {
    i++;
    const score = Number(r[scoreKey] ?? 0);
    if (lastScore === null || score !== lastScore) {
      rank = i;
      lastScore = score;
    }
    out.push({ ...r, rank });
  }
  return out;
}
