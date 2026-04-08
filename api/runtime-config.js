module.exports = async (req, res) => {
  let parsed = {};
  try {
    parsed = JSON.parse(process.env.VITE_FIREBASE_CONFIG || "{}");
  } catch {
    parsed = {};
  }

  const valid = Boolean(parsed.apiKey && parsed.authDomain && parsed.projectId);

  const payload = {
    VITE_FIREBASE_CONFIG: valid ? JSON.stringify(parsed) : "",
    VITE_APP_CHECK_KEY: process.env.VITE_APP_CHECK_KEY || "",
    VITE_FIREBASE_CUSTOM_AUTH_DOMAIN: process.env.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || ""
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", valid ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "no-store");
  res.end(
    `window.__ANIMECLOUD_ENV__=${JSON.stringify(payload)};window.ANIMECLOUD_RUNTIME_CONFIG_ERROR=${JSON.stringify(
      valid ? "" : "Firebase config missing"
    )};`
  );
};
