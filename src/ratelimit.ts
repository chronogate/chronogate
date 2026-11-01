/** Free-tier only for v0: 200/day per IP, in-memory. No Upstash, no paid keys yet. */

const FREE_DAILY = () => Number(process.env.FREE_DAILY_LIMIT || 200);

type Entry = { used: number; day: string };
const mem = new Map<string, Entry>();

export type Quota = {
  allowed: boolean;
  remaining: number;
  limit: number;
  plan: "free";
  error?: string;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function take(ip: string, _apiKey?: string): Promise<Quota> {
  const day = todayUtc();
  const key = `rl:${day}:${ip}`;
  let e = mem.get(key);
  if (!e || e.day !== day) {
    e = { used: 0, day };
    mem.set(key, e);
  }
  e.used += 1;
  // Opportunistic prune of other days
  if (mem.size > 5000) {
    for (const [k, v] of mem) if (v.day !== day) mem.delete(k);
  }
  const lim = FREE_DAILY();
  const allowed = e.used <= lim;
  return {
    allowed,
    remaining: Math.max(0, lim - e.used),
    limit: lim,
    plan: "free",
    error: allowed ? undefined : "FREE_TIER_EXHAUSTED",
  };
}

export function overLimitBody(q: Quota) {
  return {
    error: q.error || "FREE_TIER_EXHAUSTED",
    message: `Free tier is ${q.limit} calls/day per IP. Limit resets at 00:00 UTC. Paid packs coming soon.`,
    resets: "00:00 UTC",
  };
}
