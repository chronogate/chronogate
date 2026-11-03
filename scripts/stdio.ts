// ChronoGate MCP over stdio (newline-delimited JSON-RPC). Same tools as POST /mcp.
// Used by the Dockerfile (Glama wraps it with mcp-proxy). Logs go to stderr only.
import readline from "node:readline";
import { handle } from "../api/mcp.js";

const rl = readline.createInterface({ input: process.stdin });
const write = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); } catch { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const msgs = Array.isArray(msg) ? msg : [msg];
  for (const m of msgs) {
    const out = await handle(m, "stdio", process.env.CHRONOGATE_API_KEY);
    if (out) write(out);
  }
});
console.error("ChronoGate MCP (stdio) ready");
