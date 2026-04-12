const API_BASE = "/api/anilibria";
const MEDIA_PROXY_BASE = "/api/anilibria-stream";
const IMAGE_PROXY_BASE = "/api/anilibria-image";
const KODIK_API_BASE = "/api/kodik";
const APP_CONSTANTS = window.ANIMECLOUD_CONSTANTS || {};
const STORAGE_KEYS = APP_CONSTANTS.STORAGE_KEYS || {};
const SITE_URL =
  APP_CONSTANTS.SITE_URL ||
  (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://example.invalid");

const DEFAULT_SEO_TITLE = "AnimeCloud - аниме из базы Kodik";
const DEFAULT_SEO_DESCRIPTION =
  "AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером.";
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
    description: "Поиск аниме по названию, формату и жанрам в каталоге AnimeCloud.",
    robots: "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
  },
  profile: {
    title: "Профиль зрителя - AnimeCloud",
    description: "Профиль, списки, комментарии и история просмотра в AnimeCloud.",
    robots: "noindex,nofollow,noarchive"
  }
};

const CACHE_TTL = 120000;
const DETAIL_TTL = 300000;
const API_RETRY_ATTEMPTS = 3;
const API_RETRY_BASE_DELAY = 350;
const API_TIMEOUT_MS = 10000;
const GRID_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE = 260;
const RENDER_BATCH_SIZE = 8;
const CONTENT_STATS_TTL = 12 * 60 * 60 * 1000;
const FAVORITES_STORAGE_PREFIX = STORAGE_KEYS.favoritesPrefix || "animecloud_favorites";
const WATCH_PROGRESS_KEY = STORAGE_KEYS.progress || "animecloud_watch_progress_v1";
const ADMIN_HERO_STORAGE_KEY = STORAGE_KEYS.adminHero || "animecloud_admin_featured_alias";
const FAVORITE_LIST_KEYS = ["watching", "planned", "completed", "paused"];
const KODIK_SORTING_OPTIONS = [
  { value: "FRESH_AT_DESC", label: "Обновлены недавно" },
  { value: "FRESH_AT_ASC", label: "Обновлены давно" },
  { value: "RATING_DESC", label: "Самый высокий рейтинг" },
  { value: "RATING_ASC", label: "Самый низкий рейтинг" },
  { value: "YEAR_DESC", label: "Самые новые" },
  { value: "YEAR_ASC", label: "Самые старые" }
];
const KODIK_TYPE_OPTIONS = [
  { value: "TV", description: "TV сериал" },
  { value: "ONA", description: "ONA" },
  { value: "WEB", description: "WEB" },
  { value: "OVA", description: "OVA" },
  { value: "OAD", description: "OAD" },
  { value: "MOVIE", description: "Фильм" },
  { value: "SPECIAL", description: "Спешл" }
];

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
  voiceOptions: [],
  catalogFilterKey: "",
  catalogFilterPool: [],
  favorites: [],
  authUser: null,
  featured: null,
  searchTimer: null,
  searchAbort: null,
  searchQuery: "",
  latestTotal: 0,
  catalogMergedTotal: 0,
  catalogPage: 0,
  catalogTotal: 0,
  catalogTotalPages: 0,
  catalogHasMore: false,
  catalogSort: "FRESH_AT_DESC",
  catalogType: "",
  catalogGenre: "",
  catalogGenres: [],
  catalogVoice: "",
  ongoingMergedTotal: 0,
  ongoingPage: 0,
  ongoingTotal: 0,
  ongoingTotalPages: 0,
  ongoingHasMore: false,
  topMergedTotal: 0,
  topPage: 0,
  topTotal: 0,
  topTotalPages: 0,
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
  currentSource: "kodik",
  manifestBlobUrl: null,
  hls: null,
  hlsLoaderPromise: null,
  infiniteObserver: null,
  heroPool: [],
  heroCarouselIndex: 0,
  heroCarouselTimer: null,
  personalizedRecommendations: [],
  personalizedGenres: [],
  personalizedKey: "",
  personalizedPromise: null,
  detailRenderToken: "",
  releaseOpenAlias: "",
  releaseOpenPromise: null,
  playerSelectionToken: "",
  hlsRecoveryTried: false,
  playerStartupTimer: null,
  installPromptEvent: null,
  progressUiFrame: 0,
  shareFeedbackTimer: 0
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
  catalogVoice: document.getElementById("catalog-voice"),
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

function ensureDynamicInterface() {
  const catalogActions = document.querySelector('[data-view-panel="catalog"] .section-actions');
  if (catalogActions && !document.getElementById("catalog-voice")) {
    const label = document.createElement("label");
    label.className = "select-control";
    label.innerHTML =
      '<span>Озвучка</span><select id="catalog-voice"><option value="">Все озвучки</option></select>';
    catalogActions.appendChild(label);
  }

  const profileProgressGrid = document.getElementById("profile-progress-grid");
  if (profileProgressGrid && !document.getElementById("profile-recommendations-shell")) {
    const shelf = document.createElement("section");
    shelf.className = "profile-shelf profile-shelf--recommendations";
    shelf.id = "profile-recommendations-shell";
    shelf.innerHTML = `
      <div class="section-head section-head--compact">
        <div>
          <div class="section-kicker">Персонально</div>
          <h3>Подборка для вас</h3>
          <p class="section-summary" id="profile-recommendations-summary">
            Анализируем ваши жанры и историю просмотра…
          </p>
        </div>
        <button class="ghost-btn profile-recommendations__refresh" type="button" id="profile-recommendations-refresh-btn">
          Обновить подборку
        </button>
      </div>
      <div class="anime-grid" id="profile-recommendations-grid"></div>
    `;
    profileProgressGrid.insertAdjacentElement("afterend", shelf);
  }

  els.catalogVoice = document.getElementById("catalog-voice");
  els.profileRecommendationsShell = document.getElementById("profile-recommendations-shell");
  els.profileRecommendationsGrid = document.getElementById("profile-recommendations-grid");
  els.profileRecommendationsSummary = document.getElementById("profile-recommendations-summary");
  els.profileRecommendationsRefreshBtn = document.getElementById("profile-recommendations-refresh-btn");
}

ensureDynamicInterface();

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value || 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uniqueStrings = (values = []) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
const GENRE_LABEL_ALIASES = new Map([
  ["сенен", "Сёнен"],
  ["сёнен", "Сёнен"],
  ["седзе", "Сёдзё"],
  ["сёдзё", "Сёдзё"],
  ["сенен ай", "Сёнен-ай"],
  ["сёнен ай", "Сёнен-ай"],
  ["седзе ай", "Сёдзё-ай"],
  ["сёдзё ай", "Сёдзё-ай"],
  ["сэйнэн", "Сэйнэн"],
  ["сейнен", "Сэйнэн"],
  ["сеинен", "Сэйнэн"],
  ["дзесей", "Дзёсэй"],
  ["дзёсэй", "Дзёсэй"],
  ["джосей", "Дзёсэй"],
  ["экшн", "Экшен"],
  ["action", "Экшен"],
  ["adventure", "Приключения"],
  ["comedy", "Комедия"],
  ["drama", "Драма"],
  ["fantasy", "Фэнтези"],
  ["romance", "Романтика"],
  ["исекай", "Исэкай"],
  ["исэкай", "Исэкай"],
  ["isekai", "Исэкай"],
  ["cgdct", "Милые девочки"],
  ["cute girls doing cute things", "Милые девочки"],
  ["science fiction", "Фантастика"],
  ["sci fi", "Фантастика"],
  ["slice of life", "Повседневность"],
  ["sports", "Спорт"],
  ["supernatural", "Сверхъестественное"],
  ["thriller", "Триллер"]
]);

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
  if (!path) return "/mc-icon-512.png?v=5";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("//")) return `https:${path}`;
  if (path.startsWith("/")) return path;
  return path;
}

function proxiedImageUrl(path) {
  const absolute = absoluteUrl(path);
  if (!absolute || absolute.startsWith("/")) return absolute;
  try {
    const url = new URL(absolute, window.location.origin);
    if (url.origin === window.location.origin) return url.toString();
    if (
      !(
        /(^|\.)anilibria\.top$/i.test(url.hostname) ||
        /(^|\.)libria\.fun$/i.test(url.hostname) ||
        /(^|\.)kp\.yandex\.net$/i.test(url.hostname) ||
        /(^|\.)kodik\.biz$/i.test(url.hostname) ||
        /(^|\.)kodik\.info$/i.test(url.hostname) ||
        /(^|\.)kodikres\.com$/i.test(url.hostname) ||
        /(^|\.)shikimori\.io$/i.test(url.hostname) ||
        /(^|\.)shikimori\.one$/i.test(url.hostname) ||
        /(^|\.)shikimori\.me$/i.test(url.hostname) ||
        /(^|\.)shikimori\.org$/i.test(url.hostname)
      )
    ) {
      return absolute;
    }
    return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return absolute;
  }
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
  const url = new URL(path, window.location.origin);
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
  const query = new URLSearchParams(location.search).get("q")?.trim() || "";
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

  const rawHash = (location.hash || "").replace(/^#/, "");
  if (rawHash.startsWith("anime/")) {
    return { type: "anime", alias: decodeURIComponent(rawHash.slice(6)), legacy: true };
  }
  if (rawHash) {
    return { type: "view", view: rawHash, legacy: true, query: "" };
  }
  return { type: "view", view: "home", legacy: false, query: "" };
}

function navigateTo(path, options = {}) {
  const nextPath = normalizePath(path);
  const nextUrl = new URL(nextPath, location.origin);
  const search = String(options.search || "").replace(/^\?/, "").trim();
  nextUrl.search = search ? `?${search}` : "";
  const currentUrl = `${normalizePath(location.pathname)}${location.search}`;
  const nextUrlValue = `${nextUrl.pathname}${nextUrl.search}`;
  if (currentUrl === nextUrlValue) return;
  const method = options.replace ? "replaceState" : "pushState";
  history[method]({}, "", nextUrlValue);
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
        description: DEFAULT_SEO_DESCRIPTION,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl("/search")}?q={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        }
      },
      page
    ]
  });
}

function buildReleaseStructuredData(release, description, path) {
  const canonical = siteUrl(path);
  const graph = [
    {
      "@type": "TVSeries",
      name: release.title,
      url: canonical,
      description,
      image: release.poster || siteUrl("/mc-icon-512.png"),
      genre: release.genres || [],
      inLanguage: "ru",
      numberOfEpisodes: release.episodesTotal || undefined,
      dateCreated: /^\d{4}$/.test(String(release.year || "")) ? String(release.year) : undefined,
      isPartOf: {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl("/")
      }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Главная",
          item: siteUrl("/")
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Каталог",
          item: siteUrl("/catalog")
        },
        {
          "@type": "ListItem",
          position: 3,
          name: release.title,
          item: canonical
        }
      ]
    }
  ];

  if (release.externalPlayer || (Array.isArray(release.sourceItems) && release.sourceItems.length)) {
    graph.push({
      "@type": "VideoObject",
      name: `${release.title} — смотреть онлайн`,
      description,
      thumbnailUrl: [release.poster || siteUrl("/mc-icon-512.png")],
      embedUrl: release.externalPlayer || undefined,
      uploadDate: /^\d{4}$/.test(String(release.year || "")) ? `${String(release.year)}-01-01T00:00:00Z` : undefined,
      isFamilyFriendly: !/\b(18\+|r|nc-17)\b/i.test(String(release.age || "")),
      potentialAction: {
        "@type": "WatchAction",
        target: canonical
      }
    });
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl("/"),
        inLanguage: "ru",
        description: DEFAULT_SEO_DESCRIPTION,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl("/search")}?q={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        }
      },
      ...graph
    ]
  });
}

