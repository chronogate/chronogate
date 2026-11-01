import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { kv } from "./store.js";

export const DEFAULT_CREDITS = 20000;
export const paymentLink = () => process.env.PAYMENT_LINK_URL || "https://chronogate-self.vercel.app/#pricing";
const SHOW_TTL = 7 * 24 * 3600;

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** Stripe-Signature: t=..,v1=.. ; HMAC-SHA256(secret, `${t}.${raw}`). */
export function verifyStripeSig(raw: string, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const exp = Buffer.from(createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex"));
  return sigs.some((s) => { const b = Buffer.from(s || ""); return b.length === exp.length && timingSafeEqual(b, exp); });
}

export function creditsFor(session: any): number {
  const md = session?.metadata?.credits ?? session?.line_items?.data?.[0]?.price?.metadata?.credits;
  const n = Number(md);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_CREDITS; // amount_total 500 => 20000 (only pack today)
}

/** Issue exactly one key per Checkout Session. Returns the key (new or existing). */
export async function fulfill(session: any): Promise<{ issued: boolean; key?: string }> {
  const sid = String(session?.id || "");
  if (!sid.startsWith("cs_")) throw new Error("bad session id");
  if (session.payment_status !== "paid") return { issued: false };
  const store = kv();
  const key = "cg_" + randomBytes(24).toString("base64url");
  const won = await store.setNx(`cg:sess:${sid}`, hashKey(key)); // permanent marker
  if (!won) return { issued: false };
  await store.set(`cg:key:${hashKey(key)}`, String(creditsFor(session)));
  await store.set(`cg:show:${sid}`, key, SHOW_TTL);
  return { issued: true, key };
}

export async function keyForSession(sid: string): Promise<{ state: "ready" | "pending" | "expired"; key?: string; credits?: number }> {
  const store = kv();
  const marker = await store.get(`cg:sess:${sid}`);
  if (!marker) return { state: "pending" };
  const key = await store.get(`cg:show:${sid}`);
  if (!key) return { state: "expired" };
  const c = await store.get(`cg:key:${marker}`);
  return { state: "ready", key, credits: Number(c || 0) };
}

/** Spend one credit. "invalid" | "empty" | remaining count. */
export async function spend(apiKey: string): Promise<{ ok: true; remaining: number } | { ok: false; reason: "invalid" | "empty" }> {
  const store = kv();
  const k = `cg:key:${hashKey(apiKey)}`;
  if ((await store.get(k)) == null) return { ok: false, reason: "invalid" };
  const left = await store.incrBy(k, -1);
  if (left < 0) { await store.incrBy(k, 1); return { ok: false, reason: "empty" }; }
  return { ok: true, remaining: left };
}
