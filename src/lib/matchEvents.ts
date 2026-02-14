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
    if (e.event_type !== "GOAL") continue;

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
    if (e.event_type !== "GOAL") continue;

    const a = norm(e.assist);
    if (!a) continue;

    const team = norm(e.team);
    const key = `${a}__${team}`;
    if (!map.has(key)) map.set(key, { player: a, team, assists: 0 });
    map.get(key)!.assists += 1;
  }

  return [...map.values()].sort((a, b) => b.assists - a.assists);
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
