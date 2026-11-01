import type { IncomingMessage, ServerResponse } from "node:http";
import { send } from "../src/http.js";
import { kv } from "../src/store.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const store = kv();
  let redisOk = false;
  if (store.kind === "redis") {
    try { await store.set("cg:health", String(Date.now()), 600); redisOk = (await store.get("cg:health")) != null; } catch {}
  }
  return send(res, 200, { ok: true, redis: redisOk, store: store.kind, webhook_configured: !!process.env.STRIPE_WEBHOOK_SECRET }, { "cache-control": "no-store" });
}
