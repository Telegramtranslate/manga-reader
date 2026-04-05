const API_BASE = "/api/anilibria";
const MEDIA_PROXY_BASE = "/api/anilibria-stream";
const ORIGIN_BASE = "https://anilibria.top";
const SITE_URL = "https://color-manga-cloud.vercel.app";

const DEFAULT_SEO_TITLE = "AnimeCloud - аниме с русской озвучкой";
const DEFAULT_SEO_DESCRIPTION =
  "AnimeCloud - каталог аниме с русской озвучкой, быстрым мобильным интерфейсом, расписанием, подборками и встроенным плеером на базе AniLibria.";
const VIEW_SEO = {
  home: {
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION
  },
  catalog: {
    title: "Каталог аниме с русской озвучкой - AnimeCloud",
    description:
      "Каталог аниме с русской озвучкой: популярные релизы, жанры, форматы, онгоинги и быстрый поиск на AnimeCloud."
  },
  ongoing: {
    title: "Онгоинги аниме с русской озвучкой - AnimeCloud",
    description: "Свежие онгоинги аниме с русской озвучкой и быстрым плеером на AnimeCloud."
  },
  top: {
    title: "Топ аниме с русской озвучкой - AnimeCloud",
    description: "Топ аниме с русской озвучкой: популярные и высоко оцененные релизы в каталоге AnimeCloud."
  },
  schedule: {
    title: "Расписание выхода аниме - AnimeCloud",
    description: "Расписание выхода аниме с русской озвучкой по дням недели на AnimeCloud."
  },
  search: {
    title: "Поиск аниме с русской озвучкой - AnimeCloud",
    description: "Поиск аниме по названию, формату и жанрам в каталоге AnimeCloud."
  },
  profile: {
    title: "Профиль зрителя - AnimeCloud",
    description: "Профиль, списки, комментарии и история просмотра в AnimeCloud."
  }
};

const CACHE_TTL = 120000;
const DETAIL_TTL = 300000;
const API_RETRY_ATTEMPTS = 3;
const API_RETRY_BASE_DELAY = 350;
const GRID_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE = 260;
const RENDER_BATCH_SIZE = 8;
const FAVORITES_STORAGE_PREFIX = "animecloud_favorites";
const WATCH_PROGRESS_KEY = "animecloud_watch_progress_v1";
const ADMIN_HERO_STORAGE_KEY = "animecloud_admin_featured_alias";
const FAVORITE_LIST_KEYS = ["watching", "planned", "completed", "paused"];

const responseCache = new Map();
const requestCache = new Map();
const manifestCache = new Map();

const state = {
  currentView: "home",
  previousView: "home",
  latest: [],
  recommended: [],
  popular: [],
  catalogItems: [],
  ongoingItems: [],
  topItems: [],
  scheduleItems: [],
  searchResults: [],
  sortingOptions: [],
  typeOptions: [],
  genreOptions: [],
  favorites: [],
  authUser: null,
  featured: null,
  searchTimer: null,
  searchAbort: null,
  searchQuery: "",
  catalogPage: 0,
  catalogTotal: 0,
  catalogHasMore: false,
  catalogSort: "FRESH_AT_DESC",
  catalogType: "",
  catalogGenre: "",
  catalogGenres: [],
  ongoingPage: 0,
  ongoingTotal: 0,
  ongoingHasMore: false,
  topPage: 0,
  topTotal: 0,
  topHasMore: false,
  referencesLoaded: false,
  homeLoaded: false,
  catalogLoaded: false,
  ongoingLoaded: false,
  topLoaded: false,
  scheduleLoaded: false,
  currentAnime: null,
  currentEpisode: null,
  currentQuality: "auto",
  currentSource: "anilibria",
  manifestBlobUrl: null,
  hls: null,
  hlsLoaderPromise: null,
  infiniteObserver: null,
  heroPool: [],
  heroCarouselIndex: 0,
  heroCarouselTimer: null,
  detailRenderToken: "",
  releaseOpenAlias: "",
  releaseOpenPromise: null,
  playerSelectionToken: "",
  hlsRecoveryTried: false,
  playerStartupTimer: null,
  installPromptEvent: null
};

const els = {
  tabs: [...document.querySelectorAll(".tab-btn[data-view]")],
  mobileTabs: [...document.querySelectorAll(".mobile-nav__btn[data-view]")],
  panels: [...document.querySelectorAll("[data-view-panel]")],
  brandBtn: document.getElementById("brand-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  installBtn: document.getElementById("install-btn"),
  searchInput: document.getElementById("search-input"),
  heroCard: document.getElementById("hero-card"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroMeta: document.getElementById("hero-meta"),
  heroPoster: document.getElementById("hero-poster"),
  heroOpenBtn: document.getElementById("hero-open-btn"),
  heroRandomBtn: document.getElementById("hero-random-btn"),
  heroDots: document.getElementById("hero-dots"),
  statsRow: document.querySelector(".stats-row"),
  latestCount: document.getElementById("latest-count"),
  catalogCount: document.getElementById("catalog-count"),
  ongoingCount: document.getElementById("ongoing-count"),
  topCount: document.getElementById("top-count"),
  latestGrid: document.getElementById("latest-grid"),
  recommendedGrid: document.getElementById("recommended-grid"),
  popularGrid: document.getElementById("popular-grid"),
  continueGrid: document.getElementById("continue-grid"),
  catalogGrid: document.getElementById("catalog-grid"),
  ongoingGrid: document.getElementById("ongoing-grid"),
  topGrid: document.getElementById("top-grid"),
  scheduleGrid: document.getElementById("schedule-grid"),
  searchGrid: document.getElementById("search-grid"),
  favoritesGrid: document.getElementById("favorites-grid"),
  listWatchingGrid: document.getElementById("list-watching-grid"),
  listPlannedGrid: document.getElementById("list-planned-grid"),
  listCompletedGrid: document.getElementById("list-completed-grid"),
  listPausedGrid: document.getElementById("list-paused-grid"),
  profileProgressGrid: document.getElementById("profile-progress-grid"),
  continueSummary: document.getElementById("continue-summary"),
  catalogSummary: document.getElementById("catalog-summary"),
  ongoingSummary: document.getElementById("ongoing-summary"),
  topSummary: document.getElementById("top-summary"),
  scheduleSummary: document.getElementById("schedule-summary"),
  searchSummary: document.getElementById("search-summary"),
  profileSummary: document.getElementById("profile-summary"),
  profileProgressSummary: document.getElementById("profile-progress-summary"),
  profileAvatar: document.getElementById("profile-avatar"),
  profileName: document.getElementById("profile-name"),
  profileRoleBadge: document.getElementById("profile-role-badge"),
  profileEmail: document.getElementById("profile-email"),
  favoritesCount: document.getElementById("favorites-count"),
  favoritesMode: document.getElementById("favorites-mode"),
  adminPanel: document.getElementById("admin-panel"),
  adminNote: document.getElementById("admin-note"),
  adminRefreshBtn: document.getElementById("admin-refresh-btn"),
  adminClearCacheBtn: document.getElementById("admin-clear-cache-btn"),
  adminClearCommentsBtn: document.getElementById("admin-clear-comments-btn"),
  adminClearProgressBtn: document.getElementById("admin-clear-progress-btn"),
  catalogSort: document.getElementById("catalog-sort"),
  catalogType: document.getElementById("catalog-type"),
  catalogGenre: document.getElementById("catalog-genre"),
  catalogGenreChips: document.getElementById("catalog-genre-chips"),
  catalogMoreBtn: document.getElementById("catalog-more-btn"),
  ongoingMoreBtn: document.getElementById("ongoing-more-btn"),
  topMoreBtn: document.getElementById("top-more-btn"),
  drawer: document.getElementById("details-drawer"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  drawerClose: document.getElementById("drawer-close"),
  detailPoster: document.getElementById("detail-poster"),
  detailTitle: document.getElementById("detail-title"),
  detailDescription: document.getElementById("detail-description"),
  detailMeta: document.getElementById("detail-meta"),
  detailChips: document.getElementById("detail-chips"),
  detailFavoriteBtn: document.getElementById("detail-favorite-btn"),
  detailShareBtn: document.getElementById("detail-share-btn"),
  detailAdminPinBtn: document.getElementById("detail-admin-pin-btn"),
  detailListActions: document.getElementById("detail-list-actions"),
  listWatchBtn: document.getElementById("list-watch-btn"),
  listPlanBtn: document.getElementById("list-plan-btn"),
  listCompleteBtn: document.getElementById("list-complete-btn"),
  listPauseBtn: document.getElementById("list-pause-btn"),
  sourceSwitch: document.getElementById("source-switch"),
  voiceList: document.getElementById("voice-list"),
  crewList: document.getElementById("crew-list"),
  episodesList: document.getElementById("episodes-list"),
  playerTitle: document.getElementById("player-title"),
  playerNote: document.getElementById("player-note"),
  qualitySwitch: document.getElementById("quality-switch"),
  player: document.getElementById("anime-player"),
  externalPlayer: document.getElementById("external-player"),
  nextEpisodeBtn: document.getElementById("next-episode-btn"),
  cardTemplate: document.getElementById("anime-card-template"),
  metaDescription: document.getElementById("meta-description"),
  metaRobots: document.getElementById("meta-robots"),
  canonicalLink: document.getElementById("canonical-link"),
  ogType: document.getElementById("og-type"),
  ogTitle: document.getElementById("og-title"),
  ogDescription: document.getElementById("og-description"),
  ogUrl: document.getElementById("og-url"),
  ogImage: document.getElementById("og-image"),
  twitterTitle: document.getElementById("twitter-title"),
  twitterDescription: document.getElementById("twitter-description"),
  twitterImage: document.getElementById("twitter-image"),
  structuredData: document.getElementById("structured-data"),
  homePanel: document.querySelector('[data-view-panel="home"]')
};

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value || 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPermissionDeniedError(error) {
  const code = String(error?.code || error?.message || "").toLowerCase();
  return code.includes("permission-denied") || code.includes("insufficient permissions");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isStandaloneDisplayMode() {
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function syncInstallButton() {
  if (!els.installBtn) return;
  els.installBtn.hidden = !state.installPromptEvent || isStandaloneDisplayMode();
}

async function handleInstallClick() {
  if (!state.installPromptEvent) return;
  const deferredPrompt = state.installPromptEvent;
  state.installPromptEvent = null;
  syncInstallButton();

  try {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  } catch (error) {
    console.error(error);
  } finally {
    syncInstallButton();
  }
}

function absoluteUrl(path) {
  if (!path) return "/mc-icon-512.png?v=4";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("//")) return `https:${path}`;
  return `${ORIGIN_BASE}${path}`;
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

function apiUrl(path, params) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

function siteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
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

function routeFromLocation() {
  const pathname = normalizePath(location.pathname);
  if (pathname.startsWith("/anime/")) {
    return { type: "anime", alias: decodeURIComponent(pathname.slice(7)), legacy: false };
  }

  const knownViews = new Set(["/", "/catalog", "/ongoing", "/top", "/schedule", "/search", "/profile"]);
  if (knownViews.has(pathname)) {
    return {
      type: "view",
      view: pathname === "/" ? "home" : pathname.slice(1),
      legacy: false
    };
  }

  const rawHash = (location.hash || "").replace(/^#/, "");
  if (rawHash.startsWith("anime/")) {
    return { type: "anime", alias: decodeURIComponent(rawHash.slice(6)), legacy: true };
  }
  if (rawHash) {
    return { type: "view", view: rawHash, legacy: true };
  }
  return { type: "view", view: "home", legacy: false };
}

function navigateTo(path, options = {}) {
  const next = normalizePath(path);
  if (normalizePath(location.pathname) === next) return;
  const method = options.replace ? "replaceState" : "pushState";
  history[method]({}, "", next);
}

function truncateSeoText(text, max = 170) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function buildStructuredData(page) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl("/"),
        inLanguage: "ru",
        description: DEFAULT_SEO_DESCRIPTION
      },
      page
    ]
  });
}

function applySeo({ title, description, path, image, type = "website", structuredData }) {
  const canonical = siteUrl(path || "/");
  document.title = title || DEFAULT_SEO_TITLE;
  if (els.metaDescription) els.metaDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.metaRobots) {
    els.metaRobots.content = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  }
  if (els.canonicalLink) els.canonicalLink.href = canonical;
  if (els.ogType) els.ogType.content = type;
  if (els.ogTitle) els.ogTitle.content = title || DEFAULT_SEO_TITLE;
  if (els.ogDescription) els.ogDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.ogUrl) els.ogUrl.content = canonical;
  if (els.ogImage) els.ogImage.content = image || siteUrl("/mc-icon-512.png?v=4");
  if (els.twitterTitle) els.twitterTitle.content = title || DEFAULT_SEO_TITLE;
  if (els.twitterDescription) els.twitterDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.twitterImage) els.twitterImage.content = image || siteUrl("/mc-icon-512.png?v=4");
  if (els.structuredData) {
    els.structuredData.textContent =
      structuredData ||
      buildStructuredData({
        "@type": "CollectionPage",
        name: title || DEFAULT_SEO_TITLE,
        url: canonical,
        inLanguage: "ru",
        description: description || DEFAULT_SEO_DESCRIPTION,
        isPartOf: {
          "@type": "WebSite",
          name: "AnimeCloud",
          url: siteUrl("/")
        }
      });
  }
}

