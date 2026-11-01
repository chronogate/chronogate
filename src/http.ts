import type { IncomingMessage, ServerResponse } from "node:http";

export function clientIp(req: IncomingMessage) {
  const h = (n: string) => String(req.headers[n] || "").split(",")[0].trim();
  return h("x-vercel-forwarded-for") || h("x-real-ip") || h("x-forwarded-for") || String(req.socket.remoteAddress || "unknown");
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization, x-api-key, mcp-session-id, mcp-protocol-version",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(JSON.stringify(body, null, 2));
}

export async function readJson(req: IncomingMessage & { body?: any }): Promise<any> {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let s = "";
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > 100_000) throw new Error("body too large");
    s += c;
  }
  return s ? JSON.parse(s) : {};
}

export function bearer(req: IncomingMessage): string | undefined {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] || (req.headers["x-api-key"] as string | undefined) || undefined;
}

export function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url || "/", "http://x").searchParams;
}
