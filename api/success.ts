import type { IncomingMessage, ServerResponse } from "node:http";
import { send, query } from "../src/http.js";
import { keyForSession } from "../src/billing.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const sid = query(req).get("session_id") || "";
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return send(res, 400, { error: "BAD_SESSION_ID" });
  const r = await keyForSession(sid);
  const usage = {
    api: "Authorization: Bearer <key>  e.g. curl -H 'Authorization: Bearer <key>' 'https://chronogate-self.vercel.app/v1/now?tz=America/Chicago'",
    mcp: 'Remote MCP https://chronogate-self.vercel.app/mcp with header "Authorization: Bearer <key>"',
    cost: "1 credit per call; 402 when empty",
  };
  if (wantsJson) {
    if (r.state === "ready") return send(res, 200, { status: "ready", api_key: r.key, credits: r.credits, usage }, { "cache-control": "no-store" });
    if (r.state === "pending") return send(res, 202, { status: "pending", message: "Payment is still being confirmed. Retry in a few seconds." }, { "cache-control": "no-store" });
    return send(res, 410, { status: "expired", message: "This key was already issued and its display window (7 days) has passed." });
  }
  let inner: string;
  if (r.state === "ready") {
    inner = `<h1>Your ChronoGate API key</h1><p>Save it now. It is shown on this page for 7 days only.</p>
<pre style="background:#f4f4f4;padding:12px;word-break:break-all">${esc(r.key!)}</pre>
<p>Credits: <b>${r.credits}</b> (1 per call).</p>
<h2>REST</h2><pre>curl -H "Authorization: Bearer ${esc(r.key!)}" \\
  "https://chronogate-self.vercel.app/v1/now?tz=America/Chicago"</pre>
<h2>MCP</h2><p>Server URL <code>https://chronogate-self.vercel.app/mcp</code> with header <code>Authorization: Bearer &lt;key&gt;</code>.</p>`;
  } else if (r.state === "pending") {
    inner = `<meta http-equiv="refresh" content="4"><h1>Confirming payment…</h1><p>Your key isn't ready yet. This page refreshes automatically; or refresh in a few seconds.</p>`;
  } else inner = `<h1>Key already issued</h1><p>The 7-day display window for this purchase has passed.</p>`;
  res.writeHead(r.state === "pending" ? 202 : 200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
  res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>ChronoGate credits</title><body style="font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px">${inner}</body>`);
}
