import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type Row = Record<string, any>;

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "src", "data");
const NAME_MAP_PATH = path.join(DATA_DIR, "name_map.csv");
const FAIL_MAP_PATH = path.join(DATA_DIR, "name_map_fail.csv");

// 対象CSV（国・クラブ一本化）
const TARGETS = [
  path.join(DATA_DIR, "callups_site.csv"),
  path.join(DATA_DIR, "club_squads_site.csv"),
];

type NameMapEntry = {
  /** canonical key: name_en|birth_date (YYYY-MM-DD) */
  key: string;
  name_en: string;
  birth_date: string;
  name_ja: string;
  source?: string;
  updated_at?: string;
};

type FailReason = "notfound" | "ambiguous" | "no_ja" | "api_error";

type FailEntry = {
  key: string; // canonical: name_en_norm|birth_date
  reason: FailReason;
  checked_at: string; // ISO
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 日付の正規化：YYYY-MM-DD に寄せる（時刻が付いていても切り落とす） */
const normDate = (s: string) => {
  const t0 = String(s ?? "").trim();
  if (!t0) return "";

  // 1) ISO日時/日時付き：先頭10文字が YYYY-MM-DD ならそれを採用
  const iso10 = t0.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso10) return iso10[1];

  // 2) スラッシュ/ドット区切り（時刻が後ろにあってもOK）
  const m = t0.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mm = m[2].padStart(2, "0");
    const dd = m[3].padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  return "";
};

// "O. Baumann" → "O Baumann" / 連続スペース潰し
const normName = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(/[’'`´]/g, "'")
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/\s+/g, " ");

const foldDiacritics = (s: string) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

// 記号ゆるめ（検索用）：- ' などをスペース化して潰す
const loosenName = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/[’']/g, "'")
    .replace(/[-‐-–—]/g, " ")
    .replace(/\s+/g, " ");

const keyOf = (name_en: string, birth_date: string) =>
  `${String(name_en ?? "").trim()}|${String(birth_date ?? "").trim()}`;

/** 互換：複数の正規化パターンでキー候補を作る */
const candidateKeys = (name_en_raw: string, birth_norm: string) => {
  const raw = String(name_en_raw ?? "").trim();

  const v1 = raw;
  const v2 = normName(raw);
  const v3 = foldDiacritics(v1);
  const v4 = foldDiacritics(v2);

  const uniq = new Set<string>([
    keyOf(v1, birth_norm),
    keyOf(v2, birth_norm),
    keyOf(v3, birth_norm),
    keyOf(v4, birth_norm),
  ]);

  // loosenも候補に足す（揺れ吸収）
  const loose = loosenName(raw);
  if (loose && loose !== raw) {
    uniq.add(keyOf(loose, birth_norm));
    uniq.add(keyOf(foldDiacritics(loose), birth_norm));
  }

  return Array.from(uniq);
};

function readCsv(filePath: string): Row[] {
  const csv = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return (parsed.data ?? []).filter((r) => r && Object.keys(r).length > 0);
}

function writeCsv(filePath: string, rows: Row[]) {
  // Excel対策：UTF-8 with BOM + CRLF
  const csvBody = Papa.unparse(rows, { quotes: false, newline: "\r\n" });
  const csv = "\ufeff" + csvBody;
  fs.writeFileSync(filePath, csv, "utf-8");
}

function ensureNameMapFile() {
  if (!fs.existsSync(NAME_MAP_PATH)) {
    fs.writeFileSync(
      NAME_MAP_PATH,
      "key,name_en,birth_date,name_ja,source,updated_at\n",
      "utf-8",
    );
  }
}

function ensureFailMapFile() {
  if (!fs.existsSync(FAIL_MAP_PATH)) {
    fs.writeFileSync(FAIL_MAP_PATH, "key,reason,checked_at\n", "utf-8");
  }
}

function detectDelimiterFromHeader(raw: string): "," | "\t" {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  if (firstLine.includes(",")) return ",";
  if (firstLine.includes("\t")) return "\t";
  return ",";
}

type NameMapStore = {
  /** alias -> entry (for lookup) */
  index: Map<string, NameMapEntry>;
  /** canonical key -> entry (for writing) */
  canon: Map<string, NameMapEntry>;
};

function readNameMap(): NameMapStore {
  ensureNameMapFile();

  const raw = fs.readFileSync(NAME_MAP_PATH, "utf-8").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiterFromHeader(raw);

  const parsed = Papa.parse<NameMapEntry>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter,
  });

  const rows = (parsed.data ?? []).filter(
    (r) => r && Object.keys(r).length > 0,
  );

  const canon = new Map<string, NameMapEntry>();
  const index = new Map<string, NameMapEntry>();

  for (const r of rows) {
    const name_en = String((r as any).name_en ?? "").trim();
    const birth = normDate(String((r as any).birth_date ?? ""));
    const name_ja = String((r as any).name_ja ?? "").trim();
    if (!name_en || !birth || !name_ja) continue;

    const entry: NameMapEntry = {
      key: keyOf(name_en, birth),
      name_en,
      birth_date: birth,
      name_ja,
      source: String((r as any).source ?? ""),
      updated_at: String((r as any).updated_at ?? ""),
    };

    // canonical
    canon.set(entry.key, entry);

    // 既存の key 列があればそれも alias として登録（互換）
    const keyCol = String((r as any).key ?? "").trim();
    if (keyCol) index.set(keyCol, entry);

    // alias（正規化キー群）
    for (const k of candidateKeys(name_en, birth)) index.set(k, entry);
  }

  return { index, canon };
}

