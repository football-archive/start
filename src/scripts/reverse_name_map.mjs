
/**
 * callups_site.csv / club_squads_site.csv -> name_map.csv
 * Run from project root:
 *   node src/scripts/reverse_name_map.mjs [--write]
 *
 * Default is preview-only.
 * Existing name_map entries are never overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'src', 'data');
const mapPath = path.join(DATA, 'name_map.csv');

const targets = [
  ['callups_site.csv', path.join(DATA, 'callups_site.csv')],
  ['club_squads_site.csv', path.join(DATA, 'club_squads_site.csv')],
];

const write = process.argv.includes('--write');
const today = new Date().toISOString().slice(0, 10);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(ROOT, '_work', 'name_map_reverse');

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: false,
  });
}

function normDate(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(
    /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:\D|$)/
  );
  return m
    ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    : '';
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s)
    ? `"${s.replaceAll('"', '""')}"`
    : s;
}

function toCsv(rows, columns) {
  return '\uFEFF' +
    [
      columns.join(','),
      ...rows.map(r =>
        columns.map(c => csvCell(r[c])).join(',')
      ),
    ].join('\r\n') +
    '\r\n';
}

function saveCsv(file, rows, columns) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv(rows, columns), 'utf8');
}

function keyOf(en, birth) {
  return `${en}|${birth}`;
}

for (const [, p] of targets) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing: ${p}`);
  }
}
if (!fs.existsSync(mapPath)) {
  throw new Error(`Missing: ${mapPath}`);
}

const mapRows = readCsv(mapPath);
const mapColumns = Object.keys(mapRows[0] ?? {});

const requiredMap = [
  'key',
  'name_en',
  'birth_date',
  'name_ja',
  'source',
  'updated_at',
];

if (!requiredMap.every(c => mapColumns.includes(c))) {
  throw new Error(
    'name_map.csv headers differ from expected schema'
  );
}

// 既存辞書のキーを保護
const existing = new Set();

for (const r of mapRows) {
  const en = String(r.name_en ?? '').trim();
  const birth = normDate(r.birth_date);

  if (en && birth) {
    existing.add(keyOf(en, birth));
  }

  // 旧形式のkey列も考慮
  const rawKey = String(r.key ?? '').trim();

  if (rawKey) {
    const i = rawKey.lastIndexOf('|');

    if (i > 0) {
      const kbirth = normDate(rawKey.slice(i + 1));

      if (kbirth) {
        existing.add(
          keyOf(rawKey.slice(0, i).trim(), kbirth)
        );
      }
    }
  }
}

// 逆反映候補を収集
const candidates = new Map();

const skipped = {
  missingIdentity: 0,
  missingJa: 0,
  placeholder: 0,
  alreadyInMap: 0,
};

for (const [fileName, p] of targets) {
  for (const row of readCsv(p)) {
    const en = String(row.name_en ?? '').trim();
    const birth = normDate(row.birth_date);
    const ja = String(row.name_ja ?? '').trim();

    if (!en || !birth) {
      skipped.missingIdentity++;
      continue;
    }

    if (!ja) {
      skipped.missingJa++;
      continue;
    }

    if (ja === en) {
      skipped.placeholder++;
      continue;
    }

    const key = keyOf(en, birth);

    if (existing.has(key)) {
      skipped.alreadyInMap++;
      continue;
    }

    if (!candidates.has(key)) {
      candidates.set(key, {
        name_en: en,
        birth_date: birth,
        names: new Map(),
      });
    }

    const entry = candidates.get(key);

    if (!entry.names.has(ja)) {
      entry.names.set(ja, {
        count: 0,
        sources: new Set(),
      });
    }

    const info = entry.names.get(ja);
    info.count++;
    info.sources.add(fileName);
  }
}

// 表記一致のみ追加、競合は隔離
const additions = [];
const conflicts = [];

for (const [key, entry] of candidates) {
  const options = [...entry.names.entries()];

  if (options.length !== 1) {
    for (const [ja, info] of options) {
      conflicts.push({
        key,
        name_en: entry.name_en,
        birth_date: entry.birth_date,
        name_ja_candidate: ja,
        occurrences: info.count,
        source_files: [...info.sources].join(';'),
      });
    }
    continue;
  }

  const [ja] = options[0];

  additions.push({
    key,
    name_en: entry.name_en,
    birth_date: entry.birth_date,
    name_ja: ja,
    source: 'manual_csv',
    updated_at: today,
  });
}

additions.sort((a, b) =>
  a.key.localeCompare(b.key, 'en')
);
conflicts.sort((a, b) =>
  a.key.localeCompare(b.key, 'en')
);

const addColumns = requiredMap;

const conflictColumns = [
  'key',
  'name_en',
  'birth_date',
  'name_ja_candidate',
  'occurrences',
  'source_files',
];

const previewPath = path.join(
  outDir,
  'name_map_additions_preview.csv'
);
const conflictPath = path.join(
  outDir,
  'name_map_conflicts.csv'
);

saveCsv(previewPath, additions, addColumns);
saveCsv(conflictPath, conflicts, conflictColumns);

console.log(
  `Mode: ${write ? 'WRITE' : 'PREVIEW (no changes to name_map.csv)'}`
);
console.log(`Existing name_map rows: ${mapRows.length}`);
console.log(`Unique new keys: ${candidates.size}`);
console.log(`Safe additions: ${additions.length}`);
console.log(
  `Conflicting keys: ${new Set(conflicts.map(r => r.key)).size}`
);
console.log(`Skipped rows: ${JSON.stringify(skipped)}`);
console.log(`Preview: ${previewPath}`);
console.log(`Conflicts: ${conflictPath}`);

if (write) {
  const backupDir = path.join(
    ROOT,
    '_backup',
    today
  );

  fs.mkdirSync(backupDir, { recursive: true });

  const backupPath = path.join(
    backupDir,
    `name_map.before_reverse_${stamp}.csv`
  );

  fs.copyFileSync(mapPath, backupPath);

  // 既存行を維持して、新規キーだけ末尾に追加
  const all = [...mapRows, ...additions];

  saveCsv(mapPath, all, mapColumns);

  console.log(
    `Updated: ${mapPath} (${all.length} rows)`
  );
  console.log(`Backup: ${backupPath}`);
}
