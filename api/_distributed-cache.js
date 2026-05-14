let kvClient = null;
let kvInitAttempted = false;

const memoryCache = new Map();

function now() {
  return Date.now();
}

function cleanMemoryCache() {
  const timestamp = now();
  for (const [key, entry] of memoryCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= timestamp) {
      memoryCache.delete(key);
    }
  }
}

function readMemory(key) {
  cleanMemoryCache();
  const entry = memoryCache.get(key);
  return entry ? entry.value : null;
}

function writeMemory(key, value, ttlMs) {
  memoryCache.set(key, {
    value,
    expiresAt: now() + Math.max(1000, Number(ttlMs || 0))
  });
}

function getRedisEnv() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN ||
    "";
  return { url: url.trim(), token: token.trim() };
}

function canUseKv() {
  const { url, token } = getRedisEnv();
  return Boolean(url && token);
}

function getKvClient() {
  if (kvClient) return kvClient;
  if (kvInitAttempted) return null;
  kvInitAttempted = true;
  try {
    // Optional dependency: if not installed, silently fallback to memory cache.
    const { Redis } = require("@upstash/redis");
    const { url, token } = getRedisEnv();
    kvClient = new Redis({
      url,
      token
    });
  } catch {
    kvClient = null;
  }
  return kvClient;
}

async function getSharedJson(key) {
  const local = readMemory(key);
  if (local !== null) return local;

  if (!canUseKv()) return null;
  const kv = getKvClient();
  if (!kv) return null;

  try {
    const value = await kv.get(key);
    if (value !== null && value !== undefined) {
      writeMemory(key, value, 10000);
      return value;
    }
  } catch {}
  return null;
}

async function setSharedJson(key, value, ttlMs) {
  writeMemory(key, value, ttlMs);
  if (!canUseKv()) return;
  const kv = getKvClient();
  if (!kv) return;

  try {
    await kv.set(key, value, { ex: Math.max(1, Math.ceil(Number(ttlMs || 0) / 1000)) });
  } catch {}
}

module.exports = {
  getSharedJson,
  setSharedJson
};
