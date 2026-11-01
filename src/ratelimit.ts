/** Free tier: FREE_DAILY_LIMIT (200)/day per IP, in Redis (memory fallback). Paid: Bearer cg_ key, 1 credit per call. */
import { kv } from "./store.js";
import { spend, paymentLink } from "./billing.js";

const FREE_DAILY = () => Number(process.env.FREE_DAILY_LIMIT || 200);

export type Quota = {
  allowed: boolean;
  remaining: number;
  limit: number;
  plan: "free" | "paid";
  status: number; // 200 | 401 | 402
  error?: string;
};

export async function take(ip: string, apiKey?: string): Promise<Quota> {
  if (apiKey) {
    const r = await spend(apiKey);
    if (r.ok) return { allowed: true, remaining: r.remaining, limit: 0, plan: "paid", status: 200 };
    return r.reason === "invalid"
      ? { allowed: false, remaining: 0, limit: 0, plan: "paid", status: 401, error: "INVALID_API_KEY" }
      : { allowed: false, remaining: 0, limit: 0, plan: "paid", status: 402, error: "CREDITS_EXHAUSTED" };
  }
  const day = new Date().toISOString().slice(0, 10);
  const used = await kv().incrBy(`cg:rl:${day}:${ip}`, 1, 26 * 3600);
  const lim = FREE_DAILY();
  const allowed = used <= lim;
  return { allowed, remaining: Math.max(0, lim - used), limit: lim, plan: "free", status: allowed ? 200 : 402, error: allowed ? undefined : "FREE_TIER_EXHAUSTED" };
}

export function overLimitBody(q: Quota) {
  const buy = paymentLink();
  if (q.error === "INVALID_API_KEY") return { error: q.error, message: "Unknown API key. Buy credits or omit the Authorization header to use the free tier.", buy };
  if (q.error === "CREDITS_EXHAUSTED") return { error: q.error, message: "This key has no credits left. Buy another pack.", buy };
  return {
    error: "FREE_TIER_EXHAUSTED",
    message: `Free tier is ${q.limit} calls/day per IP (resets 00:00 UTC). Buy 20,000 calls for $5: ${buy}`,
    resets: "00:00 UTC",
    buy,
  };
}
