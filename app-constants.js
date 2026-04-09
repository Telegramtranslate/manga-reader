(function () {
  const DEFAULT_SITE_URL =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://example.invalid";

  function normalizeSiteUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).toString().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  const runtimeSiteUrl = normalizeSiteUrl(window.__ANIMECLOUD_ENV__?.SITE_URL);
  const canonicalSiteUrl = normalizeSiteUrl(document.getElementById("canonical-link")?.href);
  const originSiteUrl = normalizeSiteUrl(window.location?.origin);

  const STORAGE_KEYS = Object.freeze({
    auth: "animecloud_auth_v1",
    authRedirectPending: "animecloud_google_redirect_pending_v1",
    favoritesPrefix: "animecloud_favorites",
    progress: "animecloud_watch_progress_v1",
    comments: "animecloud_comments_v1",
    lists: "animecloud_lists_v1",
    settings: "animecloud_settings_v1",
    adminHero: "animecloud_admin_featured_alias"
  });

  window.ANIMECLOUD_CONSTANTS = Object.freeze({
    DEFAULT_SITE_URL,
    SITE_URL: runtimeSiteUrl || canonicalSiteUrl || originSiteUrl || DEFAULT_SITE_URL,
    STORAGE_KEYS
  });
})();