function updateViewSeo(view) {
  const seo = VIEW_SEO[view] || VIEW_SEO.home;
  applySeo({
    title: seo.title,
    description: seo.description,
    path: getViewPath(view),
    structuredData: buildStructuredData({
      "@type": "CollectionPage",
      name: seo.title,
      url: siteUrl(getViewPath(view)),
      inLanguage: "ru",
      description: seo.description,
      isPartOf: {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl("/")
      }
    })
  });
}

function updateReleaseSeo(release) {
  const description = truncateSeoText(
    `${release.description || DEFAULT_SEO_DESCRIPTION} ${
      release.genres?.length ? `Жанры: ${release.genres.join(", ")}.` : ""
    } ${release.episodesTotal ? `Эпизодов: ${release.episodesTotal}.` : ""}`
  );
  const path = getAnimePath(release.alias);
  applySeo({
    title: `${release.title} - смотреть онлайн с русской озвучкой | AnimeCloud`,
    description,
    path,
    image: release.poster || siteUrl("/mc-icon-512.png?v=4"),
    type: "video.other",
    structuredData: buildStructuredData({
      "@type": "TVSeries",
      name: release.title,
      url: siteUrl(path),
      description,
      image: release.poster || siteUrl("/mc-icon-512.png?v=4"),
      genre: release.genres || [],
      inLanguage: "ru",
      numberOfEpisodes: release.episodesTotal || undefined,
      dateCreated: /^\d{4}$/.test(String(release.year || "")) ? String(release.year) : undefined,
      isPartOf: {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl("/")
      }
    })
  });
}

async function fetchJson(path, params, options = {}) {
  const ttl = options.ttl ?? CACHE_TTL;
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
    const attempts = Math.max(1, Number(options.retries || API_RETRY_ATTEMPTS));

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(url, { cache: "no-store", signal: options.signal });
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
          await sleep(API_RETRY_BASE_DELAY * attempt);
          continue;
        }
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

const extractList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};
const extractPagination = (payload) =>
  payload?.meta?.pagination ||
  payload?.pagination || {
    current_page: Number(payload?.page || 1),
    total_pages: Number(payload?.total_pages || 1),
    total: Number(payload?.total || extractList(payload).length)
  };
const posterSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const cardPosterSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const thumbSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.thumbnail ||
      poster?.thumbnail ||
      poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src
  );

function buildRelease(item) {
  const source = item?.release || item || {};
  const publishedEpisode = item?.published_release_episode || source.published_release_episode || null;
  const members = Array.isArray(source.members) ? source.members : [];
  const genres = Array.isArray(source.genres)
    ? source.genres.map((genre) => genre?.name || genre?.description || genre?.value).filter(Boolean)
    : [];
  const episodes = Array.isArray(source.episodes)
    ? source.episodes
        .slice()
        .sort((left, right) => (left.ordinal || 0) - (right.ordinal || 0))
        .map((episode) => ({
          ...episode,
          previewUrl: absoluteUrl(
            episode?.preview?.optimized?.preview ||
              episode?.preview?.preview ||
              episode?.preview?.optimized?.src ||
              episode?.preview?.src ||
              episode?.preview?.optimized?.thumbnail ||
              episode?.preview?.thumbnail
          )
        }))
    : [];

  return {
    id: source.id,
    alias: source.alias,
    title: source.name?.main || source.name?.english || "Без названия",
    year: source.year || "-",
    type: source.type?.description || source.type?.value || "Не указано",
    typeValue: source.type?.value || "",
    season: source.season?.description || "",
    age: source.age_rating?.label || "-",
    ageValue: source.age_rating?.value || "",
    ongoing: Boolean(source.is_ongoing || source.is_in_production),
    statusLabel: source.is_ongoing || source.is_in_production ? "Онгоинг" : "Завершен",
    publishDay: source.publish_day?.description || "",
    publishDayValue: source.publish_day?.value || 0,
    description: source.description || "Описание пока не заполнено.",
    poster: posterSource(source.poster),
    cardPoster: cardPosterSource(source.poster),
    thumb: thumbSource(source.poster),
    genres,
    episodesTotal: source.episodes_total || episodes.length || 0,
    averageDuration: source.average_duration_of_episode || 0,
    favorites: source.added_in_users_favorites || 0,
    externalPlayer: normalizeExternalPlayer(source.external_player),
    voices: members.filter((member) => member?.role?.value === "voicing").map((member) => member.nickname).filter(Boolean),
    crew: members
      .map((member) => ({
        name: member?.nickname,
        role: member?.role?.description || member?.role?.value || "Команда"
      }))
      .filter((member) => member.name),
    episodes,
    publishedEpisode: publishedEpisode
      ? {
          ordinal: publishedEpisode.ordinal || 0,
          name: publishedEpisode.name || "Без названия",
          duration: publishedEpisode.duration || 0
        }
      : null,
    nextEpisodeNumber: item?.next_release_episode_number || source.next_release_episode_number || null
  };
}

const buildReleases = (payload) => extractList(payload).map(buildRelease);

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const formatDurationMinutes = (minutes) => (minutes ? `${minutes} мин.` : "");
const formatEpisodeDuration = (seconds) => (seconds ? `${Math.max(1, Math.round(seconds / 60))} мин.` : "");

function shouldPreferFastStart() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || "");
  const downlink = Number(connection?.downlink || 0);
  if (saveData || effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g") return true;
  if (downlink && downlink < 4) return true;
  return Boolean(window.matchMedia?.("(max-width: 860px)").matches && (!downlink || downlink < 6));
}

function pickPreferredQuality(options) {
  if (!options.length) return "";
  if (state.currentQuality && state.currentQuality !== "auto" && options.some((item) => item.key === state.currentQuality)) {
    return state.currentQuality;
  }
  if (shouldPreferFastStart() && options.some((item) => item.key === "480")) return "480";
  if (options.some((item) => item.key === "720")) return "720";
  if (options.some((item) => item.key === "1080")) return "1080";
  return options[0].key;
}

function createEmptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = message;
  return node;
}

function createErrorState(message, onRetry) {
  const node = document.createElement("div");
  node.className = "error-state";

  const text = document.createElement("p");
  text.textContent = message;
  node.appendChild(text);

  if (typeof onRetry === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-btn";
    button.textContent = "Повторить";
    button.addEventListener("click", onRetry);
    node.appendChild(button);
  }

  return node;
}

function replaceWithErrorState(target, message, onRetry) {
  if (!target) return;
  target.replaceChildren(createErrorState(message, onRetry));
}

function scheduleChunkAppend(target, nodes) {
  const token = `${Date.now()}-${Math.random()}`;
  target.dataset.renderToken = token;
  let index = 0;
  const preferLightBatches =
    shouldPreferFastStart() || window.matchMedia?.("(max-width: 860px)")?.matches;
  const batchSize = preferLightBatches ? 4 : RENDER_BATCH_SIZE;

  const queueNextBatch = () => {
    if (target.dataset.renderToken !== token || index >= nodes.length) return;
    if (preferLightBatches && "requestIdleCallback" in window) {
      requestIdleCallback(() => requestAnimationFrame(appendBatch), { timeout: 180 });
      return;
    }
    requestAnimationFrame(appendBatch);
  };

  const appendBatch = () => {
    if (target.dataset.renderToken !== token) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + batchSize, nodes.length);
    while (index < end) {
      fragment.appendChild(nodes[index]);
      index += 1;
    }
    target.appendChild(fragment);
    if (index < nodes.length) {
      queueNextBatch();
    }
  };

  queueNextBatch();
}

function createTag(text) {
  const node = document.createElement("span");
  node.className = "tag";
  node.textContent = text;
  return node;
}

function createMetaPill(text) {
  const node = document.createElement("span");
  node.className = "meta-pill";
  node.textContent = text;
  return node;
}

function createChip(text) {
  const node = document.createElement("span");
  node.className = "chip";
  node.textContent = text;
  return node;
}

function safeIdle(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1200 });
    return;
  }
  setTimeout(callback, 180);
}

function afterNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function releaseViewportLocks() {
  const authModal = document.getElementById("auth-modal");
  if (authModal && !authModal.hidden) return;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

function relocateInjectedControls() {
  if (els.homePanel && els.heroCard && els.homePanel.firstElementChild !== els.heroCard) {
    els.homePanel.insertAdjacentElement("afterbegin", els.heroCard);
  }

  if (els.homePanel && els.statsRow && els.heroCard?.nextElementSibling !== els.statsRow) {
    els.heroCard?.insertAdjacentElement("afterend", els.statsRow);
  }

  const heroActions = document.querySelector(".hero-actions");
  if (heroActions && els.heroDots && els.heroDots.previousElementSibling !== heroActions) {
    heroActions.insertAdjacentElement("afterend", els.heroDots);
  }

  const detailActions = document.querySelector(".detail-actions");
  if (detailActions && els.detailListActions && els.detailListActions.previousElementSibling !== detailActions) {
    detailActions.insertAdjacentElement("afterend", els.detailListActions);
  }

  const resumeActions = document.querySelector(".resume-actions");
  if (resumeActions && els.nextEpisodeBtn && els.nextEpisodeBtn.parentElement !== resumeActions) {
    resumeActions.appendChild(els.nextEpisodeBtn);
  }
}

function readProgressMap() {
  try {
    const sharedMap = window.animeCloudWatchState?.getProgressMap?.();
    if (sharedMap && typeof sharedMap === "object") return sharedMap;
  } catch {}

  if (state.authUser?.localId) return {};

  try {
    return JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function getProgressForAlias(alias) {
  return alias ? readProgressMap()[alias] || null : null;
}

function getAllKnownReleases() {
  const pool = [
    ...state.latest,
    ...state.recommended,
    ...state.popular,
    ...state.catalogItems,
    ...state.ongoingItems,
    ...state.topItems,
    ...state.searchResults,
    ...state.favorites
  ].filter(Boolean);

  const seen = new Set();
  return pool.filter((item) => {
    if (!item?.alias || seen.has(item.alias)) return false;
    seen.add(item.alias);
    return true;
  });
}

function findReleaseByAlias(alias) {
  if (!alias) return null;
  return getAllKnownReleases().find((item) => item.alias === alias) || null;
}

function buildProgressRelease(progress) {
  const known = findReleaseByAlias(progress.alias);
  if (known) {
    return { ...known, __progress: progress };
  }

  return {
    id: progress.alias,
    alias: progress.alias,
    title: progress.title || "Без названия",
    year: "",
    type: "Аниме",
    age: "",
    statusLabel: "Продолжить",
    publishDay: "",
    poster: progress.poster || "/mc-icon-512.png?v=4",
    cardPoster: progress.cardPoster || progress.poster || "/mc-icon-512.png?v=4",
    thumb: progress.cardPoster || progress.poster || "/mc-icon-512.png?v=4",
    genres: [],
    episodesTotal: progress.episodeOrdinal || 0,
    __progress: progress
  };
}

function getContinueWatchingReleases(limit = 12) {
  return Object.values(readProgressMap())
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, limit)
    .map(buildProgressRelease);
}

function progressPercent(progress) {
  const duration = Number(progress?.duration || 0);
  const time = Number(progress?.time || 0);
  if (!duration || duration <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((time / duration) * 100)));
}

function createSkeletonCard() {
  const article = document.createElement("article");
  article.className = "anime-card anime-card--skeleton";
  article.setAttribute("aria-hidden", "true");
  article.innerHTML =
    '<div class="anime-card__action anime-card__action--skeleton"><div class="anime-card__poster-wrap skeleton-block"></div><div class="anime-card__body"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--meta"></div><div class="skeleton-tags"><span class="skeleton-pill"></span><span class="skeleton-pill"></span></div></div></div>';
  return article;
}

function renderSkeletonGrid(target, count = 8) {
  if (!target) return;
  target.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    fragment.appendChild(createSkeletonCard());
  }
  target.appendChild(fragment);
}

function decorateCardProgress(node, release) {
  const progress = release?.__progress || getProgressForAlias(release?.alias);
  if (!progress) return node;
  const body = node.querySelector(".anime-card__body");
  if (!body || body.querySelector(".anime-card__progress")) return node;

  const progressNode = document.createElement("div");
  progressNode.className = "anime-card__progress";
  progressNode.innerHTML = `<div class="anime-card__progress-bar"><span style="width:${progressPercent(
    progress
  )}%"></span></div><div class="anime-card__progress-meta">${escapeHtml(
    progress.episodeLabel || "Продолжить просмотр"
  )} • ${escapeHtml(formatClock(progress.time || 0))}</div>`;
  body.appendChild(progressNode);
  return node;
}

function renderContinueWatchingSections() {
  const releases = getContinueWatchingReleases();
  const summary = releases.length
    ? `Недосмотренных релизов: ${formatNumber(releases.length)}. Быстрый возврат к серии и времени просмотра.`
    : "Когда начнете смотреть аниме, здесь появится быстрый возврат к серии.";

  if (els.continueSummary) els.continueSummary.textContent = summary;
  if (els.profileProgressSummary) els.profileProgressSummary.textContent = summary;

  updateGrid(els.continueGrid, releases, "Продолжение просмотра пока пусто.");
  updateGrid(els.profileProgressGrid, releases, "Продолжение просмотра пока пусто.");
}

function decorateEpisodeProgress(release) {
  const progress = getProgressForAlias(release?.alias);
  if (!progress) return;

  els.episodesList.querySelectorAll(".episode-btn").forEach((button) => {
    const matchId = progress.episodeId && button.dataset.episodeId === progress.episodeId;
    const matchOrdinal = !matchId && String(progress.episodeOrdinal || "") === button.dataset.ordinal;
    if (!matchId && !matchOrdinal) return;
    button.classList.add("has-progress");

    if (!button.querySelector(".episode-progress")) {
      const bar = document.createElement("div");
      bar.className = "episode-progress";
      bar.innerHTML = `<span style="width:${progressPercent(progress)}%"></span>`;
      button.appendChild(bar);
    }

    if (!button.querySelector(".episode-progress-meta")) {
      const meta = document.createElement("small");
      meta.className = "episode-progress-meta";
      meta.textContent = `Продолжить с ${formatClock(progress.time || 0)}`;
      button.appendChild(meta);
    }
  });
}

function syncHeroOpenLink() {
  if (state.featured && els.heroOpenBtn) {
    els.heroOpenBtn.dataset.alias = state.featured.alias;
  }
}

function renderHeroFallback(message = "Загружаем лучшие релизы...") {
  if (els.heroTitle) els.heroTitle.textContent = "AnimeCloud";
  if (els.heroDescription) {
    els.heroDescription.textContent =
      "Русская озвучка, быстрый каталог, расписание, рекомендации и удобный мобильный просмотр.";
  }
  if (els.heroMeta) {
    els.heroMeta.replaceChildren(
      createMetaPill("Каталог аниме"),
      createMetaPill("Русская озвучка"),
      createMetaPill("Быстрый старт")
    );
  }
  if (els.heroPoster) {
    els.heroPoster.hidden = true;
    els.heroPoster.removeAttribute("src");
    els.heroPoster.alt = "AnimeCloud";
  }
  if (els.heroOpenBtn) {
    els.heroOpenBtn.disabled = true;
    els.heroOpenBtn.dataset.alias = "";
  }
  if (els.heroDots) {
    els.heroDots.innerHTML = "";
  }
  const fallback = document.getElementById("hero-fallback");
  const fallbackText = document.getElementById("hero-fallback-text");
  if (fallbackText) fallbackText.textContent = message;
  if (fallback) fallback.hidden = false;
}

function renderHeroPoster() {
  if (els.heroPoster) {
    els.heroPoster.hidden = false;
  }
  if (els.heroOpenBtn) {
    els.heroOpenBtn.disabled = false;
  }
  const fallback = document.getElementById("hero-fallback");
  if (fallback) {
    fallback.hidden = true;
  }
}

function getHeroCandidates() {
  return uniqueReleases([
    ...(state.latest || []),
    ...(state.recommended || []),
    ...(state.popular || []),
    ...(state.catalogItems || []),
    ...(state.ongoingItems || []),
    ...(state.topItems || [])
  ].filter(Boolean));
}

function setupInfiniteScroll() {
  if (state.infiniteObserver) {
    state.infiniteObserver.disconnect();
  }
  if (!("IntersectionObserver" in window)) return;
  if (shouldPreferFastStart() || window.matchMedia?.("(max-width: 860px)")?.matches) return;

  const buttons = [els.catalogMoreBtn, els.ongoingMoreBtn, els.topMoreBtn].filter(Boolean);
  state.infiniteObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const button = entry.target;
        if (!entry.isIntersecting || button.hidden || button.disabled) return;
        button.click();
      });
    },
    {
      rootMargin: "280px 0px 320px"
    }
  );

  buttons.forEach((button) => state.infiniteObserver.observe(button));
}

function registerGenres(releases) {
  const next = new Set(state.genreOptions);
  (releases || []).forEach((release) => {
    (release.genres || []).forEach((genre) => {
      const label = String(genre || "").trim();
      if (label) next.add(label);
    });
  });

  const sorted = [...next].sort((left, right) => left.localeCompare(right, "ru"));
  if (
    sorted.length === state.genreOptions.length &&
    sorted.every((value, index) => value === state.genreOptions[index])
  ) {
    return;
  }

  state.genreOptions = sorted;
  renderCatalogControls();
}

function renderGenreChips() {
  if (!els.catalogGenreChips) return;
  els.catalogGenreChips.innerHTML = "";

  const fragment = document.createDocumentFragment();
  state.genreOptions.forEach((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `genre-chip-btn${state.catalogGenres.includes(genre) ? " is-active" : ""}`;
    button.textContent = genre;
    button.addEventListener("click", () => {
      if (state.catalogGenres.includes(genre)) {
        state.catalogGenres = state.catalogGenres.filter((item) => item !== genre);
      } else {
        state.catalogGenres = [...state.catalogGenres, genre];
      }
      renderGenreChips();
      refreshCatalogView();
    });
    fragment.appendChild(button);
  });

  els.catalogGenreChips.appendChild(fragment);
}

function getFilteredCatalogItems() {
  return state.catalogItems.filter((release) => {
    const genres = release.genres || [];
    if (state.catalogGenre && !genres.includes(state.catalogGenre)) return false;
    if (state.catalogGenres.length && !state.catalogGenres.every((genre) => genres.includes(genre))) return false;
    return true;
  });
}

function refreshCatalogView(pagination = null) {
  if (!els.catalogGrid) return;
  const items = getFilteredCatalogItems();
  const pageLabel = pagination ? ` Страница ${pagination.current_page || state.catalogPage} из ${pagination.total_pages || 1}.` : "";
  const labels = [...new Set([state.catalogGenre, ...state.catalogGenres].filter(Boolean))];

  if (els.catalogSummary) {
    els.catalogSummary.textContent = labels.length
      ? `Фильтр по жанрам: ${labels.join(", ")}. Показано ${formatNumber(items.length)} из ${formatNumber(
          state.catalogItems.length
        )} загруженных тайтлов.${pageLabel}`
      : `${formatNumber(state.catalogTotal || state.catalogItems.length)} тайтлов в каталоге.${pageLabel}`;
  }

  updateGrid(
    els.catalogGrid,
    items,
    labels.length ? "По выбранным жанрам пока ничего не найдено." : "Каталог пуст."
  );
}

function isAdminUser() {
  const email = String(state.authUser?.email || "").trim().toLowerCase();
  return email === "serikovmaksim94@gmail.com";
}

