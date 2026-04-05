(function () {
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
    authDomain: "oauth-489621.firebaseapp.com",
    projectId: "oauth-489621",
    storageBucket: "oauth-489621.firebasestorage.app",
    messagingSenderId: "263581962151",
    appId: "1:263581962151:web:41538be2d5bae44d037082"
  };

  function parseRuntimeJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  }

  function shouldUseSameOriginAuthDomain(locationObject = window.location) {
    const hostname = String(locationObject?.hostname || "").trim().toLowerCase();
    const protocol = String(locationObject?.protocol || "").trim().toLowerCase();
    if (!hostname || protocol === "file:") return false;
    return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
  }

  function normalizeFirebaseConfig(config) {
    const next = { ...DEFAULT_FIREBASE_CONFIG, ...(config || {}) };
    const configuredAuthDomain = String(next.authDomain || "").trim().toLowerCase();
    const currentHostname = String(window.location?.hostname || "").trim().toLowerCase();

    // On production we proxy Firebase auth helpers through the current host,
    // so Google sign-in no longer exposes the raw firebaseapp.com helper domain.
    if (currentHostname && shouldUseSameOriginAuthDomain() && /(?:firebaseapp\.com|web\.app)$/i.test(configuredAuthDomain)) {
      next.authDomain = currentHostname;
    }

    return next;
  }

  const runtimeFirebaseConfig =
    window.ANIMECLOUD_FIREBASE_CONFIG_JSON ||
    window.__ANIMECLOUD_ENV__?.VITE_FIREBASE_CONFIG ||
    document.querySelector('meta[name="firebase-config"]')?.content ||
    window.ANIMECLOUD_FIREBASE_CONFIG ||
    null;

  const FIREBASE_CONFIG = normalizeFirebaseConfig(parseRuntimeJson(runtimeFirebaseConfig, DEFAULT_FIREBASE_CONFIG));

  const APP_CHECK_SITE_KEY =
    window.ANIMECLOUD_APP_CHECK_KEY ||
    window.__ANIMECLOUD_ENV__?.VITE_APP_CHECK_KEY ||
    document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
    "";
  const APP_CHECK_ENABLED =
    document.querySelector('meta[name="firebase-app-check-enabled"]')?.content === "true" ||
    window.ANIMECLOUD_ENABLE_APP_CHECK === true;

  let recaptchaPromise = null;

  window.ANIMECLOUD_FIREBASE_CONFIG = FIREBASE_CONFIG;
  window.ANIMECLOUD_FIREBASE_HELPER_HOST = DEFAULT_FIREBASE_CONFIG.authDomain;
  window.ANIMECLOUD_FIREBASE_HELPER_ORIGIN = `https://${DEFAULT_FIREBASE_CONFIG.authDomain}`;
  window.ANIMECLOUD_FIREBASE_SDK_VERSION = window.ANIMECLOUD_FIREBASE_SDK_VERSION || "10.12.5";
  window.ANIMECLOUD_APP_CHECK_KEY = window.ANIMECLOUD_APP_CHECK_KEY || APP_CHECK_SITE_KEY;
  window.ANIMECLOUD_ENABLE_APP_CHECK = window.ANIMECLOUD_ENABLE_APP_CHECK === true || APP_CHECK_ENABLED;

  window.animeCloudLoadRecaptchaEnterprise = function animeCloudLoadRecaptchaEnterprise() {
    if (!window.ANIMECLOUD_ENABLE_APP_CHECK || !window.ANIMECLOUD_APP_CHECK_KEY) {
      return Promise.resolve(null);
    }

    if (recaptchaPromise) return recaptchaPromise;

    const existing = document.querySelector('script[data-animecloud-recaptcha="1"]');
    if (existing) {
      recaptchaPromise = Promise.resolve(existing);
      return recaptchaPromise;
    }

    recaptchaPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(window.ANIMECLOUD_APP_CHECK_KEY)}`;
      script.async = true;
      script.defer = true;
      script.dataset.animecloudRecaptcha = "1";
      script.onload = () => resolve(script);
      script.onerror = () => {
        recaptchaPromise = null;
        reject(new Error("reCAPTCHA Enterprise script load failed"));
      };
      document.head.appendChild(script);
    });

    return recaptchaPromise;
  };
})();