function createFetchSignal(timeoutMs = API_TIMEOUT_MS, externalSignal = null) {
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

function applySeo({ title, description, path, image, type = "website", structuredData, robots }) {
  const canonical = siteUrl(path || "/");
  document.title = title || DEFAULT_SEO_TITLE;
  if (els.metaDescription) els.metaDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.metaRobots) {
    els.metaRobots.content =
      robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  }
  if (els.canonicalLink) els.canonicalLink.href = canonical;
  if (els.ogType) els.ogType.content = type;
  if (els.ogTitle) els.ogTitle.content = title || DEFAULT_SEO_TITLE;
  if (els.ogDescription) els.ogDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.ogUrl) els.ogUrl.content = canonical;
  if (els.ogImage) els.ogImage.content = image || siteUrl("/mc-icon-512.png?v=5");
  if (els.twitterTitle) els.twitterTitle.content = title || DEFAULT_SEO_TITLE;
  if (els.twitterDescription) els.twitterDescription.content = description || DEFAULT_SEO_DESCRIPTION;
  if (els.twitterImage) els.twitterImage.content = image || siteUrl("/mc-icon-512.png?v=5");
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
    robots: seo.robots,
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
    image: release.poster || siteUrl("/mc-icon-512.png"),
    type: "video.other",
    structuredData: buildReleaseStructuredData(release, description, path)
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
      const { signal, cleanup } = createFetchSignal(options.timeout ?? API_TIMEOUT_MS, options.signal);
      try {
        const response = await fetch(url, { cache: "no-store", signal });
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
  proxiedImageUrl(
    poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const cardPosterSource = (poster) =>
  proxiedImageUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const cardPosterDirectSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const heroPosterSource = (poster) =>
  proxiedImageUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail ||
      poster?.optimized?.src ||
      poster?.src
  );
const thumbSource = (poster) =>
  proxiedImageUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const heroPosterDirectSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );
const thumbDirectSource = (poster) =>
  absoluteUrl(
    poster?.optimized?.preview ||
      poster?.preview ||
      poster?.optimized?.src ||
      poster?.src ||
      poster?.optimized?.thumbnail ||
      poster?.thumbnail
  );

function normalizePreparedEpisode(episode, fallbackSourceId = "") {
  const ordinal = Number(episode?.ordinal || 0);
  const seasonOrdinal = Number(episode?.seasonOrdinal || 0);

  return {
    ...episode,
    id: episode?.id || `${fallbackSourceId || "episode"}:${seasonOrdinal || 0}:${ordinal || 0}`,
    ordinal,
    seasonOrdinal,
    name: episode?.name || (ordinal ? `${ordinal} серия` : "Фильм"),
    duration: Number(episode?.duration || 0),
    externalUrl: episode?.externalUrl ? normalizeExternalPlayer(episode.externalUrl) : "",
    previewUrl: episode?.previewUrl ? absoluteUrl(episode.previewUrl) : "",
    provider: episode?.provider || "external",
    sourceId: episode?.sourceId || fallbackSourceId
  };
}

function normalizePreparedSource(source) {
  const sourceId =
    source?.id ||
    `source-${String(source?.translationId || source?.title || source?.provider || "default")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`;
  const episodes = Array.isArray(source?.episodes)
    ? source.episodes.map((episode) => normalizePreparedEpisode(episode, sourceId))
    : [];

  return {
    id: sourceId,
    provider: String(source?.provider || "external"),
    kind: String(source?.kind || (episodes.length ? "iframe-episodes" : "iframe")),
    title: String(source?.title || "Источник"),
    note: String(source?.note || ""),
    voices: uniqueStrings(Array.isArray(source?.voices) ? source.voices : []),
    translationId: String(source?.translationId || ""),
    externalUrl: source?.externalUrl ? normalizeExternalPlayer(source.externalUrl) : "",
    episodes
  };
}

function normalizePreparedRelease(item) {
  const posterSources = uniqueStrings([
    ...(Array.isArray(item?.posterSources) ? item.posterSources : []),
    item?.posterDirect,
    item?.poster,
    item?.heroPoster,
    item?.cardPoster,
    item?.thumb
  ]
    .map(absoluteUrl)
    .filter(Boolean));
  const posterDirect = posterSources[0] || "";
  const heroPosterDirect = absoluteUrl(item?.heroPosterDirect || item?.heroPoster || posterDirect);
  const cardPosterDirect = absoluteUrl(item?.cardPosterDirect || item?.cardPoster || posterDirect);
  const thumbDirect = absoluteUrl(item?.thumbDirect || item?.thumb || cardPosterDirect);
  const sourceItems = Array.isArray(item?.sourceItems) ? item.sourceItems.map(normalizePreparedSource) : [];
  const fallbackSource = sourceItems[0] || null;
  const episodes = Array.isArray(item?.episodes) && item.episodes.length
    ? item.episodes.map((episode) => normalizePreparedEpisode(episode, fallbackSource?.id || ""))
    : fallbackSource?.episodes || [];
  const externalPlayer = normalizeExternalPlayer(
    item?.externalPlayer || sourceItems.find((source) => source.externalUrl)?.externalUrl || ""
  );

  return {
    provider: String(item?.provider || "kodik"),
    providerSet: uniqueStrings(Array.isArray(item?.providerSet) ? item.providerSet : [item?.provider || "kodik"]),
    id: item?.id || item?.alias,
    alias: item?.alias || "",
    title: item?.title || "Без названия",
    originalTitle: item?.originalTitle || "",
    alternateTitles: uniqueStrings([
      item?.title,
      item?.originalTitle,
      ...(Array.isArray(item?.alternateTitles) ? item.alternateTitles : [])
    ]),
    year: item?.year || "-",
    type: item?.type || "Не указано",
    typeValue: item?.typeValue || "",
    season: item?.season || "",
    age: item?.age || "-",
    ageValue: item?.ageValue || "",
    ongoing: Boolean(item?.ongoing),
    statusLabel: item?.statusLabel || "Доступно",
    publishDay: item?.publishDay || "",
    publishDayValue: Number(item?.publishDayValue || 0),
    sortFreshAt: Number(item?.sortFreshAt || 0),
    sortRating: Number(item?.sortRating || item?.favorites || 0),
    description: item?.description || "Описание пока не заполнено.",
    posterSources,
    posterCandidateQueue: uniqueStrings(posterSources.map((url) => proxiedImageUrl(url)).filter(Boolean)),
    posterDirectQueue: posterSources,
    poster: proxiedImageUrl(posterDirect),
    posterDirect,
    heroPoster: proxiedImageUrl(heroPosterDirect),
    heroPosterDirect,
    cardPoster: proxiedImageUrl(cardPosterDirect),
    cardPosterDirect,
    thumb: proxiedImageUrl(thumbDirect),
    thumbDirect,
    genres: normalizeGenreList(Array.isArray(item?.genres) ? item.genres : []),
    episodesTotal: Number(item?.episodesTotal || episodes.length || 0),
    averageDuration: Number(item?.averageDuration || 0),
    favorites: Number(item?.favorites || 0),
    externalPlayer,
    voices: uniqueStrings([
      ...(Array.isArray(item?.voices) ? item.voices : []),
      ...sourceItems.flatMap((source) => source.voices || [])
    ]),
    crew: Array.isArray(item?.crew)
      ? item.crew
          .map((member) => ({
            name: String(member?.name || "").trim(),
            role: String(member?.role || "Команда").trim()
          }))
          .filter((member) => member.name)
      : [],
    episodes,
    publishedEpisode: item?.publishedEpisode
      ? {
          ordinal: Number(item.publishedEpisode.ordinal || 0),
          name: item.publishedEpisode.name || "Без названия",
          duration: Number(item.publishedEpisode.duration || 0)
        }
      : null,
    nextEpisodeNumber: item?.nextEpisodeNumber || null,
    identifiers: {
      shikimoriId: String(item?.identifiers?.shikimoriId || ""),
      kinopoiskId: String(item?.identifiers?.kinopoiskId || ""),
      imdbId: String(item?.identifiers?.imdbId || ""),
      kodikId: String(item?.identifiers?.kodikId || "")
    },
    kodikIdentity: String(item?.kodikIdentity || ""),
    sourceItems
  };
}

function buildRelease(item) {
  return normalizePreparedRelease(item?.release || item || {});
}

const buildReleases = (payload) => extractList(payload).map(buildRelease);

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGenreKey(value) {
  return normalizeComparableText(value).replace(/-/g, " ");
}

function normalizeGenreLabel(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const key = normalizeGenreKey(raw);
  if (!key) return "";
  if (GENRE_LABEL_ALIASES.has(key)) return GENRE_LABEL_ALIASES.get(key);

  if (/^[a-z]/i.test(raw)) {
    return raw
      .split(" ")
      .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : ""))
      .join(" ");
  }

  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

function normalizeGenreList(values = []) {
  const map = new Map();

  values.forEach((value) => {
    const label = normalizeGenreLabel(value);
    const key = normalizeGenreKey(label);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, label);
      return;
    }

    const current = map.get(key);
    if (!current) {
      map.set(key, label);
      return;
    }

    if (!current.includes("ё") && label.includes("ё")) {
      map.set(key, label);
      return;
    }

    if (current === current.toUpperCase() && label !== label.toUpperCase()) {
      map.set(key, label);
    }
  });

  return [...map.values()];
}

function getReleaseGenreKeys(release) {
  return new Set(normalizeGenreList(Array.isArray(release?.genres) ? release.genres : []).map(normalizeGenreKey));
}

function releaseMatchesGenres(release, genres = [], mode = "every") {
  const releaseGenreKeys = getReleaseGenreKeys(release);
  const targetKeys = normalizeGenreList(Array.isArray(genres) ? genres : [genres]).map(normalizeGenreKey);
  if (!targetKeys.length) return true;
  if (!releaseGenreKeys.size) return false;
  if (mode === "some") return targetKeys.some((key) => releaseGenreKeys.has(key));
  return targetKeys.every((key) => releaseGenreKeys.has(key));
}

function findMatchingGenres(query) {
  const queryKey = normalizeGenreKey(query);
  if (!queryKey) return [];

  const matches = state.genreOptions.filter((genre) => {
    const genreKey = normalizeGenreKey(genre);
    return genreKey && (genreKey.includes(queryKey) || queryKey.includes(genreKey));
  });

  if (matches.length) return matches;
  if (GENRE_LABEL_ALIASES.has(queryKey)) return [GENRE_LABEL_ALIASES.get(queryKey)];
  return [];
}

function getReleaseYearValue(release) {
  const year = Number(release?.year || 0);
  return Number.isFinite(year) ? year : 0;
}

function getReleaseTitleVariants(release) {
  return uniqueStrings([
    release?.title,
    release?.originalTitle,
    ...(Array.isArray(release?.alternateTitles) ? release.alternateTitles : [])
  ])
    .map(normalizeComparableText)
    .filter(Boolean);
}

function normalizeVoiceLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b(hls|player|iframe|внешний плеер)\b/gi, "")
    .replace(/\bTV\b/gi, "")
    .replace(/\.+/g, ".")
    .trim();
}

function getReleaseVoiceLabels(release) {
  return uniqueStrings([
    ...(Array.isArray(release?.voices) ? release.voices : []),
    ...(Array.isArray(release?.sourceItems)
      ? release.sourceItems.flatMap((source) => [source?.title, ...(Array.isArray(source?.voices) ? source.voices : [])])
      : [])
  ])
    .map(normalizeVoiceLabel)
    .filter(Boolean)
    .filter((value) => !/^source-\w+/i.test(value));
}

function releaseMatchesVoiceFilter(release, voice) {
  const selected = normalizeComparableText(normalizeVoiceLabel(voice));
  if (!selected) return true;
  return getReleaseVoiceLabels(release)
    .map(normalizeComparableText)
    .some((label) => label === selected || label.includes(selected));
}

function getReleaseIdentityKeys(release) {
  const identifiers = release?.identifiers || {};
  return uniqueStrings([
    identifiers.shikimoriId ? `shikimori:${identifiers.shikimoriId}` : "",
    identifiers.kinopoiskId ? `kinopoisk:${identifiers.kinopoiskId}` : "",
    identifiers.imdbId ? `imdb:${identifiers.imdbId}` : "",
    identifiers.kodikId ? `kodik:${identifiers.kodikId}` : "",
    release?.kodikIdentity || ""
  ]);
}

