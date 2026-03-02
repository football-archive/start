// src/lib/ctSeasonMeta.ts
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export type CtSeasonMetaRow = {
  season: string;
  league_key: string;
  club_key: string;
  rank_ja: string;
  coach_ja: string;
  comment_ja: string;
};

// ct_season_meta.csv を読み込む（クラブ“あゆみ”の子ページ/メタ表示で共通利用）
export function loadCtSeasonMeta(): CtSeasonMetaRow[] {
  const csvPath = path.join(process.cwd(), "src", "data", "ct_season_meta.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(raw);

  return rows.map((r) => ({
    season: String(r.season ?? "").trim(),
    league_key: String(r.league_key ?? "").trim(),
    club_key: String(r.club_key ?? "").trim(),
    // 互換：result_ja を使っていた場合も拾えるようにしておく
    rank_ja: String((r.rank_ja ?? r.result_ja) ?? "").trim(),
    coach_ja: String(r.coach_ja ?? "").trim(),
    comment_ja: String(r.comment_ja ?? "").trim(),
  }));
}

// 1クラブ×1シーズンのメタを引く（見つからなければ null）
export function findCtSeasonMeta(
  all: CtSeasonMetaRow[],
  args: { season: string; league_key: string; club_key: string },
): CtSeasonMetaRow | null {
  const season = String(args.season ?? "").trim();
  const league_key = String(args.league_key ?? "").trim();
  const club_key = String(args.club_key ?? "").trim();

  // league_key も一致させる（同名クラブの誤ヒットを防ぐ）
  return (
    all.find(
      (r) =>
        r.season === season &&
        r.club_key === club_key &&
        (!r.league_key || r.league_key === league_key),
    ) ?? null
  );
}
