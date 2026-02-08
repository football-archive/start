import fs from "fs";
import path from "path";

export type GroupRow = {
  tournament: string; // "WC" など
  edition: string; // "2026" など
  stage: string; // "group" など
  group: string; // "A"〜
  slot: string; // "1"〜
  country_name_ja: string; // 表示用（日本語）
  country_key: string; // callups の country とマッチさせる（現状は日本語でOK運用）
  route_param: string; // /wc/2026/team/[team_key] の [team_key]（現状は日本語運用でもOK）
  is_placeholder: string; // "0" / "1"
  placeholder_code: string; // "UEFA_PO_A" など
  // 追加列があっても壊れないように optional で受ける（例: source_note）
  [key: string]: string;
};

// ★ CSVファイル名はこのままでOK（既に運用中の想定）
const CSV_PATH = path.resolve("src/data/tournament_groups_master.csv");

// クォート対応のCSV 1行パーサ（最低限）
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" はエスケープされたダブルクォート
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): GroupRow[] {
  const rawLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (rawLines.length === 0) return [];

  // ★ BOM除去（これが効かないと tournament 列名が壊れて filter が全滅します）
  const headerLine = rawLines[0].replace(/^\uFEFF/, "");
  const keys = parseCSVLine(headerLine).map((s) => s.trim());

  return rawLines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj: any = {};
    keys.forEach((k, i) => (obj[k] = (values[i] ?? "").trim()));
    return obj as GroupRow;
  });
}

export function loadGroups(
  tournament: string,
  edition: string,
  stage: string = "group",
) {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(raw);

  // tournament列が壊れている時の保険（BOM除去できてれば基本不要だが安全側）
  for (const r of rows) {
    if ((r as any)["﻿tournament"] && !r.tournament) {
      r.tournament = (r as any)["﻿tournament"];
    }
  }

  return rows.filter(
    (r) =>
      r.tournament === tournament && r.edition === edition && r.stage === stage,
  );
}

export function getGroupsList(rows: GroupRow[]) {
  // A,B,C... の順を維持
  return [...new Set(rows.map((r) => r.group))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

export function getGroupCountries(rows: GroupRow[], group: string) {
  // slot順（"1"〜）で返す
  return rows
    .filter((r) => r.group === group)
    .sort((a, b) => Number(a.slot) - Number(b.slot));
}
