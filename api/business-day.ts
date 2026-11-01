import type { IncomingMessage, ServerResponse } from "node:http";
import { query } from "../src/http.js";
import { withQuota } from "../src/guard.js";
import { isBusinessDay } from "../src/business.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return withQuota(req, res, () => {
    const sp = query(req);
    const date = sp.get("date") || "";
    const country = sp.get("country") || "US";
    return isBusinessDay(date, country);
  });
}
