import type { IncomingMessage, ServerResponse } from "node:http";
import { take, overLimitBody } from "./ratelimit.js";
import { clientIp, send, bearer } from "./http.js";

export async function withQuota(
  req: IncomingMessage,
  res: ServerResponse,
  run: () => Promise<unknown> | unknown,
) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const q = await take(clientIp(req), bearer(req));
  const rl = {
    "x-ratelimit-limit": String(q.limit),
    "x-ratelimit-remaining": String(q.remaining),
    "x-plan": q.plan,
  };
  if (!q.allowed) return send(res, 429, overLimitBody(q), rl);
  try {
    return send(res, 200, await run(), rl);
  } catch (e: any) {
    const code = e?.code;
    const status =
      code === "BAD_TZ" || code === "BAD_ISO" || code === "BAD_DATE" || code === "BAD_COUNTRY" || code === "BAD_DAYS" || code === "BAD_EXPR"
        ? 400
        : 500;
    return send(res, status, { error: code || "ERROR", message: String(e?.message || e) }, rl);
  }
}
