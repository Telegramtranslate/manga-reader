(function (global, factory) {
  const api = factory();
  global.ANIMECLOUD_PLAYER_UTILS = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  function shouldPreferFastStart(browserEnv = {}) {
    const navigatorLike = browserEnv.navigator || globalThis.navigator || {};
    const matchMedia = browserEnv.matchMedia || globalThis.matchMedia;
    const connection = navigatorLike.connection || navigatorLike.mozConnection || navigatorLike.webkitConnection;
    const saveData = Boolean(connection?.saveData);
    const effectiveType = String(connection?.effectiveType || "");
    const downlink = Number(connection?.downlink || 0);
    if (saveData || effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g") return true;
    if (downlink && downlink < 4) return true;
    return Boolean(matchMedia?.("(max-width: 860px)")?.matches && (!downlink || downlink < 6));
  }

  function pickPreferredQuality(options, currentQuality = "", browserEnv = {}) {
    const items = Array.isArray(options)
      ? options
      : Object.entries(options || {}).map(([key, value]) => ({ key, value }));
    if (!items.length) return Array.isArray(options) ? "" : "auto";
    if (currentQuality && currentQuality !== "auto" && items.some((item) => String(item.key) === String(currentQuality))) {
      return currentQuality;
    }
    if (shouldPreferFastStart(browserEnv) && items.some((item) => String(item.key) === "480")) return "480";
    if (items.some((item) => String(item.key) === "720")) return "720";
    if (items.some((item) => String(item.key) === "1080")) return "1080";
    return String(items[0].key || "");
  }

  return {
    shouldPreferFastStart,
    pickPreferredQuality
  };
});
