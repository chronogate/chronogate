/**
 * Local smoke: pure TZ cases + live Nager for US holiday.
 * Run: npm test
 */
import { DateTime } from "luxon";
import { nowInZone, convertIso, wallParts } from "../src/tz.js";
import { isBusinessDay, addBusinessDays } from "../src/business.js";
import { resolveExpression } from "../src/resolve.js";

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed++;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

// 1) America/Chicago now
{
  const r = nowInZone("America/Chicago");
  check("now America/Chicago has utc+local", !!(r.utc && r.local?.iso && r.tz === "America/Chicago"), r);
  check("now offset is -05 or -06", r.local.offset === "-05:00" || r.local.offset === "-06:00", r.local);
}

// 2) US spring-forward 2026: clocks spring forward 2026-03-08 02:00 → 03:00 local
//    A naive 02:30 America/Chicago does not exist; luxon typically shifts forward.
{
  const c = convertIso("2026-03-08T02:30:00", "America/Chicago", "UTC");
  check("spring-forward convert returns iso", !!c.utc && !!c.result?.iso, c);
  // After spring forward, CST (-6) becomes CDT (-5). 02:30 invalid → typically 03:30 CDT = 08:30Z
  const utcHour = DateTime.fromISO(c.utc!).toUTC().hour;
  check("spring-forward lands at UTC morning (07-09)", utcHour >= 7 && utcHour <= 9, { utc: c.utc, utcHour, result: c.result });
  const wall = wallParts("2026-03-08T08:30:00.000Z", "America/Chicago");
  check("08:30Z is 03:30 CDT (DST on)", wall.time.startsWith("03:30") && wall.is_dst === true, wall);
}

// 3) Known US holiday — Nager lists observed Independence Day on 2026-07-03 (Fri); 07-04 is Sat
{
  const sat = await isBusinessDay("2026-07-04", "US");
  check("2026-07-04 weekend true", sat.weekend === true, sat);
  check("2026-07-04 not a business day", sat.business_day === false, sat);
  const obs = await isBusinessDay("2026-07-03", "US");
  if (obs.holiday_source === "unavailable") {
    console.warn("WARN  Nager unavailable — skipping Jul 3 holiday assert", obs.holiday_error);
    check("2026-07-03 weekday computed", obs.weekend === false, obs);
  } else {
    check("2026-07-03 observed Independence Day is holiday", obs.holiday === true, obs);
    check("2026-07-03 not a business day", obs.business_day === false, obs);
  }
}

// Also a weekday holiday: Thanksgiving 2026-11-26 (Thu)
{
  const r = await isBusinessDay("2026-11-26", "US");
  if (r.holiday_source === "unavailable") {
    console.warn("WARN  Nager unavailable — skipping Thanksgiving holiday assert", r.holiday_error);
    check("Thanksgiving path soft-failed (weekend false still computed)", r.weekend === false, r);
  } else {
    check("2026-11-26 Thanksgiving is holiday", r.holiday === true, r);
    check("2026-11-26 not a business day", r.business_day === false, r);
  }
}

// Ordinary weekday
{
  const r = await isBusinessDay("2026-07-07", "US"); // Tuesday
  check("2026-07-07 is business day (if Nager ok)", r.weekend === false && (r.holiday_source === "unavailable" || r.business_day === true), r);
}

// 4) add business days across a weekend: Fri 2026-07-10 + 1 → Mon 2026-07-13
{
  const r = await addBusinessDays("2026-07-10", 1, "US");
  check("Fri+1bd → Mon 2026-07-13", r.end === "2026-07-13", r);
  check("skipped includes Sat/Sun", r.skipped.includes("2026-07-11") && r.skipped.includes("2026-07-12"), r);
}

// Across Independence Day: Nager observes Jul 3 (Fri). Thu Jul 2 + 3bd
// skip Fri 3 (holiday), Sat 4, Sun 5 → Mon 6, Tue 7, Wed 8
{
  const r = await addBusinessDays("2026-07-02", 3, "US");
  check("2026-07-02 + 3bd → 2026-07-08 (observed Jul 3)", r.end === "2026-07-08", r);
}

// 5) resolve expressions
{
  const r = await resolveExpression("tomorrow 9am", "America/Chicago");
  check("tomorrow 9am has time 09:00", r.result?.time?.startsWith("09:00") === true, r);
  const n = await resolveExpression("next Tuesday 3pm", "America/Chicago");
  check("next Tuesday 3pm is Tuesday", (n.result as any)?.weekday === "Tuesday", n);
  check("next Tuesday 3pm is 15:00", (n.result as any)?.time?.startsWith("15:00") === true, n);
  const b = await resolveExpression("in 2 business days", "America/Chicago", "US");
  check("in 2 business days returns date", !!(b.result as any)?.date, b);
}

// 6) bad tz rejected
{
  let threw = false;
  try {
    nowInZone("Not/AZone");
  } catch (e: any) {
    threw = e?.code === "BAD_TZ";
  }
  check("invalid tz throws BAD_TZ", threw);
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
