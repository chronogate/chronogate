import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import now from "../api/now.js";
import convert from "../api/convert.js";
import resolve from "../api/resolve.js";
import businessDay from "../api/business-day.js";
import businessDaysAdd from "../api/business-days-add.js";
import mcp from "../api/mcp.js";
import success from "../api/success.js";
import webhook from "../api/stripe-webhook.js";

const port = Number(process.env.PORT || 3000);
http
  .createServer(async (req, res) => {
    const p = new URL(req.url || "/", "http://x").pathname;
    if (p === "/v1/now" || p === "/api/now") return now(req, res);
    if (p === "/v1/convert" || p === "/api/convert") return convert(req, res);
    if (p === "/v1/resolve" || p === "/api/resolve") return resolve(req, res);
    if (p === "/v1/business-day" || p === "/api/business-day") return businessDay(req, res);
    if (p === "/v1/business-days/add" || p === "/api/business-days-add") return businessDaysAdd(req, res);
    if (p === "/success") return success(req, res);
    if (p === "/api/stripe/webhook" || p === "/api/stripe-webhook") return webhook(req, res);
    if (p === "/mcp" || p === "/api/mcp") return mcp(req, res);
    const f = path.join("public", p === "/" ? "index.html" : path.normalize(p).replace(/^\/+/, ""));
    if (f.startsWith("public") && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "text/plain; charset=utf-8" });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404);
    res.end("not found");
  })
  .listen(port, () => console.log(`ChronoGate dev on :${port}`));
