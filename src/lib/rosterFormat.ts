// 表示用の安全な変換ユーティリティ集
export const toInt = (v: any): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return String(Math.trunc(n));
};

// "YYYY-MM-DD" or "YYYY/MM/DD" → "YYYY-MM"
export const toYM = (s?: string | null): string => {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})[-\/](\d{1,2})/);
  if (!m) return String(s);
  const yyyy = m[1];
  const mm = m[2].padStart(2, "0");
  return `${yyyy}-${mm}`;
};

// 年齢（birth: "YYYY-MM-DD" or "YYYY/MM/DD", asOf: "YYYY-MM-DD"）
export const calcAge = (
  birth?: string | null,
  asOf?: string | null,
): string => {
  if (!birth) return "";
  const b = String(birth).replace(/\//g, "-");
  const bm = b.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!bm) return "";

  const by = Number(bm[1]);
  const bmo = Number(bm[2]);
  const bd = Number(bm[3]);

  const base = asOf ? String(asOf).replace(/\//g, "-") : "";
  const tm = base.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  const now = tm
    ? { y: Number(tm[1]), m: Number(tm[2]), d: Number(tm[3]) }
    : (() => {
        const dt = new Date();
        return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
      })();

  let age = now.y - by;
  const beforeBirthday = now.m < bmo || (now.m === bmo && now.d < bd);
  if (beforeBirthday) age -= 1;

  return String(age);
};

export const toYMD = (s?: string) => {
  const t = (s ?? "").trim();
  if (!t) return "";

  // YYYY/M/D または YYYY-MM-DD 等を吸収
  const m = t.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return t;

  const y = m[1];
  const mm = m[2].padStart(2, "0");
  const dd = m[3].padStart(2, "0");
  return `${y}-${mm}-${dd}`;
};

// 代表候補Map用のキー（同名対策として birth も含める）
export const keyNameBirth = (
  name_en?: string | null,
  birth_date?: string | null,
): string => {
  return `${(name_en || "").trim()}|${(birth_date || "").trim()}`;
};