function readAdminHeroAlias() {
  try {
    return localStorage.getItem(ADMIN_HERO_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeAdminHeroAlias(alias) {
  try {
    if (alias) localStorage.setItem(ADMIN_HERO_STORAGE_KEY, alias);
    else localStorage.removeItem(ADMIN_HERO_STORAGE_KEY);
  } catch {}
}

function favoriteStorageKey() {
  return `${FAVORITES_STORAGE_PREFIX}_${state.authUser?.localId || "guest"}`;
}

function snapshotRelease(release) {
  return {
    id: release.id,
    alias: release.alias,
    title: release.title,
    year: release.year,
    type: release.type,
    age: release.age,
    statusLabel: release.statusLabel,
    publishDay: release.publishDay,
    poster: release.poster,
    cardPoster: release.cardPoster,
    thumb: release.thumb,
    genres: release.genres || [],
    episodesTotal: release.episodesTotal || 0
  };
}

function snapshotReleaseWithList(release, listKey = "planned") {
  return { ...snapshotRelease(release), listKey };
}

function normalizeFavoriteItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.alias)
    .map((item) => ({ ...item, listKey: item.listKey || "planned" }))
    .filter((item) => {
      if (seen.has(item.alias)) return false;
      seen.add(item.alias);
      return true;
    })
    .slice(0, 240);
}

function currentListForAlias(alias) {
  return state.favorites.find((item) => item.alias === alias)?.listKey || "";
}

function getListItems(listKey) {
  return state.favorites.filter((item) => item.listKey === listKey);
}

function updateListButtons() {
  const activeList = currentListForAlias(state.currentAnime?.alias);
  [
    [els.listWatchBtn, "watching"],
    [els.listPlanBtn, "planned"],
    [els.listCompleteBtn, "completed"],
    [els.listPauseBtn, "paused"]
  ].forEach(([button, listKey]) => {
    if (!button) return;
    button.classList.toggle("is-active", activeList === listKey);
  });
}

function loadFavorites() {
  if (state.authUser?.localId) {
    state.favorites = normalizeFavoriteItems(state.favorites || []);
    return;
  }

  try {
    const raw = localStorage.getItem(favoriteStorageKey());
    state.favorites = normalizeFavoriteItems(raw ? JSON.parse(raw) : []);
  } catch {
    state.favorites = [];
  }
}

async function hydrateCloudSessionData(session = state.authUser) {
  if (!session?.localId || !window.animeCloudSync?.hydrateSessionData) return;

  try {
    const payload = await window.animeCloudSync.hydrateSessionData(session);
    if (Array.isArray(payload?.favorites)) {
      state.favorites = normalizeFavoriteItems(payload.favorites);
    }
    renderProfile();
    renderFavoriteButton();
    if (state.currentAnime) {
      renderDetails(state.currentAnime, { deferHeavy: false });
    }
    window.dispatchEvent(new CustomEvent("animecloud:progress-updated", { detail: { hydrated: true } }));
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
    renderProfile();
    renderFavoriteButton();
  }
}

function persistFavoriteState() {
  state.favorites = normalizeFavoriteItems(state.favorites);
  if (!state.authUser?.localId) {
    try {
      localStorage.setItem(favoriteStorageKey(), JSON.stringify(state.favorites));
    } catch {}
  }

  renderProfile();
  renderFavoriteButton();
  updateListButtons();

  if (state.authUser?.localId && window.animeCloudSync?.saveFavorites) {
    window.animeCloudSync.saveFavorites(state.authUser, state.favorites).catch(console.error);
  }
}

function saveFavorites() {
  persistFavoriteState();
}

function isFavorite(alias) {
  return state.favorites.some((item) => item.alias === alias);
}

function setReleaseList(release, listKey) {
  if (!release?.alias) return;
  state.favorites = state.favorites.filter((item) => item.alias !== release.alias);
  if (listKey) {
    state.favorites.unshift(snapshotReleaseWithList(release, listKey));
  }
  persistFavoriteState();
}

function toggleFavorite(release) {
  if (!release?.alias) return;
  const currentList = currentListForAlias(release.alias);
  setReleaseList(release, currentList ? "" : "planned");
}

function renderFavoriteButton() {
  if (!els.detailFavoriteBtn) return;
  const active = Boolean(state.currentAnime && isFavorite(state.currentAnime.alias));
  els.detailFavoriteBtn.textContent = active ? "В списках" : "Добавить в список";
  els.detailFavoriteBtn.classList.toggle("is-active", active);
  updateListButtons();
}

function renderProfile() {
  if (!els.favoritesGrid) return;
  const user = state.authUser;
  const admin = isAdminUser();
  syncInstallButton();

  if (els.profileAvatar) els.profileAvatar.src = user?.photoUrl || "/mc-icon-192.png?v=4";
  if (els.profileName) els.profileName.textContent = user?.displayName || user?.email?.split("@")[0] || "Гость";
  if (els.profileRoleBadge) els.profileRoleBadge.hidden = !admin;
  if (els.profileEmail) els.profileEmail.textContent = user?.email || "Вход не выполнен";
  if (els.favoritesCount) els.favoritesCount.textContent = formatNumber(state.favorites.length);
  if (els.favoritesMode) {
    els.favoritesMode.textContent = admin ? "Владелец" : user?.localId ? "Облако" : "Локально";
  }
  if (els.profileSummary) {
    els.profileSummary.textContent = user?.localId
      ? "Списки, прогресс и комментарии синхронизируются через Firebase для текущего аккаунта."
      : "Без входа данные хранятся только в этом браузере.";
  }
  if (els.adminPanel) els.adminPanel.hidden = !admin;
  if (els.adminNote) {
    els.adminNote.textContent = admin
      ? "Локальные инструменты владельца действуют только в этой сборке сайта."
      : "Панель видна только владельцу.";
  }

  updateGrid(els.listWatchingGrid, getListItems("watching"), "Список «Смотрю» пока пуст.");
  updateGrid(els.listPlannedGrid, getListItems("planned"), "Пока ничего не запланировано.");
  updateGrid(els.listCompletedGrid, getListItems("completed"), "Просмотренные тайтлы пока не отмечены.");
  updateGrid(els.listPausedGrid, getListItems("paused"), "Отложенных тайтлов пока нет.");
  updateGrid(els.favoritesGrid, state.favorites, "В избранном пока пусто.");
  renderContinueWatchingSections();
  updateListButtons();
}

function uniqueReleases(list) {
  const seen = new Set();
  return list.filter((release) => {
    if (!release?.alias || seen.has(release.alias)) return false;
    seen.add(release.alias);
    return true;
  });
}

function findCachedReleaseByAlias(alias) {
  if (!alias) return null;

  const pools = [
    state.currentAnime,
    state.featured,
    ...state.latest,
    ...state.recommended,
    ...state.popular,
    ...state.catalogItems,
    ...state.ongoingItems,
    ...state.topItems,
    ...state.searchResults,
    ...state.favorites
  ];

  return pools.find((release) => release?.alias === alias) || null;
}

function renderHeroDots() {
  if (!els.heroDots) return;
  els.heroDots.innerHTML = "";
  const fragment = document.createDocumentFragment();

  state.heroPool.forEach((release, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `hero-dot${state.heroCarouselIndex === index ? " is-active" : ""}`;
    button.setAttribute("aria-label", release.title);
    button.addEventListener("click", () => {
      goToHeroIndex(index);
    });
    fragment.appendChild(button);
  });

  els.heroDots.appendChild(fragment);
}

function goToHeroIndex(index) {
  if (!state.heroPool.length) return;
  const safeIndex = (index + state.heroPool.length) % state.heroPool.length;
  state.heroCarouselIndex = safeIndex;
  state.featured = state.heroPool[safeIndex];
  renderHero(state.featured);
}

function startHeroCarousel() {
  if (state.heroCarouselTimer) {
    clearInterval(state.heroCarouselTimer);
    state.heroCarouselTimer = null;
  }
  if (state.heroPool.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  state.heroCarouselTimer = setInterval(() => {
    if (document.hidden || els.drawer?.classList.contains("is-open")) return;
    goToHeroIndex(state.heroCarouselIndex + 1);
  }, 8000);
}

function renderHero(release) {
  if (!release) {
    renderHeroFallback();
    return;
  }

  renderHeroPoster();

  const meta = [
    `${release.type} • ${release.year}`,
    release.season,
    `${release.episodesTotal || "?"} эп.`,
    release.publishDay ? `Выходит: ${release.publishDay}` : "",
    release.age
  ].filter(Boolean);

  els.heroTitle.textContent = release.title;
  els.heroDescription.textContent = release.description;
  els.heroMeta.replaceChildren(...meta.map(createMetaPill));
  els.heroPoster.src = release.poster;
  els.heroPoster.alt = release.title;
  renderHeroDots();
  syncHeroOpenLink();
}

function applyAdminHero(releases) {
  const forcedAlias = readAdminHeroAlias();
  if (!forcedAlias) return null;
  return releases.find((release) => release.alias === forcedAlias) || null;
}

function updateStats() {
  els.latestCount.textContent = formatNumber(state.latest.length || state.recommended.length || state.popular.length);
  els.catalogCount.textContent = formatNumber(state.catalogTotal || state.catalogItems.length || getHeroCandidates().length);
  els.ongoingCount.textContent = formatNumber(state.ongoingTotal || state.ongoingItems.length);
  els.topCount.textContent = formatNumber(state.topTotal || state.popular.length || state.topItems.length);
}

function syncHomeChrome(view) {
  const visible = view === "home";
  if (els.heroCard) els.heroCard.hidden = !visible;
  if (els.statsRow) els.statsRow.hidden = !visible;
}

function setView(view, options = {}) {
  releaseViewportLocks();

  if (els.drawer?.classList.contains("is-open")) {
    closeDrawer({ updateHistory: false });
  }

  state.currentView = view;
  if (view !== "search") {
    state.previousView = view;
  }

  els.tabs.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  els.mobileTabs.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  els.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });

  syncHomeChrome(view);

  if (options.updateHistory !== false) {
    navigateTo(getViewPath(view), { replace: options.replaceHistory });
  }

  updateViewSeo(view);
  if (view === "search") {
    safeIdle(() => els.searchInput?.focus());
  }
  if (view === "profile") {
    renderProfile();
  }
  ensureViewLoaded(view).catch(console.error);
}

async function ensureViewLoaded(view) {
  if (view === "home" && !state.homeLoaded) return loadHome();
  if (view === "catalog" && !state.catalogLoaded) return loadCatalog({ reset: true });
  if (view === "ongoing" && !state.ongoingLoaded) return loadOngoing({ reset: true });
  if (view === "top" && !state.topLoaded) return loadTop({ reset: true });
  if (view === "schedule" && !state.scheduleLoaded) return loadSchedule();
  if (view === "profile") return renderProfile();
  if (view === "search" && !state.searchQuery.trim()) renderSearchEmpty();
}

async function loadReferences(force = false) {
  if (state.referencesLoaded && !force) return;
  const [sortingPayload, typesPayload] = await Promise.all([
    fetchJson("/anime/catalog/references/sorting", null, { ttl: DETAIL_TTL }),
    fetchJson("/anime/catalog/references/types", null, { ttl: DETAIL_TTL })
  ]);

  state.sortingOptions = Array.isArray(sortingPayload) ? sortingPayload : [];
  state.typeOptions = Array.isArray(typesPayload) ? typesPayload : [];
  state.referencesLoaded = true;
  renderCatalogControls();
}

function renderCatalogControls() {
  els.catalogSort.innerHTML = "";
  els.catalogType.innerHTML = '<option value="">Все форматы</option>';
  els.catalogGenre.innerHTML = '<option value="">Все жанры</option>';

  state.sortingOptions.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label || option.description || option.value;
    node.selected = option.value === state.catalogSort;
    els.catalogSort.appendChild(node);
  });

  state.typeOptions.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.description || option.value;
    node.selected = option.value === state.catalogType;
    els.catalogType.appendChild(node);
  });

  state.genreOptions.forEach((genre) => {
    const node = document.createElement("option");
    node.value = genre;
    node.textContent = genre;
    node.selected = genre === state.catalogGenre;
    els.catalogGenre.appendChild(node);
  });

  renderGenreChips();
}

