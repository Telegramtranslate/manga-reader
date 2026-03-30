(function () {
  "use strict";

  const SOURCE_NAME = "mangabuff";
  const SOURCE_ORIGIN = "https://mangabuff.ru";
  const SOURCE_PROXY = "/api/mangabuff";
  const CACHE_PREFIX = "mc_mangabuff_";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const LISTING_PATHS = [
    "/",
    "/manga/top",
    "/types/manxva/2026",
    "/types/manxya/2026",
    "/types/manga/2026",
    "/types/manxva/2025",
    "/types/manxya/2025",
    "/types/manga/2025"
  ];

  const FALLBACK_ITEMS = [
    {
      slug: "ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora",
      title: "Я стала жертвой одержимости злого императора",
      type: "Манхва",
      genre: "Драма",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora.jpg?1757890971",
      cover: "https://mangabuff.ru/img/manga/posters/ya-stala-zhertvoi-oderzhimosti-zlogo-imperatora.jpg?1757890971"
    },
    {
      slug: "reinkarnaciya-korolya-kvona",
      title: "Реинкарнация короля Квона",
      type: "Манхва",
      genre: "Боевые искусства",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/reinkarnaciya-korolya-kvona.jpg?1757891723",
      cover: "https://mangabuff.ru/img/manga/posters/reinkarnaciya-korolya-kvona.jpg?1757891723"
    },
    {
      slug: "absolyutnoe-chuvstvo-mecha",
      title: "Абсолютное чувство меча",
      type: "Манхва",
      genre: "Экшен",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/absolyutnoe-chuvstvo-mecha.jpg?1755870764",
      cover: "https://mangabuff.ru/img/manga/posters/absolyutnoe-chuvstvo-mecha.jpg?1755870764"
    },
    {
      slug: "vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou",
      title: "Ведите себя как подобает боссу подземелий, мистер Сваллоу!",
      type: "Манхва",
      genre: "Экшен",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou.jpg?1704839025",
      cover: "https://mangabuff.ru/img/manga/posters/vedite-sebya-kak-podobaet-bossu-podzemelii-mister-svollou.jpg?1704839025"
    },
    {
      slug: "legendarnye-geroi-otlichniki-akademii",
      title: "Реинкарнация Легендарного Героя",
      type: "Манхва",
      genre: "Приключения",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/legendarnye-geroi-otlichniki-akademii.jpg",
      cover: "https://mangabuff.ru/img/manga/posters/legendarnye-geroi-otlichniki-akademii.jpg"
    },
    {
      slug: "kak-otvergnut-moego-navyazchivogo-byvshego-muzha",
      title: "Как отвергнуть моего навязчивого бывшего мужа",
      type: "Манхва",
      genre: "История",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/kak-otvergnut-moego-navyazchivogo-byvshego-muzha.jpg?1760960114",
      cover: "https://mangabuff.ru/img/manga/posters/kak-otvergnut-moego-navyazchivogo-byvshego-muzha.jpg?1760960114"
    },
    {
      slug: "tipichnaya-reinkarnaciya",
      title: "Моя типичная реинкарнация",
      type: "Манхва",
      genre: "Экшен",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/tipichnaya-reinkarnaciya.jpg?1755868090",
      cover: "https://mangabuff.ru/img/manga/posters/tipichnaya-reinkarnaciya.jpg?1755868090"
    },
    {
      slug: "zatknis-drakon-ya-bolshe-ne-hochu-vospityvat-detei-s-toboi",
      title: "Заткнись, дракон, я больше не хочу воспитывать детей с тобой.",
      type: "Маньхуа",
      genre: "Героическое фэнтези",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/zatknis-drakon-ya-bolshe-ne-hochu-vospityvat-detei-s-toboi.jpg",
      cover: "https://mangabuff.ru/img/manga/posters/zatknis-drakon-ya-bolshe-ne-hochu-vospityvat-detei-s-toboi.jpg"
    },
    {
      slug: "eto-vpervye-kogda-ya-lyubima",
      title: "Это впервые, когда я любима",
      type: "Манхва",
      genre: "Романтика",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/eto-vpervye-kogda-ya-lyubima.jpg?1762522552",
      cover: "https://mangabuff.ru/img/manga/posters/eto-vpervye-kogda-ya-lyubima.jpg?1762522552"
    },
    {
      slug: "neveroyatnoe-obuchenie",
      title: "Невероятное обучение",
      type: "Манхва",
      genre: "Экшен",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/neveroyatnoe-obuchenie.jpg?1757895042",
      cover: "https://mangabuff.ru/img/manga/posters/neveroyatnoe-obuchenie.jpg?1757895042"
    },
    {
      slug: "tri-genialnyh-sestry-neozhidanno-okazalis-vlyubleny",
      title: "Три гениальных сестры неожиданно влюбились",
      type: "Манга",
      genre: "Комедия",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/tri-genialnyh-sestry-neozhidanno-okazalis-vlyubleny.jpg?1699049401",
      cover: "https://mangabuff.ru/img/manga/posters/tri-genialnyh-sestry-neozhidanno-okazalis-vlyubleny.jpg?1699049401"
    },
    {
      slug: "voennye-trofei-gercogini",
      title: "Герцогиня-трофей",
      type: "Манхва",
      genre: "Драма",
      coverThumb: "https://mangabuff.ru/x180/img/manga/posters/voennye-trofei-gercogini.jpg?1757440392",
      cover: "https://mangabuff.ru/img/manga/posters/voennye-trofei-gercogini.jpg?1757440392"
    }
  ];

  let catalogPromise = null;
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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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

  function inferTypeFromPath(path) {
    if (path.indexOf("/types/manxva") !== -1) return "Манхва";
    if (path.indexOf("/types/manxya") !== -1) return "Маньхуа";
    if (path.indexOf("/types/manga") !== -1) return "Манга";
    return "";
  }

  function inferYearFromPath(path) {
    const match = String(path || "").match(/\/(20\d{2})(?:\/)?$/);
    return match ? Number.parseInt(match[1], 10) : null;
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

  function normalizeListingEntry(anchor, contextPath) {
    const href = anchor.getAttribute("href") || "";
    const slugMatch = href.match(/\/manga\/([^/?#]+)/);
    if (!slugMatch) return null;

    const slug = slugMatch[1];
    const id = createMangaId(slug);
    const infoParts = text(anchor.querySelector(".cards__info")).split(",").map(part => part.trim()).filter(Boolean);
    const rawCover = extractBackgroundUrl(anchor.querySelector(".cards__img")?.getAttribute("style"));
    const thumb = coverToThumb(rawCover);
    const fullCover = coverToFull(rawCover);
    const fallbackType = inferTypeFromPath(contextPath);
    const year = inferYearFromPath(contextPath);
    const type = infoParts[0] || fallbackType || "";
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
      year: year,
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

  function parseListingHtml(html, contextPath) {
    const doc = createDoc(html);
    const catalog = {};
    doc.querySelectorAll("a.cards__item[href*=\"/manga/\"]").forEach(anchor => {
      const entry = normalizeListingEntry(anchor, contextPath);
      if (!entry) return;
      catalog[entry.id] = catalog[entry.id]
        ? {
            ...catalog[entry.id],
            ...entry,
            genres: mergeUnique([...(catalog[entry.id].genres || []), ...(entry.genres || [])]),
            rating: entry.rating || catalog[entry.id].rating,
            updatedAt: entry.updatedAt || catalog[entry.id].updatedAt
          }
        : entry;
    });
    return catalog;
  }

  function buildFallbackCatalog() {
    const catalog = {};
    FALLBACK_ITEMS.forEach(item => {
      const id = createMangaId(item.slug);
      catalog[id] = {
        id: id,
        source: SOURCE_NAME,
        sourceUrl: absoluteUrl("/manga/" + item.slug),
        slug: item.slug,
        title: item.title,
        desc: "",
        description: "",
        author: "",
        year: 2026,
        status: "",
        genres: item.genre ? [item.genre] : [],
        cover: item.cover,
        coverThumb: item.coverThumb,
        type: item.type,
        origin: getOriginByType(item.type),
        chapterCount: 0,
        updatedAt: extractUpdatedAtFromUrl(item.cover) || 1774890000,
        chapters: null,
        rating: null
      };
    });
    return catalog;
  }

  async function loadJsonFallback() {
    try {
      const response = await fetch("./catalog-fallback.json?v=3", { cache: "no-store" });
      if (!response.ok) throw new Error("Fallback request failed: " + response.status);
      const data = await response.json();
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch (error) {
      console.error("Failed to load fallback catalog file:", error);
    }
    return buildFallbackCatalog();
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

  async function loadCatalog(options) {
    const force = !!(options && options.force);
    if (catalogPromise && !force) return catalogPromise;

    catalogPromise = (async function () {
      const cacheKey = CACHE_PREFIX + "catalog_v3";
      if (!force) {
        const cached = readCache(cacheKey, null);
        if (cached && Object.keys(cached).length) return cached;
      }

      try {
        const pages = await Promise.all(LISTING_PATHS.map(async path => ({
          path: path,
          html: await fetchText(path)
        })));

        const catalog = {};
        pages.forEach(page => {
          const parsed = parseListingHtml(page.html, page.path);
          Object.keys(parsed).forEach(id => {
            const existing = catalog[id];
          catalog[id] = existing
              ? {
                  ...existing,
                  ...parsed[id],
                  genres: mergeUnique([...(existing.genres || []), ...(parsed[id].genres || [])]),
                  rating: existing.rating ?? parsed[id].rating ?? null,
                  updatedAt: parsed[id].updatedAt || existing.updatedAt
                }
              : parsed[id];
          });
        });

        if (!Object.keys(catalog).length) throw new Error("Catalog is empty");
        writeCache(cacheKey, catalog);
        return catalog;
      } catch (error) {
        console.error("Failed to load MangaBuff catalog:", error);
        const fallback = await loadJsonFallback();
        writeCache(cacheKey, fallback, 30 * 60 * 1000);
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
        writeCache(titleCacheKey, enriched, 24 * 60 * 60 * 1000);
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
        writeCache(pagesCacheKey, pages, 24 * 60 * 60 * 1000);
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
