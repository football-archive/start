import { loadCallups } from "../src/lib/callups";
import { getGoalRanking, getAssistRanking } from "../src/lib/matchEvents";

const competition = "WC";
const edition = "2026";

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .normalize("NFKC");

const number = (value: unknown) => {
  const s = norm(value);
  if (!s) return 0;

  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`GA数値が不正です: ${s}`);
  }
  return n;
};

const key = (team: string, player: string) =>
  JSON.stringify([norm(team), norm(player)]);

const rows = loadCallups().filter(
  (r) =>
    norm(r.competition).toUpperCase() === competition &&
    norm(r.edition) === edition,
);

// イベントから得点・アシストを集計
const eventGoals = new Map<string, number>();
const eventAssists = new Map<string, number>();

for (const r of getGoalRanking(competition, edition)) {
  const k = key(r.team, r.player);
  eventGoals.set(k, (eventGoals.get(k) ?? 0) + r.goals);
}

for (const r of getAssistRanking(competition, edition)) {
  const k = key(r.team, r.player);
  eventAssists.set(k, (eventAssists.get(k) ?? 0) + r.assists);
}

const nameCounts = new Map<string, number>();

for (const r of rows) {
  const team = norm(r.country);
  const player = norm(r.name_ja);
  if (!team || !player) continue;

  const k = key(team, player);
  nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
}

// callup側の選手を比較
const seen = new Set<string>();
const differences: string[] = [];

let compared = 0;
let matched = 0;

for (const r of rows) {
  const team = norm(r.country);
  const player = norm(r.name_ja);

  if (!team || !player) continue;

  const k = key(team, player);

  if (seen.has(k)) continue;
  seen.add(k);

  if ((nameCounts.get(k) ?? 0) > 1) {
    differences.push(
      [team, player, "G/A", "DUPLICATE_NAME", "要個別確認"].join("\t"),
    );
    continue;
  }

  const stats = [
    ["G", number(r.goals), eventGoals.get(k) ?? 0],
    ["A", number(r.assists), eventAssists.get(k) ?? 0],
  ] as const;

  for (const [stat, callup, events] of stats) {
    compared++;

    if (callup === events) {
      matched++;
      continue;
    }

    const diff = events - callup;

    differences.push(
      [
        team,
        player,
        stat,
        `callup=${callup}`,
        `events=${events}`,
        `差分=${diff > 0 ? "+" : ""}${diff}`,
      ].join("\t"),
    );
  }
}

// イベント側にしか存在しない選手も検出
for (const [stat, eventMap] of [
  ["G", eventGoals],
  ["A", eventAssists],
] as const) {
  for (const [k, count] of eventMap) {
    if (seen.has(k)) continue;

    const [team, player] = JSON.parse(k) as [string, string];

    differences.push(
      [
        team,
        player,
        stat,
        "callup=未登録",
        `events=${count}`,
        "PLAYER_NOT_FOUND",
      ].join("\t"),
    );
  }
}

differences.sort((a, b) => a.localeCompare(b, "ja"));

console.log(`\n${competition}${edition} GA数値差分チェック\n`);

for (const line of differences) {
  console.log(line);
}

console.log("\n--- 集計 ---");
console.log(`比較対象：${rows.length}選手`);
console.log(`比較項目：${compared}件（G・A）`);
console.log(`一致：${matched}件`);
console.log(`不一致：${differences.length}件`);

console.log("\n--- イベント集計 ---");
console.log(
  `得点：${eventGoals.size}選手 / ${[...eventGoals.values()].reduce((a, b) => a + b, 0)}点`,
);
console.log(
  `アシスト：${eventAssists.size}選手 / ${[...eventAssists.values()].reduce((a, b) => a + b, 0)}件`,
);

if (differences.length > 0) {
  process.exitCode = 1;
}

let nonZeroCompared = 0;
let nonZeroMatched = 0;

for (const r of rows) {
  const k = key(r.country, r.name_ja);

  if ((nameCounts.get(k) ?? 0) !== 1) continue;

  for (const [callup, events] of [
    [number(r.goals), eventGoals.get(k) ?? 0],
    [number(r.assists), eventAssists.get(k) ?? 0],
  ]) {
    if (callup === 0 && events === 0) continue;

    nonZeroCompared++;
    if (callup === events) nonZeroMatched++;
  }
}

console.log("\n--- 非ゼロGA照合 ---");
console.log(`比較：${nonZeroCompared}項目`);
console.log(`一致：${nonZeroMatched}項目`);
console.log(`不一致：${nonZeroCompared - nonZeroMatched}項目`);

console.log("\n--- callup集計 ---");
console.log(`得点合計：${rows.reduce((sum, r) => sum + number(r.goals), 0)}`);
console.log(
  `アシスト合計：${rows.reduce((sum, r) => sum + number(r.assists), 0)}`,
);