function stripComparableReleaseDecorators(value) {
  return normalizeComparableText(value)
    .replace(/\b(tv|ona|ova|oad|movie|special|season|part)\b/g, " ")
    .replace(/\b(тв|фильм|сезон|часть|спешл|спецвыпуск)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areReleasesSame(left, right) {
  if (!left || !right) return false;

  const leftIdentity = new Set(getReleaseIdentityKeys(left));
  const rightIdentity = getReleaseIdentityKeys(right);
  if (rightIdentity.some((key) => leftIdentity.has(key))) {
    return true;
  }

  const leftTitles = getReleaseTitleVariants(left);
  const rightTitles = getReleaseTitleVariants(right);
  if (!leftTitles.length || !rightTitles.length) return false;

  const leftYear = getReleaseYearValue(left);
  const rightYear = getReleaseYearValue(right);
  if (leftYear && rightYear && Math.abs(leftYear - rightYear) > 1) {
    return false;
  }

  if (leftTitles.some((leftTitle) => rightTitles.includes(leftTitle))) {
    return true;
  }

  const leftBaseTitles = uniqueStrings(leftTitles.map(stripComparableReleaseDecorators).filter(Boolean));
  const rightBaseTitles = uniqueStrings(rightTitles.map(stripComparableReleaseDecorators).filter(Boolean));

  return leftBaseTitles.some((leftTitle) => rightBaseTitles.includes(leftTitle));
}

function mergeSourceItems(primarySources = [], extraSources = []) {
  const merged = primarySources.map((source) => normalizePreparedSource(source));

  extraSources.forEach((source) => {
    const normalized = normalizePreparedSource(source);
    const existing = merged.find((item) => item.id === normalized.id);
    if (!existing) {
      merged.push(normalized);
      return;
    }

    existing.voices = uniqueStrings([...(existing.voices || []), ...(normalized.voices || [])]);
    existing.note = existing.note || normalized.note;
    existing.externalUrl = existing.externalUrl || normalized.externalUrl;
    if (normalized.episodes?.length) {
      const existingEpisodeIds = new Set((existing.episodes || []).map((episode) => episode.id));
      existing.episodes = [
        ...(existing.episodes || []),
        ...normalized.episodes.filter((episode) => !existingEpisodeIds.has(episode.id))
      ].sort((left, right) => Number(left.ordinal || 0) - Number(right.ordinal || 0));
    }
  });

  return merged;
}

function mergeReleaseEntries(primary, extra) {
  if (!primary) return extra ? normalizePreparedRelease(extra) : null;
  if (!extra) return normalizePreparedRelease(primary);

  const base = normalizePreparedRelease(primary);
  const addon = normalizePreparedRelease(extra);
  const mergedSourceItems = mergeSourceItems(base.sourceItems, addon.sourceItems);
  const firstExternalSource = mergedSourceItems.find((source) => source.externalUrl);
  const preferredEpisodes =
    mergedSourceItems.find((source) => source.episodes?.length)?.episodes ||
    addon.episodes ||
    base.episodes;

  return normalizePreparedRelease({
    ...base,
    provider: addon.provider || base.provider,
    providerSet: uniqueStrings([...(base.providerSet || []), ...(addon.providerSet || [])]),
    originalTitle: base.originalTitle || addon.originalTitle,
    alternateTitles: uniqueStrings([...(base.alternateTitles || []), ...(addon.alternateTitles || [])]),
    description:
      base.description && base.description !== "Описание пока не заполнено."
        ? base.description
        : addon.description || base.description,
    posterSources: uniqueStrings([...(base.posterSources || []), ...(addon.posterSources || [])]),
    genres: normalizeGenreList([...(base.genres || []), ...(addon.genres || [])]),
    favorites: Math.max(Number(base.favorites || 0), Number(addon.favorites || 0)),
    sortFreshAt: Math.max(Number(base.sortFreshAt || 0), Number(addon.sortFreshAt || 0)),
    sortRating: Math.max(
      Number(base.sortRating || 0),
      Number(addon.sortRating || 0),
      Number(base.favorites || 0),
      Number(addon.favorites || 0)
    ),
    voices: uniqueStrings([...(base.voices || []), ...(addon.voices || [])]),
    crew: [...(base.crew || []), ...(addon.crew || [])].filter((member, index, list) => {
      const key = `${member.name}:${member.role}`;
      return list.findIndex((candidate) => `${candidate.name}:${candidate.role}` === key) === index;
    }),
    episodesTotal: Math.max(Number(base.episodesTotal || 0), Number(addon.episodesTotal || 0)),
    averageDuration: Number(base.averageDuration || 0) || Number(addon.averageDuration || 0),
    publishedEpisode: base.publishedEpisode || addon.publishedEpisode,
    nextEpisodeNumber: base.nextEpisodeNumber || addon.nextEpisodeNumber,
    externalPlayer: firstExternalSource?.externalUrl || base.externalPlayer || addon.externalPlayer,
    identifiers: {
      shikimoriId: base.identifiers?.shikimoriId || addon.identifiers?.shikimoriId || "",
      kinopoiskId: base.identifiers?.kinopoiskId || addon.identifiers?.kinopoiskId || "",
      imdbId: base.identifiers?.imdbId || addon.identifiers?.imdbId || "",
      kodikId: base.identifiers?.kodikId || addon.identifiers?.kodikId || ""
    },
    kodikIdentity: base.kodikIdentity || addon.kodikIdentity || "",
    sourceItems: mergedSourceItems,
    episodes: preferredEpisodes
  });
}

function mergeReleaseCollections(primaryList = [], extraList = []) {
  const merged = primaryList.map((release) => normalizePreparedRelease(release));

  extraList.forEach((candidate) => {
    const normalized = normalizePreparedRelease(candidate);
    const existingIndex = merged.findIndex((release) => areReleasesSame(release, normalized));
    if (existingIndex === -1) {
      merged.push(normalized);
      return;
    }

    merged[existingIndex] = mergeReleaseEntries(merged[existingIndex], normalized);
  });

  return uniqueReleases(merged);
}

function getCatalogSortConfig(value) {
  const sorting = String(value || "").toUpperCase();
  const direction = sorting.includes("ASC") ? "asc" : "desc";
  if (sorting.includes("RATING")) return { field: "rating", direction };
  if (sorting.includes("YEAR")) return { field: "year", direction };
  if (sorting.includes("NAME")) return { field: "title", direction };
  return { field: "fresh", direction };
}

function getKodikSortConfig(value) {
  const { field, direction } = getCatalogSortConfig(value);
  if (field === "rating") return { sort: "shikimori_rating", order: direction };
  if (field === "year") return { sort: "year", order: direction };
  if (field === "title") return { sort: "title", order: direction };
  return { sort: "updated_at", order: direction };
}

function compareCatalogReleases(left, right, sorting = state.catalogSort) {
  const { field, direction } = getCatalogSortConfig(sorting);
  const multiplier = direction === "asc" ? 1 : -1;
  const leftTitle = String(left?.title || "").trim();
  const rightTitle = String(right?.title || "").trim();

  if (field === "title") {
    return multiplier * leftTitle.localeCompare(rightTitle, "ru");
  }

  const readNumericValue = (release) => {
    if (field === "rating") return Number(release?.sortRating || release?.favorites || 0);
    if (field === "year") return getReleaseYearValue(release);
    return Number(release?.sortFreshAt || 0) || getReleaseYearValue(release);
  };

  const diff = readNumericValue(left) - readNumericValue(right);
  if (diff !== 0) return multiplier * diff;

  const secondaryYearDiff = getReleaseYearValue(left) - getReleaseYearValue(right);
  if (secondaryYearDiff !== 0) return multiplier * secondaryYearDiff;

  return leftTitle.localeCompare(rightTitle, "ru");
}

function sortCatalogReleases(list, sorting = state.catalogSort) {
  return [...(Array.isArray(list) ? list : [])].sort((left, right) => compareCatalogReleases(left, right, sorting));
}

function fetchKodikDiscover(mode, page, limit, options = {}) {
  const genres = Array.isArray(options.genres) ? options.genres : [options.genres].filter(Boolean);
  const animeKinds = Array.isArray(options.animeKinds) ? options.animeKinds : [options.animeKinds].filter(Boolean);
  const mediaTypes = Array.isArray(options.mediaTypes) ? options.mediaTypes : [options.mediaTypes].filter(Boolean);
  return fetchJson(
    KODIK_API_BASE,
    {
      action: "discover",
      mode,
      page,
      limit,
      sort: options.sort || "",
      order: options.order || "",
      genres: normalizeGenreList(genres).join("||"),
      animeKinds: uniqueStrings(animeKinds).join("||"),
      mediaTypes: uniqueStrings(mediaTypes).join("||")
    },
    {
      ttl: options.ttl ?? 120000,
      retries: options.retries || 2,
      signal: options.signal
    }
  ).then((payload) => {
    if (payload?.unavailable) {
      const error = new Error(String(payload.message || payload.error || "Kodik temporarily unavailable"));
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function fetchKodikSearch(query, options = {}) {
  return fetchJson(
    KODIK_API_BASE,
    {
      action: "search",
      query,
      limit: options.limit || 36
    },
    {
      ttl: options.ttl ?? 60000,
      retries: options.retries || 2,
      signal: options.signal
    }
  ).then((payload) => {
    if (payload?.unavailable) {
      const error = new Error(String(payload.message || payload.error || "Kodik temporarily unavailable"));
      error.payload = payload;
      throw error;
    }
    return payload;
  });
}

function getKodikUnavailableMessage(error, fallbackMessage) {
  const raw = String(error?.payload?.message || error?.message || "").toLowerCase();
  if (raw.includes("неверный токен") || raw.includes("отсутствует или неверный токен") || raw.includes("invalid token") || raw.includes("missing token")) {
    return "Kodik временно недоступен: проверьте KODIK_TOKEN в Vercel.";
  }
  return fallbackMessage;
}

function buildKodikReleaseParams(release) {
  if (!release) return null;
  const guessedMeta = release.alias ? guessKodikMetaFromAlias(release.alias) : null;

  const params = {
    action: "release",
    title: release.title || guessedMeta?.title || "",
    originalTitle: release.originalTitle || "",
    year: release.year || guessedMeta?.year || ""
  };

  if (release.kodikIdentity) {
    params.identity = release.kodikIdentity;
  } else if (release.identifiers?.shikimoriId) {
    params.identity = `shikimori:${release.identifiers.shikimoriId}`;
  } else if (release.identifiers?.kinopoiskId) {
    params.identity = `kinopoisk:${release.identifiers.kinopoiskId}`;
  } else if (release.identifiers?.imdbId) {
    params.identity = `imdb:${release.identifiers.imdbId}`;
  } else if (release.alias) {
    params.identity = guessKodikIdentityFromAlias(release.alias);
  }

  const alternateTitles = uniqueStrings([
    ...(Array.isArray(release.alternateTitles) ? release.alternateTitles : []),
    ...(Array.isArray(guessedMeta?.alternateTitles) ? guessedMeta.alternateTitles : [])
  ]);
  if (alternateTitles.length) {
    params.alternateTitles = alternateTitles.join("||");
  }

  return params;
}

function guessKodikMetaFromAlias(alias) {
  const value = String(alias || "");
  if (!value.startsWith("kodik-")) return null;
  const body = value.slice(6);

  if (body.startsWith("title-")) {
    const slug = body.slice(6).trim();
    if (!slug) return null;

    let year = "";
    let titleSlug = slug;
    const yearMatch = slug.match(/-(19|20)\d{2}$/);
    if (yearMatch) {
      year = yearMatch[0].slice(1);
      titleSlug = slug.slice(0, -yearMatch[0].length);
    }

    const title = titleSlug
      .split("-")
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!title) return null;

    return {
      title,
      year,
      alternateTitles: [title]
    };
  }

  return null;
}

function guessKodikIdentityFromAlias(alias) {
  const value = String(alias || "");
  if (!value.startsWith("kodik-")) return "";
  const body = value.slice(6);
  const prefixes = ["shikimori", "kinopoisk", "imdb", "kodik"];

  for (const prefix of prefixes) {
    if (body.startsWith(`${prefix}-`)) {
      return `${prefix}:${body.slice(prefix.length + 1)}`;
    }
  }

  if (body.startsWith("title-")) {
    const meta = guessKodikMetaFromAlias(alias);
    if (!meta?.title) return "";
    return `title:${normalizeComparableText(meta.title)}:${meta.year || ""}`;
  }

  return "";
}

function fetchKodikRelease(release, options = {}) {
  const params = buildKodikReleaseParams(release);
  if (!params) return Promise.resolve(null);

  return fetchJson(KODIK_API_BASE, params, {
    ttl: options.ttl ?? DETAIL_TTL,
    retries: options.retries || 2,
    signal: options.signal
  }).then((payload) => {
    if (!payload || payload.notFound || payload.unavailable || payload.item === null) {
      return null;
    }
    return payload;
  });
}

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

function scheduleChunkRender(target, items, createNode, options = {}) {
  const token = `${Date.now()}-${Math.random()}`;
  target.dataset.renderToken = token;
  let index = 0;
  const preferLightBatches =
    options.preferLightBatches ??
    (shouldPreferFastStart() || window.matchMedia?.("(max-width: 860px)")?.matches);
  const batchSize = Math.max(1, options.batchSize || (preferLightBatches ? 3 : RENDER_BATCH_SIZE));

  const queueNextBatch = () => {
    if (target.dataset.renderToken !== token || index >= items.length) return;
    if (preferLightBatches && "requestIdleCallback" in window) {
      requestIdleCallback(() => requestAnimationFrame(appendBatch), { timeout: 180 });
      return;
    }
    requestAnimationFrame(appendBatch);
  };

  const appendBatch = () => {
    if (target.dataset.renderToken !== token) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + batchSize, items.length);
    while (index < end) {
      const node = createNode(items[index], index);
      if (node) {
        fragment.appendChild(node);
      }
      index += 1;
    }
    target.appendChild(fragment);
    if (index < items.length) {
      queueNextBatch();
      return;
    }
    if (typeof options.onComplete === "function" && target.dataset.renderToken === token) {
      options.onComplete();
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
  document.body.classList.remove("is-viewport-locked");
  document.documentElement.classList.remove("is-viewport-locked");
}

function relocateInjectedControls() {
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
      poster: progress.poster || "/mc-icon-512.png?v=5",
      cardPoster: progress.cardPoster || progress.poster || "/mc-icon-512.png?v=5",
      thumb: progress.cardPoster || progress.poster || "/mc-icon-512.png?v=5",
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

function progressHeadline(progress) {
  const percent = progressPercent(progress);
  if (percent >= 99) return "Почти досмотрено";
  if (percent >= 75) return "Финальные минуты";
  return progress.episodeLabel || "Продолжить просмотр";
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

  const percent = progressPercent(progress);
  const progressNode = document.createElement("div");
  progressNode.className = "anime-card__progress";
  progressNode.setAttribute(
    "aria-label",
    `${progressHeadline(progress)}. ${percent}% просмотра. ${formatClock(progress.time || 0)}${
      progress.duration ? ` из ${formatClock(progress.duration)}` : ""
    }.`
  );

  const topRow = document.createElement("div");
  topRow.className = "anime-card__progress-top";

  const label = document.createElement("span");
  label.className = "anime-card__progress-label";
  label.textContent = progressHeadline(progress);

  const value = document.createElement("span");
  value.className = "anime-card__progress-value";
  value.textContent = `${percent}%`;

  topRow.append(label, value);

  const bar = document.createElement("progress");
  bar.className = "anime-card__progress-bar";
  bar.max = 100;
  bar.value = percent;

  const meta = document.createElement("div");
  meta.className = "anime-card__progress-meta";
  meta.textContent = `${progress.episodeLabel || "Продолжить просмотр"} • ${formatClock(progress.time || 0)}${
    progress.duration ? ` из ${formatClock(progress.duration)}` : ""
  }`;

  progressNode.append(topRow, bar, meta);
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

function scheduleProgressUiRefresh() {
  if (state.progressUiFrame) {
    cancelAnimationFrame(state.progressUiFrame);
  }

  state.progressUiFrame = requestAnimationFrame(() => {
    state.progressUiFrame = 0;

    if (state.currentView === "home" || state.currentView === "profile") {
      renderContinueWatchingSections();
    }
    if (state.currentAnime) {
      decorateEpisodeProgress(state.currentAnime);
    }
    if (state.currentView === "profile") {
      renderProfile();
    }
  });
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
      const bar = document.createElement("progress");
      bar.className = "episode-progress";
      bar.max = 100;
      bar.value = progressPercent(progress);
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
    els.heroPoster.removeAttribute("srcset");
    els.heroPoster.removeAttribute("sizes");
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

  const triggerLoadMore = (button) => {
    if (!button || button.hidden || button.disabled || button.dataset.autoLoading === "1") return;
    button.dataset.autoLoading = "1";
    setLoadMoreButtonLoading(button, true);

    const action =
      button === els.catalogMoreBtn
        ? () => loadCatalog({ reset: false })
        : button === els.ongoingMoreBtn
          ? () => loadOngoing({ reset: false })
          : button === els.topMoreBtn
            ? () => loadTop({ reset: false })
            : null;

    if (!action) {
      delete button.dataset.autoLoading;
      return;
    }

    Promise.resolve(action())
      .catch(console.error)
      .finally(() => {
        setLoadMoreButtonLoading(button, false);
        delete button.dataset.autoLoading;
      });
  };

  const buttons = [els.catalogMoreBtn, els.ongoingMoreBtn, els.topMoreBtn].filter(Boolean);
  state.infiniteObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const button = entry.target;
        if (!entry.isIntersecting || button.hidden || button.disabled) return;
        triggerLoadMore(button);
      });
    },
    {
      rootMargin: "280px 0px 320px"
    }
  );

  buttons.forEach((button) => state.infiniteObserver.observe(button));
}

function registerGenres(releases) {
  const sorted = normalizeGenreList([
    ...state.genreOptions,
    ...(releases || []).flatMap((release) => release.genres || [])
  ]).sort((left, right) => left.localeCompare(right, "ru"));
  if (
    sorted.length === state.genreOptions.length &&
    sorted.every((value, index) => value === state.genreOptions[index])
  ) {
    return;
  }

  state.genreOptions = sorted;
  renderCatalogControls();
}

function registerVoices(releases) {
  const sorted = uniqueStrings([
    ...state.voiceOptions,
    ...(releases || []).flatMap((release) => getReleaseVoiceLabels(release))
  ]).sort((left, right) => left.localeCompare(right, "ru"));

  if (
    sorted.length === state.voiceOptions.length &&
    sorted.every((value, index) => value === state.voiceOptions[index])
  ) {
    return;
  }

  state.voiceOptions = sorted;
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
      state.catalogLoaded = false;
      loadCatalog({ reset: true }).catch(console.error);
    });
    fragment.appendChild(button);
  });

  els.catalogGenreChips.appendChild(fragment);
}

