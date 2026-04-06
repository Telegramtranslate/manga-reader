const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
  authDomain: "oauth-489621.firebaseapp.com",
  projectId: "oauth-489621",
  storageBucket: "oauth-489621.firebasestorage.app",
  messagingSenderId: "263581962151",
  appId: "1:263581962151:web:41538be2d5bae44d037082"
};

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function hasRequiredFirebaseFields(config) {
  return Boolean(
    config &&
      typeof config === "object" &&
      ["apiKey", "authDomain", "projectId", "appId"].every((key) => String(config[key] || "").trim())
  );
}

module.exports = async (req, res) => {
  const parsedEnvConfig = parseJson(process.env.VITE_FIREBASE_CONFIG);
  const payload = {
    VITE_FIREBASE_CONFIG: JSON.stringify(hasRequiredFirebaseFields(parsedEnvConfig) ? parsedEnvConfig : DEFAULT_FIREBASE_CONFIG),
    VITE_APP_CHECK_KEY: process.env.VITE_APP_CHECK_KEY || "6Lf186YsAAAAAKBHEUg6qywGQgONrhC2AIaKzQDS",
    VITE_FIREBASE_CUSTOM_AUTH_DOMAIN: process.env.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || ""
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.end(`window.__ANIMECLOUD_ENV__=${JSON.stringify(payload)};`);
};