async function loadHome(force = false) {
  if (state.homeLoaded && !force) return;

  renderSkeletonGrid(els.continueGrid, 4);
  renderSkeletonGrid(els.latestGrid, 6);
  renderSkeletonGrid(els.recommendedGrid, 6);
  renderSkeletonGrid(els.popularGrid, 6);

  try {
    const [latestPayload, recommendedPayload, popularPayload] = await Promise.all([
      fetchJson("/anime/releases/latest", { limit: 12 }, { ttl: 60000 }),
      fetchJson("/anime/releases/recommended", { limit: 12 }, { ttl: 60000 }),
      fetchJson("/anime/catalog/releases", { page: 1, limit: 12, "f[sorting]": "RATING_DESC" }, { ttl: 120000 })
    ]);

    state.latest = buildReleases(latestPayload);
    state.recommended = buildReleases(recommendedPayload);
    state.popular = buildReleases(popularPayload);

    registerGenres(state.latest);
    registerGenres(state.recommended);
    registerGenres(state.popular);

    const featuredPool = getHeroCandidates();
    state.featured = applyAdminHero(featuredPool) || featuredPool[0] || null;
    state.heroPool = uniqueReleases([state.featured, ...featuredPool]).slice(0, 4);
    state.heroCarouselIndex = Math.max(0, state.heroPool.findIndex((item) => item.alias === state.featured?.alias));
    state.catalogTotal = extractPagination(popularPayload).total || state.catalogTotal;
    state.homeLoaded = true;

    renderHero(state.featured);
    updateGrid(els.latestGrid, state.latest, "Свежие релизы пока не найдены.");
    updateGrid(els.recommendedGrid, state.recommended, "Подборка пока не заполнена.");
    updateGrid(els.popularGrid, state.popular, "Популярные релизы пока не найдены.");
    renderContinueWatchingSections();
    updateStats();
    startHeroCarousel();
  } catch (error) {
    console.error("loadHome failed", error);
    state.homeLoaded = false;
    renderHeroFallback("Не удалось загрузить главную витрину.");
    replaceWithErrorState(els.latestGrid, "Не удалось загрузить последние релизы.", () => loadHome(true).catch(console.error));
    replaceWithErrorState(els.recommendedGrid, "Не удалось загрузить рекомендации.", () => loadHome(true).catch(console.error));
    replaceWithErrorState(els.popularGrid, "Не удалось загрузить популярные релизы.", () => loadHome(true).catch(console.error));
    renderContinueWatchingSections();
    updateStats();
    throw error;
  }
}

function buildCatalogParams(page, extra = {}) {
  const params = {
    page,
    limit: GRID_PAGE_SIZE,
    "f[sorting]": state.catalogSort
  };
  if (state.catalogType) {
    params["f[types]"] = state.catalogType;
  }
  Object.assign(params, extra);
  return params;
}

async function loadCatalog(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.catalogPage + 1;

  if (reset) {
    state.catalogItems = [];
    state.catalogPage = 0;
    state.catalogHasMore = false;
    els.catalogSummary.textContent = "Загружаем каталог…";
    renderSkeletonGrid(els.catalogGrid, 8);
  }

  try {
    els.catalogMoreBtn.disabled = true;
    const payload = await fetchJson("/anime/catalog/releases", buildCatalogParams(nextPage), { ttl: 120000 });
    const releases = buildReleases(payload);
    const pagination = extractPagination(payload);

    registerGenres(releases);
    state.catalogItems = reset ? releases : state.catalogItems.concat(releases);
    state.catalogPage = pagination.current_page || nextPage;
    state.catalogTotal = pagination.total || state.catalogItems.length;
    state.catalogHasMore = state.catalogPage < (pagination.total_pages || 1);
    state.catalogLoaded = true;

    const hasFilters = Boolean(state.catalogGenre || state.catalogGenres.length);
    if (hasFilters) {
      refreshCatalogView(pagination);
    } else {
      els.catalogSummary.textContent = `${formatNumber(state.catalogTotal)} тайтлов. Страница ${state.catalogPage} из ${pagination.total_pages || 1}.`;
      if (reset) {
        updateGrid(els.catalogGrid, state.catalogItems, "Каталог пуст.");
      } else {
        updateGrid(els.catalogGrid, releases, "Каталог пуст.", {
          append: true,
          offset: state.catalogItems.length - releases.length
        });
      }
    }

    els.catalogMoreBtn.hidden = !state.catalogHasMore;
    els.catalogMoreBtn.disabled = !state.catalogHasMore;
    updateStats();
    setupInfiniteScroll();
  } catch (error) {
    console.error("loadCatalog failed", error);
    els.catalogMoreBtn.hidden = true;
    els.catalogMoreBtn.disabled = false;
    els.catalogSummary.textContent = "Каталог временно недоступен.";
    replaceWithErrorState(els.catalogGrid, "Не удалось загрузить каталог.", () => loadCatalog({ reset: true }).catch(console.error));
    throw error;
  }
}

async function loadOngoing(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.ongoingPage + 1;

  if (reset) {
    state.ongoingItems = [];
    state.ongoingPage = 0;
    state.ongoingHasMore = false;
    els.ongoingSummary.textContent = "Загружаем онгоинги…";
    renderSkeletonGrid(els.ongoingGrid, 8);
  }

  try {
    els.ongoingMoreBtn.disabled = true;
    const payload = await fetchJson(
      "/anime/catalog/releases",
      buildCatalogParams(nextPage, { "f[publish_statuses]": "IS_ONGOING" }),
      { ttl: 120000 }
    );
    const releases = buildReleases(payload);
    const pagination = extractPagination(payload);

    registerGenres(releases);
    state.ongoingItems = reset ? releases : state.ongoingItems.concat(releases);
    state.ongoingPage = pagination.current_page || nextPage;
    state.ongoingTotal = pagination.total || state.ongoingItems.length;
    state.ongoingHasMore = state.ongoingPage < (pagination.total_pages || 1);
    state.ongoingLoaded = true;

    els.ongoingSummary.textContent = `${formatNumber(state.ongoingTotal)} активных релизов. Страница ${state.ongoingPage} из ${pagination.total_pages || 1}.`;
    if (reset) {
      updateGrid(els.ongoingGrid, state.ongoingItems, "Онгоинги не найдены.");
    } else {
      updateGrid(els.ongoingGrid, releases, "Онгоинги не найдены.", {
        append: true,
        offset: state.ongoingItems.length - releases.length
      });
    }

    els.ongoingMoreBtn.hidden = !state.ongoingHasMore;
    els.ongoingMoreBtn.disabled = !state.ongoingHasMore;
    updateStats();
    setupInfiniteScroll();
  } catch (error) {
    console.error("loadOngoing failed", error);
    els.ongoingMoreBtn.hidden = true;
    els.ongoingMoreBtn.disabled = false;
    els.ongoingSummary.textContent = "Раздел онгоингов временно недоступен.";
    replaceWithErrorState(els.ongoingGrid, "Не удалось загрузить онгоинги.", () => loadOngoing({ reset: true }).catch(console.error));
    throw error;
  }
}
async function loadTop(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.topPage + 1;

  if (reset) {
    state.topItems = [];
    state.topPage = 0;
    state.topHasMore = false;
    els.topSummary.textContent = "Загружаем топ каталога…";
    renderSkeletonGrid(els.topGrid, 8);
  }

  try {
    els.topMoreBtn.disabled = true;
    const payload = await fetchJson(
      "/anime/catalog/releases",
      { page: nextPage, limit: GRID_PAGE_SIZE, "f[sorting]": "RATING_DESC" },
      { ttl: 120000 }
    );
    const releases = buildReleases(payload);
    const pagination = extractPagination(payload);

    registerGenres(releases);
    state.topItems = reset ? releases : state.topItems.concat(releases);
    state.topPage = pagination.current_page || nextPage;
    state.topTotal = pagination.total || state.topItems.length;
    state.topHasMore = state.topPage < (pagination.total_pages || 1);
    state.topLoaded = true;

    els.topSummary.textContent = `${formatNumber(state.topTotal)} релизов в рейтинге. Страница ${state.topPage} из ${pagination.total_pages || 1}.`;
    if (reset) {
      updateGrid(els.topGrid, state.topItems, "Топ пока не заполнен.");
    } else {
      updateGrid(els.topGrid, releases, "Топ пока не заполнен.", {
        append: true,
        offset: state.topItems.length - releases.length
      });
    }

    els.topMoreBtn.hidden = !state.topHasMore;
    els.topMoreBtn.disabled = !state.topHasMore;
    updateStats();
    setupInfiniteScroll();
  } catch (error) {
    console.error("loadTop failed", error);
    els.topMoreBtn.hidden = true;
    els.topMoreBtn.disabled = false;
    els.topSummary.textContent = "Топ временно недоступен.";
    replaceWithErrorState(els.topGrid, "Не удалось загрузить топ.", () => loadTop({ reset: true }).catch(console.error));
    throw error;
  }
}

async function loadSchedule() {
  try {
    state.scheduleLoaded = true;
    els.scheduleGrid.replaceChildren(createEmptyState("Загружаем расписание…"));
    const payload = await fetchJson("/anime/schedule/week", null, { ttl: 60000 });
    state.scheduleItems = buildReleases(payload);
    renderSchedule();
  } catch (error) {
    console.error("loadSchedule failed", error);
    state.scheduleLoaded = false;
    replaceWithErrorState(els.scheduleGrid, "Не удалось загрузить расписание.", () => loadSchedule().catch(console.error));
    throw error;
  }
}

function renderSchedule() {
  if (!state.scheduleItems.length) {
    els.scheduleGrid.replaceChildren(createEmptyState("Расписание пока недоступно."));
    return;
  }

  const groups = new Map();
  state.scheduleItems
    .slice()
    .sort((left, right) => {
      const dayDiff = (left.publishDayValue || 0) - (right.publishDayValue || 0);
      return dayDiff !== 0 ? dayDiff : left.title.localeCompare(right.title, "ru");
    })
    .forEach((release) => {
      const key = release.publishDay || "Без дня";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(release);
    });

  const nodes = [];
  groups.forEach((releases, day) => {
    const dayNode = document.createElement("section");
    dayNode.className = "schedule-day";

    const title = document.createElement("h3");
    title.textContent = day;
    dayNode.appendChild(title);

    const list = document.createElement("div");
    list.className = "schedule-list";

    releases.forEach((release) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "schedule-item";
      button.innerHTML = `<img src="${escapeHtml(release.thumb)}" alt="${escapeHtml(
        release.title
      )}" loading="lazy" decoding="async"><div class="schedule-item__body"><strong>${escapeHtml(
        release.title
      )}</strong><span>${escapeHtml(`${release.type} • ${release.year}`)}</span><small>${escapeHtml(
        release.publishedEpisode
          ? `Доступна ${release.publishedEpisode.ordinal} серия`
          : release.nextEpisodeNumber
            ? `Следующая серия: ${release.nextEpisodeNumber}`
            : `${release.episodesTotal || "?"} эп.`
      )}</small></div>`;
      button.addEventListener("click", () => openRelease(release.alias).catch(console.error));
      list.appendChild(button);
    });

    dayNode.appendChild(list);
    nodes.push(dayNode);
  });

  els.scheduleGrid.innerHTML = "";
  scheduleChunkAppend(els.scheduleGrid, nodes);
}