function getFilteredCatalogItems() {
  return state.catalogItems.filter((release) => {
    if (!releaseMatchesCatalogTypeSelection(release, state.catalogType)) return false;
    if (state.catalogGenre && !releaseMatchesGenres(release, [state.catalogGenre])) return false;
    if (state.catalogGenres.length && !releaseMatchesGenres(release, state.catalogGenres)) return false;
    if (state.catalogVoice && !releaseMatchesVoiceFilter(release, state.catalogVoice)) return false;
    return true;
  });
}

function refreshCatalogView(pagination = null) {
  if (!els.catalogGrid) return;
  const items = getFilteredCatalogItems();
  const currentPage = pagination?.current_page || state.catalogPage || 0;
  const totalPages = Math.max(pagination?.total_pages || 0, state.catalogTotalPages || 0, currentPage ? 1 : 0);
  const pageLabel = currentPage ? ` Страница ${currentPage} из ${totalPages || 1}.` : "";
  const genreLabels = [...new Set([state.catalogGenre, ...state.catalogGenres].filter(Boolean))];
  const activeFilters = [
    ...(genreLabels.length ? [`жанры: ${genreLabels.join(", ")}`] : []),
    ...(state.catalogVoice ? [`озвучка: ${state.catalogVoice}`] : [])
  ];

  if (els.catalogSummary) {
    els.catalogSummary.textContent = activeFilters.length
      ? `Активные фильтры: ${activeFilters.join(" • ")}. Загружено ${formatNumber(items.length)} релизов из базы Kodik.`
      : `${formatNumber(state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length)} тайтлов в полной базе Kodik.${pageLabel}`;
  }

  updateGrid(
    els.catalogGrid,
    items,
    activeFilters.length ? "По выбранным фильтрам пока ничего не найдено." : "Каталог пуст."
  );
}

function refreshOngoingSummary(pagination = null) {
  if (!els.ongoingSummary) return;
  const currentPage = pagination?.current_page || state.ongoingPage || 0;
  const totalPages = Math.max(pagination?.total_pages || 0, state.ongoingTotalPages || 0, currentPage ? 1 : 0);
  const pageLabel = currentPage ? ` Страница ${currentPage} из ${totalPages || 1}.` : "";
  els.ongoingSummary.textContent = `${formatNumber(
    state.ongoingMergedTotal || state.ongoingTotal || state.ongoingItems.length
  )} активных релизов.${pageLabel}`;
}

function refreshTopSummary(pagination = null) {
  if (!els.topSummary) return;
  const currentPage = pagination?.current_page || state.topPage || 0;
  const totalPages = Math.max(pagination?.total_pages || 0, state.topTotalPages || 0, currentPage ? 1 : 0);
  const pageLabel = currentPage ? ` Страница ${currentPage} из ${totalPages || 1}.` : "";
  els.topSummary.textContent = `${formatNumber(
    state.topMergedTotal || state.topTotal || state.topItems.length
  )} релизов в рейтинге.${pageLabel}`;
}

function isAdminUser() {
  return state.authUser?.isAdmin === true;
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

function buildRecommendationProfile() {
  const genreWeights = new Map();
  const blockedAliases = new Set();
  const progressMap = readProgressMap();
  const favoriteWeights = {
    watching: 5,
    completed: 4,
    planned: 2,
    paused: 1
  };

  const addReleaseGenres = (release, weight = 1) => {
    if (!release) return;
    normalizeGenreList(release.genres || []).forEach((genre, index) => {
      const boost = Math.max(0.5, weight - index * 0.2);
      genreWeights.set(genre, Number(genreWeights.get(genre) || 0) + boost);
    });
  };

  state.favorites.forEach((item) => {
    if (!item?.alias) return;
    blockedAliases.add(item.alias);
    addReleaseGenres(item, favoriteWeights[item.listKey] || 2);
  });

  Object.keys(progressMap || {}).forEach((alias) => {
    blockedAliases.add(alias);
    addReleaseGenres(findCachedReleaseByAlias(alias), 3);
  });

  const topGenres = [...genreWeights.entries()]
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, 3)
    .map(([genre]) => genre);

  return { genreWeights, topGenres, blockedAliases };
}

function scoreRecommendationRelease(release, profile) {
  if (!release?.alias || profile.blockedAliases.has(release.alias)) return -Infinity;

  const genres = normalizeGenreList(release.genres || []);
  if (!genres.length && profile.topGenres.length) return -Infinity;

  let genreScore = 0;
  let overlapCount = 0;
  genres.forEach((genre) => {
    const value = Number(profile.genreWeights.get(genre) || 0);
    if (value > 0) {
      overlapCount += 1;
      genreScore += value;
    }
  });

  if (profile.topGenres.length && overlapCount === 0) return -Infinity;

  const ratingScore = Math.min(20, Number(release.sortRating || release.favorites || 0) / 800);
  const freshnessScore = Math.min(8, Number(release.sortFreshAt || 0) / 1000000000000);
  const ongoingBonus = release.ongoing ? 2 : 0;
  const sourceBonus = Array.isArray(release.sourceItems) && release.sourceItems.length > 1 ? 1.5 : 0;

  return genreScore * 6 + overlapCount * 10 + ratingScore + freshnessScore + ongoingBonus + sourceBonus;
}

