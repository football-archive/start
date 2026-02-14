// src/lib/csvSimple.ts
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  // BOM除去
  const s = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" -> "
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      cur = "";
      // CRLF対策
      if (row.length === 1 && row[0] === "" && rows.length === 0) continue;
      rows.push(row.map((x) => x.replace(/\r$/, "")));
      row = [];
      continue;
    }

    cur += ch;
  }

  // last
  row.push(cur);
  rows.push(row.map((x) => x.replace(/\r$/, "")));

  // 空行除去
  const cleaned = rows.filter((r) =>
    r.some((x) => String(x ?? "").trim() !== ""),
  );
  if (cleaned.length === 0) return [];

  const header = cleaned[0].map((h) => String(h ?? "").trim());
  const out: Record<string, string>[] = [];

  for (let i = 1; i < cleaned.length; i++) {
    const r = cleaned[i];
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = String(r[j] ?? "").trim();
    }
    out.push(obj);
  }

  return out;
}
