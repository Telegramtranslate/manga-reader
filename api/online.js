const crypto = require("node:crypto");

const ONLINE_KEY = "animecloud:online:v1";
const ONLINE_TTL_MS = 2 * 60 * 1000;
const ONLINE_KEY_TTL_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 4096;
const ONLINE_COUNTER_MODE = String(process.env.ONLINE_COUNTER_MODE || "hybrid").trim().toLowerCase();
const ONLINE_FALLBACK_MIN = readBoundedInteger(process.env.ONLINE_FALLBACK_MIN, 80, 1, 9999);
const ONLINE_FALLBACK_MAX = Math.max(
  ONLINE_FALLBACK_MIN,
  readBoundedInteger(process.env.ONLINE_FALLBACK_MAX, 260, ONLINE_FALLBACK_MIN, 9999)
);

let redisClient = null;
let redisInitAttempted = false;
const memorySessions = new Map();

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

function readBoundedInteger(value, fallback, min, max) {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getRedisEnv() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_REST_API_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_REST_API_TOKEN ||
    "";
  return { url: url.trim(), token: token.trim() };
}

function hasRedisConfig() {
  const { url, token } = getRedisEnv();
  return Boolean(url && token);
}

function getRedisClient() {
  if (redisClient) return redisClient;
  if (redisInitAttempted) return null;
  redisInitAttempted = true;

  const { url, token } = getRedisEnv();
  if (!url || !token) return null;

  try {
    const { Redis } = require("@upstash/redis");
    redisClient = new Redis({ url, token });
  } catch {
    redisClient = null;
  }
  return redisClient;
}

function cleanupMemorySessions(timestamp = Date.now()) {
  const cutoff = timestamp - ONLINE_TTL_MS;
  for (const [sessionId, lastSeen] of memorySessions.entries()) {
    if (Number(lastSeen || 0) < cutoff) {
      memorySessions.delete(sessionId);
    }
  }
}

function fallbackSessionId(req) {
  const source = [
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || ""
  ].join("|");

  return `auto-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 32)}`;
}

function normalizeSessionId(value, req) {
  const raw = String(value || "").trim();
  if (/^[a-zA-Z0-9:_-]{12,96}$/.test(raw)) return raw;
  return fallbackSessionId(req);
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }

  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function countWithRedis(sessionId, timestamp) {
  const redis = getRedisClient();
  if (!redis) return null;

  const cutoff = timestamp - ONLINE_TTL_MS;
  await redis.zremrangebyscore(ONLINE_KEY, 0, cutoff);
  await redis.zadd(ONLINE_KEY, { score: timestamp, member: sessionId });
  await redis.expire(ONLINE_KEY, ONLINE_KEY_TTL_SECONDS);
  return Number(await redis.zcard(ONLINE_KEY)) || 0;
}

function countWithMemory(sessionId, timestamp) {
  cleanupMemorySessions(timestamp);
  memorySessions.set(sessionId, timestamp);
  return memorySessions.size;
}

function stableHashNumber(input) {
  return Number.parseInt(crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 8), 16) || 0;
}

function getFallbackEstimate(timestamp) {
  const fiveMinuteBucket = Math.floor(timestamp / (5 * 60 * 1000));
  const dayBucket = Math.floor(timestamp / (24 * 60 * 60 * 1000));
  const spread = Math.max(1, ONLINE_FALLBACK_MAX - ONLINE_FALLBACK_MIN + 1);
  const raw = ONLINE_FALLBACK_MIN + (stableHashNumber(`${ONLINE_KEY}:${dayBucket}:${fiveMinuteBucket}`) % spread);
  const wave = Math.round(Math.sin(fiveMinuteBucket / 4) * Math.min(18, Math.max(4, spread * 0.08)));
  return Math.min(ONLINE_FALLBACK_MAX, Math.max(ONLINE_FALLBACK_MIN, raw + wave));
}

function countWithFallback(sessionId, timestamp) {
  const memoryCount = countWithMemory(sessionId, timestamp);

  if (ONLINE_COUNTER_MODE === "memory" || ONLINE_COUNTER_MODE === "strict") {
    return {
      count: memoryCount,
      source: "memory",
      realTime: false
    };
  }

  return {
    count: Math.max(memoryCount, getFallbackEstimate(timestamp)),
    source: "estimate",
    realTime: false
  };
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const timestamp = Date.now();
  const body = req.method === "POST" ? await parseJsonBody(req) : {};
  const sessionId = normalizeSessionId(body.sessionId || req.query?.sessionId, req);

  try {
    const redisCount = await countWithRedis(sessionId, timestamp);
    if (redisCount !== null) {
      sendJson(res, 200, {
        ok: true,
        count: redisCount,
        ttlMs: ONLINE_TTL_MS,
        source: "redis",
        realTime: true
      });
      return;
    }
  } catch (error) {
    console.warn("online redis counter failed", error?.message || error);
  }

  const fallback = countWithFallback(sessionId, timestamp);
  sendJson(res, 200, {
    ok: true,
    count: fallback.count,
    ttlMs: ONLINE_TTL_MS,
    source: fallback.source,
    realTime: fallback.realTime,
    sharedCounterConfigured: hasRedisConfig()
  });
};
