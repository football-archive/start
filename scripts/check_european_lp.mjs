import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const base = path.join(process.cwd(), 'src', 'data');
const oldPath = path.join(base, 'ucl_league_phase.csv');
const newPath = path.join(base, 'european_league_phase.csv');
const read = (p) => parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, bom: true, relax_quotes: false });
const oldRows = read(oldPath);
const allNewRows = read(newPath);
const newRows = allNewRows.filter((r) => r.competition === 'UCL');
const fields = Object.keys(oldRows[0] ?? {});
const problems = [];
if (oldRows.length !== newRows.length) problems.push(`行数: old=${oldRows.length}, new UCL=${newRows.length}`);
for (let i = 0; i < Math.max(oldRows.length, newRows.length); i++) {
  const a = oldRows[i], b = newRows[i];
  if (!a || !b) continue;
  for (const f of fields) {
    if (a[f] !== b[f]) problems.push(`行${i + 2} ${f}: old=${JSON.stringify(a[f])}, new=${JSON.stringify(b[f])}`);
  }
}
const oldSeasons = [...new Set(oldRows.map(r => r.season))].sort();
const newSeasons = [...new Set(newRows.map(r => r.season))].sort();
if (JSON.stringify(oldSeasons) !== JSON.stringify(newSeasons)) problems.push('シーズン一覧が不一致');
const unique = (rows) => rows.map(r => `${r.season}\t${r.club_key}`).sort();
if (JSON.stringify(unique(oldRows)) !== JSON.stringify(unique(newRows))) problems.push('シーズン・クラブ組み合わせが不一致');
console.log(`旧UCL: ${oldRows.length}行 / 新UCL: ${newRows.length}行 / 新CSV全体: ${allNewRows.length}行`);
console.log(`シーズン: ${oldSeasons.join(', ')}`);
if (problems.length) {
  console.error(`NG: ${problems.length}件の差分`);
  console.error(problems.slice(0, 30).join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: 全列・全行・シーズン・クラブキーが一致（competition列を除く）');
}
