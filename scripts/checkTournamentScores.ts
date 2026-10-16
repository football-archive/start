import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const competition = "WC";
const edition = "2026";

type ScheduleRow = {
  "match-id": string;
  competition: string;
  edition: string;
  home: string;
  away: string;
  home_score: string;
  away_score: string;
};

type EventRow = {
  competition: string;
  edition: string;
  match_id: string;
  event_type: string;
  team: string;
  player: string;
  period: string;
  note: string;
};

function readCsv<T>(filename: string): T[] {
  const file = path.join(process.cwd(), "src", "data", filename);

  const csv = fs.readFileSync(file, "utf-8");

  return Papa.parse<T>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  }).data;
}

const norm = (v: unknown) => String(v ?? "").trim();

const schedules = readCsv<ScheduleRow>(
  "competition_schedule_and_results.csv",
).filter(
  (r) => norm(r.competition) === competition && norm(r.edition) === edition,
);

const events = readCsv<EventRow>("match_events.csv").filter(
  (r) => norm(r.competition) === competition && norm(r.edition) === edition,
);

const eventsByMatch = new Map<string, EventRow[]>();

for (const event of events) {
  const id = norm(event.match_id);

  if (!eventsByMatch.has(id)) {
    eventsByMatch.set(id, []);
  }

  eventsByMatch.get(id)!.push(event);
}

let ok = 0;
let ng = 0;
let skipped = 0;

const scheduleIds = new Set(schedules.map((r) => norm(r["match-id"])));

for (const match of schedules) {
  const id = norm(match["match-id"]);

  const home = norm(match.home);
  const away = norm(match.away);

  const expectedHome = Number(match.home_score);
  const expectedAway = Number(match.away_score);

  if (
    norm(match.home_score) === "" ||
    norm(match.away_score) === "" ||
    !Number.isFinite(expectedHome) ||
    !Number.isFinite(expectedAway)
  ) {
    skipped++;
    console.log(`SKIP ${id}: スコア未確定`);
    continue;
  }

  let actualHome = 0;
  let actualAway = 0;

  const matchEvents = eventsByMatch.get(id) ?? [];

  for (const event of matchEvents) {
    const type = norm(event.event_type).toUpperCase();
    const team = norm(event.team);
    const period = norm(event.period).toUpperCase();
    const note = norm(event.note);

    // PK戦は試合スコアに含めない
    if (period === "PSO" || period === "PKSO" || note.includes("PK戦")) {
      continue;
    }

    if (type !== "GOAL" && type !== "PK" && type !== "OWN_GOAL") {
      continue;
    }

    // team は得点が加算される側（OWN_GOALも同じ）
    const scoringTeam = team;

    if (scoringTeam === home) {
      actualHome++;
    } else if (scoringTeam === away) {
      actualAway++;
    } else {
      console.log(`WARN ${id}: チーム名不一致 ${team}`);
      ng++;
    }
  }

  if (actualHome === expectedHome && actualAway === expectedAway) {
    ok++;
  } else {
    ng++;

    console.log(
      `NG ${id} ${home} vs ${away}: ` +
        `スコア ${expectedHome}-${expectedAway} / ` +
        `イベント ${actualHome}-${actualAway}`,
    );
  }
}

// 試合一覧に存在しないイベントも検出
for (const id of eventsByMatch.keys()) {
  if (!scheduleIds.has(id)) {
    ng++;
    console.log(`NG ${id}: 試合一覧に存在しないイベント`);
  }
}

console.log("\n=== 大会得点イベント照合 ===");
console.log(`大会: ${competition} ${edition}`);
console.log(`試合数: ${schedules.length}`);
console.log(`一致: ${ok}`);
console.log(`不一致・異常: ${ng}`);
console.log(`未確定: ${skipped}`);

if (schedules.length === 0 || ng > 0 || skipped > 0) {
  process.exitCode = 1;
}
