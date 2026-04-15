(function (global, factory) {
  const api = factory();
  global.ANIMECLOUD_API_CLIENT = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DEFAULT_ALLOWED_IMAGE_HOSTS = [
    /(^|\.)kp\.yandex\.net$/i,
    /(^|\.)kodik\.biz$/i,
    /(^|\.)kodik\.info$/i,
    /(^|\.)kodikres\.com$/i,
    /(^|\.)shikimori\.io$/i,
    /(^|\.)shikimori\.one$/i,
    /(^|\.)shikimori\.me$/i,
    /(^|\.)shikimori\.org$/i
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function absoluteUrl(path, fallback = "/mc-icon-512.png?v=5") {
    if (!path) return fallback;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("/")) return path;
    return path;
  }

  function normalizeExternalPlayer(url) {
    if (!url) return "";
    const raw = url.startsWith("//") ? `https:${url}` : url;
    try {
      const parsed = new URL(raw);
      if (parsed.hostname.includes("kodik")) {
        parsed.searchParams.set("translations", "true");
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  function normalizePath(path) {
    const next = `/${String(path || "").replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
    return next.length > 1 ? next.replace(/\/+$/, "") : "/";
  }

  function getViewPath(view) {
    return view === "home" ? "/" : normalizePath(view);
  }

  function getAnimePath(alias) {
    return `/anime/${encodeURIComponent(alias)}`;
  }

  function routeFromLocation(locationLike) {
    const activeLocation = locationLike || global.location;
    const pathname = normalizePath(activeLocation?.pathname || "/");
    const query = new URLSearchParams(activeLocation?.search || "").get("q")?.trim() || "";
    if (pathname.startsWith("/anime/")) {
      return { type: "anime", alias: decodeURIComponent(pathname.slice(7)), legacy: false };
    }

    const knownViews = new Set(["/", "/catalog", "/ongoing", "/top", "/schedule", "/search", "/profile"]);
    if (knownViews.has(pathname)) {
      return {
        type: "view",
        view: pathname === "/" ? "home" : pathname.slice(1),
        legacy: false,
        query
      };
    }

    const rawHash = String(activeLocation?.hash || "").replace(/^#/, "");
    if (rawHash.startsWith("anime/")) {
      return { type: "anime", alias: decodeURIComponent(rawHash.slice(6)), legacy: true };
    }
    if (rawHash) {
      return { type: "view", view: rawHash, legacy: true, query: "" };
    }
    return { type: "view", view: "home", legacy: false, query: "" };
  }

  function createFetchSignal(timeoutMs, externalSignal) {
    if (!timeoutMs && !externalSignal) {
      return { signal: undefined, cleanup: () => {} };
    }

    const controller = new AbortController();
    const cleanups = [];

    if (timeoutMs > 0) {
      const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
      cleanups.push(() => clearTimeout(timer));
    }

    if (externalSignal) {
      const abortFromExternal = () => controller.abort(externalSignal.reason);
      if (externalSignal.aborted) {
        abortFromExternal();
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, { once: true });
        cleanups.push(() => externalSignal.removeEventListener("abort", abortFromExternal));
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => cleanups.splice(0).forEach((fn) => fn())
    };
  }

  function createApiClient(options = {}) {
    const responseCache = options.responseCache || new Map();
    const requestCache = options.requestCache || new Map();
    const locationLike = options.location || global.location;
    const historyLike = options.history || global.history;
    const fetchImpl = options.fetchImpl || global.fetch.bind(global);
    const imageProxyBase = options.imageProxyBase || "/api/anilibria-image";
    const siteUrlBase = options.siteUrlBase || locationLike?.origin || "https://example.invalid";
    const apiTimeoutMs = Number(options.apiTimeoutMs || 10000);
    const apiRetryAttempts = Number(options.apiRetryAttempts || 3);
    const apiRetryBaseDelay = Number(options.apiRetryBaseDelay || 350);
    const allowedImageHosts =
      Array.isArray(options.allowedImageHosts) && options.allowedImageHosts.length
        ? options.allowedImageHosts
        : DEFAULT_ALLOWED_IMAGE_HOSTS;

    function siteUrl(path = "/") {
      return new URL(path, siteUrlBase).toString();
    }

    function apiUrl(path, params) {
      const url = new URL(path, locationLike?.origin || siteUrlBase);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
          }
        });
      }
      return url.toString();
    }

    function proxiedImageUrl(path) {
      const absolute = absoluteUrl(path);
      if (!absolute || absolute.startsWith("/")) return absolute;
      try {
        const url = new URL(absolute, locationLike?.origin || siteUrlBase);
        if (url.origin === (locationLike?.origin || "")) return url.toString();
        if (!allowedImageHosts.some((pattern) => pattern.test(url.hostname))) {
          return absolute;
        }
        return `${imageProxyBase}?url=${encodeURIComponent(url.toString())}`;
      } catch {
        return absolute;
      }
    }

    function navigateTo(path, navOptions = {}) {
      const nextPath = normalizePath(path);
      const nextUrl = new URL(nextPath, locationLike?.origin || siteUrlBase);
      const search = String(navOptions.search || "").replace(/^\?/, "").trim();
      nextUrl.search = search ? `?${search}` : "";
      const currentUrl = `${normalizePath(locationLike?.pathname || "/")}${locationLike?.search || ""}`;
      const nextUrlValue = `${nextUrl.pathname}${nextUrl.search}`;
      if (currentUrl === nextUrlValue) return;
      const method = navOptions.replace ? "replaceState" : "pushState";
      historyLike?.[method]?.({}, "", nextUrlValue);
    }

    async function fetchJson(path, params, fetchOptions = {}) {
      const ttl = fetchOptions.ttl ?? 120000;
      const url = apiUrl(path, params);
      const cached = responseCache.get(url);
      if (ttl > 0 && cached && Date.now() - cached.time < ttl) {
        return cached.data;
      }
      if (requestCache.has(url)) {
        return requestCache.get(url);
      }

      const promise = (async () => {
        let lastError = null;
        const attempts = Math.max(1, Number(fetchOptions.retries || apiRetryAttempts));

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const { signal, cleanup } = createFetchSignal(fetchOptions.timeout ?? apiTimeoutMs, fetchOptions.signal);
          try {
            const response = await fetchImpl(url, { cache: "no-store", signal });
            const rawText = await response.text();

            if (!response.ok) {
              throw new Error(`API request failed: ${response.status} ${path}`);
            }
            if (!rawText) {
              throw new Error(`API request returned empty body: ${path}`);
            }

            const data = JSON.parse(rawText);
            if (data == null) {
              throw new Error(`API request returned invalid payload: ${path}`);
            }

            if (ttl > 0) {
              responseCache.set(url, { time: Date.now(), data });
            }
            return data;
          } catch (error) {
            lastError = error;
            if (error?.name === "AbortError") {
              throw error;
            }
            if (attempt < attempts) {
              await sleep(apiRetryBaseDelay * attempt);
              continue;
            }
          } finally {
            cleanup();
          }
        }

        if (cached?.data) {
          return cached.data;
        }

        throw lastError || new Error(`API request failed: ${path}`);
      })().finally(() => requestCache.delete(url));

      requestCache.set(url, promise);
      return promise;
    }

    return {
      absoluteUrl,
      proxiedImageUrl,
      normalizeExternalPlayer,
      apiUrl,
      siteUrl,
      normalizePath,
      getViewPath,
      getAnimePath,
      routeFromLocation,
      navigateTo,
      createFetchSignal,
      fetchJson
    };
  }

  return {
    absoluteUrl,
    normalizeExternalPlayer,
    normalizePath,
    getViewPath,
    getAnimePath,
    routeFromLocation,
    createFetchSignal,
    createApiClient
  };
});