function renderPersonalRecommendations() {
  if (!els.profileRecommendationsGrid || !els.profileRecommendationsSummary) return;

  const genres = state.personalizedGenres || [];
  const hasSignals = Boolean(genres.length || state.favorites.length || Object.keys(readProgressMap() || {}).length);
  if (!state.personalizedRecommendations.length) {
    els.profileRecommendationsSummary.textContent = genres.length
      ? `По вашим жанрам (${genres.join(", ")}) пока не удалось собрать устойчивую подборку.`
      : "Добавьте тайтлы в списки или начните смотреть аниме, и здесь появится персональная подборка.";
    updateGrid(
      els.profileRecommendationsGrid,
      [],
      genres.length ? "По вашим жанрам пока ничего не найдено." : "Подборка появится после первых действий в профиле."
    );
    return;
  }

  els.profileRecommendationsSummary.textContent = genres.length
    ? `Собрано на основе ваших жанров: ${genres.join(", ")}.`
    : hasSignals
      ? "Подборка собрана по вашим действиям и ближайшим похожим релизам."
      : "Стартовая подборка: популярные релизы, с которых удобно начать.";
  updateGrid(els.profileRecommendationsGrid, state.personalizedRecommendations, "Подборка пока пуста.");
}

async function loadPersonalRecommendations(options = {}) {
  if (!els.profileRecommendationsGrid) return [];

  const profile = buildRecommendationProfile();
  const cacheKey = JSON.stringify({
    genres: profile.topGenres,
    favorites: state.favorites.map((item) => `${item.alias}:${item.listKey || ""}`).sort(),
    progress: Object.keys(readProgressMap() || {}).sort()
  });

  if (!options.force && state.personalizedKey === cacheKey && state.personalizedRecommendations.length) {
    renderPersonalRecommendations();
    return state.personalizedRecommendations;
  }

  if (state.personalizedPromise && !options.force) {
    return state.personalizedPromise;
  }

  state.personalizedKey = cacheKey;
  state.personalizedGenres = profile.topGenres;
  renderSkeletonGrid(els.profileRecommendationsGrid, 6);
  if (els.profileRecommendationsSummary) {
    els.profileRecommendationsSummary.textContent = profile.topGenres.length
      ? `Обновляем подборку по жанрам: ${profile.topGenres.join(", ")}…`
      : "Собираем базовую персональную подборку…";
  }

  state.personalizedPromise = (async () => {
    let pool = uniqueReleases(getAllKnownReleases());

    if (profile.topGenres.length) {
      const kodikMatches = await fetchKodikDiscover("catalog", 1, 48, {
        ttl: 90000,
        genres: profile.topGenres,
        sort: "shikimori_rating",
        order: "desc"
      }).catch(() => ({ items: [] }));

      const merged = buildReleases(kodikMatches);
      registerGenres(merged);
      registerVoices(merged);
      pool = mergeReleaseCollections(pool, merged);
    }

    const fallbackPool = uniqueReleases([...state.recommended, ...state.popular, ...state.latest, ...pool]);
    const ranked = fallbackPool
      .map((release) => ({ release, score: scoreRecommendationRelease(release, profile) }))
      .filter((item) => Number.isFinite(item.score) && item.score > -Infinity)
      .sort((left, right) => right.score - left.score)
      .map((item) => item.release);

    state.personalizedRecommendations = (ranked.length ? ranked : fallbackPool.filter((release) => !profile.blockedAliases.has(release.alias))).slice(0, 12);
    renderPersonalRecommendations();
    return state.personalizedRecommendations;
  })()
    .catch((error) => {
      console.error(error);
      state.personalizedRecommendations = uniqueReleases(
        [...state.recommended, ...state.popular, ...state.latest].filter((release) => !profile.blockedAliases.has(release?.alias))
      ).slice(0, 12);
      renderPersonalRecommendations();
      return state.personalizedRecommendations;
    })
    .finally(() => {
      state.personalizedPromise = null;
    });

  return state.personalizedPromise;
}

