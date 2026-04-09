const { Readable } = require("stream");
const { guardProxyRequest, resolveSiteOrigin } = require("./_proxy-guard");

function readQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isAllowedMediaUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "anilibria.top" || /(^|\.)libria\.fun$/i.test(url.hostname))
    );
  } catch {
    return false;
  }
}

function resolveProxyOrigin(req) {
  return resolveSiteOrigin(req);
}

function isManifestResponse(target, upstream) {
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  return /\.m3u8(?:$|\?)/i.test(target) || contentType.includes("mpegurl");
}

function buildProxyUrl(proxyOrigin, rawUrl) {
  return `${proxyOrigin}/api/anilibria-stream?url=${encodeURIComponent(rawUrl)}`;
}

function rewriteManifestLine(line, baseUrl, proxyOrigin) {
  if (!line) return line;
  if (line.startsWith("#")) {
    return line.replace(/URI="([^"]+)"/g, (match, uri) => {
      try {
        const absolute = new URL(uri, baseUrl).toString();
        return `URI="${buildProxyUrl(proxyOrigin, absolute)}"`;
      } catch {
        return match;
      }
    });
  }

  try {
    const absolute = new URL(line, baseUrl).toString();
    return buildProxyUrl(proxyOrigin, absolute);
  } catch {
    return line;
  }
}

module.exports = async (req, res) => {
  if (!guardProxyRequest(req, res, { bucketName: "stream-proxy", maxPerWindow: 3600 })) {
    return;
  }

  const target = readQueryValue(req.query?.url);
  if (!target || !isAllowedMediaUrl(target)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Invalid media URL" }));
    return;
  }

  const requestHeaders = {
    accept: req.headers.accept || "*/*",
    "user-agent":
      req.headers["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnimeCloud/1.0"
  };

  if (req.headers.range) requestHeaders.range = req.headers.range;
  if (req.headers["if-none-match"]) requestHeaders["if-none-match"] = req.headers["if-none-match"];
  if (req.headers["if-modified-since"]) {
    requestHeaders["if-modified-since"] = req.headers["if-modified-since"];
  }

  try {
    const upstream = await fetch(target, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: requestHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });

    res.statusCode = upstream.status;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-AnimeCloud-Proxy", "anilibria-stream");

    if (isManifestResponse(target, upstream) && req.method !== "HEAD") {
      const proxyOrigin = resolveProxyOrigin(req);
      const text = await upstream.text();
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => rewriteManifestLine(line, target, proxyOrigin))
        .join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", upstream.headers.get("cache-control") || "public, max-age=60");
      res.setHeader("Content-Length", Buffer.byteLength(rewritten, "utf8"));
      res.end(rewritten);
      return;
    }

    [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "cache-control",
      "etag",
      "last-modified",
      "expires"
    ].forEach((headerName) => {
      const value = upstream.headers.get(headerName);
      if (value) {
        res.setHeader(headerName, value);
      }
    });

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    if (typeof Readable.fromWeb !== "function") {
      throw new Error("Readable.fromWeb requires Node.js 18+ runtime");
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Media proxy failed",
        message: String(error?.message || error || "Unknown error")
      })
    );
  }
};
