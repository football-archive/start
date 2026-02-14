// src/lib/competitionAwards.ts
import { readFileSync } from "node:fs";
import { parseCsv } from "./csvSimple";

export type AwardRow = {
  competition: string;
  edition: string;
  award_key: string;
  award_name: string;
  rank: string;
  player: string;
  team?: string;
  note?: string;
};

const norm = (v: unknown) => String(v ?? "").trim();

export function loadCompetitionAwards(): AwardRow[] {
  const csv = readFileSync("src/data/competition_awards.csv", "utf-8");
  const rows = parseCsv(csv) as any[];
  return rows.map((r) => ({
    competition: norm(r.competition),
    edition: norm(r.edition),
    award_key: norm(r.award_key),
    award_name: norm(r.award_name),
    rank: norm(r.rank),
    player: norm(r.player),
    team: norm(r.team),
    note: norm(r.note),
  }));
}

export function getAwards(competition: string, edition: string) {
  const rows = loadCompetitionAwards().filter(
    (r) => r.competition === competition && r.edition === edition,
  );

  // award_key ごとにまとめる
  const map = new Map<
    string,
    { key: string; name: string; items: AwardRow[] }
  >();

  for (const r of rows) {
    const k = r.award_key || "other";
    if (!map.has(k)) map.set(k, { key: k, name: r.award_name || k, items: [] });
    map.get(k)!.items.push(r);
  }

  // 並び順（好みで調整OK）
  const order = [
    "golden_ball",
    "best_xi",
    "golden_glove",
    "best_young",
    "golden_boot",
  ];

  const groups = [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // 中の並び：rank（数値優先、文字は後ろ）
  for (const g of groups) {
    g.items.sort((a, b) => {
      const na = Number(a.rank);
      const nb = Number(b.rank);
      const aNum = Number.isFinite(na) && a.rank !== "";
      const bNum = Number.isFinite(nb) && b.rank !== "";
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return String(a.rank).localeCompare(String(b.rank));
    });
  }

  return groups;
}
