import fs from "fs";
import XLSX from "xlsx";
import path from "path";

const WORK_DIR = "_work";
const INPUT = path.join(WORK_DIR, "Callups_update_WC2026.xlsx");
const OUTPUT = path.join(WORK_DIR, "callups_tm_converted.csv");

const MASTER_SHEET = "Country_URL_Master";
const RAW_SHEET = "RAW";

const COMPETITION = "WC";
const EDITION = 2026;

const today = new Date().toISOString().slice(0, 10);
const SOURCE = "Transfermarkt (copypaste)";

// ====== 国名（RAWが日本語になったときの master 引き用） ======
const COUNTRY_JA_TO_EN: Record<string, string> = {
  カメルーン: "Cameroon",
  ナイジェリア: "Nigeria",
  ジョージア: "Georgia",
  スロベニア: "Slovenia",
  ハンガリー: "Hungary",
  ボリビア: "Bolivia",
  ジャマイカ: "Jamaica",
  ニューカレドニア: "New Caledonia",
  スリナム: "Suriname",
  コンゴ民主共和国: "Democratic Republic of the Congo",
  イラク: "Iraq",
  // 必要に応じて追加
};

function normalizeCountryForMaster(rawCountry: string) {
  return COUNTRY_JA_TO_EN[rawCountry] ?? rawCountry;
}

