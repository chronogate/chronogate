// Minimal stateless MCP server over Streamable HTTP (JSON responses, no SSE). Protocol 2025-06-18.
import type { IncomingMessage, ServerResponse } from "node:http";
import { take, overLimitBody } from "../src/ratelimit.js";
import { clientIp, send, readJson, bearer } from "../src/http.js";
import { nowInZone, convertIso } from "../src/tz.js";
import { resolveExpression } from "../src/resolve.js";
import { isBusinessDay, addBusinessDays } from "../src/business.js";

const TOOLS = [
  {
    name: "now",
    title: "Now in timezone",
    description: "Current instant plus wall-clock time in an IANA timezone (e.g. America/Chicago). Includes offset and DST flag.",
    inputSchema: {
      type: "object",
      properties: { tz: { type: "string", description: "IANA timezone, default UTC" } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "convert",
    title: "Convert between timezones",
    description: "Convert an ISO-8601 instant (or naive local with from=) between IANA zones, handling DST.",
    inputSchema: {
      type: "object",
      properties: {
        iso: { type: "string", description: "ISO-8601 datetime" },
        from: { type: "string", description: "Source IANA zone if iso is naive" },
        to: { type: "string", description: "Target IANA zone (default UTC)" },
      },
      required: ["iso"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "resolve_expression",
    title: "Resolve relative time expression",
    description: 'Resolve expressions like "next Tuesday 3pm", "tomorrow 9am", or "in 2 business days" in a timezone.',
    inputSchema: {
      type: "object",
      properties: {
        expr: { type: "string" },
        tz: { type: "string", description: "IANA timezone" },
        country: { type: "string", description: "ISO country for business-day exprs (default US)" },
      },
      required: ["expr", "tz"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "is_business_day",
    title: "Is business day",
    description: "Whether a YYYY-MM-DD date is a business day in a country (weekend + Nager.Date public holidays).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        country: { type: "string", description: "ISO 3166-1 alpha-2, default US" },
      },
      required: ["date"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "add_business_days",
    title: "Add business days",
    description: "Add N business days to a start date, skipping weekends and public holidays.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "YYYY-MM-DD" },
        days: { type: "integer", description: "Non-negative integer" },
        country: { type: "string", description: "ISO 3166-1 alpha-2, default US" },
      },
      required: ["start", "days"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

async function callTool(name: string, args: any) {
  switch (name) {
    case "now":
      return nowInZone(args?.tz || "UTC");
    case "convert":
      return convertIso(String(args?.iso || ""), args?.from, args?.to || "UTC");
    case "resolve_expression":
      return resolveExpression(String(args?.expr || ""), String(args?.tz || "UTC"), args?.country || "US");
    case "is_business_day":
      return isBusinessDay(String(args?.date || ""), args?.country || "US");
    case "add_business_days":
      return addBusinessDays(String(args?.start || ""), Number(args?.days), args?.country || "US");
    default:
      throw Object.assign(new Error("unknown tool"), { code: "UNKNOWN_TOOL" });
  }
}

async function handle(msg: any, ip: string, key?: string) {
  const { id, method, params } = msg || {};
  const ok = (result: any) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string, data?: any) => ({ jsonrpc: "2.0", id, error: { code, message, data } });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "chronogate", title: "ChronoGate", version: "0.1.0" },
        instructions:
          "ChronoGate gives timezone and business-day truth for scheduling agents. Use now, convert, resolve_expression, is_business_day, and add_business_days. Not related to ChronoGate IoT devices.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      if (!TOOLS.some((t) => t.name === name)) return err(-32602, "unknown tool");
      const q = await take(ip, key);
      if (!q.allowed) {
        const b = overLimitBody(q);
        return ok({
          isError: true,
          content: [{ type: "text", text: b.message }],
          structuredContent: b,
        });
      }
      try {
        const r = await callTool(name, params?.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r });
      } catch (e: any) {
        return err(-32602, String(e?.message || e), { code: e?.code });
      }
    }
    default:
      if (id === undefined) return null;
      return err(-32601, `method not found: ${method}`);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET") return send(res, 405, { error: "SSE not supported; POST JSON-RPC to this endpoint" }, { allow: "POST" });
  if (req.method === "DELETE") return send(res, 200, {});
  if (req.method !== "POST") return send(res, 405, {});
  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  const ip = clientIp(req);
  const key = bearer(req);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 10).map((m) => handle(m, ip, key)))).filter(Boolean);
    return out.length ? send(res, 200, out) : (res.writeHead(202), res.end());
  }
  const out = await handle(body, ip, key);
  if (!out) {
    res.writeHead(202);
    return res.end();
  }
  return send(res, 200, out);
}
