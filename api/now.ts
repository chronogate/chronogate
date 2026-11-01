import type { IncomingMessage, ServerResponse } from "node:http";
import { query } from "../src/http.js";
import { withQuota } from "../src/guard.js";
import { nowInZone } from "../src/tz.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return withQuota(req, res, () => {
    const tz = query(req).get("tz") || "UTC";
    return nowInZone(tz);
  });
}