// ====== utils ======
function keyNormalize(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeBucket(b?: string) {
  if (!b) return "";
  if (b === "Qualified") return "QUALIFIED"; // 指定どおり
  return b;
}

// Excelの Date / "dd/mm/yyyy" / "yyyy/mm/dd" / "(年齢)" 付きなどを YYYY/M/D に
function normalizeDateAny(v: unknown) {
  if (!v) return "";

  // ExcelがDate型で保持している場合
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}/${v.getMonth() + 1}/${v.getDate()}`;
  }

  // Excelシリアル日付（number）の場合
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y && d.m && d.d) {
      return `${d.y}/${d.m}/${d.d}`;
    }
  }

  const s = String(v).trim();
  if (!s) return "";

  // yyyy/mm/dd
  const mYMD = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (mYMD) return `${mYMD[1]}/${Number(mYMD[2])}/${Number(mYMD[3])}`;

  // dd/mm/yyyy
  const mDMY = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mDMY) return `${mDMY[3]}/${Number(mDMY[2])}/${Number(mDMY[1])}`;

  return "";
}

function normalizeHeight(h: unknown) {
  const s = String(h ?? "").trim();
  if (!s || s === "-") return "";

  // "1,83m" / "1.83m" / "1,83 m"
  const m = s.match(/(\d)[,.](\d+)\s*m/i);
  if (!m) return "";
  const meters = parseFloat(`${m[1]}.${m[2]}`);
  return String(Math.round(meters * 100));
}

// 日本語/英語ポジを GK/DF/MF/FW に寄せる
function mapPosLabelToPrimary(label: string) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const s = raw.toLowerCase();

  // ---- 日本語（TM日本語表記） ----
  if (raw.includes("ゴールキーパー")) return "GK";

  // FW（“ウイング”/“ウィンガー”両対応）
  if (
    raw.includes("センターフォワード") ||
    raw.includes("フォワード") ||
    raw.includes("ストライカー") ||
    raw.includes("ウイング") ||
    raw.includes("ウィンガー")
  )
    return "FW";

  // MF（“フィルダー/フィールダー”両対応。日本語は「ミッド」を見ればほぼ拾える）
  if (
    raw.includes("守備的ミッド") ||
    raw.includes("セントラルミッド") ||
    raw.includes("攻撃的ミッド") ||
    raw.includes("ミッド") ||
    raw.includes("中盤")
  )
    return "MF";

  // DF
  if (
    raw.includes("センターバック") ||
    raw.includes("右サイドバック") ||
    raw.includes("左サイドバック") ||
    raw.includes("サイドバック") ||
    raw.includes("ウイングバック") ||
    raw.includes("ディフェンダー") ||
    raw.includes("バック")
  )
    return "DF";

  // ---- 英語（既存互換） ----
  if (s.includes("goalkeeper")) return "GK";

  if (
    s.includes("back") ||
    s.includes("centre-back") ||
    s.includes("center-back") ||
    s.includes("defender") ||
    s.includes("wing-back")
  )
    return "DF";

  if (s.includes("midfield")) return "MF";

  if (
    s.includes("winger") ||
    s.includes("forward") ||
    s.includes("striker") ||
    s.includes("second striker") ||
    s.includes("centre-forward") ||
    s.includes("center forward")
  )
    return "FW";

  return "";
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ====== master map ======
type MasterInfo = {
  confederation: string;
  confederation_bucket: string;
  country: string; // 英名
};

function buildMasterMap(masterAoA: any[][]) {
  const header = (masterAoA[0] ?? []).map((x) => String(x ?? ""));
  const idxCompetition = header.indexOf("competition");
  const idxEdition = header.indexOf("edition");
  const idxConf = header.indexOf("confederation");
  const idxBucket = header.indexOf("confederation_bucket");
  const idxCountry = header.indexOf("country");

  if (idxCountry < 0 || idxBucket < 0 || idxConf < 0) {
    throw new Error(
      `Master header missing. need country/confederation/confederation_bucket. headers=${header.join(",")}`,
    );
  }

  const map = new Map<string, MasterInfo>();

  for (let i = 1; i < masterAoA.length; i++) {
    const row = masterAoA[i];
    const country = String(row[idxCountry] ?? "").trim();
    if (!country) continue;

    const comp =
      idxCompetition >= 0 ? String(row[idxCompetition] ?? "").trim() : "";
    const ed = idxEdition >= 0 ? Number(row[idxEdition] ?? NaN) : NaN;

    const okComp = idxCompetition >= 0 ? comp === COMPETITION : true;
    const okEd = idxEdition >= 0 ? ed === EDITION : true;
    if (!okComp || !okEd) continue;

    const confederation = String(row[idxConf] ?? "").trim();
    const bucket = normalizeBucket(String(row[idxBucket] ?? "").trim());

    map.set(keyNormalize(country), {
      confederation,
      confederation_bucket: bucket,
      country,
    });
  }

  return map;
}

// ====== main ======
if (!fs.existsSync(INPUT)) {
  console.error("❌ Excel not found:", INPUT);
  process.exit(1);
}

const wb = XLSX.readFile(INPUT);

// master
const masterSheet = wb.Sheets[MASTER_SHEET];
if (!masterSheet) {
  console.error(`❌ Master sheet not found: ${MASTER_SHEET}`);
  console.error("sheets=", wb.SheetNames.join(", "));
  process.exit(1);
}
const masterAoA: any[][] = XLSX.utils.sheet_to_json(masterSheet, { header: 1 });
const masterMap = buildMasterMap(masterAoA);

// raw
const rawSheet = wb.Sheets[RAW_SHEET];
if (!rawSheet) {
  console.error(`❌ RAW sheet not found: ${RAW_SHEET}`);
  console.error("sheets=", wb.SheetNames.join(", "));
  process.exit(1);
}
const rows: any[][] = XLSX.utils.sheet_to_json(rawSheet, { header: 1 });

// 出力（16列）
const out: string[] = [];
out.push(
  [
    "competition",
    "edition",
    "confederation",
    "confederation_bucket",
    "country",
    "nt_shirt_no",
    "position_primary",
    "is_star",
    "name_en",
    "birth_date",
    "height_cm",
    "current_club",
    "snapshot_date",
    "name_ja",
    "national_debut",
    "source",
    "notes",
  ].join(","),
);

type PendingRow = {
  rawCountry: string;
  nt_shirt_no: string;
  name_en: string;
  birth_date: string;
  height_cm: string;
  current_club: string;
  national_debut: string;
  pos_guess: string; // ★追加
};

const missingInMaster = new Set<string>();

let currentCountry = "";
let pending: PendingRow | null = null;

function flushPending(posPrimary: string) {
  if (!pending) return;

  if (!pending) return;

  const finalPos = posPrimary || pending.pos_guess || "";
  const masterKeyCountry = normalizeCountryForMaster(pending.rawCountry);
  const m = masterMap.get(keyNormalize(masterKeyCountry));
  if (!m) missingInMaster.add(pending.rawCountry);

  out.push(
    [
      csvEscape(COMPETITION),
      csvEscape(EDITION),
      csvEscape(m?.confederation ?? ""),
      csvEscape(m?.confederation_bucket ?? ""),
      csvEscape(pending.rawCountry), // 表示はRAWの国名（日本語でOK）
      csvEscape(pending.nt_shirt_no),
      csvEscape(finalPos),
      ,
      csvEscape(pending.name_en),
      csvEscape(pending.birth_date),
      csvEscape(pending.height_cm),
      csvEscape(pending.current_club),
      csvEscape(today),
      csvEscape(pending.name_en), // name_ja 仮置き
      csvEscape(pending.national_debut),
      csvEscape(SOURCE),
      csvEscape(""),
    ].join(","),
  );

  pending = null;
}

// 「選手行の次の行」に来る “ポジション見出し行” を検出
// ※ MFだけ「見出し+数字」等で複数セルになりがちなので、行内をスキャンして拾う
function detectPosForPending(r: any[]): string {
  const cells = (r ?? [])
    .map((v: any) => String(v ?? "").trim())
    .filter((s: string) => s !== "");

  if (cells.length === 0) return "";

  // 次行が“選手行”っぽい（先頭が背番号/順位などの数値）ならポジ行ではない
  if (
    /^\d+$/.test(cells[0]) ||
    cells[0] === "-" ||
    cells[0] === "#" ||
    cells[0] === "＃"
  ) {
    return "";
  }

  // 行内のどこかにポジがあれば拾う（複数セルOK）
  for (const c of cells) {
    const pos = mapPosLabelToPrimary(c);
    if (pos) return pos;
  }

  return "";
}

function isHeaderRow(r: any[]) {
  const c0 = String(r[0] ?? "").trim();
  const c1 = String(r[1] ?? "").trim();
  // 英語/日本語どちらでも弾く
  const isNo = c0 === "#" || c0 === "＃";
  const isPlayer =
    ["player", "選手"].includes(c1.toLowerCase()) || c1 === "選手";
  return isNo && isPlayer;
}

for (const r of rows) {
  const c0 = r[0];

  // 国ブロック
  if (typeof c0 === "string" && c0.startsWith("### ")) {
    // 国切替時に pending が残ってたら保険で吐く
    if (pending) flushPending(pending.pos_guess);

    currentCountry = c0.replace("### ", "").trim();
    continue;
  }

  if (!currentCountry) continue;

  // pendingの次行がポジション行なら確定して吐く
  if (pending) {
    const pos = detectPosForPending(r);
    if (pos) {
      flushPending(pos);
      continue;
    }
  }

  // ヘッダ行除外
  if (isHeaderRow(r)) continue;

  // 選手行判定：列1に名前
  const name_en = String(r[1] ?? "").trim();
  if (!name_en || name_en.toLowerCase() === "player" || name_en === "選手")
    continue;

  // もし前のpendingが残っている＝ポジ行が無い例外 → 空posで吐く
  if (pending) flushPending(pending.pos_guess);

  const shirtRaw = String(r[0] ?? "").trim();
  const nt_shirt_no = shirtRaw === "-" || shirtRaw === "" ? "" : shirtRaw;

  // 列位置はあなたの運用RAW準拠
  // 0:# 1:Name 3:DOB 4:Club 5:Height 9:Debut（英語版も日本語版も概ね同じ）
  const birth_date = normalizeDateAny(r[3]);
  const current_club = String(r[4] ?? "").trim();
  const height_cm = normalizeHeight(r[5]);
  const national_debut = normalizeDateAny(r[9]);

  const pos_guess = mapPosLabelToPrimary(String(r[2] ?? "").trim());

  pending = {
    rawCountry: currentCountry,
    nt_shirt_no,
    name_en,
    birth_date,
    height_cm,
    current_club,
    national_debut,
    pos_guess, // ★追加
  };
}

// 末尾に pending が残った場合（保険）
if (pending) flushPending(pending.pos_guess);

// UTF-8 BOM付き（Excel文字化け防止）
const BOM = "\uFEFF";
fs.writeFileSync(OUTPUT, BOM + out.join("\n"), "utf8");

console.log("✅ Converted CSV written to", OUTPUT);
console.log(`✅ masterMap entries = ${masterMap.size}`);

if (missingInMaster.size > 0) {
  console.log("⚠️ Master missing these countries:");
  console.log([...missingInMaster].sort().join(", "));
}
