(function () {
  "use strict";

  const SOURCE_NAME = "mangabuff";
  const SOURCE_ORIGIN = "https://mangabuff.ru";
  const SOURCE_PROXY = "/api/mangabuff";
  const CACHE_PREFIX = "mc_mangabuff_";
  const STATIC_CATALOG_URL = "./catalog-full.json?v=1";
  const CATALOG_CACHE_KEY = CACHE_PREFIX + "catalog_v6";
  const CATALOG_META_KEY = CACHE_PREFIX + "catalog_meta_v2";
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const TITLE_CACHE_TTL = 24 * 60 * 60 * 1000;
  const PAGE_CACHE_TTL = 24 * 60 * 60 * 1000;
  const CATALOG_FIRST_PAGE = 1;
  const CATALOG_LAST_PAGE = 247;
  const INITIAL_PAGE_LIMIT = 12;
  const FORCE_REFRESH_PAGE_LIMIT = 24;
  const REQUEST_CHUNK_SIZE = 4;
  const WARMUP_DELAY_MS = 800;

  let catalogPromise = null;
  let warmCatalogPromise = null;
  const titlePromises = new Map();
  const chapterPromises = new Map();

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const normalized = String(value).replace(",", ".").replace(/[^\d.]+/g, "").trim();
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function readCache(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
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

  function extractBackgroundUrl(style) {
    const match = String(style || "").match(/url\(['"]?([^'")]+)['"]?\)/i);
    return match ? match[1] : "";
  }

  function coverToFull(url) {
    return absoluteUrl(String(url || "").replace("/x180/", "/"));
  }

  function coverToThumb(url) {
    return absoluteUrl(url);
  }

  function mergeUnique(items) {
    return [...new Set((items || []).filter(Boolean))];
  }

  function extractUpdatedAtFromUrl(url) {
    try {
      const parsed = new URL(absoluteUrl(url));
      const value = Number.parseInt(parsed.search.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function pagePath(page) {
    return "/manga?page=" + page;
  }

  function chunked(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  function range(from, to) {
    const values = [];
    for (let page = from; page <= to; page += 1) values.push(page);
    return values;
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

  function normalizeListingEntry(anchor) {
    const href = anchor.getAttribute("href") || "";
    const slugMatch = href.match(/\/manga\/([^/?#]+)/);
    if (!slugMatch) return null;

    const slug = slugMatch[1];
    const id = createMangaId(slug);
    const infoParts = text(anchor.querySelector(".cards__info")).split(",").map(part => part.trim()).filter(Boolean);
    const rawCover = extractBackgroundUrl(anchor.querySelector(".cards__img")?.getAttribute("style"));
    const thumb = coverToThumb(rawCover);
    const fullCover = coverToFull(rawCover);
    const type = infoParts[0] || "";
    const primaryGenre = infoParts[1] || "";
    const updatedAt = extractUpdatedAtFromUrl(rawCover);

    return {
      id: id,
      source: SOURCE_NAME,
      sourceUrl: absoluteUrl(href),
      slug: slug,
      title: text(anchor.querySelector(".cards__name")) || slug,
      desc: "",
      description: "",
      author: "",
      year: null,
      status: "",
      genres: primaryGenre ? [primaryGenre] : [],
      cover: fullCover || thumb || "mc-icon-192.png?v=4",
      coverThumb: thumb || fullCover || "mc-icon-192.png?v=4",
      type: type,
      origin: getOriginByType(type),
      chapterCount: 0,
      updatedAt: updatedAt || 0,
      chapters: null,
      rating: null
    };
  }

  function parseListingHtml(html) {
    const doc = createDoc(html);
    const catalog = {};
    doc.querySelectorAll("a.cards__item[href*=\"/manga/\"]").forEach(anchor => {
      const entry = normalizeListingEntry(anchor);
      if (!entry) return;
      mergeCatalog(catalog, { [entry.id]: entry });
    });
    return catalog;
  }

  function buildFallbackCatalog() {
    return {
      "mb_ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora": {
        id: "mb_ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora",
        source: SOURCE_NAME,
        sourceUrl: "https://mangabuff.ru/manga/ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora",
        slug: "ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora",
        title: "Я стала жертвой одержимости злого императора",
        desc: "",
        description: "",
        author: "",
        year: 2026,
        status: "",
        genres: ["Драма"],
        cover: "https://mangabuff.ru/img/manga/posters/ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora.jpg?1757890971",
        coverThumb: "https://mangabuff.ru/x180/img/manga/posters/ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora.jpg?1757890971",
        type: "Манхва",
        origin: "Корея",
        chapterCount: 0,
        updatedAt: 1757890971,
        chapters: null,
        rating: null
      },
      "mb_reinkarnaciya-korolya-kvona": {
        id: "mb_reinkarnaciya-korolya-kvona",
        source: SOURCE_NAME,
        sourceUrl: "https://mangabuff.ru/manga/reinkarnaciya-korolya-kvona",
        slug: "reinkarnaciya-korolya-kvona",
        title: "Реинкарнация короля Квона",
        desc: "",
        description: "",
        author: "",
        year: 2026,
        status: "",
        genres: ["Боевые искусства"],
        cover: "https://mangabuff.ru/img/manga/posters/reinkarnaciya-korolya-kvona.jpg?1757891723",
        coverThumb: "https://mangabuff.ru/x180/img/manga/posters/reinkarnaciya-korolya-kvona.jpg?1757891723",
        type: "Манхва",
        origin: "Корея",
        chapterCount: 0,
        updatedAt: 1757891723,
        chapters: null,
        rating: null
      },
      "mb_absolyutnoe-chuvstvo-mecha": {
        id: "mb_absolyutnoe-chuvstvo-mecha",
        source: SOURCE_NAME,
        sourceUrl: "https://mangabuff.ru/manga/absolyutnoe-chuvstvo-mecha",
        slug: "absolyutnoe-chuvstvo-mecha",
        title: "Абсолютное чувство меча",
        desc: "",
        description: "",
        author: "",
        year: 2026,
        status: "",
        genres: ["Экшен"],
        cover: "https://mangabuff.ru/img/manga/posters/absolyutnoe-chuvstvo-mecha.jpg?1755870764",
        coverThumb: "https://mangabuff.ru/x180/img/manga/posters/absolyutnoe-chuvstvo-mecha.jpg?1755870764",
        type: "Манхва",
        origin: "Корея",
        chapterCount: 0,
        updatedAt: 1755870764,
        chapters: null,
        rating: null
      },
      "mb_vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou": {
        id: "mb_vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou",
        source: SOURCE_NAME,
        sourceUrl: "https://mangabuff.ru/manga/vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou",
        slug: "vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou",
        title: "Ведите себя как подобает боссу подземелий, мистер Сваллоу!",
        desc: "",
        description: "",
        author: "",
        year: 2026,
        status: "",
        genres: ["Экшен"],
        cover: "https://mangabuff.ru/img/manga/posters/vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou.jpg?1704839025",
        coverThumb: "https://mangabuff.ru/x180/img/manga/posters/vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou.jpg?1704839025",
        type: "Манхва",
        origin: "Корея",
        chapterCount: 0,
        updatedAt: 1704839025,
        chapters: null,
        rating: null
      }
    };
  }

  async function loadJsonFallback() {
    try {
      const response = await fetch("./catalog-fallback.json?v=5", { cache: "no-store" });
      if (!response.ok) throw new Error("Fallback request failed: " + response.status);
      const data = await response.json();
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch (error) {
      console.error("Failed to load fallback catalog file:", error);
    }
    return buildFallbackCatalog();
  }

  async function loadStaticCatalog() {
    const response = await fetch(STATIC_CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Static catalog request failed: " + response.status);
    const data = await response.json();
    if (!data || typeof data !== "object" || !Object.keys(data).length) {
      throw new Error("Static catalog is empty");
    }
    return data;
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
      updatedAt: baseEntry.updatedAt || extractUpdatedAtFromUrl(baseEntry.cover) || 0,
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

  async function fetchCatalogPages(pageNumbers) {
    const catalog = {};
    const chunks = chunked(pageNumbers, REQUEST_CHUNK_SIZE);
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(async page => {
        try {
          const html = await fetchText(pagePath(page));
          return { page: page, catalog: parseListingHtml(html) };
        } catch (error) {
          console.error("Failed catalog page:", page, error);
          return { page: page, catalog: {} };
        }
      }));
      results.forEach(result => mergeCatalog(catalog, result.catalog));
    }
    return catalog;
  }

  function notifyCatalogExpanded(catalog) {
    try {
      if (!window.mangaDB || Object.keys(catalog).length <= Object.keys(window.mangaDB).length) return;
      window.mangaDB = { ...catalog };
      window.invalidateComputedCaches && window.invalidateComputedCaches();
      window.startUI && window.startUI();
    } catch (error) {
      console.error("Failed to refresh expanded catalog:", error);
    }
  }

  function scheduleWarmCatalog(cachedCatalog, loadedUntil) {
    const nextPage = Math.max(CATALOG_FIRST_PAGE, (loadedUntil || 0) + 1);
    if (nextPage > CATALOG_LAST_PAGE || warmCatalogPromise) return;

    const startWarmup = function () {
      if (warmCatalogPromise) return;
      warmCatalogPromise = (async function () {
        const catalog = { ...(cachedCatalog || {}) };
        let lastLoaded = loadedUntil || 0;
        for (let from = nextPage; from <= CATALOG_LAST_PAGE; from += REQUEST_CHUNK_SIZE) {
          const to = Math.min(CATALOG_LAST_PAGE, from + REQUEST_CHUNK_SIZE - 1);
          const parsed = await fetchCatalogPages(range(from, to));
          mergeCatalog(catalog, parsed);
          lastLoaded = to;
          writeCache(CATALOG_CACHE_KEY, catalog, CACHE_TTL);
          writeCache(CATALOG_META_KEY, { loadedUntil: lastLoaded, totalPages: CATALOG_LAST_PAGE }, CACHE_TTL);
          if (lastLoaded % 24 === 0 || lastLoaded === CATALOG_LAST_PAGE) {
            notifyCatalogExpanded(catalog);
          }
        }
      })().catch(error => {
        console.error("Background catalog warmup failed:", error);
      }).finally(() => {
        warmCatalogPromise = null;
      });
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(startWarmup, { timeout: 2000 });
    } else {
      setTimeout(startWarmup, WARMUP_DELAY_MS);
    }
  }

  async function loadCatalog(options) {
    const force = !!(options && options.force);
    if (catalogPromise && !force) return catalogPromise;

    catalogPromise = (async function () {
      const cachedCatalog = force ? null : readCache(CATALOG_CACHE_KEY, null);
      const cachedMeta = readCache(CATALOG_META_KEY, { loadedUntil: 0, totalPages: CATALOG_LAST_PAGE });

      if (cachedCatalog && Object.keys(cachedCatalog).length && !force) {
        return cachedCatalog;
      }

      try {
        const staticCatalog = await loadStaticCatalog();
        writeCache(CATALOG_CACHE_KEY, staticCatalog, CACHE_TTL);
        writeCache(CATALOG_META_KEY, { loadedUntil: CATALOG_LAST_PAGE, totalPages: CATALOG_LAST_PAGE }, CACHE_TTL);
        return staticCatalog;
      } catch (staticError) {
        console.error("Failed to load static MangaBuff catalog:", staticError);
      }

      try {
        const firstPage = CATALOG_FIRST_PAGE;
        const lastPage = force ? Math.min(CATALOG_LAST_PAGE, FORCE_REFRESH_PAGE_LIMIT) : Math.min(CATALOG_LAST_PAGE, INITIAL_PAGE_LIMIT);
        const catalog = await fetchCatalogPages(range(firstPage, lastPage));
        if (!Object.keys(catalog).length) throw new Error("Catalog is empty");
        writeCache(CATALOG_CACHE_KEY, catalog, CACHE_TTL);
        writeCache(CATALOG_META_KEY, { loadedUntil: lastPage, totalPages: CATALOG_LAST_PAGE }, CACHE_TTL);
        if (lastPage < CATALOG_LAST_PAGE) {
          scheduleWarmCatalog(catalog, lastPage);
        }
        return catalog;
      } catch (error) {
        console.error("Failed to load MangaBuff catalog:", error);
        const fallback = await loadJsonFallback();
        writeCache(CATALOG_CACHE_KEY, fallback, 30 * 60 * 1000);
        writeCache(CATALOG_META_KEY, { loadedUntil: 0, totalPages: CATALOG_LAST_PAGE }, 30 * 60 * 1000);
        return fallback;
      }
    })();

    return catalogPromise;
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
    ensureTitleChapters: ensureTitleChapters,
    ensureChapterPages: ensureChapterPages,
    getTitleMetaParts: getTitleMetaParts,
    getChapterLabel: getChapterLabel,
    prefetchChapterPages: prefetchChapterPages
  };
})();