function writeNameMap(store: NameMapStore) {
  const rows = Array.from(store.canon.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  writeCsv(NAME_MAP_PATH, rows);
}

function upsertNameMap(
  store: NameMapStore,
  name_en_raw: string,
  birth: string,
  name_ja: string,
) {
  const name_en = normName(String(name_en_raw ?? "").trim());
  const key = keyOf(name_en, birth);
  const now = new Date().toISOString().slice(0, 10);

  const entry: NameMapEntry = {
    key,
    name_en,
    birth_date: birth,
    name_ja,
    source: "wikidata",
    updated_at: now,
  };

  store.canon.set(key, entry);

  // alias（raw/正規化/ダイアクリティカル/loosen）
  for (const k of candidateKeys(name_en_raw, birth)) store.index.set(k, entry);
}

function readFailMap(): Map<string, FailEntry> {
  ensureFailMapFile();

  const raw = fs.readFileSync(FAIL_MAP_PATH, "utf-8").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiterFromHeader(raw);

  const parsed = Papa.parse<FailEntry>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter,
  });

  const rows = (parsed.data ?? []).filter(
    (r) => r && Object.keys(r).length > 0,
  );

  const map = new Map<string, FailEntry>();
  for (const r of rows) {
    const key = String((r as any).key ?? "").trim();
    const reason = String((r as any).reason ?? "").trim() as FailReason;
    const checked_at = String((r as any).checked_at ?? "").trim();
    if (!key || !reason || !checked_at) continue;
    map.set(key, { key, reason, checked_at });
  }
  return map;
}

function writeFailMap(map: Map<string, FailEntry>) {
  const rows = Array.from(map.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  writeCsv(FAIL_MAP_PATH, rows);
}

// ----------------- Wikidata API -----------------
type LookupKey = { name_en_norm: string; birth: string };

type ApiLookupResult =
  | { status: "ok"; name_ja: string }
  | {
      status: "skip";
      reason: FailReason;
    };

async function fetchJsonWithTimeout(
  url: string,
  tries = 4,
  timeoutMs = 15000,
): Promise<any> {
  let wait = 800;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: {
          "User-Agent": "soccer-db-name-ja-enricher/2.5 (personal project)",
          Accept: "application/json",
        },
      });
      const text = await res.text();
      clearTimeout(t);

      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status)) {
          await sleep(wait);
          wait = Math.min(Math.floor(wait * 1.7), 8000);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return JSON.parse(text);
    } catch {
      clearTimeout(t);
      await sleep(wait);
      wait = Math.min(Math.floor(wait * 1.7), 8000);
    }
  }
  throw new Error("request failed");
}

