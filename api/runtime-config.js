module.exports = async (req, res) => {
  const parsed = JSON.parse(process.env.VITE_FIREBASE_CONFIG || "{}");

  if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId) {
    res.statusCode = 500;
    res.end("Firebase config missing");
    return;
  }

  const payload = {
    VITE_FIREBASE_CONFIG: JSON.stringify(parsed),
    VITE_APP_CHECK_KEY: process.env.VITE_APP_CHECK_KEY || "",
    VITE_FIREBASE_CUSTOM_AUTH_DOMAIN: process.env.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || ""
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.end(`window.__ANIMECLOUD_ENV__=${JSON.stringify(payload)};`);
};
