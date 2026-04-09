const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestBuckets = new Map();

function readHeader(req, headerName) {
  const value = req.headers?.[headerName];
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function parseOrigin(rawValue) {
  if (!rawValue) return "";
  try {
    return new URL(rawValue).origin;
  } catch {
    return "";
  }
}

function resolveSiteOrigin(req) {
  const forwardedProto = readHeader(req, "x-forwarded-proto");
  const forwardedHost = readHeader(req, "x-forwarded-host");
  const protocol = forwardedProto || (req.connection?.encrypted ? "https" : "http");
  const host = forwardedHost || readHeader(req, "host") || "localhost";
  return `${protocol}://${host}`;
}

function getClientIp(req) {
  const forwardedFor = readHeader(req, "x-forwarded-for");
  const forwardedIp = forwardedFor.split(",")[0]?.trim();
  return forwardedIp || req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function isExpiredBucket(entry, now) {
  return !entry || now - Number(entry.startedAt || 0) > RATE_LIMIT_WINDOW_MS;
}

function isRateLimited(req, bucketName, maxPerWindow) {
  const now = Date.now();

  for (const [key, entry] of requestBuckets.entries()) {
    if (isExpiredBucket(entry, now)) {
      requestBuckets.delete(key);
    }
  }

  const bucketKey = `${bucketName}:${getClientIp(req)}`;
  const current = requestBuckets.get(bucketKey);

  if (isExpiredBucket(current, now)) {
    requestBuckets.set(bucketKey, { startedAt: now, count: 1 });
    return false;
  }

  if (current.count >= maxPerWindow) {
    return true;
  }

  current.count += 1;
  return false;
}

function isSameOriginBrowserRequest(req) {
  const siteOrigin = resolveSiteOrigin(req);
  const origin = parseOrigin(readHeader(req, "origin"));
  const referer = parseOrigin(readHeader(req, "referer"));

  if (origin) return origin === siteOrigin;
  if (referer) return referer === siteOrigin;

  const secFetchSite = readHeader(req, "sec-fetch-site").toLowerCase();
  return secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none";
}

function rejectJson(res, statusCode, errorMessage) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: errorMessage }));
}

function guardProxyRequest(req, res, options = {}) {
  const {
    bucketName = "proxy",
    maxPerWindow = 300,
    allowMethods = ["GET", "HEAD"]
  } = options;

  if (!allowMethods.includes(req.method || "GET")) {
    res.setHeader("Allow", allowMethods.join(", "));
    rejectJson(res, 405, "Method Not Allowed");
    return false;
  }

  if (!isSameOriginBrowserRequest(req)) {
    rejectJson(res, 403, "Cross-origin proxy access is forbidden");
    return false;
  }

  if (isRateLimited(req, bucketName, maxPerWindow)) {
    rejectJson(res, 429, "Too Many Requests");
    return false;
  }

  return true;
}

module.exports = {
  guardProxyRequest,
  readHeader,
  resolveSiteOrigin
};
