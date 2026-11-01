import { DateTime, IANAZone } from "luxon";

export function assertIana(tz: string): string {
  if (!tz || typeof tz !== "string" || tz.length > 64) throw Object.assign(new Error("tz required (IANA)"), { code: "BAD_TZ" });
  if (!IANAZone.isValidZone(tz)) throw Object.assign(new Error(`unknown IANA timezone: ${tz}`), { code: "BAD_TZ" });
  return tz;
}

export function nowInZone(tz: string) {
  const zone = assertIana(tz);
  const dt = DateTime.now().setZone(zone);
  return {
    utc: dt.toUTC().toISO(),
    unix_ms: dt.toMillis(),
    tz: zone,
    local: {
      iso: dt.toISO(),
      date: dt.toISODate(),
      time: dt.toFormat("HH:mm:ss"),
      offset: dt.toFormat("ZZ"),
      offset_minutes: dt.offset,
      weekday: dt.toFormat("cccc"),
      is_dst: dt.isInDST,
    },
  };
}

export function convertIso(iso: string, from?: string, to?: string) {
  if (!iso || typeof iso !== "string") throw Object.assign(new Error("iso required"), { code: "BAD_ISO" });
  let dt: DateTime;
  if (from) {
    assertIana(from);
    // Prefer zone from ISO if present; else interpret naive as `from`
    const parsed = DateTime.fromISO(iso, { setZone: true });
    if (!parsed.isValid) throw Object.assign(new Error(`invalid iso: ${parsed.invalidReason}`), { code: "BAD_ISO" });
    if (parsed.zoneName === "UTC" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso.trim())) {
      dt = DateTime.fromISO(iso, { zone: from });
    } else {
      dt = parsed.setZone(from);
    }
  } else {
    dt = DateTime.fromISO(iso, { setZone: true });
  }
  if (!dt.isValid) throw Object.assign(new Error(`invalid iso: ${dt.invalidReason}`), { code: "BAD_ISO" });
  const target = to ? assertIana(to) : "UTC";
  const out = dt.setZone(target);
  return {
    input: iso,
    from: from || dt.zoneName,
    to: target,
    utc: dt.toUTC().toISO(),
    result: {
      iso: out.toISO(),
      date: out.toISODate(),
      time: out.toFormat("HH:mm:ss"),
      offset: out.toFormat("ZZ"),
      offset_minutes: out.offset,
      weekday: out.toFormat("cccc"),
      is_dst: out.isInDST,
    },
  };
}

/** Parts for a wall clock in a zone — useful for DST edge checks. */
export function wallParts(isoUtc: string, tz: string) {
  const zone = assertIana(tz);
  const dt = DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);
  return {
    tz: zone,
    iso: dt.toISO(),
    date: dt.toISODate(),
    time: dt.toFormat("HH:mm:ss"),
    offset: dt.toFormat("ZZ"),
    is_dst: dt.isInDST,
  };
}
