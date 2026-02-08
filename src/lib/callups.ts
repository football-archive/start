import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export type CallupRow = {
  competition: string;
  edition: string;
  confederation: string;
  confederation_bucket?: string; // ← 追加！
  country: string;
  nt_shirt_no?: string;
  position_primary?: "GK" | "DF" | "MF" | "FW" | string;
  is_star?: string;
  name_en: string;
  name_ja?: string;
  birth_date?: string;
  height_cm?: string;
  current_club?: string;
  [key: string]: any;
};

function pickLatestBySnapshot(rows: CallupRow[]): CallupRow[] {
  const map = new Map<string, CallupRow>();

  const toTime = (d?: string) => {
    if (!d) return 0;
    const m = d.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  };

  for (const r of rows) {
    const key = [r.competition, r.edition, r.country, r.name_en].join("||");

    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      continue;
    }

    const tPrev = toTime(prev.snapshot_date);
    const tNow = toTime(r.snapshot_date);

    if (tNow >= tPrev) {
      map.set(key, r);
    }
  }

  return [...map.values()];
}

export function loadCallups(): CallupRow[] {
  const csvPath = path.join(process.cwd(), "src", "data", "callups_site.csv");
  const csv = fs.readFileSync(csvPath, "utf-8");

  const parsed = Papa.parse<CallupRow>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = (parsed.data ?? []).filter((r) => r && r.country && r.name_en);

  // ✅ 追加：snapshot_date が複数ある場合、国×大会(competition/edition)ごとに最新1枚だけ残す
  // 目的：代表ページで古いスナップショットが混ざって二重表示されるのを防ぐ
  const toKeyDate = (v: unknown): string => {
    const s = String(v ?? "").trim();
    if (!s) return "";

    // yyyy-mm-dd / yyyy/mm/dd / yyyy/m/d を吸収
    let m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) {
      const y = m[1];
      const mm = String(Number(m[2])).padStart(2, "0");
      const dd = String(Number(m[3])).padStart(2, "0");
      return `${y}${mm}${dd}`; // 比較しやすい
    }

    // 念のため：先頭に yyyy が来る系を拾う
    m = s.match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);
    if (m) {
      const y = m[1];
      const mm = String(Number(m[2])).padStart(2, "0");
      const dd = String(Number(m[3])).padStart(2, "0");
      return `${y}${mm}${dd}`;
    }

    return "";
  };

  // groupKey: competition + edition + country
  const groupMax = new Map<string, string>();
  for (const r of rows) {
    const comp = String((r as any).competition ?? "").trim();
    const ed = String((r as any).edition ?? "").trim();
    const country = String((r as any).country ?? "").trim();
    if (!country) continue;

    const gk = `${comp}|||${ed}|||${country}`;
    const d = toKeyDate((r as any).snapshot_date);
    const cur = groupMax.get(gk) ?? "";
    if (d && d > cur) groupMax.set(gk, d);
  }

  const latestOnly = rows.filter((r) => {
    const comp = String((r as any).competition ?? "").trim();
    const ed = String((r as any).edition ?? "").trim();
    const country = String((r as any).country ?? "").trim();
    const gk = `${comp}|||${ed}|||${country}`;

    const max = groupMax.get(gk) ?? "";
    const d = toKeyDate((r as any).snapshot_date);

    // snapshot_date が空の行は、同グループに max があるなら落とす
    if (max) return d === max;
    return true; // そもそもsnapshot_date運用してないデータならそのまま
  });

  return latestOnly;
}

export function countrySlug(country: string): string {
  return encodeURIComponent(country.trim());
}

export function countryFromSlug(slug: string): string {
  return decodeURIComponent(slug);
}

// 表示用の並び順：GK→DF→MF→FW→その他、背番号（番号あり→昇順→番号なし）→名前
export function sortForRoster(a: CallupRow, b: CallupRow): number {
  const posOrder: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

  const pa = String(a.position_primary ?? "").trim();
  const pb = String(b.position_primary ?? "").trim();

  const oa = pa in posOrder ? posOrder[pa] : 9;
  const ob = pb in posOrder ? posOrder[pb] : 9;
  if (oa !== ob) return oa - ob;

  // ---- 背番号：番号ありを先、番号あり同士は昇順 ----
  const sa = String((a as any).nt_shirt_no ?? "").trim();
  const sb = String((b as any).nt_shirt_no ?? "").trim();

  const aHasNo = sa !== "" && sa !== "-" && sa !== "—";
  const bHasNo = sb !== "" && sb !== "-" && sb !== "—";

  if (aHasNo && bHasNo) {
    const na = Number(sa);
    const nb = Number(sb);

    // 念のため「数値化できない文字」が混ざってた場合の保険
    const aNumOk = Number.isFinite(na);
    const bNumOk = Number.isFinite(nb);

    if (aNumOk && bNumOk && na !== nb) return na - nb;
    if (aNumOk !== bNumOk) return aNumOk ? -1 : 1;

    // ここまで来たら同値 or 数値化できない同士 → 文字列で比較
    const sdiff = sa.localeCompare(sb, "en");
    if (sdiff !== 0) return sdiff;
  } else if (aHasNo !== bHasNo) {
    return aHasNo ? -1 : 1;
  }

  // ---- 最後：名前 ----
  const nameA = String(a.name_en ?? "");
  const nameB = String(b.name_en ?? "");
  return nameA.localeCompare(nameB, "en");
}
