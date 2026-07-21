import fs from "node:fs";
import path from "node:path";

export type TransferWindowRow = {
  season: string;
  window: string;
  league_key: string;
  start_date: string;
  end_date: string;
  note: string;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();

const normalizeKey = (value: unknown) => normalize(value).toLowerCase();

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];

      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);

  return values.map((value) => value.trim());
};

const csvPath = path.join(process.cwd(), "src", "data", "transfer_windows.csv");

export function loadTransferWindows(): TransferWindowRow[] {
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const raw = fs.readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => normalizeKey(header));

  return lines
    .slice(1)
    .map((line) => {
      const columns = parseCsvLine(line);

      const source = Object.fromEntries(
        headers.map((header, index) => [header, normalize(columns[index])]),
      );

      return {
        season: normalize(source.season),
        window: normalizeKey(source.window),
        league_key: normalizeKey(source.league_key),
        start_date: normalize(source.start_date),
        end_date: normalize(source.end_date),
        note: normalize(source.note),
      };
    })
    .filter(
      (row) =>
        row.season &&
        row.window &&
        row.league_key &&
        row.start_date &&
        row.end_date,
    );
}

export function findTransferWindow(
  rows: TransferWindowRow[],
  season: string,
  window: string,
  leagueKey: string,
): TransferWindowRow | undefined {
  const targetSeason = normalize(season);
  const targetWindow = normalizeKey(window);
  const targetLeague = normalizeKey(leagueKey);

  if (!targetSeason || !targetWindow || !targetLeague) {
    return undefined;
  }

  return rows.find(
    (row) =>
      row.season === targetSeason &&
      row.window === targetWindow &&
      row.league_key === targetLeague,
  );
}
