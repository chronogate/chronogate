import { DateTime } from "luxon";
import { assertIana } from "./tz.js";
import { addBusinessDays } from "./business.js";

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function parseTimeToken(tok: string): { hour: number; minute: number } | null {
  const m = tok.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    if (ap === "pm" && hour !== 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  if (minute > 59) return null;
  return { hour, minute };
}

/**
 * Resolve relative scheduling expressions in an IANA zone.
 * Supported (v0):
 *   - "next Tuesday 3pm" / "next tue 15:00"
 *   - "tomorrow 9am"
 *   - "in N business days" (date only; optional country=US)
 */
export async function resolveExpression(expr: string, tz: string, country = "US") {
  if (!expr || typeof expr !== "string" || expr.length > 200) {
    throw Object.assign(new Error("expr required"), { code: "BAD_EXPR" });
  }
  const zone = assertIana(tz);
  const raw = expr.trim().toLowerCase().replace(/\s+/g, " ");
  const now = DateTime.now().setZone(zone);

  // in N business days
  let m = raw.match(/^in\s+(\d+)\s+business\s+days?$/);
  if (m) {
    const n = Number(m[1]);
    const add = await addBusinessDays(now.toISODate()!, n, country);
    return {
      expr,
      tz: zone,
      kind: "business_days",
      country: country.toUpperCase(),
      result: {
        date: add.end,
        iso: DateTime.fromISO(add.end!, { zone }).startOf("day").toISO(),
        skipped: add.skipped,
      },
    };
  }

  // tomorrow [time]
  m = raw.match(/^tomorrow(?:\s+(.+))?$/);
  if (m) {
    const t = m[1] ? parseTimeToken(m[1]) : { hour: 9, minute: 0 };
    if (!t) throw Object.assign(new Error("could not parse time after tomorrow"), { code: "BAD_EXPR" });
    const dt = now.plus({ days: 1 }).set({ hour: t.hour, minute: t.minute, second: 0, millisecond: 0 });
    return {
      expr,
      tz: zone,
      kind: "tomorrow",
      result: {
        iso: dt.toISO(),
        utc: dt.toUTC().toISO(),
        date: dt.toISODate(),
        time: dt.toFormat("HH:mm:ss"),
        weekday: dt.toFormat("cccc"),
        offset: dt.toFormat("ZZ"),
        is_dst: dt.isInDST,
      },
    };
  }

  // next <weekday> [time]
  m = raw.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:\s+(.+))?$/);
  if (m) {
    const name = m[1];
    const full =
      name.startsWith("mon") ? "monday" :
      name.startsWith("tue") ? "tuesday" :
      name.startsWith("wed") ? "wednesday" :
      name.startsWith("thu") ? "thursday" :
      name.startsWith("fri") ? "friday" :
      name.startsWith("sat") ? "saturday" : "sunday";
    const targetWd = WEEKDAYS[full];
    const t = m[2] ? parseTimeToken(m[2]) : { hour: 9, minute: 0 };
    if (!t) throw Object.assign(new Error("could not parse time after weekday"), { code: "BAD_EXPR" });
    let dt = now.set({ hour: t.hour, minute: t.minute, second: 0, millisecond: 0 });
    let guard = 0;
    // Always strictly after now → at least +1 day then advance to weekday
    dt = dt.plus({ days: 1 });
    while (dt.weekday !== targetWd && guard < 8) {
      dt = dt.plus({ days: 1 });
      guard++;
    }
    dt = dt.set({ hour: t.hour, minute: t.minute, second: 0, millisecond: 0 });
    return {
      expr,
      tz: zone,
      kind: "next_weekday",
      weekday: full,
      result: {
        iso: dt.toISO(),
        utc: dt.toUTC().toISO(),
        date: dt.toISODate(),
        time: dt.toFormat("HH:mm:ss"),
        weekday: dt.toFormat("cccc"),
        offset: dt.toFormat("ZZ"),
        is_dst: dt.isInDST,
      },
    };
  }

  throw Object.assign(
    new Error('unsupported expr; try "next Tuesday 3pm", "tomorrow 9am", or "in 2 business days"'),
    { code: "BAD_EXPR" },
  );
}
