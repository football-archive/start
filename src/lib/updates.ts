import fs from "node:fs";
import path from "node:path";

export type UpdateItem = {
  date: string; // YYYY-MM-DD
  title: string;
  category?: string; // clubs | nt | etc
};

function parseCsvLine(line: string): string[] {
  // シンプルCSV想定（titleにカンマ入れない運用ならこれで十分）
  return line.split(",").map((s) => s.trim());
}

export function loadUpdates(limit = 10): UpdateItem[] {
  const filePath = path.resolve(process.cwd(), "src/data/updates.csv");
  const text = fs.readFileSync(filePath, "utf8");

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  // 1行目ヘッダ想定
  const rows = lines.slice(1);

  const items: UpdateItem[] = rows
    .map((line) => {
      const [date, title, category] = parseCsvLine(line);
      if (!date || !title) return null;
      return { date, title, category };
    })
    .filter((v): v is UpdateItem => !!v);

  // date降順（YYYY-MM-DD 前提）
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return items.slice(0, limit);
}

export function latestUpdateDate(category?: string): string | null {
  const items = loadUpdates(9999); // 全件読み込み（軽い）
  const filtered = category
    ? items.filter((x) => x.category === category)
    : items;
  if (filtered.length === 0) return null;
  return filtered[0].date; // loadUpdatesは降順ソート済み
}

export function fmtJP(date: string | null): string {
  if (!date) return "-";
  // YYYY-MM-DD -> YYYY/M/D
  const [y, m, d] = date.split("-").map((s) => Number(s));
  if (!y || !m || !d) return date;
  return `${y}/${m}/${d}`;
}
