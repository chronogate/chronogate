/** Nager.Date public holidays with short in-memory cache. Fail soft if down. */

type NagerHoliday = {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  countryCode: string;
  fixed?: boolean;
  global?: boolean;
  types?: string[];
};

type CacheEntry = { at: number; dates: Set<string>; list: NagerHoliday[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

export type HolidayLookup = {
  dates: Set<string>;
  list: NagerHoliday[];
  source: "nager" | "unavailable";
  error?: string;
};

export async function holidaysFor(year: number, country: string): Promise<HolidayLookup> {
  const cc = country.toUpperCase();
  const key = `${year}:${cc}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { dates: hit.dates, list: hit.list, source: "nager" };
  }
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`nager HTTP ${res.status}`);
    const list = (await res.json()) as NagerHoliday[];
    const dates = new Set(list.map((h) => h.date));
    cache.set(key, { at: Date.now(), dates, list });
    return { dates, list, source: "nager" };
  } catch (e: any) {
    // Fail soft: empty holiday set so weekends still work
    return { dates: new Set(), list: [], source: "unavailable", error: String(e?.message || e) };
  }
}

export async function isPublicHoliday(date: string, country: string): Promise<{
  holiday: boolean;
  name?: string;
  source: "nager" | "unavailable";
  error?: string;
}> {
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return { holiday: false, source: "unavailable", error: "bad date" };
  const h = await holidaysFor(year, country);
  if (!h.dates.has(date)) return { holiday: false, source: h.source, error: h.error };
  const row = h.list.find((x) => x.date === date);
  return { holiday: true, name: row?.name || row?.localName, source: h.source, error: h.error };
}