function renderSearchEmpty() {
  updateGrid(els.searchGrid, [], "Введите название аниме, чтобы увидеть результаты.");
  els.searchSummary.textContent = "Введите название сверху, чтобы найти релиз.";
}

async function runSearch(query) {
  const cleanQuery = query.trim();
  state.searchQuery = cleanQuery;
  if (state.searchAbort) {
    state.searchAbort.abort();
    state.searchAbort = null;
  }

  if (!cleanQuery) {
    state.searchResults = [];
    renderSearchEmpty();
    setView(state.previousView || "home");
    return;
  }

  const controller = new AbortController();
  state.searchAbort = controller;
  setView("search");
  els.searchSummary.textContent = "Ищем релизы…";
  renderSkeletonGrid(els.searchGrid, 8);

  try {
    const payload = await fetchJson("/app/search/releases", { query: cleanQuery }, { ttl: 60000, signal: controller.signal });
    if (controller.signal.aborted) return;

    state.searchResults = buildReleases(payload).slice(0, 36);
    els.searchSummary.textContent = state.searchResults.length
      ? `Найдено ${formatNumber(state.searchResults.length)} релизов по запросу «${cleanQuery}».`
      : `По запросу «${cleanQuery}» ничего не найдено.`;
    updateGrid(els.searchGrid, state.searchResults, "Ничего не найдено.");
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
    els.searchSummary.textContent = "Поиск временно недоступен.";
    updateGrid(els.searchGrid, [], "Поиск временно недоступен.");
  } finally {
    if (state.searchAbort === controller) {
      state.searchAbort = null;
    }
  }
}

const prefetchRelease = (alias) =>
  fetchJson(`/anime/releases/${encodeURIComponent(alias)}`, null, { ttl: DETAIL_TTL }).catch(() => {});

function createAnimeCard(release, index) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const action = node.querySelector(".anime-card__action");
  const poster = node.querySelector(".anime-card__poster");

  node.querySelector(".anime-card__age").textContent = release.age;
  node.querySelector(".anime-card__status").textContent = release.statusLabel;
  node.querySelector(".anime-card__title").textContent = release.title;
  node.querySelector(".anime-card__meta").textContent = [release.type, release.year, `${release.episodesTotal || "?"} эп.`]
    .filter(Boolean)
    .join(" • ");

  poster.src = release.cardPoster;
  poster.alt = release.title;
  poster.loading = index < 4 ? "eager" : "lazy";
  poster.decoding = "async";
  poster.fetchPriority = index < 2 ? "high" : "auto";
  poster.srcset = `${release.cardPoster} 1x, ${release.poster} 2x`;
  poster.sizes = "(max-width: 560px) 44vw, (max-width: 920px) 30vw, 220px";

  const tags = node.querySelector(".anime-card__tags");
  const values = release.genres.slice(0, 2);
  if (!values.length && release.publishDay) {
    values.push(release.publishDay);
  }
  values.forEach((value) => tags.appendChild(createTag(value)));

  action.href = getAnimePath(release.alias);
  action.setAttribute("aria-label", `${release.title}: открыть релиз`);
  action.addEventListener("click", (event) => {
    event.preventDefault();
    openRelease(release.alias).catch(console.error);
  });

  const warmRelease = () => {
    prefetchRelease(release.alias);
    ensureHlsLibrary().catch(() => {});
  };

  action.addEventListener("mouseenter", warmRelease, { once: true });
  action.addEventListener("focus", warmRelease, { once: true });
  action.addEventListener("touchstart", warmRelease, { once: true, passive: true });

  return decorateCardProgress(node, release);
}

function updateGrid(target, releases, emptyMessage, options = {}) {
  if (!target) return;
  const append = Boolean(options.append);
  const offset = options.offset || 0;
  if (!append) {
    target.innerHTML = "";
  }
  if (!releases.length) {
    if (!append) {
      target.replaceChildren(createEmptyState(emptyMessage));
    }
    return;
  }

  scheduleChunkAppend(
    target,
    releases.map((release, index) => createAnimeCard(release, offset + index))
  );
}

function openDrawer() {
  els.drawer.classList.add("is-open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer(options = {}) {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  destroyPlayer();
  stopExternalPlayer();

  if (options.updateHistory !== false) {
    navigateTo(getViewPath(state.previousView || "home"), { replace: options.replaceHistory });
  }

  updateViewSeo(state.previousView || state.currentView || "home");
  window.dispatchEvent(new CustomEvent("animecloud:drawer-closed"));
  releaseViewportLocks();
}

function destroyPlayer() {
  if (state.playerStartupTimer) {
    clearTimeout(state.playerStartupTimer);
    state.playerStartupTimer = null;
  }
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  state.hlsRecoveryTried = false;
  els.player.pause();
  els.player.removeAttribute("src");
  els.player.load();
  if (state.manifestBlobUrl) {
    URL.revokeObjectURL(state.manifestBlobUrl);
    state.manifestBlobUrl = null;
  }
}

function stopExternalPlayer() {
  const currentSrc = els.externalPlayer.getAttribute("src") || "";
  if (currentSrc && currentSrc !== "about:blank") {
    els.externalPlayer.src = "about:blank";
  }
  els.externalPlayer.hidden = true;
  els.player.hidden = false;
}

function showVideoSurface() {
  els.externalPlayer.hidden = true;
  els.player.hidden = false;
}

function showExternalSurface(url) {
  destroyPlayer();
  els.player.hidden = true;
  els.externalPlayer.hidden = false;
  els.externalPlayer.src = url;
}

function buildQualityOptions(episode) {
  const options = [
    { key: "1080", label: "1080p", url: episode.hls_1080 },
    { key: "720", label: "720p", url: episode.hls_720 },
    { key: "480", label: "480p", url: episode.hls_480 }
  ].filter((item) => item.url);

  if (state.currentQuality === "auto" || !options.some((item) => item.key === state.currentQuality)) {
    state.currentQuality = pickPreferredQuality(options);
  }
  return options;
}

function proxiedMediaUrl(url) {
  const normalized = url.startsWith("//") ? `https:${url}` : url;
  return `${MEDIA_PROXY_BASE}?url=${encodeURIComponent(normalized)}`;
}

function getPlayableManifestUrl(manifestUrl) {
  const normalized = manifestUrl.startsWith("//") ? `https:${manifestUrl}` : manifestUrl;
  const proxiedUrl = `${window.location.origin}${proxiedMediaUrl(normalized)}`;
  manifestCache.set(normalized, { time: Date.now(), text: proxiedUrl });
  return proxiedUrl;
}

function clearPlayerStartupTimer() {
  if (!state.playerStartupTimer) return;
  clearTimeout(state.playerStartupTimer);
  state.playerStartupTimer = null;
}

function syncPlayerReadyState() {
  clearPlayerStartupTimer();
  if (state.currentSource === "anilibria" && !els.player.hidden) {
    els.playerNote.textContent = "Поток подключён.";
  }
}

function armPlayerStartupTimer(selectionToken, episode, qualityKey) {
  clearPlayerStartupTimer();
  const timeoutMs = shouldPreferFastStart() ? 10000 : 15000;

  state.playerStartupTimer = setTimeout(() => {
    if (state.playerSelectionToken !== selectionToken) return;
    if (state.currentSource !== "anilibria") return;
    if (state.currentEpisode?.id !== episode?.id) return;
    if (els.player.readyState >= 2 || Number(els.player.currentTime || 0) > 0) {
      clearPlayerStartupTimer();
      return;
    }

    if (qualityKey !== "480" && episode?.hls_480 && state.currentQuality !== "480") {
      els.playerNote.textContent = "Поток долго стартует. Переключаемся на 480p…";
      state.currentQuality = "480";
      selectEpisode(episode, { preserveSource: true, forceReload: true }).catch(console.error);
      return;
    }

    destroyPlayer();
    els.playerNote.textContent = "Поток не загрузился. Попробуйте 480p, другую серию или обновите страницу.";
  }, timeoutMs);
}

async function ensureHlsLibrary() {
  if (window.Hls) return window.Hls;
  if (state.hlsLoaderPromise) return state.hlsLoaderPromise;

  state.hlsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-animecloud-hls="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Hls), { once: true });
      existing.addEventListener("error", () => reject(new Error("HLS script load failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.animecloudHls = "1";
    script.onload = () => resolve(window.Hls);
    script.onerror = () => {
      state.hlsLoaderPromise = null;
      reject(new Error("HLS script load failed"));
    };
    document.head.appendChild(script);
  });

  return state.hlsLoaderPromise;
}

async function attachPlayer(manifestUrl) {
  destroyPlayer();
  stopExternalPlayer();
  showVideoSurface();

  const playableManifestUrl = getPlayableManifestUrl(manifestUrl);

  let HlsLib = null;
  try {
    HlsLib = await ensureHlsLibrary();
  } catch {}

  if (HlsLib && HlsLib.isSupported()) {
    state.hlsRecoveryTried = false;
    state.hls = new HlsLib({
      enableWorker: true,
      lowLatencyMode: false,
      capLevelToPlayerSize: true,
      backBufferLength: 6,
      maxBufferLength: 12,
      maxMaxBufferLength: 18,
      manifestLoadingTimeOut: 9000,
      fragLoadingTimeOut: 12000,
      manifestLoadingMaxRetry: 1,
      fragLoadingMaxRetry: 1,
      startLevel: -1
    });
    state.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
      if (!els.player.hidden) {
        els.playerNote.textContent = "Буферизуем поток…";
      }
    });
    state.hls.on(HlsLib.Events.ERROR, (_, data) => {
      if (!data?.fatal) return;
      console.error("HLS fatal error", data);
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && !state.hlsRecoveryTried) {
        state.hlsRecoveryTried = true;
        els.playerNote.textContent = "Поток не отвечает. Перезагружаем соединение…";
        try {
          state.hls.startLoad(-1);
          return;
        } catch {}
      }
      destroyPlayer();
      els.playerNote.textContent = "Не удалось загрузить поток. Попробуйте другую серию или обновите страницу.";
    });
    state.hls.loadSource(playableManifestUrl);
    state.hls.attachMedia(els.player);
    return;
  }

  els.player.src = playableManifestUrl;
}

function buildSourceList(release) {
  const sources = [
    {
      id: "anilibria",
      title: "AniLibria",
      note: release.voices.length ? release.voices.slice(0, 4).join(", ") : "Русская озвучка AniLibria"
    }
  ];

  if (release.externalPlayer) {
    sources.push({
      id: "external",
      title: "Другие озвучки",
      note: "AniDub, DEEP, Studio Band и другие, если они доступны у источника"
    });
  }
  return sources;
}

function buildSourceNodes(release) {
  return buildSourceList(release).map((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sourceId = source.id;
    button.className = `source-btn${state.currentSource === source.id ? " is-active" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.note)}</small>`;
    button.addEventListener("click", () => switchSource(source.id));
    return button;
  });
}

