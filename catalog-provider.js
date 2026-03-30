(function () {
  "use strict";

  const SOURCE_NAME = "mangabuff";
  const SOURCE_ORIGIN = "https://mangabuff.ru";
  const SOURCE_PROXY = "/api/mangabuff";
  const CACHE_PREFIX = "mc_mangabuff_";
  const CATALOG_CACHE_KEY = CACHE_PREFIX + "catalog_v9";
  const CATALOG_META_KEY = CACHE_PREFIX + "catalog_meta_v5";
  const LEGACY_CACHE_KEYS = [
    CACHE_PREFIX + "catalog_v8",
    CACHE_PREFIX + "catalog_meta_v4",
    CACHE_PREFIX + "catalog_v7",
    CACHE_PREFIX + "catalog_meta_v3"
  ];
  const MAX_CATALOG_CACHE_CHARS = 900000;
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const TITLE_CACHE_TTL = 24 * 60 * 60 * 1000;
  const PAGE_CACHE_TTL = 24 * 60 * 60 * 1000;
  const SEED_CATALOG_URL = "./catalog-seed.json?v=3";
  const FALLBACK_CATALOG_URL = "./catalog-fallback.json?v=8";
  const PART_URLS = [
    "./catalog-part-01.json?v=3",
    "./catalog-part-02.json?v=3",
    "./catalog-part-03.json?v=3",
    "./catalog-part-04.json?v=3",
    "./catalog-part-05.json?v=3",
    "./catalog-part-06.json?v=3",
    "./catalog-part-07.json?v=3",
    "./catalog-part-08.json?v=3"
  ];

  let catalogPromise = null;
  let warmCatalogPromise = null;
  let catalogRefreshTimer = null;
  let pendingExpandedCatalog = null;
  let pendingExpandedCatalogFinal = false;
  let loadedCatalog = null;
  let loadedPartsCount = 0;
  let loadNextPartPromise = null;
  const titlePromises = new Map();
  const chapterPromises = new Map();

  function readCache(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      if (key === CATALOG_CACHE_KEY && raw.length > MAX_CATALOG_CACHE_CHARS) {
        localStorage.removeItem(key);
        return fallback;
      }
      const parsed = JSON.parse(raw);
      if (parsed.expires && parsed.expires < Date.now()) {
        localStorage.removeItem(key);
        return fallback;
      }
      return parsed.data || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeCache(key, value, ttl) {
    try {
      localStorage.setItem(key, JSON.stringify({
        data: value,
        expires: Date.now() + (ttl || CACHE_TTL)
      }));
    } catch (error) {}
  }

  function purgeLegacyCacheKeys() {
    LEGACY_CACHE_KEYS.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {}
    });
  }

  purgeLegacyCacheKeys();

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const normalized = String(value).replace(",", ".").replace(/[^\d.]+/g, "").trim();
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function absoluteUrl(url) {
    if (!url) return "";
    try {
      return new URL(url, SOURCE_ORIGIN).toString();
    } catch (error) {
      return url;
    }
  }

  function sourcePath(path) {
    if (!path || path === "/") return SOURCE_PROXY;
    return SOURCE_PROXY + (path.startsWith("/") ? path : "/" + path);
  }

  async function fetchText(path) {
    const response = await fetch(sourcePath(path), {
      headers: {
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) {
      throw new Error("Source request failed: " + response.status);
    }
    return response.text();
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("JSON request failed: " + response.status);
    }
    return response.json();
  }

  function createDoc(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function createMangaId(slug) {
    return "mb_" + slug;
  }

  function getSlugFromId(id) {
    return String(id || "").replace(/^mb_/, "");
  }

  function getOriginByType(type) {
    switch (type) {
      case "Манхва":
        return "Корея";
      case "Маньхуа":
        return "Китай";
      case "Манга":
        return "Япония";
      default:
        return "";
    }
  }

  function mergeUnique(items) {
    return [...new Set((items || []).filter(Boolean))];
  }

  function mergeCatalog(target, incoming) {
    Object.keys(incoming || {}).forEach(id => {
      const nextEntry = incoming[id];
      const currentEntry = target[id];
      target[id] = currentEntry
        ? {
            ...currentEntry,
            ...nextEntry,
            genres: mergeUnique([...(currentEntry.genres || []), ...(nextEntry.genres || [])]),
            rating: currentEntry.rating ?? nextEntry.rating ?? null,
            updatedAt: Math.max(currentEntry.updatedAt || 0, nextEntry.updatedAt || 0)
          }
        : nextEntry;
    });
    return target;
  }

  function cloneCatalog(catalog) {
    return JSON.parse(JSON.stringify(catalog || {}));
  }

  function buildChapterKey(tome, chapter) {
    const tomeNumber = Number.parseInt(String(tome || "0"), 10) || 0;
    const chapterNumber = parseNumber(chapter);
    const chapterPart = Number.isFinite(chapterNumber) ? Math.round(chapterNumber * 1000) : 0;
    return tomeNumber * 1000000 + chapterPart;
  }

  function chapterOrderValue(chapter) {
    return parseNumber(chapter);
  }

  function flushCatalogRefresh() {
    if (!pendingExpandedCatalog) return;
    const nextCatalog = pendingExpandedCatalog;
    const isFinal = pendingExpandedCatalogFinal;
    pendingExpandedCatalog = null;
    pendingExpandedCatalogFinal = false;
    window.mangaDB = { ...nextCatalog };
    window.invalidateComputedCaches && window.invalidateComputedCaches();
    if (window.requestCatalogRefresh) {
      window.requestCatalogRefresh({
        final: isFinal,
        total: Object.keys(window.mangaDB).length
      });
      return;
    }
    window.startUI && window.startUI();
  }

  function notifyCatalogExpanded(catalog, options) {
    try {
      if (!window.mangaDB) return;
      const prevCount = Object.keys(window.mangaDB).length;
      const nextCount = Object.keys(catalog).length;
      if (nextCount <= prevCount) return;
      pendingExpandedCatalog = catalog;
      pendingExpandedCatalogFinal = pendingExpandedCatalogFinal || !!(options && options.final);
      if (catalogRefreshTimer) {
        clearTimeout(catalogRefreshTimer);
        catalogRefreshTimer = null;
      }
      if (pendingExpandedCatalogFinal) {
        flushCatalogRefresh();
        return;
      }
      catalogRefreshTimer = setTimeout(() => {
        catalogRefreshTimer = null;
        flushCatalogRefresh();
      }, 280);
    } catch (error) {
      console.error("Failed to refresh expanded catalog:", error);
    }
  }

  async function loadSeedCatalog() {
    const data = await fetchJson(SEED_CATALOG_URL);
    if (!data || typeof data !== "object" || !Object.keys(data).length) {
      throw new Error("Seed catalog is empty");
    }
    return data;
  }

  async function loadFallbackCatalog() {
    try {
      const data = await fetchJson(FALLBACK_CATALOG_URL);
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch (error) {
      console.error("Failed to load fallback catalog:", error);
    }
    return {};
  }

  function scheduleWarmCatalog(seedCatalog, loadedParts) {
    if (warmCatalogPromise) return;
    const startIndex = Math.max(0, loadedParts || 0);
    if (startIndex >= PART_URLS.length) return;

    const start = function () {
      if (warmCatalogPromise) return;
      warmCatalogPromise = (async function () {
        const merged = cloneCatalog(seedCatalog);
        let loaded = startIndex;
        for (let i = startIndex; i < PART_URLS.length; i += 1) {
          try {
            const part = await fetchJson(PART_URLS[i]);
            mergeCatalog(merged, part);
            loaded = i + 1;
            writeCache(CATALOG_META_KEY, { loadedParts: loaded }, CACHE_TTL);
            if (Object.keys(merged).length < 1500) {
              writeCache(CATALOG_CACHE_KEY, merged, CACHE_TTL);
            }
            if (loaded === 1 || loaded === PART_URLS.length) {
              notifyCatalogExpanded(merged, { final: loaded === PART_URLS.length });
            }
          } catch (error) {
            console.error("Failed to load catalog part:", PART_URLS[i], error);
            break;
          }
        }
      })().catch(error => {
        console.error("Background catalog warmup failed:", error);
      }).finally(() => {
        warmCatalogPromise = null;
      });
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(start, { timeout: 1800 });
    } else {
      setTimeout(start, 700);
    }
  }

  function parseTitleHtml(html, slug, baseEntry) {
    const doc = createDoc(html);
    const metaParts = [...doc.querySelectorAll(".manga__middle-link")].map(text).filter(Boolean);
    const type = metaParts[0] || baseEntry.type || "";
    const year = metaParts.find(part => /^\d{4}$/.test(part)) || baseEntry.year || null;
    const status = metaParts.find(part => part !== type && !/^\d{4}$/.test(part)) || baseEntry.status || "";
    const altTitles = [...doc.querySelectorAll(".manga__name-alt span")].map(text).filter(Boolean);
    const tags = [...doc.querySelectorAll(".tags .tags__item")].map(text).filter(Boolean);
    const genres = mergeUnique([...(baseEntry.genres || []), ...tags.filter(tag => !/^\d+\+$/.test(tag))]).slice(0, 14);
    const chapterUrlRegex = new RegExp("https://mangabuff\\.ru/manga/" + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/([^\"/?#]+)/([^\"/?#]+)", "g");
    const seen = new Set();
    const chapters = {};
    let match;

    while ((match = chapterUrlRegex.exec(html))) {
      const tome = match[1];
      const chapter = match[2];
      const chapterId = tome + ":" + chapter;
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);
      const key = buildChapterKey(tome, chapter);
      chapters[String(key)] = {
        id: createMangaId(slug) + "_ch_" + tome + "_" + chapter,
        number: chapterOrderValue(chapter),
        tome: tome,
        chapter: chapter,
        title: "Том " + tome + " • Глава " + chapter,
        sourceUrl: absoluteUrl("/manga/" + slug + "/" + tome + "/" + chapter),
        updatedAt: baseEntry.updatedAt || 0,
        publishedAt: baseEntry.updatedAt || 0,
        pages: null
      };
    }

    return {
      ...baseEntry,
      slug: slug,
      title: text(doc.querySelector(".manga__name")) || baseEntry.title || slug,
      desc: text(doc.querySelector(".manga__description")).slice(0, 220),
      description: text(doc.querySelector(".manga__description")),
      author: baseEntry.author || "",
      year: Number.parseInt(year, 10) || baseEntry.year || null,
      status: status,
      genres: genres,
      cover: absoluteUrl(doc.querySelector(".manga__poster img")?.getAttribute("src")) || baseEntry.cover,
      coverThumb: baseEntry.coverThumb || absoluteUrl(doc.querySelector(".manga__poster img")?.getAttribute("src")) || baseEntry.cover,
      type: type,
      origin: getOriginByType(type) || baseEntry.origin || "",
      chapterCount: Object.keys(chapters).length || baseEntry.chapterCount || 0,
      updatedAt: baseEntry.updatedAt || 0,
      rating: baseEntry.rating ?? null,
      altTitles: altTitles,
      chapters: Object.keys(chapters).length ? chapters : baseEntry.chapters || null
    };
  }

  function parseChapterImages(html) {
    const doc = createDoc(html);
    return [...doc.querySelectorAll(".reader__pages img")]
      .map(img => absoluteUrl(img.getAttribute("src") || img.getAttribute("data-src") || ""))
      .filter(Boolean);
  }

  async function loadCatalog(options) {
    const force = !!(options && options.force);
    if (catalogPromise && !force) return catalogPromise;

    catalogPromise = (async function () {
      const cachedCatalog = force ? null : readCache(CATALOG_CACHE_KEY, null);
      if (cachedCatalog && Object.keys(cachedCatalog).length && !force) {
        const cachedMeta = readCache(CATALOG_META_KEY, { loadedParts: 0 });
        loadedCatalog = cloneCatalog(cachedCatalog);
        loadedPartsCount = Math.min(Number(cachedMeta.loadedParts) || 0, PART_URLS.length);
        return cloneCatalog(loadedCatalog);
      }

      try {
        const seedCatalog = await loadSeedCatalog();
        writeCache(CATALOG_CACHE_KEY, seedCatalog, CACHE_TTL);
        writeCache(CATALOG_META_KEY, { loadedParts: 0 }, CACHE_TTL);
        loadedCatalog = cloneCatalog(seedCatalog);
        loadedPartsCount = 0;
        return cloneCatalog(loadedCatalog);
      } catch (error) {
        console.error("Failed to load seed catalog:", error);
        const fallback = await loadFallbackCatalog();
        if (Object.keys(fallback).length) {
          writeCache(CATALOG_CACHE_KEY, fallback, 30 * 60 * 1000);
          writeCache(CATALOG_META_KEY, { loadedParts: 0 }, 30 * 60 * 1000);
          loadedCatalog = cloneCatalog(fallback);
          loadedPartsCount = 0;
          return cloneCatalog(loadedCatalog);
        }
        loadedCatalog = {};
        loadedPartsCount = 0;
        return {};
      }
    })();

    return catalogPromise;
  }

  async function loadNextCatalogChunk() {
    if (loadNextPartPromise) return loadNextPartPromise;
    if (!loadedCatalog || !Object.keys(loadedCatalog).length) {
      await loadCatalog();
    }
    if (loadedPartsCount >= PART_URLS.length) {
      return {
        catalog: cloneCatalog(loadedCatalog || {}),
        hasMore: false,
        added: 0
      };
    }

    loadNextPartPromise = (async function () {
      const partUrl = PART_URLS[loadedPartsCount];
      const part = await fetchJson(partUrl);
      mergeCatalog(loadedCatalog, part);
      loadedPartsCount += 1;
      const snapshot = cloneCatalog(loadedCatalog);
      if (Object.keys(snapshot).length < 1500) {
        writeCache(CATALOG_CACHE_KEY, snapshot, CACHE_TTL);
        writeCache(CATALOG_META_KEY, { loadedParts: loadedPartsCount }, CACHE_TTL);
      } else {
        try {
          localStorage.removeItem(CATALOG_CACHE_KEY);
          localStorage.removeItem(CATALOG_META_KEY);
        } catch (error) {}
      }
      return {
        catalog: snapshot,
        hasMore: loadedPartsCount < PART_URLS.length,
        added: Object.keys(part || {}).length
      };
    })().finally(() => {
      loadNextPartPromise = null;
    });

    return loadNextPartPromise;
  }

  function hasMoreCatalogParts() {
    return loadedPartsCount < PART_URLS.length;
  }

  async function ensureTitleChapters(mangaId) {
    const slug = getSlugFromId(mangaId);
    if (!slug) return {};
    const manga = window.mangaDB && window.mangaDB[mangaId];
    if (!manga) return {};
    if (manga.chapters && Object.keys(manga.chapters).length) return manga.chapters;

    const titleCacheKey = CACHE_PREFIX + "title_" + slug;
    const cachedTitle = readCache(titleCacheKey, null);
    if (cachedTitle && cachedTitle.chapters && Object.keys(cachedTitle.chapters).length) {
      Object.assign(manga, cachedTitle);
      return manga.chapters || {};
    }

    if (!titlePromises.has(mangaId)) {
      titlePromises.set(mangaId, (async function () {
        const html = await fetchText("/manga/" + slug);
        const enriched = parseTitleHtml(html, slug, manga);
        Object.assign(manga, enriched);
        writeCache(titleCacheKey, enriched, TITLE_CACHE_TTL);
        return manga.chapters || {};
      })().finally(() => {
        titlePromises.delete(mangaId);
      }));
    }

    return titlePromises.get(mangaId);
  }

  async function ensureChapterPages(mangaId, chapterKey) {
    const slug = getSlugFromId(mangaId);
    const manga = window.mangaDB && window.mangaDB[mangaId];
    if (!slug || !manga) return [];

    if (!manga.chapters || !manga.chapters[String(chapterKey)]) {
      await ensureTitleChapters(mangaId);
    }

    const chapter = manga.chapters && (manga.chapters[String(chapterKey)] || manga.chapters[chapterKey]);
    if (!chapter) return [];
    if (Array.isArray(chapter.pages) && chapter.pages.length) return chapter.pages;

    const pagesCacheKey = CACHE_PREFIX + "pages_" + slug + "_" + chapter.tome + "_" + chapter.chapter;
    const cachedPages = readCache(pagesCacheKey, null);
    if (Array.isArray(cachedPages) && cachedPages.length) {
      chapter.pages = cachedPages;
      return cachedPages;
    }

    const promiseKey = mangaId + ":" + chapterKey;
    if (!chapterPromises.has(promiseKey)) {
      chapterPromises.set(promiseKey, (async function () {
        const html = await fetchText("/manga/" + slug + "/" + chapter.tome + "/" + chapter.chapter);
        const pages = parseChapterImages(html);
        chapter.pages = pages;
        writeCache(pagesCacheKey, pages, PAGE_CACHE_TTL);
        return pages;
      })().finally(() => {
        chapterPromises.delete(promiseKey);
      }));
    }

    return chapterPromises.get(promiseKey);
  }

  function prefetchChapterPages(mangaId, chapterKey) {
    Promise.resolve()
      .then(() => ensureChapterPages(mangaId, chapterKey))
      .catch(() => {});
  }

  function getTitleMetaParts(manga) {
    if (!manga) return [];
    return [manga.author, manga.year, manga.status, manga.type, manga.origin].filter(Boolean);
  }

  function getChapterLabel(chapter, chapterNumber) {
    if (chapter && chapter.tome && chapter.chapter) {
      return "Том " + chapter.tome + " • Глава " + chapter.chapter;
    }
    return "Глава " + chapterNumber;
  }

  window.mangaCatalogProvider = {
    loadCatalog: loadCatalog,
    loadNextCatalogChunk: loadNextCatalogChunk,
    hasMoreCatalogParts: hasMoreCatalogParts,
    ensureTitleChapters: ensureTitleChapters,
    ensureChapterPages: ensureChapterPages,
    getTitleMetaParts: getTitleMetaParts,
    getChapterLabel: getChapterLabel,
    prefetchChapterPages: prefetchChapterPages
  };
})();
