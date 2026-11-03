# ChronoGate

Timezone and business-day truth for scheduling agents. LLMs guess at "now", DST and holidays; ChronoGate answers authoritatively: current time in any IANA zone, DST-safe conversion, relative expressions ("next Tuesday 3pm", "in 3 business days"), and public-holiday-aware business days for 100+ countries (via Nager.Date).

- **Remote MCP:** `https://chronogate-self.vercel.app/mcp` (Streamable HTTP, JSON-RPC, protocol 2025-06-18, stateless)
- **Docs for agents:** [https://chronogate-self.vercel.app/llms.txt](https://chronogate-self.vercel.app/llms.txt)
- **Free tier:** 200 calls/day per IP, no API key. Over the limit returns HTTP 402 (with buy link); resets 00:00 UTC. Paid tier coming.

## MCP tools

| Tool | What it does |
|---|---|
| `now` | Current instant + wall-clock time, offset and DST flag in an IANA zone |
| `convert` | Convert an ISO timestamp between zones, DST-safe |
| `resolve_expression` | Resolve "tomorrow 9am", "next Tuesday 3pm", "in N business days" to an exact instant |
| `is_business_day` | Weekend + public-holiday check for a date and country |
| `add_business_days` | Add N business days to a date, skipping weekends and holidays |

## Client config

```json
{
  "mcpServers": {
    "chronogate": {
      "type": "http",
      "url": "https://chronogate-self.vercel.app/mcp"
    }
  }
}
```

## REST

```bash
curl "https://chronogate-self.vercel.app/v1/now?tz=America/Chicago"
curl "https://chronogate-self.vercel.app/v1/convert?iso=2026-03-08T08:00:00Z&to=America/Chicago"
curl "https://chronogate-self.vercel.app/v1/resolve?expr=next%20Tuesday%203pm&tz=America/Chicago"
curl "https://chronogate-self.vercel.app/v1/business-day?date=2026-07-03&country=US"
curl "https://chronogate-self.vercel.app/v1/business-days/add?start=2026-07-02&days=3&country=US"

# MCP over plain HTTP
curl -X POST https://chronogate-self.vercel.app/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Run locally

```bash
npm install && npm run dev   # local server
npm test                     # smoke tests
```
Deploys as Vercel serverless functions (see `vercel.json`).

## Notes

- Holidays come from the public [Nager.Date](https://date.nager.at) API; if it's unavailable, weekend logic still works (`holiday_source: "unavailable"`).
- [Terms](https://chronogate-self.vercel.app/terms.html)
- ChronoGate is not affiliated with chronogate.io.

MIT licensed.

## Paid credits

- $5 = 20,000 calls (one-time pack, no subscription). Buy: https://buy.stripe.com/3cIeVec3Hagz6ZBc4VgMw00
- After paying you land on /success, which shows your `cg_` API key once (kept 7 days).
- REST: `Authorization: Bearer cg_...`. MCP: same header on https://chronogate-self.vercel.app/mcp
- 1 credit per call. Unknown key → 401. Empty key or free tier used up → 402 with a `buy` link.

## Docker (stdio MCP)

```sh
docker build -t chronogate .
docker run -i --rm chronogate        # MCP over stdio; wrap with mcp-proxy for HTTP
npm run healthcheck                  # initialize + tools/list handshake (also the Docker HEALTHCHECK)
```
