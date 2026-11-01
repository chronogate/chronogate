import { DateTime } from "luxon";
import { isPublicHoliday, holidaysFor } from "./holidays.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(d: string): string {
  if (!DATE_RE.test(d)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { code: "BAD_DATE" });
  const dt = DateTime.fromISO(d, { zone: "utc" });
  if (!dt.isValid || dt.toISODate() !== d) throw Object.assign(new Error("invalid calendar date"), { code: "BAD_DATE" });
  return d;
}

export function assertCountry(c: string): string {
  if (!c || typeof c !== "string" || !/^[A-Za-z]{2}$/.test(c)) {
    throw Object.assign(new Error("country must be ISO 3166-1 alpha-2 (e.g. US)"), { code: "BAD_COUNTRY" });
  }
  return c.toUpperCase();
}

export async function isBusinessDay(date: string, country: string) {
  const d = assertDate(date);
  const cc = assertCountry(country);
  const dt = DateTime.fromISO(d, { zone: "utc" });
  const weekday = dt.weekday; // 1=Mon .. 7=Sun
  const weekend = weekday === 6 || weekday === 7;
  const hol = await isPublicHoliday(d, cc);
  const business_day = !weekend && !hol.holiday;
  return {
    date: d,
    country: cc,
    business_day,
    weekend,
    weekday: dt.toFormat("cccc"),
    holiday: hol.holiday,
    holiday_name: hol.name || null,
    holiday_source: hol.source,
    holiday_error: hol.error || null,
  };
}

export async function addBusinessDays(start: string, days: number, country: string) {
  const s = assertDate(start);
  const cc = assertCountry(country);
  if (!Number.isInteger(days) || days < 0 || days > 3660) {
    throw Object.assign(new Error("days must be an integer 0..3660"), { code: "BAD_DAYS" });
  }
  if (days === 0) {
    const check = await isBusinessDay(s, cc);
    return { start: s, days, country: cc, end: s, skipped: [] as string[], end_is_business_day: check.business_day };
  }

  // Prefetch holiday years we might cross
  let cur = DateTime.fromISO(s, { zone: "utc" });
  const years = new Set<number>([cur.year, cur.year + 1, cur.year + Math.ceil(days / 200)]);
  const holidaySets = new Map<number, Set<string>>();
  let source: "nager" | "unavailable" = "nager";
  let err: string | undefined;
  for (const y of years) {
    const h = await holidaysFor(y, cc);
    holidaySets.set(y, h.dates);
    if (h.source === "unavailable") {
      source = "unavailable";
      err = h.error;
    }
  }

  const skipped: string[] = [];
  let remaining = days;
  // Start counting from the day AFTER start (standard "add N business days")
  while (remaining > 0) {
    cur = cur.plus({ days: 1 });
    const iso = cur.toISODate()!;
    const wd = cur.weekday;
    const weekend = wd === 6 || wd === 7;
    const holSet = holidaySets.get(cur.year) || new Set();
    if (!holidaySets.has(cur.year)) {
      const h = await holidaysFor(cur.year, cc);
      holidaySets.set(cur.year, h.dates);
      if (h.source === "unavailable") {
        source = "unavailable";
        err = h.error;
      }
    }
    const holiday = (holidaySets.get(cur.year) || holSet).has(iso);
    if (weekend || holiday) {
      skipped.push(iso);
      continue;
    }
    remaining -= 1;
  }

  return {
    start: s,
    days,
    country: cc,
    end: cur.toISODate(),
    skipped,
    holiday_source: source,
    holiday_error: err || null,
  };
}
