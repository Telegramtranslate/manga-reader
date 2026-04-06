module.exports = async (req, res) => {
  const payload = {
    VITE_FIREBASE_CONFIG: process.env.VITE_FIREBASE_CONFIG || "",
    VITE_APP_CHECK_KEY: process.env.VITE_APP_CHECK_KEY || "",
    VITE_FIREBASE_CUSTOM_AUTH_DOMAIN: process.env.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || ""
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  res.end(`window.__ANIMECLOUD_ENV__=${JSON.stringify(payload)};`);
};
