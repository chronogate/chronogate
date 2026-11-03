// Health check: spawn the stdio server, run initialize + tools/list, exit 0 if 5 tools come back.
import { spawn } from "node:child_process";
const p = spawn(process.execPath, ["--import", "tsx", "scripts/stdio.ts"], { stdio: ["pipe", "pipe", "ignore"] });
const t = setTimeout(() => { p.kill(); console.error("healthcheck: timeout"); process.exit(1); }, 10000);
let buf = "";
p.stdout.on("data", (d) => {
  buf += d;
  for (const l of buf.split("\n").slice(0, -1)) {
    const m = JSON.parse(l);
    if (m.id === 2) { clearTimeout(t); p.kill(); const n = m.result?.tools?.length; console.log(`healthcheck: ok, ${n} tools`); process.exit(n === 5 ? 0 : 1); }
  }
});
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "hc", version: "1" } } }) + "\n");
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