function wdBirthToYmd(entity: any): string {
  const time =
    entity?.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time ?? "";
  const m = String(time).match(/^\+?(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

async function searchIds(nameEn: string): Promise<string[]> {
  const q = encodeURIComponent(nameEn);
  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json` +
    `&language=en&uselang=en&limit=20&search=${q}`;
  const searchJson = await fetchJsonWithTimeout(searchUrl, 4, 15000);
  return (searchJson?.search ?? [])
    .map((x: any) => String(x?.id ?? ""))
    .filter(Boolean)
    .slice(0, 20);
}

async function getEntities(ids: string[]) {
  const idsParam = encodeURIComponent(ids.join("|"));
  // sitelinksも取る（jawiki.title fallback 用）
  const getUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=ja|en&props=labels|claims|sitelinks&ids=${idsParam}`;
  return await fetchJsonWithTimeout(getUrl, 4, 15000);
}

async function lookupOneViaApiCore(
  nameEn: string,
  birthYmd: string,
): Promise<ApiLookupResult> {
  // 2段階検索：原文→ダイアクリティカル除去→loosen
  const candidates = [
    nameEn,
    foldDiacritics(nameEn),
    loosenName(nameEn),
    foldDiacritics(loosenName(nameEn)),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  try {
    for (const q of candidates) {
      const ids = await searchIds(q);
      if (ids.length === 0) continue;

      const entJson: any = await getEntities(ids);
      const entities = entJson?.entities ?? {};
      const matches: { id: string; ja?: string }[] = [];

      for (const id of ids) {
        const e = entities[id];
        if (!e) continue;
        const ymd = wdBirthToYmd(e);
        if (ymd && ymd === birthYmd) {
          // jaラベルが無い国が多いので jawiki.title をフォールバックに使う
          const jaLabel = e?.labels?.ja?.value ? String(e.labels.ja.value) : "";
          const jaWiki = e?.sitelinks?.jawiki?.title
            ? String(e.sitelinks.jawiki.title)
            : "";
          const ja = jaLabel || jaWiki || undefined;
          matches.push({ id, ja });
        }
      }

      const birthYear = (ymd: string) =>
        String(ymd).match(/^(\d{4})-/)?.[1] ?? "";

      if (matches.length === 0) {
        // ---- fallback: birth YEAR match + jawiki exists (safe-ish) ----
        const by = birthYear(birthYmd);
        if (by) {
          const yearHits: { id: string; ja?: string }[] = [];

          for (const id of ids) {
            const e = entities[id];
            if (!e) continue;

            const ymd = wdBirthToYmd(e);
            if (!ymd) continue;
            if (birthYear(ymd) !== by) continue;

            // jawiki/title or ja label
            const jaLabel = e?.labels?.ja?.value
              ? String(e.labels.ja.value)
              : "";
            const jaWiki = e?.sitelinks?.jawiki?.title
              ? String(e.sitelinks.jawiki.title)
              : "";
            const ja = jaLabel || jaWiki || undefined;

            // jawiki か jaLabel が無いなら誤爆しやすいので除外
            if (!ja) continue;

            yearHits.push({ id, ja });
          }

          if (yearHits.length === 1) {
            return { status: "ok", name_ja: yearHits[0].ja! };
          }
          if (yearHits.length >= 2) {
            return { status: "skip", reason: "ambiguous" };
          }
        }
      }

      if (matches.length === 1) {
        const ja = matches[0].ja;
        if (!ja) return { status: "skip", reason: "no_ja" };
        return { status: "ok", name_ja: ja };
      }

      if (matches.length >= 2) return { status: "skip", reason: "ambiguous" };
      // matches==0 → 次の検索語へ
    }
    return { status: "skip", reason: "notfound" };
  } catch {
    return { status: "skip", reason: "api_error" };
  }
}

// api_error だけ1回だけ再試行
async function lookupOneViaApi(
  nameEn: string,
  birthYmd: string,
): Promise<ApiLookupResult> {
  const r1 = await lookupOneViaApiCore(nameEn, birthYmd);
  if (r1.status === "skip" && r1.reason === "api_error") {
    await sleep(600);
    const r2 = await lookupOneViaApiCore(nameEn, birthYmd);
    return r2;
  }
  return r1;
}

async function fetchJaNamesBatch(
  keys: LookupKey[],
  opts: {
    concurrency: number;
    delayMs: number;
    debug?: boolean;
    offset: number;
    total: number;
  },
) {
  const out = new Map<string, ApiLookupResult>();

  const CONCURRENCY = Math.max(1, Math.min(10, opts.concurrency));
  const delayMs = Math.max(0, opts.delayMs);

  let idx = 0;

  async function worker() {
    while (idx < keys.length) {
      const i = idx++;
      const k = keys[i];
      const kk = keyOf(k.name_en_norm, k.birth);

      if (opts.debug) {
        console.log(
          `[wikidata-api] ${opts.offset + i + 1}/${opts.total} ${k.name_en_norm} ${k.birth}`,
        );
      }

      const r = await lookupOneViaApi(k.name_en_norm, k.birth);
      out.set(kk, r);

      if (delayMs) await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return out;
}

// ----------------- CLI -----------------
function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const kv: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) kv[m[1]] = m[2];
  }
  return { args, kv };
}

function usage() {
  console.log(
    `
Usage:
  npx tsx src/scripts/enrich_name_ja.ts [--callups|--clubs] [options]

Options:
  --treat-same-as-empty   name_ja==name_en を「未設定扱い」にする
  --lookup                name_map に無いものをWikidata APIで補完（辞書を育てる）
  --limit=100             lookupするユニーク件数の上限（0/未指定=無制限）
  --skip-days=30          no_ja/notfound/ambiguous を何日スキップするか（api_errorは常に再挑戦）
  --country=Japan         callups_site.csv を国で絞る（任意）
  --dry-run               書き込みしない（バックアップも作らない）
  --overwrite             既存name_jaも上書き（通常は使わない）
  --concurrency=3         API同時実行数（1-10）
  --delay=150             API 1件ごとの待機ms（礼儀）
  --debug                 進捗ログを詳細に出す
  --dump=tmp/enrich_failures.csv  lookup失敗（notfound/no_ja/ambiguous/api_error）をCSV出力
`.trim(),
  );
}

// dump（Bおすすめ）用：対象に応じて「文脈列」を揃える
function buildFailureRow(params: {
  target: string;
  reason: string;
  name_en: string;
  birth_date: string;
  ctx: Row;
}) {
  const { target, reason, name_en, birth_date, ctx } = params;

  // callups
  const isCallups = target.includes("callups");
  if (isCallups) {
    return {
      target,
      competition: String(ctx.competition ?? ""),
      edition: String(ctx.edition ?? ""),
      confederation: String(ctx.confederation ?? ""),
      confederation_bucket: String(ctx.confederation_bucket ?? ""),
      country: String(ctx.country ?? ""),
      current_club: String(ctx.current_club ?? ""),
      snapshot_date: String(ctx.snapshot_date ?? ""),
      source: String(ctx.source ?? ""),
      name_en,
      birth_date,
      reason,
    };
  }

  // clubs
  return {
    target,
    season: String(ctx.season ?? ""),
    league: String(ctx.league ?? ""),
    club: String(ctx.club ?? ""),
    league_key: String(ctx.league_key ?? ""),
    club_key: String(ctx.club_key ?? ""),
    snapshot_date: String(ctx.snapshot_date ?? ""),
    source: String(ctx.source ?? ""),
    name_en,
    birth_date,
    reason,
  };
}

async function main() {
  const { args, kv } = parseArgs(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    usage();
    return;
  }

  const treatSameAsEmpty = args.has("--treat-same-as-empty");
  const onlyCallups = args.has("--callups");
  const onlyClubs = args.has("--clubs");
  const lookup = args.has("--lookup");
  const dryRun = args.has("--dry-run");
  const overwrite = args.has("--overwrite");
  const debug = args.has("--debug");

  const limit = Number(kv["limit"] ?? "0"); // lookup件数制限（ユニーク）
  const skipDays = Number(kv["skip-days"] ?? "30");
  const skipMs = Math.max(0, skipDays) * 24 * 60 * 60 * 1000;

  const countryFilter = String(kv["country"] ?? "").trim();
  const concurrency = Number(kv["concurrency"] ?? "3");
  const delayMs = Number(kv["delay"] ?? "150");
  const dumpPath = String(kv["dump"] ?? "").trim();

  const targets = onlyCallups
    ? [TARGETS[0]]
    : onlyClubs
      ? [TARGETS[1]]
      : TARGETS;

  const store = readNameMap();
  const failMap = readFailMap();
  const nowMs = Date.now();

  function shouldSkipFail(key: string): boolean {
    const f = failMap.get(key);
    if (!f) return false;
    if (f.reason === "api_error") return false; // 常に再挑戦
    const t = new Date(f.checked_at).getTime();
    if (!Number.isFinite(t)) return false;
    return nowMs - t < skipMs;
  }

  let filledTotal = 0;
  let candidatesTotal = 0;
  let missingBeforeLookupTotal = 0;
  let lookupsTotal = 0;

  const reasonTotal: Record<string, number> = {
    ok: 0,
    notfound: 0,
    ambiguous: 0,
    no_ja: 0,
    api_error: 0,
  };

  // dump用：失敗一覧（文脈付き）
  const failures: Row[] = [];

  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) {
      console.log(`[skip] not found: ${filePath}`);
      continue;
    }

    const rows = readCsv(filePath);

    // バックアップ（当日分が無ければ作る）：_backup/YYYY-MM-DD/ に退避
    const date = new Date().toISOString().slice(0, 10);
    const backupDir = path.join(ROOT, "_backup", date);
    if (!dryRun) fs.mkdirSync(backupDir, { recursive: true });

    const base = path.basename(filePath, path.extname(filePath)); // callups_site
    const bakPath = path.join(backupDir, `${base}.bak_${date}.csv`);

    if (!fs.existsSync(bakPath) && !dryRun) fs.copyFileSync(filePath, bakPath);

    // fill対象：name_en + birth_date があり、name_jaが空（またはoverwrite）
    const candidates = rows.filter((r) => {
      if (countryFilter && String(r.country ?? "").trim() !== countryFilter)
        return false;

      const nameEn = String(r.name_en ?? "").trim();
      const birth = normDate(String(r.birth_date ?? ""));
      if (!nameEn || !birth) return false;

      const ja = String(r.name_ja ?? "").trim();
      const en = String(r.name_en ?? "").trim();
      const hasJa = ja.length > 0;

      // 「name_ja が name_en と同じ」は仮置き扱いで“未設定”にする
      const isPlaceholder = treatSameAsEmpty && hasJa && en && ja === en;

      if (!overwrite) {
        if (hasJa && !isPlaceholder) return false;
      }

      return true;
    });

    candidatesTotal += candidates.length;

    // まず辞書で埋める（超高速）
    let filledByMap = 0;
    const stillMissing: { row: Row; name_en_raw: string; birth: string }[] = [];

    for (const r of candidates) {
      const name_en_raw = String(r.name_en ?? "").trim();
      const birth = normDate(String(r.birth_date ?? ""));

      const keys = candidateKeys(name_en_raw, birth);
      let hit = "";
      for (const k of keys) {
        hit = store.index.get(k)?.name_ja ?? "";
        if (hit) break;
      }

      if (hit) {
        r.name_ja = hit;
        filledByMap++;
      } else {
        stillMissing.push({ row: r, name_en_raw, birth });
      }
    }

    filledTotal += filledByMap;
    missingBeforeLookupTotal += stillMissing.length;

    console.log(
      `\n[target] ${path.basename(filePath)} rows=${rows.length} candidates=${candidates.length} filled_by_map=${filledByMap} missing=${stillMissing.length}` +
        (countryFilter ? ` country=${countryFilter}` : "") +
        (overwrite ? ` overwrite=ON` : ""),
    );

    // lookupしないなら書き戻して終了
    if (!lookup) {
      if (!dryRun) writeCsv(filePath, rows);
      continue;
    }

    // key -> 文脈行（dump用に保存）
    const ctxByKey = new Map<string, Row>();

    // Wikidataへ問い合わせるキー集合（ユニーク化）
    const uniq = new Map<string, LookupKey>();
    for (const m of stillMissing) {
      const name_en_norm = normName(m.name_en_raw);
      const kk = keyOf(name_en_norm, m.birth);
      if (!uniq.has(kk)) uniq.set(kk, { name_en_norm, birth: m.birth });
      if (!ctxByKey.has(kk)) ctxByKey.set(kk, m.row);
    }

    const uniqAll = Array.from(uniq.values());

    // fail_mapでスキップ（no_ja/notfound/ambiguousは一定期間除外）
    const uniqFiltered = uniqAll.filter((k) => {
      const kk = keyOf(k.name_en_norm, k.birth);
      return !shouldSkipFail(kk);
    });
    const skipped = uniqAll.length - uniqFiltered.length;

    // limit はスキップ後に適用（枠を無駄にしない）
    const uniqKeys = limit > 0 ? uniqFiltered.slice(0, limit) : uniqFiltered;

    console.log(
      `[lookup] unique=${uniqAll.length} -> filtered=${uniqFiltered.length}` +
        (skipped ? ` (skipped=${skipped}, skip-days=${skipDays})` : "") +
        ` -> run=${uniqKeys.length} (limit=${limit || "none"})`,
    );

    // バッチ問い合わせ
    const chunkSize = 40;
    let resolvedUnique = 0;
    let filledRowsAfterLookup = 0;

    for (let offset = 0; offset < uniqKeys.length; offset += chunkSize) {
      const chunk = uniqKeys.slice(offset, offset + chunkSize);

      const results = await fetchJaNamesBatch(chunk, {
        concurrency,
        delayMs,
        debug,
        offset,
        total: uniqKeys.length,
      });

      lookupsTotal += chunk.length;

      for (const k of chunk) {
        const kk = keyOf(k.name_en_norm, k.birth);
        const r = results.get(kk);
        if (!r) continue;

        if (r.status === "ok") {
          reasonTotal.ok++;
          resolvedUnique++;
          upsertNameMap(store, k.name_en_norm, k.birth, r.name_ja);
        } else {
          reasonTotal[r.reason] = (reasonTotal[r.reason] ?? 0) + 1;

          // fail_mapへ記録（次回以降のスキップ判定に使う）
          failMap.set(kk, {
            key: kk,
            reason: r.reason,
            checked_at: new Date().toISOString(),
          });

          // dump用：文脈付きで記録
          const ctx = ctxByKey.get(kk) ?? {};
          failures.push(
            buildFailureRow({
              target: path.basename(filePath),
              reason: r.reason,
              name_en: k.name_en_norm,
              birth_date: k.birth,
              ctx,
            }),
          );
        }
      }

      // バッチ間の礼儀
      await sleep(250);
    }

    // rows側へ反映（辞書が増えたので再度当てる）
    for (const m of stillMissing) {
      const keys = candidateKeys(m.name_en_raw, m.birth);
      let hit = "";
      for (const k of keys) {
        hit = store.index.get(k)?.name_ja ?? "";
        if (hit) break;
      }
      if (hit) {
        m.row.name_ja = hit;
        filledRowsAfterLookup++;
      }
    }

    filledTotal += filledRowsAfterLookup;

    const remaining = Math.max(0, stillMissing.length - filledRowsAfterLookup);

    console.log(
      `[lookup result] resolved_unique=${resolvedUnique}, filled_rows=${filledRowsAfterLookup}, remaining=${remaining}`,
    );

    if (!dryRun) writeCsv(filePath, rows);
  }

  if (!dryRun) {
    writeNameMap(store);
    writeFailMap(failMap);
  }

  // dump出力
  if (dumpPath) {
    const outPath = path.isAbsolute(dumpPath)
      ? dumpPath
      : path.join(ROOT, dumpPath);

    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    writeCsv(outPath, failures);
    console.log(`[dump] failures: ${outPath} rows=${failures.length}`);
  }

  console.log(`\n=== summary ===`);
  console.log(
    `targets: ${onlyCallups ? "callups" : onlyClubs ? "clubs" : "all"}`,
  );
  console.log(`candidates_total: ${candidatesTotal}`);
  console.log(`filled_total: ${filledTotal}`);
  console.log(`missing_before_lookup_total: ${missingBeforeLookupTotal}`);
  console.log(`lookups_total: ${lookupsTotal}`);
  console.log(`name_map size: ${store.canon.size}`);
  if (lookup) {
    console.log(
      `lookup_stats: ok=${reasonTotal.ok} notfound=${reasonTotal.notfound} ambiguous=${reasonTotal.ambiguous} no_ja=${reasonTotal.no_ja} api_error=${reasonTotal.api_error}`,
    );
  }
  console.log(
    `mode: ${lookup ? "fill+lookup" : "fill-only"}${dryRun ? " (dry-run)" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
