import type { IncomingMessage, ServerResponse } from "node:http";
import { send } from "../src/http.js";
import { verifyStripeSig, fulfill } from "../src/billing.js";

export const config = { api: { bodyParser: false } };

async function raw(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > 1_000_000) throw new Error("too large"); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return send(res, 503, { error: "WEBHOOK_NOT_CONFIGURED" }); // fail closed
  let body: string;
  try { body = await raw(req); } catch { return send(res, 413, { error: "TOO_LARGE" }); }
  if (!verifyStripeSig(body, req.headers["stripe-signature"] as string | undefined, secret)) return send(res, 400, { error: "BAD_SIGNATURE" });
  let ev: any;
  try { ev = JSON.parse(body); } catch { return send(res, 400, { error: "BAD_JSON" }); }
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    try {
      const r = await fulfill(ev.data?.object);
      return send(res, 200, { received: true, issued: r.issued });
    } catch (e: any) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  }
  return send(res, 200, { received: true, ignored: ev.type });
}
