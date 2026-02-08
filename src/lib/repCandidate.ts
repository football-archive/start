// src/lib/repCandidate.ts
import { keyNameBirth } from "./rosterFormat";

const normDate = (s?: string) => {
  const t = (s ?? "").trim();
  if (!t) return "";

  // "YYYY-MM-DD..." / "YYYY/MM/DD..." などの先頭10文字を拾う
  const iso10 = t.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (iso10) {
    const y = iso10[1];
    const mm = iso10[2].padStart(2, "0");
    const dd = iso10[3].padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  return t;
};

const keyOf = (name_en?: string, birth_date?: string) =>
  `${(name_en ?? "").trim()}|${normDate(birth_date)}`;

// callups_site.csv の行（必要な列だけ）
export type CallupRow = {
  competition?: string; // "WC"
  edition?: string | number; // 2026
  snapshot_date?: string; // "YYYY-MM-DD" or "YYYY/M/D"
  name_en?: string;
  birth_date?: string;
  country?: string;

  // 内部判定用
  confederation_bucket?: string; // QUALIFIED / ELIM / CONF_PO / INTER_PO / UEFA_PO_A ...
};

export function buildRepLabelFromCallups(
  callups: CallupRow[],
  opts: { competition: string; edition: number },
) {
  const filtered = callups.filter(
    (r) =>
      String(r.competition ?? "") === opts.competition &&
      String(r.edition ?? "") === String(opts.edition),
  );

  // 全体の maxSnapshot（表示用に返す）
  const maxSnapshot = filtered.reduce((m, r) => {
    const s = normDate(String(r.snapshot_date ?? ""));
    return s > m ? s : m;
  }, "");

  /**
   * ★重要変更：
   * 「全体のmaxSnapshotだけ」ではなく、
   * 選手(key)ごとに最新(snapshot_dateが最大)の行を採用する
   */
  // ★ snapshot比較をやめる
  const latestByKey = new Map<string, { country: string; bucket: string }>();

  for (const r of filtered) {
    const k = keyOf(r.name_en, r.birth_date);
    if (k.startsWith("|")) continue;

    const country = String(r.country ?? "").trim();
    if (!country) continue;

    const bucket = String(r.confederation_bucket ?? "").trim();

    // すでに登録済みなら上書きしない（最初に見つけた国を採用）
    if (!latestByKey.has(k)) {
      latestByKey.set(k, { country, bucket });
    }
  }

  // 上段：国名（空は非表示）
  const repLabel = (row: { name_en?: string; birth_date?: string }) =>
    latestByKey.get(keyOf(row.name_en, row.birth_date))?.country ?? "";

  const bucketType = (bucketRaw: string) => {
    const b = (bucketRaw ?? "").trim().toUpperCase();

    if (b.startsWith("UEFA_PO_")) return "po";
    if (b === "CONF_PO" || b === "INTER_PO") return "po";
    if (b === "QUALIFIED" || b === "WCQ") return "qualified";
    if (b === "ELIM") return "elim";

    return "unknown";
  };

  // 下段：リンク（ELIMもリンクを出す）
  const repLinks = (row: { name_en?: string; birth_date?: string }) => {
    const hit = latestByKey.get(keyOf(row.name_en, row.birth_date));
    if (!hit) return [];

    const country = hit.country;
    const type = bucketType(hit.bucket);

    if (type === "qualified") {
      return [
        {
          label: `${opts.competition}${opts.edition}`, // "WC2026"
          href: `/wc/${opts.edition}/team/${encodeURIComponent(country)}`,
        },
      ];
    }

    if (type === "po") {
      return [
        {
          label: `${opts.competition}${opts.edition} PO`, // "WC2026 PO"
          href: `/wc/${opts.edition}/team/${encodeURIComponent(country)}`,
        },
      ];
    }

    if (type === "elim") {
      return [
        {
          label: `${opts.competition}${opts.edition} 敗退`, // "WC2026 敗退"
          href: `/wc/${opts.edition}/team/${encodeURIComponent(country)}`,
        },
      ];
    }

    return [];
  };

  return { repLabel, repLinks, maxSnapshot };
}
