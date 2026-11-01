/** KV store: Upstash Redis when env is present, otherwise in-memory (local/dev fallback). */
import { Redis } from "@upstash/redis";

export interface KV {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ttlSec?: number): Promise<void>;
  setNx(k: string, v: string, ttlSec?: number): Promise<boolean>;
  incrBy(k: string, n: number, ttlSec?: number): Promise<number>;
  del(k: string): Promise<void>;
  kind: "redis" | "memory";
}

function memoryKV(): KV {
  const m = new Map<string, { v: string; exp?: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp && e.exp < Date.now()) { m.delete(k); return undefined; }
    return e;
  };
  return {
    kind: "memory",
    async get(k) { return live(k)?.v ?? null; },
    async set(k, v, ttl) { m.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : undefined }); },
    async setNx(k, v, ttl) { if (live(k)) return false; m.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : undefined }); return true; },
    async incrBy(k, n, ttl) {
      const e = live(k);
      const nv = Number(e?.v || 0) + n;
      m.set(k, { v: String(nv), exp: e?.exp ?? (ttl ? Date.now() + ttl * 1000 : undefined) });
      return nv;
    },
    async del(k) { m.delete(k); },
  };
}

function redisKV(url: string, token: string): KV {
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: "redis",
    async get(k) { const v = await r.get<string>(k); return v == null ? null : String(v); },
    async set(k, v, ttl) { ttl ? await r.set(k, v, { ex: ttl }) : await r.set(k, v); },
    async setNx(k, v, ttl) { const x = ttl ? await r.set(k, v, { nx: true, ex: ttl }) : await r.set(k, v, { nx: true }); return x === "OK"; },
    async incrBy(k, n, ttl) { const v = await r.incrby(k, n); if (ttl && v === n) await r.expire(k, ttl); return v; },
    async del(k) { await r.del(k); },
  };
}

let _kv: KV | undefined;
export function kv(): KV {
  if (_kv) return _kv;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  _kv = url && token ? redisKV(url, token) : memoryKV();
  return _kv;
}
export function _setKV(k: KV | undefined) { _kv = k; }
