function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 256000) {
        reject(new Error("CSP report body too large"));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (req.method !== "POST") {
    res.statusCode = 204;
    res.end("");
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const parsedBody = rawBody ? JSON.parse(rawBody) : null;
    console.warn(
      "[csp-report]",
      JSON.stringify(
        {
          userAgent: req.headers["user-agent"] || "",
          referer: req.headers.referer || "",
          body: parsedBody
        },
        null,
        2
      )
    );
  } catch (error) {
    console.warn("[csp-report] failed to parse report", error?.message || error);
  }

  res.statusCode = 204;
  res.end("");
};
