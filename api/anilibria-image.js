const { Readable } = require("stream");
const { guardProxyRequest } = require("./_proxy-guard");

function readValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isAllowedImageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "anilibria.top" ||
        /(^|\.)anilibria\.top$/i.test(url.hostname) ||
        /(^|\.)libria\.fun$/i.test(url.hostname) ||
        /(^|\.)kp\.yandex\.net$/i.test(url.hostname) ||
        /(^|\.)kodik\.biz$/i.test(url.hostname) ||
        /(^|\.)kodik\.info$/i.test(url.hostname) ||
        /(^|\.)kodikres\.com$/i.test(url.hostname) ||
        /(^|\.)shikimori\.io$/i.test(url.hostname) ||
        /(^|\.)shikimori\.one$/i.test(url.hostname) ||
        /(^|\.)shikimori\.me$/i.test(url.hostname) ||
        /(^|\.)shikimori\.org$/i.test(url.hostname))
    );
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (!guardProxyRequest(req, res, { bucketName: "image-proxy", maxPerWindow: 720 })) {
    return;
  }

  const target = readValue(req.query?.url);

  if (!target || !isAllowedImageUrl(target)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Invalid image URL" }));
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: {
        accept: req.headers.accept || "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent":
          req.headers["user-agent"] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnimeCloud/1.0"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000)
    });

    if (!upstream.ok) {
      res.statusCode = 307;
      res.setHeader("Location", target);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-AnimeCloud-Proxy", "anilibria-image");
    res.setHeader("Cache-Control", "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800, immutable");
    res.setHeader("Vary", "Accept");

    ["content-type", "content-length", "etag", "last-modified", "accept-ranges", "content-range"].forEach(
      (headerName) => {
        const value = upstream.headers.get(headerName);
        if (value) {
          res.setHeader(headerName, value);
        }
      }
    );

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    if (typeof Readable.fromWeb !== "function") {
      throw new Error("Readable.fromWeb requires Node.js 18+ runtime");
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.statusCode = 307;
    res.setHeader("Location", target);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
    res.end();
  }
};
