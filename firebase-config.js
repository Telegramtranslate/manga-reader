(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
    authDomain: "oauth-489621.firebaseapp.com",
    projectId: "oauth-489621",
    storageBucket: "oauth-489621.firebasestorage.app",
    messagingSenderId: "263581962151",
    appId: "1:263581962151:web:41538be2d5bae44d037082"
  };

  const APP_CHECK_SITE_KEY =
    document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
    window.ANIMECLOUD_APP_CHECK_KEY ||
    "";
  const APP_CHECK_ENABLED =
    document.querySelector('meta[name="firebase-app-check-enabled"]')?.content === "true" ||
    window.ANIMECLOUD_ENABLE_APP_CHECK === true;

  let recaptchaPromise = null;

  window.ANIMECLOUD_FIREBASE_CONFIG = window.ANIMECLOUD_FIREBASE_CONFIG || FIREBASE_CONFIG;
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
