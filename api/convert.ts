import type { IncomingMessage, ServerResponse } from "node:http";
import { query } from "../src/http.js";
import { withQuota } from "../src/guard.js";
import { convertIso } from "../src/tz.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return withQuota(req, res, () => {
    const sp = query(req);
    const iso = sp.get("iso") || "";
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || "UTC";
    return convertIso(iso, from, to);
  });
}
