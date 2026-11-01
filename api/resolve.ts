import type { IncomingMessage, ServerResponse } from "node:http";
import { query } from "../src/http.js";
import { withQuota } from "../src/guard.js";
import { resolveExpression } from "../src/resolve.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return withQuota(req, res, () => {
    const sp = query(req);
    const expr = sp.get("expr") || "";
    const tz = sp.get("tz") || "UTC";
    const country = sp.get("country") || "US";
    return resolveExpression(expr, tz, country);
  });
}
