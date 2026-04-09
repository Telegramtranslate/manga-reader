(function () {
  function parseRuntimeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }

  function hasRequiredFirebaseFields(config) {
    if (!config || typeof config !== "object") return false;
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => String(config[key] || "").trim());
  }

  function shouldUseSameOriginAuthDomain(locationObject = window.location) {
    const hostname = String(locationObject?.hostname || "").trim().toLowerCase();
    const protocol = String(locationObject?.protocol || "").trim().toLowerCase();
    if (!hostname || protocol === "file:") return false;
    return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
  }

  function readCustomAuthDomainValue() {
    return String(window.__ANIMECLOUD_ENV__?.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN || "").trim();
  }

  function useForcedCustomAuthDomain() {
    return String(window.__ANIMECLOUD_ENV__?.VITE_FIREBASE_FORCE_CUSTOM_AUTH_DOMAIN || "")
      .trim()
      .toLowerCase() === "true";
  }

  function isFirebaseHostedDomain(hostname) {
    return /(?:firebaseapp\.com|web\.app)$/i.test(String(hostname || "").trim().toLowerCase());
  }

  function getConfiguredCustomAuthDomain() {
    const envValue = readCustomAuthDomainValue();
    if (!envValue) return "";
    if (envValue.toLowerCase() === "true") {
      return String(window.location?.hostname || "").trim().toLowerCase();
    }
    return envValue.toLowerCase();
  }

  function isCustomAuthDomainEnabled() {
    const explicitDomain = getConfiguredCustomAuthDomain();
    return (
      window.ANIMECLOUD_USE_CUSTOM_AUTH_DOMAIN === true ||
      document.querySelector('meta[name="firebase-custom-auth-domain"]')?.content === "true" ||
      Boolean(explicitDomain)
    );
  }

  function normalizeFirebaseConfig(config) {
    if (!hasRequiredFirebaseFields(config)) {
      return null;
    }

    const next = { ...config };
    const configuredAuthDomain = String(next.authDomain || "").trim().toLowerCase();
    const currentHostname = String(window.location?.hostname || "").trim().toLowerCase();

    const explicitCustomAuthDomain = getConfiguredCustomAuthDomain();

    if (
      explicitCustomAuthDomain &&
      (useForcedCustomAuthDomain() ||
        explicitCustomAuthDomain === configuredAuthDomain ||
        isFirebaseHostedDomain(explicitCustomAuthDomain))
    ) {
      next.authDomain = explicitCustomAuthDomain;
      return next;
    }

    if (
      useForcedCustomAuthDomain() &&
      isCustomAuthDomainEnabled() &&
      currentHostname &&
      shouldUseSameOriginAuthDomain() &&
      isFirebaseHostedDomain(configuredAuthDomain)
    ) {
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

  const FIREBASE_CONFIG = normalizeFirebaseConfig(parseRuntimeJson(runtimeFirebaseConfig));

  const APP_CHECK_SITE_KEY =
    window.ANIMECLOUD_APP_CHECK_KEY ||
    window.__ANIMECLOUD_ENV__?.VITE_APP_CHECK_KEY ||
    document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
    "";
  const APP_CHECK_ENABLED =
    document.querySelector('meta[name="firebase-app-check-enabled"]')?.content === "true" ||
    window.ANIMECLOUD_ENABLE_APP_CHECK === true;

  let recaptchaPromise = null;
  const helperHost = String(FIREBASE_CONFIG?.authDomain || "").trim();

  window.ANIMECLOUD_FIREBASE_CONFIG = FIREBASE_CONFIG;
  window.ANIMECLOUD_FIREBASE_DISABLED = !FIREBASE_CONFIG;
  window.ANIMECLOUD_FIREBASE_ERROR = FIREBASE_CONFIG ? "" : "Firebase config missing or invalid";
  window.ANIMECLOUD_FIREBASE_HELPER_HOST = helperHost;
  window.ANIMECLOUD_FIREBASE_HELPER_ORIGIN = helperHost ? `https://${helperHost}` : "";
  window.ANIMECLOUD_USE_CUSTOM_AUTH_DOMAIN = isCustomAuthDomainEnabled();
  window.ANIMECLOUD_FIREBASE_SDK_VERSION = window.ANIMECLOUD_FIREBASE_SDK_VERSION || "10.12.5";
  window.ANIMECLOUD_APP_CHECK_KEY = window.ANIMECLOUD_APP_CHECK_KEY || APP_CHECK_SITE_KEY;
  window.ANIMECLOUD_ENABLE_APP_CHECK = window.ANIMECLOUD_ENABLE_APP_CHECK === true || APP_CHECK_ENABLED;

  window.animeCloudLoadRecaptchaEnterprise = function animeCloudLoadRecaptchaEnterprise() {
    if (window.ANIMECLOUD_FIREBASE_DISABLED || !window.ANIMECLOUD_ENABLE_APP_CHECK || !window.ANIMECLOUD_APP_CHECK_KEY) {
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