function buildEpisodeNodes(release) {
  return (release?.episodes || []).map((episode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `episode-btn${state.currentEpisode?.id === episode.id ? " is-active" : ""}`;
    button.dataset.episodeId = episode.id || "";
    button.dataset.ordinal = String(episode.ordinal || "");
    button.innerHTML = `<strong>${escapeHtml(`${episode.ordinal} серия`)}</strong><span>${escapeHtml(
      episode.name || "Без названия"
    )}</span><small>${escapeHtml(formatEpisodeDuration(episode.duration) || "Длительность не указана")}</small>`;
    button.addEventListener("click", () => selectEpisode(episode).catch(console.error));
    return button;
  });
}

function buildVoiceNodes(release) {
  return (release?.voices || []).map((name) => {
    const pill = document.createElement("div");
    pill.className = "voice-pill";
    pill.innerHTML = `<strong>${escapeHtml(name)}</strong><small>озвучка</small>`;
    return pill;
  });
}

function buildCrewNodes(release) {
  return (release?.crew || []).map((member) => {
    const pill = document.createElement("div");
    pill.className = "crew-pill";
    pill.innerHTML = `<strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small>`;
    return pill;
  });
}

function renderSourceSwitch(release) {
  if (!els.sourceSwitch) return;
  els.sourceSwitch.innerHTML = "";
  scheduleChunkAppend(els.sourceSwitch, buildSourceNodes(release));
}

function renderEpisodes(release) {
  if (!els.episodesList) return;
  const nodes = buildEpisodeNodes(release);
  els.episodesList.innerHTML = "";
  if (!nodes.length) {
    els.episodesList.appendChild(createEmptyState("У этого релиза пока нет опубликованных серий."));
    return;
  }
  scheduleChunkAppend(els.episodesList, nodes);
  requestAnimationFrame(() => {
    if (state.currentAnime?.alias === release.alias) {
      decorateEpisodeProgress(release);
    }
  });
}

function renderVoices(release) {
  if (!els.voiceList) return;
  const nodes = buildVoiceNodes(release);
  els.voiceList.innerHTML = "";
  if (!nodes.length) {
    els.voiceList.appendChild(createEmptyState("Команда озвучки не указана."));
    return;
  }
  scheduleChunkAppend(els.voiceList, nodes);
}

function renderCrew(release) {
  if (!els.crewList) return;
  const nodes = buildCrewNodes(release);
  els.crewList.innerHTML = "";
  if (!nodes.length) {
    els.crewList.appendChild(createEmptyState("Команда релиза не указана."));
    return;
  }
  scheduleChunkAppend(els.crewList, nodes);
}

function renderDetailLoadingState() {
  if (els.sourceSwitch) {
    els.sourceSwitch.replaceChildren(createEmptyState("Подготавливаем источники..."));
  }
  if (els.episodesList) {
    els.episodesList.replaceChildren(createEmptyState("Подготавливаем список серий..."));
  }
  if (els.voiceList) {
    els.voiceList.replaceChildren(createEmptyState("Подготавливаем озвучку..."));
  }
  if (els.crewList) {
    els.crewList.replaceChildren(createEmptyState("Подготавливаем команду релиза..."));
  }
}

function renderDetailShell(release) {
  if (els.detailPoster) {
    els.detailPoster.src = release.poster;
    els.detailPoster.alt = release.title;
    els.detailPoster.loading = "eager";
    els.detailPoster.decoding = "async";
    els.detailPoster.fetchPriority = "high";
  }
  if (els.detailTitle) els.detailTitle.textContent = release.title;
  if (els.detailDescription) els.detailDescription.textContent = release.description;

  const meta = [
    release.type,
    release.year,
    release.season,
    `${release.episodesTotal || "?"} эп.`,
    formatDurationMinutes(release.averageDuration),
    release.publishDay ? `Выходит: ${release.publishDay}` : "",
    release.favorites ? `${formatNumber(release.favorites)} в избранном` : "",
    release.age
  ].filter(Boolean);

  if (els.detailMeta) {
    els.detailMeta.replaceChildren(...meta.map(createMetaPill));
  }
  if (els.detailChips) {
    els.detailChips.replaceChildren(...(release.genres || []).slice(0, 10).map(createChip));
  }
  if (els.detailAdminPinBtn) {
    els.detailAdminPinBtn.hidden = !isAdminUser();
    if (isAdminUser()) {
      els.detailAdminPinBtn.textContent =
        readAdminHeroAlias() === release.alias ? "Главный баннер выбран" : "Сделать главным баннером";
    }
  }

  renderFavoriteButton();
  updateListButtons();
}

function issueDetailRenderToken(release) {
  const token = `${release?.alias || "release"}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  state.detailRenderToken = token;
  return token;
}

function isActiveDetailRender(token, alias) {
  return state.detailRenderToken === token && state.currentAnime?.alias === alias;
}

function queueDetailSectionsRender(release, token) {
  requestAnimationFrame(() => {
    if (!isActiveDetailRender(token, release.alias)) return;
    renderSourceSwitch(release);
    renderEpisodes(release);
  });

  safeIdle(() => {
    if (!isActiveDetailRender(token, release.alias)) return;
    renderVoices(release);
  });

  safeIdle(() => {
    if (!isActiveDetailRender(token, release.alias)) return;
    renderCrew(release);
  });
}

function renderDetails(release, options = {}) {
  if (!release) return;
  const token = issueDetailRenderToken(release);
  renderDetailShell(release);
  renderDetailLoadingState();

  if (options.deferHeavy === false) {
    renderSourceSwitch(release);
    renderEpisodes(release);
    renderVoices(release);
    renderCrew(release);
    return;
  }

  queueDetailSectionsRender(release, token);
}

function syncRenderedSourceState() {
  els.sourceSwitch.querySelectorAll(".source-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sourceId === state.currentSource);
  });
}

function syncRenderedEpisodeState() {
  const currentEpisodeId = String(state.currentEpisode?.id || "");
  els.episodesList.querySelectorAll(".episode-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.episodeId === currentEpisodeId);
  });
}

function renderQualityButtons(episode) {
  const qualities = buildQualityOptions(episode);
  els.qualitySwitch.innerHTML = "";

  qualities.forEach((quality) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `quality-btn${state.currentQuality === quality.key ? " is-active" : ""}`;
    button.textContent = quality.label;
    button.addEventListener("click", () => {
      state.currentQuality = quality.key;
      selectEpisode(episode, { preserveSource: true, forceReload: true }).catch(console.error);
    });
    els.qualitySwitch.appendChild(button);
  });

  return qualities;
}

async function selectEpisode(episode, options = {}) {
  if (!state.currentAnime || !episode) return;

  const nextSource = options.preserveSource ? state.currentSource : "anilibria";
  const sameEpisode =
    state.currentEpisode?.id === episode.id &&
    state.currentSource === nextSource &&
    !options.forceReload;

  if (sameEpisode) {
    syncRenderedEpisodeState();
    syncRenderedSourceState();
    return;
  }

  if (!options.preserveSource) {
    state.currentSource = "anilibria";
  }

  state.currentEpisode = episode;
  const selectionToken = `${episode.id || episode.ordinal || "episode"}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
  state.playerSelectionToken = selectionToken;

  syncRenderedEpisodeState();
  syncRenderedSourceState();
  showVideoSurface();
  stopExternalPlayer();

  const qualities = renderQualityButtons(episode);
  const selected = qualities.find((quality) => quality.key === state.currentQuality) || qualities[0];

  els.playerTitle.textContent = `${episode.ordinal} серия${episode.name ? ` • ${episode.name}` : ""}`;
  window.dispatchEvent(
    new CustomEvent("animecloud:episode-selected", {
      detail: { release: state.currentAnime, episode, sourceId: state.currentSource }
    })
  );

  if (!selected) {
    destroyPlayer();
    els.playerNote.textContent = "У этой серии пока нет доступного потока.";
    return;
  }

  els.playerNote.textContent = `Плеер подготавливает поток через ваш домен. Стартовое качество: ${selected.label}. При необходимости переключите его вручную.`;

  await afterNextPaint();
  if (state.playerSelectionToken !== selectionToken || state.currentEpisode?.id !== episode.id) return;

  try {
    await attachPlayer(selected.url);
    if (state.playerSelectionToken === selectionToken && state.currentEpisode?.id === episode.id) {
      armPlayerStartupTimer(selectionToken, episode, selected.key);
      els.player.play().catch(() => {});
    }
  } catch (error) {
    console.error(error);
    if (state.playerSelectionToken === selectionToken) {
      clearPlayerStartupTimer();
      els.playerNote.textContent = "Не удалось загрузить поток. Попробуйте другое качество или другую серию.";
    }
  }
}

function switchSource(sourceId) {
  if (!state.currentAnime || sourceId === state.currentSource) return;
  state.currentSource = sourceId;
  syncRenderedSourceState();

  window.dispatchEvent(
    new CustomEvent("animecloud:source-changed", {
      detail: { release: state.currentAnime, sourceId }
    })
  );

  if (sourceId === "external" && state.currentAnime.externalPlayer) {
    showExternalSurface(state.currentAnime.externalPlayer);
    els.qualitySwitch.innerHTML = "";
    els.playerTitle.textContent = "Другие озвучки";
    els.playerNote.textContent =
      "Если внешний источник поддерживает AniDub, DEEP, Studio Band или другие переводы, выбирайте их внутри этого плеера.";
    return;
  }

  if (state.currentEpisode) {
    selectEpisode(state.currentEpisode, { preserveSource: true, forceReload: true }).catch(console.error);
    return;
  }

  if (state.currentAnime.episodes.length) {
    selectEpisode(state.currentAnime.episodes[0], { preserveSource: true, forceReload: true }).catch(console.error);
    return;
  }

  destroyPlayer();
  stopExternalPlayer();
  els.qualitySwitch.innerHTML = "";
  els.playerTitle.textContent = "Серии отсутствуют";
  els.playerNote.textContent = "Для этого релиза пока нет опубликованных эпизодов.";
}

async function openRelease(alias, options = {}) {
  if (!alias) return null;

  const updateHistory = options.updateHistory !== false && options.updateHash !== false;
  const sameReleaseOpen =
    state.currentAnime?.alias === alias && els.drawer?.classList.contains("is-open") && !options.forceReload;
  if (sameReleaseOpen) {
    if (updateHistory) {
      navigateTo(getAnimePath(alias));
    }
    return state.currentAnime;
  }

  if (state.releaseOpenAlias === alias && state.releaseOpenPromise && !options.forceReload) {
    return state.releaseOpenPromise;
  }

  state.releaseOpenAlias = alias;
  state.releaseOpenPromise = (async () => {
    const preview = findCachedReleaseByAlias(alias);
    if (preview && !els.drawer?.classList.contains("is-open")) {
      state.currentAnime = preview;
      state.currentEpisode = null;
      state.currentQuality = "auto";
      state.currentSource = "anilibria";
      state.playerSelectionToken = "";
      renderDetails(preview, { deferHeavy: true });
      openDrawer();
      if (updateHistory) {
        navigateTo(getAnimePath(alias));
      }
    }

    const payload = await fetchJson(`/anime/releases/${encodeURIComponent(alias)}`, null, { ttl: DETAIL_TTL });
    const release = buildRelease(payload);

    state.currentAnime = release;
    state.currentEpisode = null;
    state.currentQuality = "auto";
    state.currentSource = "anilibria";
    state.playerSelectionToken = "";

    renderDetails(release, { deferHeavy: true });
    openDrawer();

    if (updateHistory) {
      navigateTo(getAnimePath(alias));
    }

    window.dispatchEvent(new CustomEvent("animecloud:release-opened", { detail: { release } }));

    if (release.episodes.length) {
      await afterNextPaint();
      if (state.currentAnime?.alias === release.alias) {
        selectEpisode(release.episodes[0]).catch(console.error);
      }
      return release;
    }

    if (release.externalPlayer) {
      await afterNextPaint();
      if (state.currentAnime?.alias === release.alias) {
        switchSource("external");
      }
      return release;
    }

    destroyPlayer();
    stopExternalPlayer();
    els.qualitySwitch.innerHTML = "";
    els.playerTitle.textContent = "Серии отсутствуют";
    els.playerNote.textContent = "Для этого релиза пока нет опубликованных эпизодов.";
    return release;
  })().finally(() => {
    if (state.releaseOpenAlias === alias) {
      state.releaseOpenAlias = "";
      state.releaseOpenPromise = null;
    }
  });

  return state.releaseOpenPromise;
}

