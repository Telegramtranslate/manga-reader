const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REPORTS = 25;
const requestBuckets = new Map();

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 128000) {
        reject(new Error("CSP report body too large"));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || "");
  const forwardedIp = firstForwarded.split(",")[0]?.trim();
  return forwardedIp || req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function isRateLimited(ipAddress) {
  const now = Date.now();

  for (const [key, entry] of requestBuckets.entries()) {
    if (now - entry.startedAt > RATE_LIMIT_WINDOW_MS) {
      requestBuckets.delete(key);
    }
  }

  const bucket = requestBuckets.get(ipAddress);
  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    requestBuckets.set(ipAddress, { startedAt: now, count: 1 });
    return false;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REPORTS) {
    return true;
  }

  bucket.count += 1;
  return false;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const ipAddress = getClientIp(req);
  if (isRateLimited(ipAddress)) {
    res.statusCode = 429;
    res.end("Too Many Requests");
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const parsedBody = rawBody ? JSON.parse(rawBody) : null;
    console.warn(
      "[csp-report]",
      JSON.stringify(
        {
          ipAddress,
          userAgent: req.headers["user-agent"] || "",
          referer: req.headers.referer || "",
          body: parsedBody
        },
        null,
        2
      )
    );
  } catch (error) {
    console.warn("[csp-report] failed to parse report", JSON.stringify({ ipAddress, message: error?.message || String(error) }));
  }

  res.statusCode = 204;
  res.end("");
};