function renderProfile() {
  if (!els.favoritesGrid) return;
  const user = state.authUser;
  const admin = isAdminUser();
  syncInstallButton();

  if (els.profileAvatar) els.profileAvatar.src = user?.photoUrl || "/mc-icon-192.png?v=5";
  if (els.profileName) els.profileName.textContent = user?.displayName || user?.email?.split("@")[0] || "Гость";
  if (els.profileRoleBadge) {
    els.profileRoleBadge.hidden = !admin;
    if (admin) {
      els.profileRoleBadge.textContent = String(user?.role || "Админ");
    }
  }
  if (els.profileEmail) els.profileEmail.textContent = user?.email || "Вход не выполнен";
  if (els.favoritesCount) els.favoritesCount.textContent = formatNumber(state.favorites.length);
  if (els.favoritesMode) {
    els.favoritesMode.textContent = admin ? String(user?.role || "Админ") : user?.localId ? "Облако" : "Локально";
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
  renderPersonalRecommendations();
  safeIdle(() => loadPersonalRecommendations().catch(console.error));
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
  const heroPosterSrc = release.heroPoster || release.poster || "/mc-icon-512.png?v=5";
  els.heroPoster.src = heroPosterSrc;
  els.heroPoster.alt = release.title;
  els.heroPoster.srcset = `${heroPosterSrc} 1x, ${release.poster || heroPosterSrc} 2x`;
  els.heroPoster.sizes = "(max-width: 860px) min(200px, 100vw), 320px";
  bindPosterFallback(els.heroPoster, release, {
    initialSrc: heroPosterSrc,
    placeholder: "/mc-icon-512.png?v=5"
  });
  renderHeroDots();
  syncHeroOpenLink();
}

function applyAdminHero(releases) {
  const forcedAlias = readAdminHeroAlias();
  if (!forcedAlias) return null;
  return releases.find((release) => release.alias === forcedAlias) || null;
}

function updateStats() {
  els.latestCount.textContent = formatNumber(state.latestTotal || state.latest.length || state.recommended.length || state.popular.length);
  els.catalogCount.textContent = formatNumber(
    state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length || getHeroCandidates().length
  );
  els.ongoingCount.textContent = formatNumber(state.ongoingMergedTotal || state.ongoingTotal || state.ongoingItems.length);
  els.topCount.textContent = formatNumber(state.topMergedTotal || state.topTotal || state.popular.length || state.topItems.length);
}

async function loadContentStats(force = false) {
  try {
    let stats = null;
    try {
      stats = await fetchJson("/api/content-stats", null, { ttl: force ? 0 : CONTENT_STATS_TTL, retries: 1 });
    } catch {
      stats = await fetchJson("/content-stats.json", null, { ttl: force ? 0 : CONTENT_STATS_TTL, retries: 1 });
    }
    state.catalogMergedTotal = Math.max(Number(stats?.catalogTotal || 0), state.catalogMergedTotal || 0);
    state.ongoingMergedTotal = Math.max(Number(stats?.ongoingTotal || 0), state.ongoingMergedTotal || 0);
    state.topMergedTotal = Math.max(Number(stats?.topTotal || 0), state.topMergedTotal || 0);
    state.latestTotal = Math.max(Number(stats?.latestTotal || 0), state.latestTotal || 0);
    state.catalogTotal = Math.max(state.catalogMergedTotal || 0, state.catalogTotal || 0);
    state.ongoingTotal = Math.max(state.ongoingMergedTotal || 0, state.ongoingTotal || 0);
    state.topTotal = Math.max(state.topMergedTotal || 0, state.topTotal || 0);
    state.catalogTotalPages = Math.max(state.catalogTotalPages || 0, Math.ceil((state.catalogMergedTotal || 0) / GRID_PAGE_SIZE));
    state.ongoingTotalPages = Math.max(state.ongoingTotalPages || 0, Math.ceil((state.ongoingMergedTotal || 0) / GRID_PAGE_SIZE));
    state.topTotalPages = Math.max(state.topTotalPages || 0, Math.ceil((state.topMergedTotal || 0) / GRID_PAGE_SIZE));
    updateStats();
    if (state.catalogLoaded) {
      if (state.catalogGenre || state.catalogGenres.length || state.catalogVoice) {
        refreshCatalogView();
      } else if (els.catalogSummary) {
        const currentPage = state.catalogPage || 0;
        const totalPages = Math.max(state.catalogTotalPages || 0, currentPage ? 1 : 0);
        const pageLabel = currentPage ? ` Страница ${currentPage} из ${totalPages || 1}.` : "";
        els.catalogSummary.textContent = `${formatNumber(
          state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length
        )} тайтлов в полной базе Kodik.${pageLabel}`;
      }
    }
    if (state.ongoingLoaded) refreshOngoingSummary();
    if (state.topLoaded) refreshTopSummary();
  } catch {}
}

function syncHomeChrome(view) {
  const visible = view === "home";
  if (els.heroCard) els.heroCard.hidden = !visible;
  if (els.statsRow) els.statsRow.hidden = !visible;
}

function setView(view, options = {}) {
  releaseViewportLocks();
  const previousView = state.currentView;

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
    const search =
      view === "search"
        ? options.search ?? (state.searchQuery.trim() ? new URLSearchParams({ q: state.searchQuery.trim() }).toString() : "")
        : "";
    navigateTo(getViewPath(view), { replace: options.replaceHistory, search });
  }

  updateViewSeo(view);
  if (view === "search" && previousView !== "search" && options.focusSearch !== false) {
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
  state.sortingOptions = KODIK_SORTING_OPTIONS.slice();
  state.typeOptions = KODIK_TYPE_OPTIONS.slice();
  state.referencesLoaded = true;
  renderCatalogControls();
}

function renderCatalogControls() {
  els.catalogSort.innerHTML = "";
  els.catalogType.innerHTML = '<option value="">Все форматы</option>';
  els.catalogGenre.innerHTML = '<option value="">Все жанры</option>';
  if (els.catalogVoice) {
    els.catalogVoice.innerHTML = '<option value="">Все озвучки</option>';
  }

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

  if (els.catalogVoice) {
    state.voiceOptions.forEach((voice) => {
      const node = document.createElement("option");
      node.value = voice;
      node.textContent = voice;
      node.selected = voice === state.catalogVoice;
      els.catalogVoice.appendChild(node);
    });
  }

  renderGenreChips();
}

async function loadHome(force = false) {
  if (state.homeLoaded && !force) return;

  renderSkeletonGrid(els.continueGrid, 4);
  renderSkeletonGrid(els.latestGrid, 6);
  renderSkeletonGrid(els.recommendedGrid, 6);
  renderSkeletonGrid(els.popularGrid, 6);

  try {
    const [latestPayload, topPayload, topPageTwoPayload, ongoingPayload] = await Promise.all([
      fetchKodikDiscover("latest", 1, 18, { ttl: 120000 }),
      fetchKodikDiscover("top", 1, 18, { ttl: 120000 }),
      fetchKodikDiscover("top", 2, 18, { ttl: 120000 }),
      fetchKodikDiscover("ongoing", 1, 18, { ttl: 120000 })
    ]);

    state.latest = buildReleases(latestPayload).slice(0, 12);
    state.recommended = buildReleases(topPayload).slice(0, 12);
    state.popular = uniqueReleases([
      ...buildReleases(topPageTwoPayload),
      ...buildReleases(ongoingPayload),
      ...state.recommended
    ]).slice(0, 12);

    registerGenres(state.latest);
    registerGenres(state.recommended);
    registerGenres(state.popular);
    registerVoices(state.latest);
    registerVoices(state.recommended);
    registerVoices(state.popular);

    const featuredPool = getHeroCandidates();
    state.featured = applyAdminHero(featuredPool) || featuredPool[0] || null;
    state.heroPool = uniqueReleases([state.featured, ...featuredPool]).slice(0, 4);
    state.heroCarouselIndex = Math.max(0, state.heroPool.findIndex((item) => item.alias === state.featured?.alias));
    state.latestTotal = Math.max(state.latestTotal || 0, extractPagination(latestPayload).total || 0, state.latest.length);
    state.catalogTotal = Math.max(state.catalogMergedTotal || 0, extractPagination(topPayload).total || 0, state.catalogTotal, state.popular.length);
    state.catalogTotalPages = Math.max(
      state.catalogTotalPages || 0,
      extractPagination(topPayload).total_pages || 0,
      Math.ceil((state.catalogTotal || state.popular.length) / GRID_PAGE_SIZE)
    );
    state.ongoingTotal = Math.max(state.ongoingMergedTotal || 0, extractPagination(ongoingPayload).total || 0, state.ongoingTotal, ongoingPayload?.items?.length || 0);
    state.ongoingTotalPages = Math.max(
      state.ongoingTotalPages || 0,
      extractPagination(ongoingPayload).total_pages || 0,
      Math.ceil((state.ongoingTotal || 0) / GRID_PAGE_SIZE)
    );
    state.topTotal = Math.max(state.topMergedTotal || 0, extractPagination(topPayload).total || 0, state.topTotal, state.recommended.length);
    state.topTotalPages = Math.max(
      state.topTotalPages || 0,
      extractPagination(topPayload).total_pages || 0,
      Math.ceil((state.topTotal || state.recommended.length) / GRID_PAGE_SIZE)
    );
    state.homeLoaded = true;
    state.personalizedKey = "";

    renderContinueWatchingSections();
    updateStats();
    renderHero(state.featured);
    if (state.currentView === "profile") {
      safeIdle(() => loadPersonalRecommendations({ force: true }).catch(console.error));
    }
    requestAnimationFrame(() => {
      updateGrid(els.latestGrid, state.latest, "Свежие релизы пока не найдены.");
      updateGrid(els.recommendedGrid, state.recommended, "Подборка пока не заполнена.");
      updateGrid(els.popularGrid, state.popular, "Популярные релизы пока не найдены.");
      startHeroCarousel();
    });
  } catch (error) {
    console.error("loadHome failed", error);
    state.homeLoaded = false;
    const message = getKodikUnavailableMessage(error, "Не удалось загрузить главную витрину.");
    renderHeroFallback(message);
    replaceWithErrorState(els.latestGrid, message, () => loadHome(true).catch(console.error));
    replaceWithErrorState(els.recommendedGrid, message, () => loadHome(true).catch(console.error));
    replaceWithErrorState(els.popularGrid, message, () => loadHome(true).catch(console.error));
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

function getKodikCatalogTypeConfig(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return { enabled: true, animeKinds: [], mediaTypes: [] };
  }

  switch (normalized) {
    case "TV":
      return { enabled: true, animeKinds: ["tv", "tv13", "tv24", "tv48"], mediaTypes: ["anime-serial"] };
    case "ONA":
      return { enabled: true, animeKinds: ["ona"], mediaTypes: ["anime-serial"] };
    case "WEB":
      return { enabled: true, animeKinds: ["tv", "tv13", "tv24", "tv48", "ona"], mediaTypes: ["anime-serial"] };
    case "OVA":
      return { enabled: true, animeKinds: ["ova"], mediaTypes: ["anime-serial"] };
    case "OAD":
      return { enabled: true, animeKinds: ["ova", "special"], mediaTypes: ["anime-serial"] };
    case "MOVIE":
      return { enabled: true, animeKinds: ["movie"], mediaTypes: ["anime"] };
    case "SPECIAL":
      return { enabled: true, animeKinds: ["special"], mediaTypes: ["anime", "anime-serial"] };
    default:
      return { enabled: false, animeKinds: [], mediaTypes: [] };
  }
}

function releaseMatchesCatalogTypeSelection(release, catalogType = state.catalogType) {
  const normalized = String(catalogType || "").trim().toUpperCase();
  if (!normalized) return true;

  const value = String(release?.typeValue || "").trim().toUpperCase();
  if (!value) return false;
  if (value === normalized) return true;

  if (release?.provider !== "kodik") return false;
  if (normalized === "WEB") return ["TV", "ONA"].includes(value);
  if (normalized === "OAD") return ["OVA", "SPECIAL"].includes(value);
  if (normalized === "SPECIAL") return ["OAD", "SPECIAL"].includes(value);
  return false;
}

async function loadCatalog(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.catalogPage + 1;
  const existingAliases = new Set(state.catalogItems.map((release) => release.alias).filter(Boolean));
  const previousCatalogCount = reset ? 0 : state.catalogItems.length;
  const previousFilteredCount = reset ? 0 : getFilteredCatalogItems().length;
  const mergedCatalogTotal = Math.max(Number(state.catalogMergedTotal || 0), Number(state.catalogTotal || 0));

  if (reset) {
    state.catalogItems = [];
    state.catalogPage = 0;
    state.catalogTotal = mergedCatalogTotal;
    state.catalogTotalPages = 0;
    state.catalogHasMore = false;
    els.catalogSummary.textContent = "Загружаем каталог…";
    renderSkeletonGrid(els.catalogGrid, 8);
  }

  try {
    els.catalogMoreBtn.disabled = true;
    const activeGenres = normalizeGenreList([state.catalogGenre, ...state.catalogGenres].filter(Boolean));
    const hasGenreFilters = activeGenres.length > 0;
    const hasClientFilters = hasGenreFilters || Boolean(state.catalogVoice);
    const kodikTypeConfig = getKodikCatalogTypeConfig(state.catalogType);
    const shouldLoadKodik = kodikTypeConfig.enabled;
    const filterKey = JSON.stringify({
      sort: state.catalogSort,
      type: state.catalogType || "",
      genres: activeGenres,
      voice: state.catalogVoice || ""
    });

    if (reset) {
      state.catalogFilterKey = filterKey;
      state.catalogFilterPool = [];
    }

    const kodikPayload = shouldLoadKodik
      ? await fetchKodikDiscover("catalog", nextPage, GRID_PAGE_SIZE, {
          ttl: 120000,
          ...getKodikSortConfig(state.catalogSort),
          genres: activeGenres,
          animeKinds: kodikTypeConfig.animeKinds,
          mediaTypes: kodikTypeConfig.mediaTypes
        })
      : { items: [], pagination: { current_page: nextPage, total_pages: nextPage, total: 0 } };

    const pagination = extractPagination(kodikPayload);
    const releases = sortCatalogReleases(buildReleases(kodikPayload), state.catalogSort);
    const appendedReleases = reset
      ? releases
      : releases.filter((release) => release?.alias && !existingAliases.has(release.alias));

    registerGenres(releases);
    registerVoices(releases);
    state.catalogItems = reset ? releases : mergeReleaseCollections(state.catalogItems, releases);
    state.catalogPage = Math.max(pagination.current_page || 0, nextPage);
    state.catalogTotal = hasGenreFilters
      ? Math.max(state.catalogItems.length, pagination.total || 0)
      : Math.max(mergedCatalogTotal || 0, pagination.total || 0, state.catalogItems.length);
    state.catalogTotalPages = Math.max(
      pagination.total_pages || 0,
      Math.ceil((state.catalogTotal || state.catalogItems.length) / GRID_PAGE_SIZE),
      state.catalogPage ? 1 : 0
    );
    state.catalogHasMore = state.catalogPage < (state.catalogTotalPages || 1);
    state.catalogLoaded = true;

    if (hasClientFilters) {
      const filteredAppended = appendedReleases.filter((release) => {
        if (hasGenreFilters && !releaseMatchesGenres(release, activeGenres)) return false;
        if (state.catalogVoice && !releaseMatchesVoiceFilter(release, state.catalogVoice)) return false;
        return true;
      });
      const filteredItems = getFilteredCatalogItems();
      const filters = [
        ...(hasGenreFilters ? [`жанры: ${[...new Set(activeGenres)].join(", ")}`] : []),
        ...(state.catalogVoice ? [`озвучка: ${state.catalogVoice}`] : [])
      ];

      if (els.catalogSummary) {
        els.catalogSummary.textContent = `Активные фильтры: ${filters.join(" • ")}. Загружено ${formatNumber(
          filteredItems.length
        )} релизов из базы Kodik.`;
      }

      if (!reset && filteredAppended.length && filteredItems.length === previousFilteredCount + filteredAppended.length) {
        updateGrid(els.catalogGrid, filteredAppended, "По выбранным фильтрам пока ничего не найдено.", {
          append: true,
          offset: previousFilteredCount
        });
      } else {
        refreshCatalogView(pagination);
      }
    } else {
      els.catalogSummary.textContent = `${formatNumber(
        state.catalogMergedTotal || state.catalogTotal
      )} тайтлов в полной базе Kodik. Страница ${state.catalogPage} из ${
        state.catalogTotalPages || 1
      }.`;
      if (reset) {
        updateGrid(els.catalogGrid, state.catalogItems, "Каталог пуст.");
      } else if (appendedReleases.length) {
        updateGrid(els.catalogGrid, appendedReleases, "Каталог пуст.", {
          append: true,
          offset: previousCatalogCount
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
    const message = getKodikUnavailableMessage(error, "Каталог временно недоступен.");
    els.catalogSummary.textContent = message;
    replaceWithErrorState(els.catalogGrid, message, () => loadCatalog({ reset: true }).catch(console.error));
    throw error;
  }
}

async function loadOngoing(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.ongoingPage + 1;
  const existingAliases = new Set(state.ongoingItems.map((release) => release.alias).filter(Boolean));
  const previousCount = reset ? 0 : state.ongoingItems.length;
  const mergedOngoingTotal = Math.max(Number(state.ongoingMergedTotal || 0), Number(state.ongoingTotal || 0));

  if (reset) {
    state.ongoingItems = [];
    state.ongoingPage = 0;
    state.ongoingTotal = mergedOngoingTotal;
    state.ongoingTotalPages = 0;
    state.ongoingHasMore = false;
    els.ongoingSummary.textContent = "Загружаем онгоинги…";
    renderSkeletonGrid(els.ongoingGrid, 8);
  }

  try {
    els.ongoingMoreBtn.disabled = true;
    const kodikPayload = await fetchKodikDiscover("ongoing", nextPage, GRID_PAGE_SIZE, {
      ttl: 120000
    });
    const releases = buildReleases(kodikPayload);
    const pagination = extractPagination(kodikPayload);
    const appendedReleases = reset
      ? releases
      : releases.filter((release) => release?.alias && !existingAliases.has(release.alias));

    registerGenres(releases);
    registerVoices(releases);
    state.ongoingItems = reset ? releases : mergeReleaseCollections(state.ongoingItems, releases);
    state.ongoingPage = Math.max(pagination.current_page || 0, nextPage);
    state.ongoingTotal = Math.max(mergedOngoingTotal || 0, pagination.total || 0, state.ongoingItems.length);
    state.ongoingTotalPages = Math.max(
      pagination.total_pages || 0,
      Math.ceil((Math.max(state.ongoingTotal || 0, state.ongoingItems.length) || 0) / GRID_PAGE_SIZE),
      state.ongoingPage ? 1 : 0
    );
    state.ongoingHasMore = state.ongoingPage < (state.ongoingTotalPages || 1);
    state.ongoingLoaded = true;

    refreshOngoingSummary();
    if (reset) {
      updateGrid(els.ongoingGrid, state.ongoingItems, "Онгоинги не найдены.");
    } else if (appendedReleases.length) {
      updateGrid(els.ongoingGrid, appendedReleases, "Онгоинги не найдены.", {
        append: true,
        offset: previousCount
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
    const message = getKodikUnavailableMessage(error, "Раздел онгоингов временно недоступен.");
    els.ongoingSummary.textContent = message;
    replaceWithErrorState(els.ongoingGrid, message, () => loadOngoing({ reset: true }).catch(console.error));
    throw error;
  }
}
async function loadTop(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.topPage + 1;
  const existingAliases = new Set(state.topItems.map((release) => release.alias).filter(Boolean));
  const previousCount = reset ? 0 : state.topItems.length;
  const mergedTopTotal = Math.max(Number(state.topMergedTotal || 0), Number(state.topTotal || 0));

  if (reset) {
    state.topItems = [];
    state.topPage = 0;
    state.topTotal = mergedTopTotal;
    state.topTotalPages = 0;
    state.topHasMore = false;
    els.topSummary.textContent = "Загружаем топ каталога…";
    renderSkeletonGrid(els.topGrid, 8);
  }

  try {
    els.topMoreBtn.disabled = true;
    const kodikPayload = await fetchKodikDiscover("top", nextPage, GRID_PAGE_SIZE, {
      ttl: 120000
    });
    const releases = buildReleases(kodikPayload);
    const pagination = extractPagination(kodikPayload);
    const appendedReleases = reset
      ? releases
      : releases.filter((release) => release?.alias && !existingAliases.has(release.alias));

    registerGenres(releases);
    registerVoices(releases);
    state.topItems = reset ? releases : mergeReleaseCollections(state.topItems, releases);
    state.topPage = Math.max(pagination.current_page || 0, nextPage);
    state.topTotal = Math.max(mergedTopTotal || 0, pagination.total || 0, state.topItems.length);
    state.topTotalPages = Math.max(
      pagination.total_pages || 0,
      Math.ceil((Math.max(state.topTotal || 0, state.topItems.length) || 0) / GRID_PAGE_SIZE),
      state.topPage ? 1 : 0
    );
    state.topHasMore = state.topPage < (state.topTotalPages || 1);
    state.topLoaded = true;

    refreshTopSummary();
    if (reset) {
      updateGrid(els.topGrid, state.topItems, "Топ пока не заполнен.");
    } else if (appendedReleases.length) {
      updateGrid(els.topGrid, appendedReleases, "Топ пока не заполнен.", {
        append: true,
        offset: previousCount
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
    const message = getKodikUnavailableMessage(error, "Топ временно недоступен.");
    els.topSummary.textContent = message;
    replaceWithErrorState(els.topGrid, message, () => loadTop({ reset: true }).catch(console.error));
    throw error;
  }
}

async function loadSchedule() {
  try {
    state.scheduleLoaded = true;
    els.scheduleGrid.replaceChildren(createEmptyState("Загружаем расписание…"));
    const payload = await fetchKodikDiscover("ongoing", 1, 72, { ttl: 60000 });
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
      const key = release.publishDay || "Сейчас доступно в Kodik";
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

function searchLocalReleases(query) {
  const normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery) return [];

  const localPool = uniqueReleases([
    state.currentAnime,
    state.featured,
    ...state.latest,
    ...state.recommended,
    ...state.popular,
    ...state.catalogItems,
    ...state.ongoingItems,
    ...state.topItems,
    ...state.favorites
  ].filter(Boolean));

  return localPool.filter((release) => {
    const titleMatch = getReleaseTitleVariants(release).some((title) => title.includes(normalizedQuery));
    if (titleMatch) return true;

    const genreMatch = normalizeGenreList(Array.isArray(release?.genres) ? release.genres : [])
      .map(normalizeGenreKey)
      .some((genre) => genre.includes(normalizedQuery));
    if (genreMatch) return true;

    return uniqueStrings(Array.isArray(release?.voices) ? release.voices : [])
      .map(normalizeComparableText)
      .some((voice) => voice.includes(normalizedQuery));
  });
}

async function runSearch(query, options = {}) {
  const cleanQuery = query.trim();
  state.searchQuery = cleanQuery;
  if (state.searchAbort) {
    state.searchAbort.abort();
    state.searchAbort = null;
  }

  if (!cleanQuery) {
    state.searchResults = [];
    if (els.searchInput && els.searchInput.value) {
      els.searchInput.value = "";
    }
    renderSearchEmpty();
    setView(state.previousView || "home", {
      updateHistory: options.updateHistory,
      focusSearch: options.focusSearch
    });
    return;
  }

  const controller = new AbortController();
  state.searchAbort = controller;
  if (els.searchInput && els.searchInput.value !== cleanQuery) {
    els.searchInput.value = cleanQuery;
  }
  setView("search", {
    updateHistory: options.updateHistory,
    focusSearch: options.focusSearch,
    search: new URLSearchParams({ q: cleanQuery }).toString(),
    replaceHistory:
      options.replaceHistory ?? normalizePath(location.pathname) === "/search"
  });
  els.searchSummary.textContent = "Ищем релизы…";
  renderSkeletonGrid(els.searchGrid, 8);

  try {
    const localResults = searchLocalReleases(cleanQuery);
    const matchedGenres = findMatchingGenres(cleanQuery).slice(0, 3);
    const [kodikPayload, kodikGenrePayload] = await Promise.all([
      fetchKodikSearch(cleanQuery, { ttl: 60000, signal: controller.signal }),
      matchedGenres.length
        ? fetchKodikDiscover("catalog", 1, 48, {
            ttl: 60000,
            signal: controller.signal,
            genres: matchedGenres,
            sort: "updated_at"
          })
        : Promise.resolve({ items: [] })
    ]);
    if (controller.signal.aborted) return;

    state.searchResults = mergeReleaseCollections(
      mergeReleaseCollections(localResults, buildReleases(kodikPayload)),
      buildReleases(kodikGenrePayload)
    ).slice(0, 48);
    registerVoices(state.searchResults);
    els.searchSummary.textContent = state.searchResults.length
      ? `Найдено ${formatNumber(state.searchResults.length)} релизов по запросу «${cleanQuery}».`
      : `По запросу «${cleanQuery}» ничего не найдено.`;
    updateGrid(els.searchGrid, state.searchResults, "Ничего не найдено.");
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
    const message = getKodikUnavailableMessage(error, "Поиск временно недоступен.");
    els.searchSummary.textContent = message;
    updateGrid(els.searchGrid, [], message);
  } finally {
    if (state.searchAbort === controller) {
      state.searchAbort = null;
    }
  }
}

const prefetchRelease = (alias) => {
  const preview = findCachedReleaseByAlias(alias);
  return fetchKodikRelease(preview || { alias, kodikIdentity: guessKodikIdentityFromAlias(alias) }, { ttl: DETAIL_TTL }).catch(() => {});
};

function createAnimeCard(release, index) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const action = node.querySelector(".anime-card__action");
  const poster = node.querySelector(".anime-card__poster");
  const cardSrc = release.cardPoster || release.thumb || release.poster;
  const card2x = release.poster || release.cardPoster || cardSrc;
  const cardFallback = release.cardPosterDirect || release.thumbDirect || release.posterDirect || "/mc-icon-192.png?v=5";
  const shouldPrioritize =
    (state.currentView === "catalog" || state.currentView === "ongoing" || state.currentView === "top") &&
    index < 2 &&
    !shouldPreferFastStart();

  node.querySelector(".anime-card__age").textContent = release.age;
  node.querySelector(".anime-card__status").textContent = release.statusLabel;
  node.querySelector(".anime-card__title").textContent = release.title;
  node.querySelector(".anime-card__meta").textContent = [release.type, release.year, `${release.episodesTotal || "?"} эп.`]
    .filter(Boolean)
    .join(" • ");

  poster.src = cardSrc;
  poster.alt = release.title;
  poster.loading = shouldPrioritize ? "eager" : "lazy";
  poster.decoding = "async";
  poster.fetchPriority = shouldPrioritize ? "high" : "low";
  poster.srcset = `${cardSrc} 1x, ${card2x} 2x`;
  poster.sizes = "(max-width: 420px) 44vw, (max-width: 860px) 40vw, (max-width: 1180px) 180px, 165px";
  bindPosterFallback(poster, release, { initialSrc: cardSrc, placeholder: cardFallback });

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

  scheduleChunkRender(target, releases, (release, index) => createAnimeCard(release, offset + index), {
    onComplete: options.onComplete
  });
}

function bindPosterFallback(image, release, options = {}) {
  if (!image || !release) return;
  const initialSrc = String(options.initialSrc || image.currentSrc || image.src || "").trim();
  const queue = uniqueStrings([
    ...(Array.isArray(release.posterCandidateQueue) ? release.posterCandidateQueue : []),
    ...(Array.isArray(release.posterDirectQueue) ? release.posterDirectQueue : []),
    release.cardPosterDirect,
    release.thumbDirect,
    release.posterDirect,
    options.placeholder || "/mc-icon-192.png?v=5"
  ]).filter((src) => src && src !== initialSrc);

  image.dataset.fallbackIndex = "0";
  image.onerror = () => {
    const index = Number(image.dataset.fallbackIndex || "0");
    const nextSrc = queue[index];
    if (!nextSrc) {
      image.onerror = null;
      return;
    }
    image.dataset.fallbackIndex = String(index + 1);
    image.src = nextSrc;
    image.srcset = "";
  };
}

function openDrawer() {
  els.drawer.classList.add("is-open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.drawer.inert = false;
}

function closeDrawer(options = {}) {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.drawer.inert = true;
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

function fallbackToEmbeddedSource(message) {
  if (!state.currentAnime) return false;
  const fallbackSource = getReleaseSources(state.currentAnime).find((source) => source.kind === "iframe" && source.externalUrl);
  if (!fallbackSource?.externalUrl) return false;

  state.currentSource = fallbackSource.id;
  syncRenderedSourceState();
  renderEpisodes(state.currentAnime);
  els.qualitySwitch.innerHTML = "";
  els.playerTitle.textContent = fallbackSource.title;
  els.playerNote.textContent = message || "Поток не ответил. Открыли встроенный внешний плеер.";
  showExternalSurface(fallbackSource.externalUrl);
  return true;
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

function isActiveVideoSource() {
  const source = state.currentAnime ? getSourceById(state.currentAnime, state.currentSource) : null;
  return Boolean(source && source.kind !== "iframe" && source.kind !== "iframe-episodes");
}

function syncPlayerReadyState() {
  clearPlayerStartupTimer();
  if (isActiveVideoSource() && !els.player.hidden) {
    els.playerNote.textContent = "Поток подключён.";
  }
}

function armPlayerStartupTimer(selectionToken, episode, qualityKey) {
  clearPlayerStartupTimer();
  const timeoutMs = shouldPreferFastStart() ? 10000 : 15000;

  state.playerStartupTimer = setTimeout(() => {
    if (state.playerSelectionToken !== selectionToken) return;
    if (!isActiveVideoSource()) return;
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
    script.src = "/hls.min.js?v=1";
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
      if (
        fallbackToEmbeddedSource("Поток не ответил. Открыли встроенный внешний плеер с альтернативным источником.")
      ) {
        return;
      }
      els.playerNote.textContent = "Не удалось загрузить поток. Попробуйте другую серию или обновите страницу.";
    });
    state.hls.loadSource(playableManifestUrl);
    state.hls.attachMedia(els.player);
    return;
  }

  els.player.src = playableManifestUrl;
}

function getReleaseSources(release) {
  return Array.isArray(release?.sourceItems) ? release.sourceItems : [];
}

function getSourceById(release, sourceId) {
  return getReleaseSources(release).find((source) => source.id === sourceId) || null;
}

function getDefaultSourceId(release) {
  const sources = getReleaseSources(release);
  if (!sources.length) return "kodik";
  return (
    sources.find((source) => source.episodes?.length)?.id ||
    sources.find((source) => source.externalUrl)?.id ||
    sources[0].id
  );
}

function getSourceEpisodes(release, sourceId) {
  return getSourceById(release, sourceId)?.episodes || [];
}

function findBestEpisodeForSource(source, currentEpisode) {
  if (!source?.episodes?.length) return null;
  if (!currentEpisode) return source.episodes[0];

  return (
    source.episodes.find((episode) => episode.id === currentEpisode.id) ||
    source.episodes.find(
      (episode) =>
        Number(episode.ordinal || 0) === Number(currentEpisode.ordinal || 0) &&
        Number(episode.seasonOrdinal || 0) === Number(currentEpisode.seasonOrdinal || 0)
    ) ||
    source.episodes.find((episode) => Number(episode.ordinal || 0) === Number(currentEpisode.ordinal || 0)) ||
    source.episodes[0]
  );
}

function buildSourceList(release) {
  return getReleaseSources(release);
}

function createSourceNode(source) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.sourceId = source.id;
  button.className = `source-btn${state.currentSource === source.id ? " is-active" : ""}`;
  button.innerHTML = `<strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.note)}</small>`;
  button.addEventListener("click", () => switchSource(source.id));
  return button;
}

function createEpisodeNode(episode) {
  const label = episode.ordinal ? `${episode.ordinal} серия` : episode.name || "Фильм";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `episode-btn${state.currentEpisode?.id === episode.id ? " is-active" : ""}`;
  button.dataset.episodeId = episode.id || "";
  button.dataset.ordinal = String(episode.ordinal || "");
  button.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(
    episode.name || "Без названия"
  )}</span><small>${escapeHtml(formatEpisodeDuration(episode.duration) || "Длительность не указана")}</small>`;
  button.addEventListener("click", () => selectEpisode(episode).catch(console.error));
  return button;
}

function createVoiceNode(name) {
  const pill = document.createElement("div");
  pill.className = "voice-pill";
  pill.innerHTML = `<strong>${escapeHtml(name)}</strong><small>озвучка</small>`;
  return pill;
}

function createCrewNode(member) {
  const pill = document.createElement("div");
  pill.className = "crew-pill";
  pill.innerHTML = `<strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small>`;
  return pill;
}

function renderSourceSwitch(release) {
  if (!els.sourceSwitch) return;
  els.sourceSwitch.innerHTML = "";
  const sources = buildSourceList(release);
  if (!sources.length) {
    els.sourceSwitch.appendChild(createEmptyState("Источники пока недоступны."));
    return;
  }
  scheduleChunkRender(els.sourceSwitch, sources, createSourceNode, { batchSize: 2 });
}

function renderEpisodes(release) {
  if (!els.episodesList) return;
  els.episodesList.innerHTML = "";
  const source = getSourceById(release, state.currentSource) || getSourceById(release, getDefaultSourceId(release));
  const episodes = source?.episodes || [];
  if (!episodes.length) {
    els.episodesList.appendChild(
      createEmptyState(
        source?.kind === "iframe"
          ? "Серии выбираются прямо внутри этого плеера."
          : "У этого релиза пока нет опубликованных серий."
      )
    );
    return;
  }
  scheduleChunkRender(els.episodesList, episodes, createEpisodeNode, {
    batchSize: shouldPreferFastStart() ? 4 : 10,
    onComplete: () => {
      if (state.currentAnime?.alias === release.alias) {
        decorateEpisodeProgress(release);
      }
    }
  });
}

function renderVoices(release) {
  if (!els.voiceList) return;
  els.voiceList.innerHTML = "";
  const voices = release?.voices || [];
  if (!voices.length) {
    els.voiceList.appendChild(createEmptyState("Команда озвучки не указана."));
    return;
  }
  scheduleChunkRender(els.voiceList, voices, createVoiceNode, { batchSize: 6 });
}

function renderCrew(release) {
  if (!els.crewList) return;
  els.crewList.innerHTML = "";
  const crew = release?.crew || [];
  if (!crew.length) {
    els.crewList.appendChild(createEmptyState("Команда релиза не указана."));
    return;
  }
  scheduleChunkRender(els.crewList, crew, createCrewNode, { batchSize: 6 });
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
    bindPosterFallback(els.detailPoster, release, {
      initialSrc: release.poster,
      placeholder: "/mc-icon-512.png?v=5"
    });
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
        readAdminHeroAlias() === release.alias ? "Локальный баннер выбран" : "Закрепить как локальный баннер";
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
  if (!getSourceById(release, state.currentSource)) {
    state.currentSource = getDefaultSourceId(release);
  }
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

  const fallbackSourceId = getDefaultSourceId(state.currentAnime);
  const nextSource = options.preserveSource ? state.currentSource : fallbackSourceId;
  const source = getSourceById(state.currentAnime, nextSource) || getSourceById(state.currentAnime, fallbackSourceId);
  const sameEpisode =
    state.currentEpisode?.id === episode.id &&
    state.currentSource === (source?.id || nextSource) &&
    !options.forceReload;

  if (sameEpisode) {
    syncRenderedEpisodeState();
    syncRenderedSourceState();
    return;
  }

  if (!options.preserveSource) {
    state.currentSource = source?.id || fallbackSourceId;
  }

  state.currentEpisode = episode;
  const selectionToken = `${episode.id || episode.ordinal || "episode"}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
  state.playerSelectionToken = selectionToken;

  syncRenderedEpisodeState();
  syncRenderedSourceState();
  els.playerTitle.textContent = `${episode.ordinal ? `${episode.ordinal} серия` : "Фильм"}${
    episode.name ? ` • ${episode.name}` : ""
  }`;
  window.dispatchEvent(
    new CustomEvent("animecloud:episode-selected", {
      detail: { release: state.currentAnime, episode, sourceId: state.currentSource }
    })
  );

  if (source?.kind === "iframe" || source?.kind === "iframe-episodes" || episode?.externalUrl) {
    clearPlayerStartupTimer();
    destroyPlayer();
    els.qualitySwitch.innerHTML = "";
    showExternalSurface(episode.externalUrl || source?.externalUrl || state.currentAnime.externalPlayer);
    els.playerNote.textContent =
      source?.kind === "iframe-episodes"
        ? "Эта озвучка открыта во встроенном внешнем плеере. Серии и качество задаются там."
        : "Этот источник открывается во встроенном внешнем плеере.";
    return;
  }

  showVideoSurface();
  stopExternalPlayer();

  const qualities = renderQualityButtons(episode);
  const selected = qualities.find((quality) => quality.key === state.currentQuality) || qualities[0];

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
  const source = getSourceById(state.currentAnime, sourceId);
  if (!source) return;

  state.currentSource = sourceId;
  syncRenderedSourceState();
  renderEpisodes(state.currentAnime);

  window.dispatchEvent(
    new CustomEvent("animecloud:source-changed", {
      detail: { release: state.currentAnime, sourceId }
    })
  );

  if (source.kind === "iframe" && !source.episodes.length && source.externalUrl) {
    showExternalSurface(source.externalUrl);
    els.qualitySwitch.innerHTML = "";
    els.playerTitle.textContent = source.title;
    els.playerNote.textContent = source.note || "Этот источник открывается во встроенном внешнем плеере.";
    return;
  }

  const nextEpisode = findBestEpisodeForSource(source, state.currentEpisode);
  if (nextEpisode) {
    selectEpisode(nextEpisode, { preserveSource: true, forceReload: true }).catch(console.error);
    return;
  }

  destroyPlayer();
  stopExternalPlayer();
  els.qualitySwitch.innerHTML = "";
  els.playerTitle.textContent = source.title;
  els.playerNote.textContent =
    source.kind === "iframe"
      ? "Серии выбираются внутри этого плеера."
      : "Для этого источника пока нет опубликованных эпизодов.";
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
      state.currentSource = getDefaultSourceId(preview);
      state.playerSelectionToken = "";
      openDrawer();
      requestAnimationFrame(() => {
        if (state.currentAnime?.alias === preview.alias) {
          renderDetails(preview, { deferHeavy: true });
        }
      });
      if (updateHistory) {
        navigateTo(getAnimePath(alias));
      }
    }

    const kodikPayload = await fetchKodikRelease(preview || { alias, kodikIdentity: guessKodikIdentityFromAlias(alias) }).catch(() => null);
    if (!kodikPayload && !preview) {
      throw new Error(`Kodik release not found: ${alias}`);
    }

    const release = kodikPayload ? buildRelease(kodikPayload) : normalizePreparedRelease(preview);

    state.currentAnime = release;
    state.currentEpisode = null;
    state.currentQuality = "auto";
    state.currentSource = getDefaultSourceId(release);
    state.playerSelectionToken = "";

    openDrawer();
    requestAnimationFrame(() => {
      if (state.currentAnime?.alias === release.alias) {
        renderDetails(release, { deferHeavy: true });
      }
    });

    if (updateHistory) {
      navigateTo(getAnimePath(alias));
    }

    window.dispatchEvent(new CustomEvent("animecloud:release-opened", { detail: { release } }));

    const defaultSource = getSourceById(release, state.currentSource) || getSourceById(release, getDefaultSourceId(release));
    const defaultEpisode = findBestEpisodeForSource(defaultSource, release.episodes?.[0] || null);

    if (defaultEpisode) {
      await afterNextPaint();
      if (state.currentAnime?.alias === release.alias) {
        selectEpisode(defaultEpisode, { preserveSource: true }).catch(console.error);
      }
      return release;
    }

    if (defaultSource?.externalUrl || release.externalPlayer) {
      await afterNextPaint();
      if (state.currentAnime?.alias === release.alias) {
        switchSource(defaultSource?.id || "external");
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
  state.voiceOptions = [];
  state.catalogGenres = [];
  state.personalizedKey = "";
  state.personalizedRecommendations = [];
  state.personalizedGenres = [];
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
    await loadContentStats(true);
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
    await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
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
  const resolvedView = known ? nextView : "home";
  const searchQuery = resolvedView === "search" ? String(route.query || "").trim() : "";

  setView(resolvedView, {
    updateHistory: false,
    focusSearch: !searchQuery
  });

  if (resolvedView === "search") {
    if (els.searchInput && els.searchInput.value !== searchQuery) {
      els.searchInput.value = searchQuery;
    }
    if (searchQuery) {
      runSearch(searchQuery, {
        updateHistory: false,
        focusSearch: false,
        replaceHistory: true
      }).catch(console.error);
    } else {
      state.searchQuery = "";
      state.searchResults = [];
      renderSearchEmpty();
    }
  }
}

function setShareButtonFeedback(label, timeout = 1600) {
  const button = els.detailShareBtn;
  if (!button) return;
  button.textContent = label;
  if (state.shareFeedbackTimer) {
    clearTimeout(state.shareFeedbackTimer);
  }
  state.shareFeedbackTimer = setTimeout(() => {
    button.textContent = "Поделиться";
    state.shareFeedbackTimer = 0;
  }, timeout);
}

async function copyTextFallback(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.className = "copy-buffer";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    textarea.remove();
  }
  if (!success) {
    window.prompt("Скопируйте ссылку на тайтл", value);
  }
  return success;
}

async function handleShareClick() {
  if (!state.currentAnime) return;
  const button = els.detailShareBtn;
  const url = `${location.origin}${getAnimePath(state.currentAnime.alias)}`;
  const shareData = {
    title: `${state.currentAnime.title} — AnimeCloud`,
    text: `Смотрите ${state.currentAnime.title} в AnimeCloud`,
    url
  };

  if (button) button.disabled = true;

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      setShareButtonFeedback("Ссылка отправлена");
      return;
    }

    await copyTextFallback(url);
    setShareButtonFeedback("Ссылка скопирована");
  } catch (error) {
    const code = String(error?.name || error?.code || "").toLowerCase();
    if (code.includes("abort")) {
      setShareButtonFeedback("Поделиться", 400);
      return;
    }

    try {
      await copyTextFallback(url);
      setShareButtonFeedback("Ссылка скопирована");
    } catch {
      setShareButtonFeedback("Не удалось поделиться");
    }
  } finally {
    if (button) button.disabled = false;
  }
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

function setLoadMoreButtonLoading(button, loading) {
  if (!button) return;
  if (!button.dataset.labelDefault) {
    button.dataset.labelDefault = button.textContent.trim() || "Показать ещё";
  }

  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", loading ? "true" : "false");
  button.textContent = loading ? "Загружаем ещё…" : button.dataset.labelDefault;
}

function bindLoadMoreButton(button, action) {
  if (!button) return;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.blur?.();
    setLoadMoreButtonLoading(button, true);
    try {
      await action();
    } catch (error) {
      console.error(error);
    } finally {
      setLoadMoreButtonLoading(button, false);
    }
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
  bindLoadMoreButton(els.catalogMoreBtn, () => loadCatalog({ reset: false }));
  bindLoadMoreButton(els.ongoingMoreBtn, () => loadOngoing({ reset: false }));
  bindLoadMoreButton(els.topMoreBtn, () => loadTop({ reset: false }));

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
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch(console.error);
  });
  els.catalogVoice?.addEventListener("change", () => {
    state.catalogVoice = els.catalogVoice.value;
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch(console.error);
  });
  els.profileRecommendationsRefreshBtn?.addEventListener("click", () => {
    loadPersonalRecommendations({ force: true }).catch(console.error);
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
    els.detailAdminPinBtn.textContent = "Локальный баннер выбран";
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
    scheduleProgressUiRefresh();
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
    if (isActiveVideoSource() && !els.player.hidden && els.player.readyState < 2) {
      els.playerNote.textContent = "Буферизуем поток…";
    }
  });
  els.player?.addEventListener("error", () => {
    clearPlayerStartupTimer();
    if (isActiveVideoSource()) {
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
      await loadContentStats();
      await loadHome();
      updateStats();
    }

    handleRoute();

    safeIdle(() => {
      if (!shouldLoadHomeNow) {
        loadHome()
          .then(() => updateStats())
          .catch(() => {});
        loadContentStats().catch(() => {});
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
