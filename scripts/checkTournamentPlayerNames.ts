import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const competition = "AFC";
const edition = "2011";

type EventRow = {
  competition: string;
  edition: string;
  event_type: string;
  team: string;
  player: string;
  assist: string;
};

const file = path.join(process.cwd(), "src", "data", "match_events.csv");

const csv = fs.readFileSync(file, "utf-8");

const events = Papa.parse<EventRow>(csv, {
  header: true,
  skipEmptyLines: true,
}).data.filter(
  (r) => r.competition?.trim() === competition && r.edition?.trim() === edition,
);

// 表記比較用。元のCSVは変更しない
const normalize = (value: string) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[・･\s　\-ー]/g, "")
    .trim();

// 文字列間の編集距離
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }

  return dp[a.length][b.length];
}

const teams = new Map<string, Set<string>>();

for (const event of events) {
  const type = event.event_type?.trim().toUpperCase();

  // OWN_GOALのplayerは相手国の選手なので除外
  if (type !== "OWN_GOAL" && event.player?.trim()) {
    const team = event.team.trim();

    if (!teams.has(team)) {
      teams.set(team, new Set());
    }

    teams.get(team)!.add(event.player.trim());
  }

  if (event.assist?.trim()) {
    const team = event.team.trim();

    if (!teams.has(team)) {
      teams.set(team, new Set());
    }

    teams.get(team)!.add(event.assist.trim());
  }
}

let count = 0;

console.log(`=== ${competition} ${edition} 選手名表記揺れチェック ===`);

for (const [team, names] of teams) {
  const list = [...names].sort();

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = normalize(list[i]);
      const b = normalize(list[j]);

      if (a === b) {
        count++;
        console.log(`[表記差] ${team}\t${list[i]}\t${list[j]}`);
        continue;
      }

      const d = distance(a, b);

      // 1文字差、または長い名前の2文字差
      if (d <= 1 || (Math.min(a.length, b.length) >= 8 && d <= 2)) {
        count++;
        console.log(`[類似 ${d}] ${team}\t${list[i]}\t${list[j]}`);
      }
    }
  }
}

console.log(`\n疑わしい組み合わせ: ${count}件`);
console.log("※候補の検出のみ。CSVは変更していません。");
