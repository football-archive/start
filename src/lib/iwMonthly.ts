import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

type Row = Record<string, string>;
const read = (name: string): Row[] =>
  parseCsv(
    fs.readFileSync(path.join(process.cwd(), "src", "data", name), "utf8"),
  );
const clean = (s: unknown) => String(s ?? "").trim();
const norm = (s: unknown) =>
  clean(s).replace(/　/g, " ").replace(/\s+/g, " ").toLowerCase();
export type IwMatch = {
  id: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  score: string;
  note: string;
  confeds: string[];
  homeUrl: string;
  awayUrl: string;
  warnings: string[];
};
export function getIwMonthly(edition: string) {
  const countries = read("country_master.csv");
  const byKey = new Map(countries.map((c) => [clean(c.country_key), c]));
  const byName = new Map(
    countries.map((c) => [norm(c.country_name_ja), clean(c.country_key)]),
  );
  const available = new Set(
    read("callups_site.csv")
      .filter(
        (r) =>
          clean(r.competition).toUpperCase() === "IW" &&
          clean(r.edition) === edition,
      )
      .map((r) => byName.get(norm(r.country)))
      .filter(Boolean),
  );
  const entries = read("nt_iw_activity.csv").filter(
    (r) =>
      clean(r.edition) === edition &&
      clean(r.team_slug) &&
      clean(r.opponent_key) &&
      clean(r.date),
  );
  const grouped = new Map<string, Row[]>();
  for (const r of entries) {
    const a = clean(r.team_slug),
      b = clean(r.opponent_key),
      date = clean(r.date);
    const key = `${date}|${[a, b].sort().join("|")}`;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  const warnings: string[] = [];
  const matches: IwMatch[] = [];
  for (const [id, rows] of grouped) {
    const first = rows[0];
    const a = clean(first.team_slug),
      b = clean(first.opponent_key);
    const homeRow = rows.find((r) => clean(r.venue_type) === "H");
    const awayRow = rows.find((r) => clean(r.venue_type) === "A");
    let home = homeRow
      ? clean(homeRow.team_slug)
      : awayRow
        ? clean(awayRow.opponent_key)
        : [a, b].sort()[0];
    let away = home === a ? b : a;
    const issues: string[] = [];
    if (rows.length > 2) issues.push(`${rows.length}件登録`);
    if (rows.filter((r) => clean(r.venue_type) === "H").length > 1)
      issues.push("Hが複数");
    if (rows.filter((r) => clean(r.venue_type) === "A").length > 1)
      issues.push("Aが複数");
    if (
      homeRow &&
      awayRow &&
      clean(homeRow.team_slug) !== clean(awayRow.opponent_key)
    )
      issues.push("H/A矛盾");
    const chosen =
      rows.find((r) => clean(r.team_slug) === home && clean(r.score)) ??
      rows.find((r) => clean(r.score)) ??
      first;
    let score = clean(chosen.score);
    if (score && clean(chosen.team_slug) !== home) {
      const m = score.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
      if (m) score = `${m[2]}-${m[1]}`;
      else issues.push("スコア反転要確認");
    }
    const scores = rows.map((r) => clean(r.score)).filter(Boolean);
    if (scores.length > 1) {
      const standardized = rows
        .filter((r) => clean(r.score))
        .map((r) => {
          const s = clean(r.score);
          const m = s.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
          return m && clean(r.team_slug) !== home ? `${m[2]}-${m[1]}` : s;
        });
      if (new Set(standardized).size > 1) issues.push("スコア不一致");
    }
    const note = rows.map((r) => clean(r.note)).find(Boolean) ?? "";
    const confeds = [
      ...new Set(
        [home, away]
          .map((k) => clean(byKey.get(k)?.confederation))
          .filter(Boolean),
      ),
    ];
    const url = (k: string) =>
      available.has(k) ? `/nt/${k}/iw/${edition}/` : "";
    matches.push({
      id,
      date: clean(first.date),
      home,
      away,
      homeName: clean(byKey.get(home)?.country_name_ja) || home,
      awayName: clean(byKey.get(away)?.country_name_ja) || away,
      score: score || "–",
      note,
      confeds,
      homeUrl: url(home),
      awayUrl: url(away),
      warnings: issues,
    });
    if (issues.length) warnings.push(`${id}: ${issues.join("、")}`);
  }
  const rank = ["AFC", "UEFA", "CAF", "CONMEBOL", "CONCACAF", "OFC"];
  matches.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Math.min(
        ...a.confeds.map((c) => (rank.indexOf(c) < 0 ? 99 : rank.indexOf(c))),
      ) -
        Math.min(
          ...b.confeds.map((c) => (rank.indexOf(c) < 0 ? 99 : rank.indexOf(c))),
        ) ||
      a.id.localeCompare(b.id),
  );
  // 日付差がある同カードは自動統合せず、検査対象にする
  const byPair = new Map<string, string[]>();
  for (const m of matches) {
    const pair = [m.home, m.away].sort().join("|");
    byPair.set(pair, [...(byPair.get(pair) ?? []), m.date]);
  }
  for (const [pair, dates] of byPair) {
    for (let i = 0; i < dates.length; i++)
      for (let j = i + 1; j < dates.length; j++) {
        const diff = Math.abs(Date.parse(dates[i]) - Date.parse(dates[j]));
        if (diff === 86400000)
          warnings.push(
            `日付差1日の同カード候補: ${pair} (${dates[i]} / ${dates[j]})`,
          );
      }
  }
  return { matches, warnings, sourceCount: entries.length };
}
