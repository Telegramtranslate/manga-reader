module.exports = async (req, res) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .trim()
    .toLowerCase();
  const allowLocalhostAuth = String(process.env.VITE_FIREBASE_ALLOW_LOCALHOST_AUTH || "")
    .trim()
    .toLowerCase() === "true";
  const isLocalHost = /^(localhost|127(?:\.\d{1,3}){3})(:\d+)?$/.test(host);
  const customAuthDomain = String(process.env.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || "").trim();
  const forceCustomAuthDomain = String(process.env.VITE_FIREBASE_FORCE_CUSTOM_AUTH_DOMAIN || "").trim();
  const siteUrl = String(process.env.SITE_URL || "").trim();
  let parsed = {};
  try {
    parsed = JSON.parse(process.env.VITE_FIREBASE_CONFIG || "{}");
  } catch {
    parsed = {};
  }

  const valid = Boolean(parsed.apiKey && parsed.authDomain && parsed.projectId);
  const firebaseDisabledByLocalMode = isLocalHost && !allowLocalhostAuth;
  const effectiveValid = valid && !firebaseDisabledByLocalMode;
  const runtimeError = firebaseDisabledByLocalMode ? "Firebase disabled in local mode" : valid ? "" : "Firebase config missing";

  const payload = {
    VITE_FIREBASE_CONFIG: effectiveValid ? JSON.stringify(parsed) : "",
    VITE_APP_CHECK_KEY: effectiveValid ? process.env.VITE_APP_CHECK_KEY || "" : "",
    VITE_APP_CHECK_ENABLED: effectiveValid ? process.env.VITE_APP_CHECK_ENABLED || "" : "",
    VITE_FIREBASE_CUSTOM_AUTH_DOMAIN: effectiveValid ? customAuthDomain : "",
    VITE_FIREBASE_FORCE_CUSTOM_AUTH_DOMAIN: effectiveValid ? forceCustomAuthDomain : "",
    VITE_FIREBASE_ALLOW_LOCALHOST_AUTH: allowLocalhostAuth ? "true" : "",
    SITE_URL: siteUrl
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", effectiveValid ? "public, max-age=31536000, s-maxage=31536000, immutable" : "no-store");
  res.end(
    `window.__ANIMECLOUD_ENV__=${JSON.stringify(payload)};window.ANIMECLOUD_RUNTIME_CONFIG_ERROR=${JSON.stringify(runtimeError)};`
  );
};
