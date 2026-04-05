const { Readable } = require("stream");

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

module.exports = async (req, res) => {
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
      redirect: "follow"
    });

    res.statusCode = upstream.status;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-AnimeCloud-Proxy", "anilibria-stream");

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
