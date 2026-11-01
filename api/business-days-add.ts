import type { IncomingMessage, ServerResponse } from "node:http";
import { query } from "../src/http.js";
import { withQuota } from "../src/guard.js";
import { addBusinessDays } from "../src/business.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return withQuota(req, res, () => {
    const sp = query(req);
    const start = sp.get("start") || "";
    const days = Number(sp.get("days"));
    const country = sp.get("country") || "US";
    return addBusinessDays(start, days, country);
  });
}
