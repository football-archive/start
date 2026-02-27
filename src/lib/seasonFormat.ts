/**
 * Season label helpers
 *
 * - "2025-26" -> "25-26"
 * - "1999-00" -> "99-00"
 * - fallback: return original
 */
export function seasonShort(season: string): string {
  const s = String(season ?? "").trim();
  if (!s) return "";

  // Common format: YYYY-YY or YYYY-YYYY
  const m = s.match(/^(\d{4})\s*[-–—]\s*(\d{2}|\d{4})$/);
  if (!m) return s;

  const left = m[1].slice(2);
  const right = m[2].length === 4 ? m[2].slice(2) : m[2];
  return `${left}-${right}`;
}