function pickRandomRelease() {
  const pool = uniqueReleases([state.featured, ...state.latest, ...state.recommended, ...state.popular].filter(Boolean));
  if (!pool.length) return;
  const release = pool[Math.floor(Math.random() * pool.length)];
  openRelease(release.alias).catch(console.error);
}

async function refreshAll() {
  responseCache.clear();
  requestCache.clear();
  manifestCache.clear();
  state.homeLoaded = false;
  state.catalogLoaded = false;
  state.ongoingLoaded = false;
  state.topLoaded = false;
  state.scheduleLoaded = false;
  state.referencesLoaded = false;
  state.genreOptions = [];
  state.catalogGenres = [];
  if (state.heroCarouselTimer) {
    clearInterval(state.heroCarouselTimer);
    state.heroCarouselTimer = null;
  }
  if (state.searchAbort) {
    state.searchAbort.abort();
    state.searchAbort = null;
  }

  try {
    await loadReferences(true);
    await loadHome(true);
    await ensureViewLoaded(state.currentView);
  } catch (error) {
    console.error("refreshAll failed", error);
  }
}

async function clearSiteRuntimeCaches() {
  responseCache.clear();
  requestCache.clear();
  manifestCache.clear();
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  async function registerLatestWorker() {
    try {
      await navigator.serviceWorker.register("/sw.js?v=38", { updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      if (registration.periodicSync) {
        try {
          const permission = await navigator.permissions.query({ name: "periodic-background-sync" }).catch(() => null);
          if (!permission || permission.state === "granted") {
            await registration.periodicSync.register("animecloud-schedule-refresh", {
              minInterval: 6 * 60 * 60 * 1000
            });
          }
        } catch {}
      }
    } catch {}
  }

  window.addEventListener(
    "load",
    () => {
      registerLatestWorker().catch(console.error);
    },
    { once: true }
  );
}

function bindViewButtons(buttons) {
  buttons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setView(button.dataset.view);
    });
  });
}

function handleRoute() {
  releaseViewportLocks();
  const route = routeFromLocation();

  if (route.legacy) {
    if (route.type === "anime" && route.alias) {
      navigateTo(getAnimePath(route.alias), { replace: true });
    } else {
      navigateTo(getViewPath(route.view || "home"), { replace: true });
    }
  }

  if (route.type === "anime" && route.alias) {
    openRelease(route.alias, { updateHistory: false }).catch(console.error);
    return;
  }

  if (els.drawer.classList.contains("is-open")) {
    closeDrawer({ updateHistory: false });
  }

  const nextView = route.view || "home";
  const known = els.panels.some((panel) => panel.dataset.viewPanel === nextView);
  setView(known ? nextView : "home", { updateHistory: false });
}

function handleShareClick() {
  if (!state.currentAnime) return;
  const button = els.detailShareBtn;
  const url = `${location.origin}${getAnimePath(state.currentAnime.alias)}`;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      button.textContent = "Ссылка скопирована";
    })
    .catch(() => {
      button.textContent = "Не удалось скопировать";
    })
    .finally(() => {
      setTimeout(() => {
        button.textContent = "Скопировать ссылку";
      }, 1400);
    });
}

function bindListButtons() {
  [
    [els.listWatchBtn, "watching"],
    [els.listPlanBtn, "planned"],
    [els.listCompleteBtn, "completed"],
    [els.listPauseBtn, "paused"]
  ].forEach(([button, listKey]) => {
    if (!button) return;
    button.addEventListener("click", () => {
      if (!state.currentAnime) return;
      const active = currentListForAlias(state.currentAnime.alias) === listKey;
      setReleaseList(state.currentAnime, active ? "" : listKey);
    });
  });
}

function bindNavigationDelegates() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (link.id === "brand-btn") {
      event.preventDefault();
      setView("home");
      return;
    }

    if (link.classList.contains("seo-footer__link")) {
      const view = href.replace(/^\/+/, "") || "home";
      event.preventDefault();
      setView(view === "home" ? "home" : view);
      return;
    }

    if (href.startsWith("/anime/")) {
      event.preventDefault();
      openRelease(decodeURIComponent(href.slice(7))).catch(console.error);
    }
  });

  window.addEventListener("popstate", handleRoute);
  window.addEventListener("hashchange", handleRoute);
}

function bindEvents() {
  bindViewButtons(els.tabs);
  bindViewButtons(els.mobileTabs);
  bindNavigationDelegates();
  bindListButtons();

  els.brandBtn?.addEventListener("click", () => setView("home"));
  els.refreshBtn?.addEventListener("click", () => refreshAll().catch(console.error));
  els.heroOpenBtn?.addEventListener("click", () => state.featured && openRelease(state.featured.alias).catch(console.error));
  els.heroRandomBtn?.addEventListener("click", pickRandomRelease);
  els.installBtn?.addEventListener("click", () => {
    handleInstallClick().catch(console.error);
  });
  els.catalogMoreBtn?.addEventListener("click", () => loadCatalog({ reset: false }).catch(console.error));
  els.ongoingMoreBtn?.addEventListener("click", () => loadOngoing({ reset: false }).catch(console.error));
  els.topMoreBtn?.addEventListener("click", () => loadTop({ reset: false }).catch(console.error));

  els.catalogSort?.addEventListener("change", () => {
    state.catalogSort = els.catalogSort.value;
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch(console.error);
  });
  els.catalogType?.addEventListener("change", () => {
    state.catalogType = els.catalogType.value;
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch(console.error);
  });
  els.catalogGenre?.addEventListener("change", () => {
    state.catalogGenre = els.catalogGenre.value;
    refreshCatalogView();
  });

  els.searchInput?.addEventListener("input", (event) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      runSearch(event.target.value).catch(console.error);
    }, SEARCH_DEBOUNCE);
  });

  els.drawerClose?.addEventListener("click", () => closeDrawer());
  els.drawerBackdrop?.addEventListener("click", () => closeDrawer());
  els.detailFavoriteBtn?.addEventListener("click", () => {
    if (state.currentAnime) toggleFavorite(state.currentAnime);
  });
  els.detailShareBtn?.addEventListener("click", handleShareClick);
  els.detailAdminPinBtn?.addEventListener("click", () => {
    if (!state.currentAnime || !isAdminUser()) return;
    writeAdminHeroAlias(state.currentAnime.alias);
    state.featured = state.currentAnime;
    state.heroPool = uniqueReleases([state.currentAnime, ...state.heroPool]).slice(0, 4);
    state.heroCarouselIndex = 0;
    renderHero(state.currentAnime);
    startHeroCarousel();
    els.detailAdminPinBtn.textContent = "Главный баннер выбран";
  });

  els.adminRefreshBtn?.addEventListener("click", () => refreshAll().catch(console.error));
  els.adminClearCacheBtn?.addEventListener("click", async () => {
    await clearSiteRuntimeCaches();
    window.dispatchEvent(new CustomEvent("animecloud:admin-cache-cleared"));
    await refreshAll().catch(console.error);
  });
  els.adminClearCommentsBtn?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("animecloud:admin-clear-comments"));
  });
  els.adminClearProgressBtn?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("animecloud:admin-clear-progress"));
  });

  window.addEventListener("animecloud:release-opened", (event) => {
    const release = event.detail?.release;
    if (release?.alias) updateReleaseSeo(release);
  });

  window.addEventListener("animecloud:auth", (event) => {
    state.authUser = event.detail?.user || null;
    loadFavorites();
    renderProfile();
    renderFavoriteButton();
    if (state.authUser?.localId && event.detail?.ready) {
      hydrateCloudSessionData(state.authUser).catch(console.error);
    } else {
      renderContinueWatchingSections();
    }
    if (state.currentAnime) {
      renderDetails(state.currentAnime, { deferHeavy: false });
    }
  });

  window.addEventListener("animecloud:profile-request", () => setView("profile"));
  window.addEventListener("animecloud:progress-updated", () => {
    renderContinueWatchingSections();
    if (state.currentAnime) {
      decorateEpisodeProgress(state.currentAnime);
    }
    if (state.currentView === "profile") {
      renderProfile();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    syncInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    state.installPromptEvent = null;
    syncInstallButton();
  });

  els.player?.addEventListener("loadedmetadata", syncPlayerReadyState);
  els.player?.addEventListener("loadeddata", syncPlayerReadyState);
  els.player?.addEventListener("canplay", syncPlayerReadyState);
  els.player?.addEventListener("playing", syncPlayerReadyState);
  els.player?.addEventListener("waiting", () => {
    if (state.currentSource === "anilibria" && !els.player.hidden && els.player.readyState < 2) {
      els.playerNote.textContent = "Буферизуем поток…";
    }
  });
  els.player?.addEventListener("error", () => {
    clearPlayerStartupTimer();
    if (state.currentSource === "anilibria") {
      els.playerNote.textContent = "Не удалось воспроизвести видео. Попробуйте 480p или другую серию.";
    }
  });
}

async function init() {
  relocateInjectedControls();
  bindEvents();
  registerServiceWorker();
  releaseViewportLocks();

  try {
    state.authUser = typeof window.getAuthUser === "function" ? window.getAuthUser() : null;
  } catch {
    state.authUser = null;
  }

  loadFavorites();
  renderProfile();
  renderFavoriteButton();
  renderSearchEmpty();
  syncInstallButton();

  try {
    const initialRoute = routeFromLocation();
    const initialView = initialRoute.type === "view" ? initialRoute.view || "home" : "home";
    const shouldLoadHomeNow = initialRoute.type === "anime" || initialView === "home";

    if (shouldLoadHomeNow) {
      await loadHome();
      updateStats();
    }

    handleRoute();

    safeIdle(() => {
      if (!shouldLoadHomeNow) {
        loadHome()
          .then(() => updateStats())
          .catch(() => {});
      }
      if (!state.scheduleLoaded && initialView !== "schedule") {
        loadSchedule().catch(() => {});
      }
      if (!state.topLoaded && initialView !== "top") {
        loadTop({ reset: true }).catch(() => {});
      }
    });
  } catch (error) {
    console.error(error);
    updateGrid(els.latestGrid, [], "Не удалось загрузить домашнюю страницу.");
    updateGrid(els.recommendedGrid, [], "Не удалось загрузить домашнюю страницу.");
    updateGrid(els.popularGrid, [], "Не удалось загрузить домашнюю страницу.");
  }
}

queueMicrotask(() => init().catch(console.error));
