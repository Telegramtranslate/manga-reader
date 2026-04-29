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
const EPISODE_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE = 260;
const RENDER_BATCH_SIZE = 8;
const VOICE_FILTER_PREFETCH_PAGES = 3;
const CATALOG_VOICE_FILTER_CACHE_LIMIT = 12;
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
const catalogVoiceFilterCache = new Map();

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
  catalogFilterAliasSet: new Set(),
  catalogFilterPageCache: new Map(),
  catalogFilterCursor: 0,
  catalogFilterExhausted: false,
  catalogFilterTotalMatches: 0,
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
  personalizedRequestToken: "",
  detailRenderToken: "",
  releaseOpenAlias: "",
  releaseOpenPromise: null,
  playerSelectionToken: "",
  hlsRecoveryTried: false,
  playerStartupTimer: null,
  externalPlayerAssistTimer: null,
  externalPlayerUrl: "",
  scrollPerfTimer: 0,
  installPromptEvent: null,
  progressUiFrame: 0,
  shareFeedbackTimer: 0,
  catalogRequestToken: "",
  catalogLoading: false,
  notifications: [],
  notificationSyncTimer: 0,
  notificationSyncInFlight: null,
  notificationPrimed: false,
  notificationLiveStop: null,
  notificationKnownIds: new Set(),
  notificationDismissedIds: new Set(),
  notificationPopoverOpen: false,
  quickMenuOpen: false,
  catalogFiltersOpen: false
};

const els = {
  tabs: [...document.querySelectorAll(".tab-btn[data-view]")],
  mobileTabs: [...document.querySelectorAll(".mobile-nav__btn[data-view]")],
  panels: [...document.querySelectorAll("[data-view-panel]")],
  brandBtn: document.getElementById("brand-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  installBtn: document.getElementById("install-btn"),
  searchInput: document.getElementById("search-input"),
  authOpenBtn: document.getElementById("auth-open-btn"),
  userMenu: document.getElementById("user-menu"),
  userChip: document.getElementById("user-chip"),
  logoutBtn: document.getElementById("logout-btn"),
  quickMenuBtn: document.getElementById("quick-menu-btn"),
  quickMenu: document.getElementById("quick-menu"),
  quickMenuAccountBtn: document.getElementById("quick-menu-account-btn"),
  quickMenuProfileBtn: document.getElementById("quick-menu-profile-btn"),
  quickMenuLoginBtn: document.getElementById("quick-menu-login-btn"),
  quickMenuLogoutBtn: document.getElementById("quick-menu-logout-btn"),
  heroCard: document.getElementById("hero-card"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroMeta: document.getElementById("hero-meta"),
  heroPoster: document.getElementById("hero-poster"),
  heroOpenBtn: document.getElementById("hero-open-btn"),
  heroRandomBtn: document.getElementById("hero-random-btn"),
  heroDots: document.getElementById("hero-dots"),
  notificationBtn: document.getElementById("notification-btn"),
  notificationBadge: document.getElementById("notification-badge"),
  notificationPopover: document.getElementById("notification-popover"),
  notificationPopoverSummary: document.getElementById("notification-popover-summary"),
  notificationPopoverList: document.getElementById("notification-popover-list"),
  notificationPopoverMarkAllBtn: document.getElementById("notification-popover-mark-all-btn"),
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
  profileNicknameForm: document.getElementById("profile-nickname-form"),
  profileNicknameInput: document.getElementById("profile-nickname-input"),
  profileNicknameStatus: document.getElementById("profile-nickname-status"),
  favoritesCount: document.getElementById("favorites-count"),
  favoritesMode: document.getElementById("favorites-mode"),
  notificationsSummary: document.getElementById("notifications-summary"),
  notificationsList: document.getElementById("notifications-list"),
  notificationsMarkAllBtn: document.getElementById("notifications-mark-all-btn"),
  adminPanel: document.getElementById("admin-panel"),
  adminNote: document.getElementById("admin-note"),
  adminRefreshBtn: document.getElementById("admin-refresh-btn"),
  adminClearCacheBtn: document.getElementById("admin-clear-cache-btn"),
  adminClearCommentsBtn: document.getElementById("admin-clear-comments-btn"),
  adminClearProgressBtn: document.getElementById("admin-clear-progress-btn"),
  catalogLayout: document.getElementById("catalog-layout"),
  catalogFiltersToggleBtn: document.getElementById("catalog-filters-toggle"),
  catalogFiltersPanel: document.getElementById("catalog-filters-panel"),
  catalogFiltersCloseBtn: document.getElementById("catalog-filters-close"),
  catalogSort: document.getElementById("catalog-sort"),
  catalogType: document.getElementById("catalog-type"),
  catalogGenre: document.getElementById("catalog-genre"),
  catalogVoice: document.getElementById("catalog-voice"),
  catalogGenreChips: document.getElementById("catalog-genre-chips"),
  catalogPrevBtn: document.getElementById("catalog-prev-btn"),
  catalogPageLabel: document.getElementById("catalog-page-label"),
  catalogNextBtn: document.getElementById("catalog-next-btn"),
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
  externalPlayerActions: document.getElementById("external-player-actions"),
  externalPlayerOpenBtn: document.getElementById("external-player-open-btn"),
  externalPlayerRetryBtn: document.getElementById("external-player-retry-btn"),
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
  homePanel: document.querySelector('[data-view-panel="home"]'),
  toastViewport: document.getElementById("toast-viewport")
};

const STATIC_UI_TEXT = Object.freeze({
  homeStats: [
    "релизов в базе",
    "тайтлов в каталоге",
    "онгоингов",
    "в рейтинге"
  ],
  topTabs: {
    home: "Главная",
    catalog: "Каталог",
    ongoing: "Онгоинги",
    top: "Топ",
    schedule: "Расписание",
    search: "Поиск",
    profile: "Профиль"
  },
  mobileTabs: {
    home: "Главная",
    catalog: "Каталог",
    top: "Топ",
    schedule: "Расписание",
    search: "Поиск"
  },
  topbar: {
    searchLabel: "Поиск по AnimeCloud",
    searchPlaceholder: "Например: Naruto, Bleach, Dorohedoro",
    refresh: "Обновить",
    install: "Установить",
    login: "Войти",
    logout: "Выйти",
    notificationSummary: "Новые серии и новые тайтлы появятся здесь.",
    notificationMarkAll: "Прочитать всё"
  },
  continueKicker: "Продолжить",
  continueTitle: "Продолжить просмотр",
  continueSummary: "Открывайте серии с того места, где остановились.",
  latestKicker: "Лента",
  latestTitle: "Последние релизы",
  latestSummary: "Свежие серии и обновления, которые сейчас выходят быстрее всего.",
  recommendedKicker: "Подборка",
  recommendedTitle: "Что посмотреть сегодня",
  recommendedSummary: "Рекомендации для вечернего просмотра без перегруженного интерфейса.",
  popularKicker: "Топ",
  popularTitle: "Популярное сейчас",
  popularSummary: "Тайтлы, которые чаще всего открывают и добавляют в избранное.",
  catalog: {
    kicker: "Полная база",
    title: "Каталог AnimeCloud",
    summary: "Загружаем каталог…",
    sort: "Сортировка",
    format: "Формат",
    genre: "Жанр",
    allFormats: "Все форматы",
    allGenres: "Все жанры",
    pagerAria: "Навигация по страницам каталога",
    prev: "Назад",
    next: "Вперёд",
    page: "Страница 1"
  },
  ongoing: {
    kicker: "Прямо сейчас",
    title: "Онгоинги",
    summary: "Загружаем онгоинги…"
  },
  top: {
    kicker: "Рейтинг",
    title: "Топ аниме",
    summary: "Загружаем топ каталога…"
  },
  schedule: {
    kicker: "Недельный план",
    title: "Расписание выхода",
    summary: "Компактный список по дням недели без тяжёлого рендера и лишней анимации."
  },
  search: {
    kicker: "Поиск",
    title: "Результаты",
    summary: "Введите название сверху, чтобы открыть нужный релиз."
  },
  profile: {
    kicker: "Профиль",
    title: "Избранное и история входа",
    summary: "Войдите, чтобы хранить свою коллекцию отдельно. Без входа избранное сохранится только в этом браузере.",
    account: "Аккаунт",
    collection: "Коллекция",
    favorites: "в избранном",
    storageMode: "режим хранения",
    historyKicker: "История",
    historyTitle: "Продолжить просмотр",
    historySummary: "Ваша история просмотра, быстрый возврат к серии и ручная очистка.",
    shelfKicker: "Мои списки",
    watching: "Смотрю",
    planned: "Запланировано",
    completed: "Просмотрено",
    paused: "Отложено",
    quickAccess: "Быстрый доступ",
    favoritesTitle: "Избранное",
    notificationsKicker: "Обновления",
    notificationsTitle: "Уведомления",
    notificationsSummary: "Войдите, чтобы получать облачные уведомления о новых тайтлах и сериях.",
    notificationsMarkAll: "Отметить всё прочитанным"
  },
  drawer: {
    close: "Закрыть",
    posterAlt: "Постер выбранного тайтла",
    kicker: "Карточка релиза",
    emptyTitle: "Выберите тайтл",
    emptyDescription: "Откройте любое аниме, чтобы увидеть описание, серии и встроенный плеер.",
    favorite: "В избранное",
    share: "Поделиться",
    adminPin: "Закрепить как локальный баннер",
    watch: "Смотрю",
    plan: "Запланировано",
    complete: "Просмотрено",
    pause: "Отложено",
    playerKicker: "Плеер",
    playerTitle: "Серия не выбрана",
    sourceLabel: "Озвучка и источник",
    playerNote: "Выберите релиз и серию выше.",
    openExternal: "Открыть источник напрямую",
    retryExternal: "Попробовать ещё раз",
    resumeLabel: "Продолжить просмотр",
    resumeEmpty: "Прогресс пока не сохранён.",
    resumeButton: "Продолжить",
    dubsLabel: "Доп. озвучки",
    dubNote: "Дополнительные озвучки выбираются во внешнем плеере, если источник их реально отдаёт.",
    episodesLabel: "Серии",
    crewLabel: "Команда релиза"
  },
  comments: {
    kicker: "Обсуждение",
    title: "Комментарии",
    summary: "Комментарии и история пока сохраняются локально в этом браузере. Вход нужен для разделения профилей и имени автора.",
    placeholder: "Напишите комментарий по тайтлу или текущей серии…",
    guest: "Комментируете как гость",
    submit: "Отправить"
  },
  auth: {
    close: "Закрыть",
    kicker: "Аккаунт",
    title: "Вход и регистрация",
    copy: "Почта нужна для вашего профиля, а Google-вход работает через проект авторизации этого сайта.",
    googleNote: "Google-вход инициализируется…",
    loginTab: "Вход",
    registerTab: "Регистрация"
  }
});

const customSelectControllers = new WeakMap();
let activeCustomSelect = null;

function ensureDynamicInterface() {
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

  const profileMeta = document.querySelector(".profile-user__meta");
  if (profileMeta && !document.getElementById("profile-nickname-form")) {
    const nicknameForm = document.createElement("form");
    nicknameForm.className = "profile-nickname";
    nicknameForm.id = "profile-nickname-form";
    nicknameForm.hidden = true;
    nicknameForm.innerHTML = `
      <label for="profile-nickname-input">Ник на сайте</label>
      <div class="profile-nickname__row">
        <input id="profile-nickname-input" type="text" name="displayName" maxlength="32" autocomplete="nickname" placeholder="Например: Максим" />
        <button class="ghost-btn" type="submit">Сохранить</button>
      </div>
      <small id="profile-nickname-status" class="profile-nickname__status" aria-live="polite"></small>
    `;
    profileMeta.insertAdjacentElement("afterend", nicknameForm);
  }

  els.catalogVoice = document.getElementById("catalog-voice");
  els.profileNicknameForm = document.getElementById("profile-nickname-form");
  els.profileNicknameInput = document.getElementById("profile-nickname-input");
  els.profileNicknameStatus = document.getElementById("profile-nickname-status");
  els.profileRecommendationsShell = document.getElementById("profile-recommendations-shell");
  els.profileRecommendationsGrid = document.getElementById("profile-recommendations-grid");
  els.profileRecommendationsSummary = document.getElementById("profile-recommendations-summary");
  els.profileRecommendationsRefreshBtn = document.getElementById("profile-recommendations-refresh-btn");
}

ensureDynamicInterface();
mountFloatingUi();

function setStaticText(selector, text) {
  const node = document.querySelector(selector);
  if (node && node.textContent !== text) {
    node.textContent = text;
  }
}

function setStaticAttr(selector, attribute, value) {
  const node = document.querySelector(selector);
  if (node && node.getAttribute(attribute) !== value) {
    node.setAttribute(attribute, value);
  }
}

function mountFloatingUi() {
  const authSlot = document.querySelector(".auth-slot");
  if (authSlot && els.notificationBtn && authSlot !== els.notificationBtn.parentElement) {
    authSlot.insertBefore(els.notificationBtn, els.userMenu || els.authOpenBtn?.nextSibling || null);
  }
  if (els.notificationPopover && els.notificationPopover.parentElement !== document.body) {
    document.body.appendChild(els.notificationPopover);
  }
  if (els.quickMenu && els.quickMenu.parentElement !== document.body) {
    document.body.appendChild(els.quickMenu);
  }
  document.getElementById("next-episode-btn")?.remove();
  document.getElementById("resume-clear-btn")?.remove();
  document.getElementById("rating-box")?.remove();
  document.getElementById("settings-autoplay-next")?.closest(".settings-toggle")?.remove();
  const sidePane = document.querySelector(".side-pane");
  if (sidePane) {
    sidePane.remove();
    els.crewList = null;
  }
  const sourceWrap = document.querySelector(".source-wrap");
  if (sourceWrap) {
    sourceWrap.remove();
    els.sourceSwitch = null;
  }
  const voiceBlock = document.querySelector(".voice-block");
  if (voiceBlock) {
    voiceBlock.remove();
    els.voiceList = null;
  }
  document.getElementById("dub-box")?.remove();
}

function repairStaticUiText() {
  const homeStatLabels = document.querySelectorAll(".stats-row--home .stat-card small");
  STATIC_UI_TEXT.homeStats.forEach((text, index) => {
    if (homeStatLabels[index] && homeStatLabels[index].textContent !== text) {
      homeStatLabels[index].textContent = text;
    }
  });

  setStaticText("#latest-shell .section-kicker", STATIC_UI_TEXT.latestKicker);
  setStaticText("#latest-shell h2", STATIC_UI_TEXT.latestTitle);
  setStaticText("#latest-shell .section-summary", STATIC_UI_TEXT.latestSummary);
  setStaticText("#continue-shell .section-kicker", STATIC_UI_TEXT.continueKicker);
  setStaticText("#continue-shell h2", STATIC_UI_TEXT.continueTitle);
  setStaticText("#continue-shell .section-summary", STATIC_UI_TEXT.continueSummary);
  setStaticText("#recommended-shell .section-kicker", STATIC_UI_TEXT.recommendedKicker);
  setStaticText("#recommended-shell h2", STATIC_UI_TEXT.recommendedTitle);
  setStaticText("#recommended-shell .section-summary", STATIC_UI_TEXT.recommendedSummary);
  setStaticText("#popular-shell .section-kicker", STATIC_UI_TEXT.popularKicker);
  setStaticText("#popular-shell h2", STATIC_UI_TEXT.popularTitle);
  setStaticText("#popular-shell .section-summary", STATIC_UI_TEXT.popularSummary);
  setStaticText('[data-view="home"]', STATIC_UI_TEXT.topTabs.home);
  setStaticText('[data-view="catalog"]', STATIC_UI_TEXT.topTabs.catalog);
  setStaticText('[data-view="ongoing"]', STATIC_UI_TEXT.topTabs.ongoing);
  setStaticText('[data-view="top"]', STATIC_UI_TEXT.topTabs.top);
  setStaticText('[data-view="schedule"]', STATIC_UI_TEXT.topTabs.schedule);
  setStaticText('[data-view="search"]', STATIC_UI_TEXT.topTabs.search);
  setStaticText('[data-view="profile"]', STATIC_UI_TEXT.topTabs.profile);
  setStaticText('.mobile-nav__btn[data-view="home"]', STATIC_UI_TEXT.mobileTabs.home);
  setStaticText('.mobile-nav__btn[data-view="catalog"]', STATIC_UI_TEXT.mobileTabs.catalog);
  setStaticText('.mobile-nav__btn[data-view="top"]', STATIC_UI_TEXT.mobileTabs.top);
  setStaticText('.mobile-nav__btn[data-view="schedule"]', STATIC_UI_TEXT.mobileTabs.schedule);
  setStaticText('.mobile-nav__btn[data-view="search"]', STATIC_UI_TEXT.mobileTabs.search);
  setStaticText(".search-box__label", STATIC_UI_TEXT.topbar.searchLabel);
  setStaticAttr("#search-input", "placeholder", STATIC_UI_TEXT.topbar.searchPlaceholder);
  setStaticText("#auth-open-btn", STATIC_UI_TEXT.topbar.login);
  setStaticText("#logout-btn", STATIC_UI_TEXT.topbar.logout);
  setStaticText("#quick-menu-login-btn .quick-menu__item-title", STATIC_UI_TEXT.topbar.login);
  setStaticText("#quick-menu-logout-btn .quick-menu__item-title", STATIC_UI_TEXT.topbar.logout);
  setStaticText("#notification-popover-summary", STATIC_UI_TEXT.topbar.notificationSummary);
  setStaticText("#notification-popover-mark-all-btn", STATIC_UI_TEXT.topbar.notificationMarkAll);
  setStaticText("#catalog-summary", STATIC_UI_TEXT.catalog.summary);
  setStaticText('[data-view-panel="catalog"] .section-kicker', STATIC_UI_TEXT.catalog.kicker);
  setStaticText('[data-view-panel="catalog"] h2', STATIC_UI_TEXT.catalog.title);
  setStaticText('.select-control span', STATIC_UI_TEXT.catalog.sort);
  setStaticText('.select-control + .select-control span', STATIC_UI_TEXT.catalog.format);
  setStaticText('.select-control + .select-control + .select-control span', STATIC_UI_TEXT.catalog.genre);
  setStaticAttr(".pager-wrap", "aria-label", STATIC_UI_TEXT.catalog.pagerAria);
  setStaticText("#catalog-prev-btn", STATIC_UI_TEXT.catalog.prev);
  setStaticText("#catalog-next-btn", STATIC_UI_TEXT.catalog.next);
  setStaticText("#catalog-page-label", STATIC_UI_TEXT.catalog.page);
  setStaticText('[data-view-panel="ongoing"] .section-kicker', STATIC_UI_TEXT.ongoing.kicker);
  setStaticText('[data-view-panel="ongoing"] h2', STATIC_UI_TEXT.ongoing.title);
  setStaticText("#ongoing-summary", STATIC_UI_TEXT.ongoing.summary);
  setStaticText('[data-view-panel="top"] .section-kicker', STATIC_UI_TEXT.top.kicker);
  setStaticText('[data-view-panel="top"] h2', STATIC_UI_TEXT.top.title);
  setStaticText("#top-summary", STATIC_UI_TEXT.top.summary);
  setStaticText('[data-view-panel="schedule"] .section-kicker', STATIC_UI_TEXT.schedule.kicker);
  setStaticText('[data-view-panel="schedule"] h2', STATIC_UI_TEXT.schedule.title);
  setStaticText("#schedule-summary", STATIC_UI_TEXT.schedule.summary);
  setStaticText('[data-view-panel="search"] .section-kicker', STATIC_UI_TEXT.search.kicker);
  setStaticText('[data-view-panel="search"] h2', STATIC_UI_TEXT.search.title);
  setStaticText("#search-summary", STATIC_UI_TEXT.search.summary);
  setStaticText('[data-view-panel="profile"] .section-kicker', STATIC_UI_TEXT.profile.kicker);
  setStaticText('[data-view-panel="profile"] h2', STATIC_UI_TEXT.profile.title);
  setStaticText("#profile-summary", STATIC_UI_TEXT.profile.summary);
  setStaticText("#notifications-summary", STATIC_UI_TEXT.profile.notificationsSummary);
  setStaticText("#notifications-mark-all-btn", STATIC_UI_TEXT.profile.notificationsMarkAll);
  setStaticText("#profile-progress-summary", STATIC_UI_TEXT.profile.historySummary);
  setStaticText("#drawer-close", "×");
  const drawerCloseButton = document.getElementById("drawer-close");
  if (drawerCloseButton) {
    drawerCloseButton.innerHTML = '<span class="drawer-close__icon" aria-hidden="true"></span>';
  }
  setStaticAttr("#drawer-close", "aria-label", STATIC_UI_TEXT.drawer.close);
  setStaticAttr("#detail-poster", "alt", STATIC_UI_TEXT.drawer.posterAlt);
  setStaticText(".detail-hero .section-kicker", STATIC_UI_TEXT.drawer.kicker);
  setStaticText("#detail-title", STATIC_UI_TEXT.drawer.emptyTitle);
  setStaticText("#detail-description", STATIC_UI_TEXT.drawer.emptyDescription);
  setStaticText("#detail-favorite-btn", STATIC_UI_TEXT.drawer.favorite);
  setStaticText("#detail-share-btn", STATIC_UI_TEXT.drawer.share);
  setStaticText("#detail-admin-pin-btn", STATIC_UI_TEXT.drawer.adminPin);
  setStaticText("#list-watch-btn", STATIC_UI_TEXT.drawer.watch);
  setStaticText("#list-plan-btn", STATIC_UI_TEXT.drawer.plan);
  setStaticText("#list-complete-btn", STATIC_UI_TEXT.drawer.complete);
  setStaticText("#list-pause-btn", STATIC_UI_TEXT.drawer.pause);
  setStaticText(".player-toolbar .section-kicker", STATIC_UI_TEXT.drawer.playerKicker);
  setStaticText("#player-title", STATIC_UI_TEXT.drawer.playerTitle);
  setStaticText("#player-note", STATIC_UI_TEXT.drawer.playerNote);
  setStaticText("#external-player-open-btn", STATIC_UI_TEXT.drawer.openExternal);
  setStaticText("#external-player-retry-btn", STATIC_UI_TEXT.drawer.retryExternal);
  setStaticText("#resume-box .detail-label", STATIC_UI_TEXT.drawer.resumeLabel);
  setStaticText("#resume-text", STATIC_UI_TEXT.drawer.resumeEmpty);
  setStaticText("#resume-btn", STATIC_UI_TEXT.drawer.resumeButton);
  setStaticText(".side-card .detail-label", STATIC_UI_TEXT.drawer.episodesLabel);
  setStaticText(".side-card + .side-card .detail-label", STATIC_UI_TEXT.drawer.crewLabel);
  setStaticText(".comments-card .section-kicker", STATIC_UI_TEXT.comments.kicker);
  setStaticText(".comments-card h2", STATIC_UI_TEXT.comments.title);
  setStaticText("#comments-summary", STATIC_UI_TEXT.comments.summary);
  setStaticAttr("#comment-input", "placeholder", STATIC_UI_TEXT.comments.placeholder);
  setStaticText("#comment-user", STATIC_UI_TEXT.comments.guest);
  setStaticText("#comment-submit", STATIC_UI_TEXT.comments.submit);
  setStaticAttr("#auth-close", "aria-label", STATIC_UI_TEXT.auth.close);
  setStaticText(".auth-modal__copy .section-kicker", STATIC_UI_TEXT.auth.kicker);
  setStaticText("#auth-title", STATIC_UI_TEXT.auth.title);
  setStaticText("#auth-copy", STATIC_UI_TEXT.auth.copy);
  setStaticText("#google-auth-note", STATIC_UI_TEXT.auth.googleNote);
  setStaticText('.auth-tab[data-auth-tab="login"]', STATIC_UI_TEXT.auth.loginTab);
  setStaticText('.auth-tab[data-auth-tab="register"]', STATIC_UI_TEXT.auth.registerTab);

  const notificationIcon = document.querySelector(".notification-btn__icon");
  if (notificationIcon && notificationIcon.textContent !== "🔔") {
    notificationIcon.textContent = "🔔";
  }
  const notificationText = document.querySelector(".notification-btn__text");
  if (notificationText && notificationText.textContent !== "Уведомления") {
    notificationText.textContent = "Уведомления";
  }
}

function ensureCustomSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return null;
  const wrapper = select.closest(".select-control");
  if (!(wrapper instanceof HTMLElement)) return null;

  let controller = customSelectControllers.get(select);
  if (controller) return controller;

  wrapper.classList.add("select-control--enhanced");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-control__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const value = document.createElement("span");
  value.className = "select-control__value";

  const caret = document.createElement("span");
  caret.className = "select-control__caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "⌄";

  trigger.append(value, caret);

  const menu = document.createElement("div");
  menu.className = "select-control__menu";
  menu.hidden = true;

  select.insertAdjacentElement("afterend", trigger);
  trigger.insertAdjacentElement("afterend", menu);

  controller = { select, wrapper, trigger, value, menu };
  customSelectControllers.set(select, controller);

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (activeCustomSelect === controller) {
      closeCustomSelect(controller);
      return;
    }
    openCustomSelect(controller);
  });

  menu.addEventListener("click", (event) => {
    const optionButton = event.target instanceof HTMLElement ? event.target.closest(".select-control__option") : null;
    if (!(optionButton instanceof HTMLButtonElement)) return;
    const nextValue = optionButton.dataset.value ?? "";
    if (select.value !== nextValue) {
      select.value = nextValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      syncCustomSelect(controller);
    }
    closeCustomSelect(controller);
  });

  select.addEventListener("change", () => {
    syncCustomSelect(controller);
  });

  syncCustomSelect(controller);
  return controller;
}

function destroyCustomSelect(select) {
  const controller = customSelectControllers.get(select);
  if (!controller) return;

  if (activeCustomSelect === controller) {
    activeCustomSelect = null;
  }

  controller.trigger.remove();
  controller.menu.remove();
  controller.wrapper.classList.remove("select-control--enhanced", "is-open");
  customSelectControllers.delete(select);
}

function syncCustomSelect(controller) {
  if (!controller) return;
  const selectedOption = controller.select.options[controller.select.selectedIndex] || controller.select.options[0];
  controller.value.textContent = selectedOption?.textContent?.trim() || "Выбрать";
  controller.trigger.setAttribute("aria-label", `${controller.wrapper.querySelector("span")?.textContent || "Поле"}: ${controller.value.textContent}`);
  renderCustomSelectOptions(controller);
}

function renderCustomSelectOptions(controller) {
  if (!controller) return;
  const fragment = document.createDocumentFragment();
  [...controller.select.options].forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `select-control__option${option.selected ? " is-active" : ""}`;
    button.dataset.value = option.value;
    button.textContent = option.textContent?.trim() || option.value || "Без названия";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", option.selected ? "true" : "false");
    if (option.disabled) {
      button.disabled = true;
    }
    fragment.appendChild(button);
  });
  controller.menu.replaceChildren(fragment);
}

function closeCustomSelect(controller = activeCustomSelect) {
  if (!controller) return;
  controller.wrapper.classList.remove("is-open");
  controller.menu.hidden = true;
  controller.trigger.setAttribute("aria-expanded", "false");
  if (activeCustomSelect === controller) {
    activeCustomSelect = null;
  }
}

function openCustomSelect(controller) {
  if (!controller) return;
  if (activeCustomSelect && activeCustomSelect !== controller) {
    closeCustomSelect(activeCustomSelect);
  }
  renderCustomSelectOptions(controller);
  controller.wrapper.classList.add("is-open");
  controller.menu.hidden = false;
  controller.trigger.setAttribute("aria-expanded", "true");
  activeCustomSelect = controller;
}

function refreshCustomCatalogSelects() {
  [els.catalogSort, els.catalogType, els.catalogGenre].forEach((select) => {
    if (select instanceof HTMLSelectElement) {
      ensureCustomSelect(select);
    }
  });
}

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value || 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uniqueStrings = (values = []) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
const EXCLUDED_GENRE_KEYS = new Set(["\u0430\u043d\u0438\u043c\u0435"]);
const CLIENT_ONLY_CATALOG_GENRE_KEYS = new Set([
  "\u043a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043a\u0430",
  "\u043a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043d\u043e\u0435",
  "\u043a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043d\u044b\u0439"
]);
const GENRE_LABEL_ALIASES = new Map([
  ["\u0431\u043e\u0435\u0432\u0438\u043a", "\u042d\u043a\u0448\u0435\u043d"],
  ["\u0432\u043e\u0435\u043d\u043d\u044b\u0439", "\u0412\u043e\u0435\u043d\u043d\u043e\u0435"],
  ["\u043a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043d\u043e\u0435", "\u041a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043a\u0430"],
  ["\u043a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043d\u044b\u0439", "\u041a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043a\u0430"],
  ["short", "\u041a\u043e\u0440\u043e\u0442\u043a\u043e\u043c\u0435\u0442\u0440\u0430\u0436\u043a\u0430"],
  ["\u0434\u0437\u0435\u0441\u0435\u0439", "\u0414\u0437\u0451\u0441\u044d\u0439"],
  ["\u0434\u0437\u0435\u0441\u044d\u0439", "\u0414\u0437\u0451\u0441\u044d\u0439"],
  ["\u0434\u0437\u0451\u0441\u0435\u0439", "\u0414\u0437\u0451\u0441\u044d\u0439"],
  ["\u0434\u0437\u0451\u0441\u044d\u0439", "\u0414\u0437\u0451\u0441\u044d\u0439"],
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
  ["исекай", "Исекай"],
  ["исэкай", "Исекай"],
  ["isekai", "Исекай"],
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

const apiClient = window.ANIMECLOUD_API_CLIENT.createApiClient({
  responseCache,
  requestCache,
  location: window.location,
  history: window.history,
  fetchImpl: window.fetch.bind(window),
  imageProxyBase: IMAGE_PROXY_BASE,
  siteUrlBase: SITE_URL,
  apiTimeoutMs: API_TIMEOUT_MS,
  apiRetryAttempts: API_RETRY_ATTEMPTS,
  apiRetryBaseDelay: API_RETRY_BASE_DELAY
});
const {
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
} = apiClient;

const seoRuntime = window.ANIMECLOUD_SEO.createSeoRuntime({
  els,
  siteUrl,
  getViewPath,
  getAnimePath,
  defaultSeoTitle: DEFAULT_SEO_TITLE,
  defaultSeoDescription: DEFAULT_SEO_DESCRIPTION,
  defaultImagePath: "/mc-icon-512.png?v=5",
  viewSeo: VIEW_SEO
});
const {
  truncateSeoText,
  buildStructuredData,
  buildReleaseStructuredData,
  applySeo,
  updateViewSeo,
  updateReleaseSeo
} = seoRuntime;

const { applyContentStats, getHomeStats } = window.ANIMECLOUD_STATS;
const shouldPreferFastStart = () =>
  window.ANIMECLOUD_PLAYER_UTILS.shouldPreferFastStart({
    navigator: window.navigator,
    matchMedia: window.matchMedia?.bind(window)
  });
const pickPreferredQuality = (options) =>
  window.ANIMECLOUD_PLAYER_UTILS.pickPreferredQuality(options, state.currentQuality, {
    navigator: window.navigator,
    matchMedia: window.matchMedia?.bind(window)
  });

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

function prettifyReleaseTitle(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) return "Без названия";

  const seasonMatch = safeValue.match(/^(.*?)(?:\s*[\[(](?:TV|ТВ)\s*[- ]?\s*(\d+)[\])])\s*$/iu);
  if (!seasonMatch) return safeValue;

  const baseTitle = String(seasonMatch[1] || "").trim();
  const seasonNumber = Number(seasonMatch[2] || 0);
  if (!baseTitle || !Number.isFinite(seasonNumber) || seasonNumber <= 0) {
    return safeValue;
  }

  return `${baseTitle} · ${seasonNumber} сезон`;
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
  const rawTitle = String(item?.title || "").trim() || "Без названия";
  const displayTitle = prettifyReleaseTitle(rawTitle);
  const rawOriginalTitle = String(item?.originalTitle || "").trim();
  const normalizedGenres = sanitizeReleaseGenres(
    Array.isArray(item?.genres) ? item.genres : [],
    [
      rawTitle,
      displayTitle,
      rawOriginalTitle,
      ...(Array.isArray(item?.alternateTitles) ? item.alternateTitles : [])
    ]
  );

  return {
    provider: String(item?.provider || "kodik"),
    providerSet: uniqueStrings(Array.isArray(item?.providerSet) ? item.providerSet : [item?.provider || "kodik"]),
    id: item?.id || item?.alias,
    alias: item?.alias || "",
    title: displayTitle,
    originalTitle: rawOriginalTitle,
    alternateTitles: uniqueStrings([
      rawTitle,
      displayTitle,
      rawOriginalTitle,
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
    description: buildReleaseDescription(item, normalizedGenres),
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
    genres: normalizedGenres,
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
    .replace(/[С‘]/g, "е")
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

    if (!current.includes("С‘") && label.includes("С‘")) {
      map.set(key, label);
      return;
    }

    if (current === current.toUpperCase() && label !== label.toUpperCase()) {
      map.set(key, label);
    }
  });

  return [...map.values()];
}

function isAllowedGenreLabel(value) {
  const key = normalizeGenreKey(value);
  return Boolean(key) && !EXCLUDED_GENRE_KEYS.has(key);
}

function sanitizeReleaseGenres(values = [], titleVariants = []) {
  const blockedKeys = new Set(
    uniqueStrings(Array.isArray(titleVariants) ? titleVariants : [titleVariants])
      .map(normalizeGenreKey)
      .filter(Boolean)
  );

  return normalizeGenreList(values).filter((label) => {
    const key = normalizeGenreKey(label);
    return key && !EXCLUDED_GENRE_KEYS.has(key) && !blockedKeys.has(key);
  });
}

function normalizeSelectedCatalogGenres(values = [], options = state.genreOptions) {
  const availableKeys = new Set();
  (options || []).forEach((option) => {
    const rawKey = normalizeGenreKey(option);
    const aliasKey = normalizeGenreKey(normalizeGenreLabel(option));
    if (rawKey) availableKeys.add(rawKey);
    if (aliasKey) availableKeys.add(aliasKey);
  });

  return normalizeGenreList(Array.isArray(values) ? values : [values]).filter((label) => {
    const key = normalizeGenreKey(label);
    return key && (availableKeys.has(key) || isClientOnlyCatalogGenre(label));
  });
}

function isClientOnlyCatalogGenre(value) {
  return CLIENT_ONLY_CATALOG_GENRE_KEYS.has(normalizeGenreKey(value));
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

function buildReleaseDescription(item = {}, genres = []) {
  const directDescription = String(item?.description || "").trim();
  if (directDescription) return directDescription;

  const normalizedGenres = normalizeGenreList(Array.isArray(genres) ? genres : []).filter(isAllowedGenreLabel);
  const summary = [
    String(item?.type || "").trim(),
    String(item?.year || "").trim() ? `${item.year} год` : "",
    normalizedGenres.length ? `Жанры: ${normalizedGenres.slice(0, 4).join(", ")}` : "",
    item?.ongoing ? "Сериал выходит." : ""
  ]
    .filter(Boolean)
    .join(". ");

  return summary || "Описание в источнике пока не указано.";
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
  const body = value.startsWith("kodik-") ? value.slice(6) : value;

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

  if (!value.startsWith("kodik-") && /^[a-z0-9-]+$/i.test(body)) {
    const title = body
      .split("-")
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!title) return null;
    return {
      title,
      year: "",
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
    ? `В истории: ${formatNumber(releases.length)}. Можно быстро вернуться к серии или удалить лишнее.`
    : "Когда начнёте смотреть аниме, здесь появится история просмотра.";

  if (els.continueSummary) els.continueSummary.textContent = summary;
  if (els.profileProgressSummary) els.profileProgressSummary.textContent = summary;

  updateGrid(els.profileProgressGrid, releases, "История просмотра пока пуста.", {
    cardOptions: {
      historyCard: true
    }
  });
}

async function removeProgressHistoryEntry(alias, title = "") {
  const safeAlias = String(alias || "").trim();
  if (!safeAlias) return;

  if (window.animeCloudWatchState?.removeProgress) {
    await window.animeCloudWatchState.removeProgress(safeAlias);
    renderContinueWatchingSections();
    createToast(
      "Удалено из истории",
      title ? `«${title}» убран из истории просмотра.` : "Тайтл убран из истории просмотра."
    );
    return;
  }

  const progressMap = { ...readProgressMap() };
  delete progressMap[safeAlias];
  try {
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(progressMap));
  } catch {}
  window.dispatchEvent(new CustomEvent("animecloud:progress-updated", { detail: { alias: safeAlias } }));
  renderContinueWatchingSections();
  createToast(
    "Удалено из истории",
    title ? `«${title}» убран из истории просмотра.` : "Тайтл убран из истории просмотра."
  );
}

function decorateHistoryCardControls(node, release) {
  if (!node || !release?.alias) return node;
  node.classList.add("anime-card--history");

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "anime-card__remove";
  removeButton.textContent = "Удалить";
  removeButton.dataset.historyAlias = release.alias;
  removeButton.dataset.historyTitle = release.title || "";
  removeButton.setAttribute("aria-label", `Удалить ${release.title} из истории`);
  removeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    removeProgressHistoryEntry(release.alias, release.title).catch(console.error);
  });

  let footer = node.querySelector(":scope > .anime-card__history-footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "anime-card__history-footer";
    node.appendChild(footer);
  }
  footer.replaceChildren(removeButton);
  return node;
}

function scheduleProgressUiRefresh() {
  if (state.progressUiFrame) {
    cancelAnimationFrame(state.progressUiFrame);
  }

  state.progressUiFrame = requestAnimationFrame(() => {
    state.progressUiFrame = 0;

    if (state.currentView === "profile") {
      renderProfile();
    }
    if (state.currentAnime) {
      decorateEpisodeProgress(state.currentAnime);
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
  const previousPrimaryGenre = state.catalogGenre;
  const previousExtraGenresKey = JSON.stringify(state.catalogGenres || []);
  const sorted = normalizeGenreList([
    ...state.genreOptions,
    ...(releases || []).flatMap((release) => release.genres || [])
  ])
    .filter(isAllowedGenreLabel)
    .sort((left, right) => left.localeCompare(right, "ru"));

  const normalizedSelectedGenres = normalizeSelectedCatalogGenres(
    [state.catalogGenre, ...(Array.isArray(state.catalogGenres) ? state.catalogGenres : [])],
    sorted
  );
  state.catalogGenre = normalizedSelectedGenres[0] || "";
  state.catalogGenres = normalizedSelectedGenres.slice(1);
  const selectionChanged =
    previousPrimaryGenre !== state.catalogGenre ||
    previousExtraGenresKey !== JSON.stringify(state.catalogGenres || []);
  if (
    !selectionChanged &&
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

function resetCatalogVoicePool(filterKey) {
  state.catalogFilterKey = filterKey;
  const cached = catalogVoiceFilterCache.get(filterKey);
  if (cached) {
    state.catalogFilterPool = Array.isArray(cached.pool) ? cached.pool.slice() : [];
    state.catalogFilterAliasSet = new Set(Array.isArray(cached.aliases) ? cached.aliases : []);
    state.catalogFilterPageCache = new Map(cached.pageCache || []);
    state.catalogFilterCursor = Number(cached.cursor || 0);
    state.catalogFilterExhausted = Boolean(cached.exhausted);
    state.catalogFilterTotalMatches = Number(cached.totalMatches || 0);
    catalogVoiceFilterCache.delete(filterKey);
    catalogVoiceFilterCache.set(filterKey, cached);
    return;
  }
  state.catalogFilterPool = [];
  state.catalogFilterAliasSet = new Set();
  state.catalogFilterPageCache = new Map();
  state.catalogFilterCursor = 0;
  state.catalogFilterExhausted = false;
  state.catalogFilterTotalMatches = 0;
}

function cacheCatalogVoicePoolState() {
  if (!state.catalogFilterKey) return;
  catalogVoiceFilterCache.set(state.catalogFilterKey, {
    pool: state.catalogFilterPool.slice(),
    aliases: [...state.catalogFilterAliasSet],
    pageCache: [...state.catalogFilterPageCache.entries()],
    cursor: state.catalogFilterCursor,
    exhausted: state.catalogFilterExhausted,
    totalMatches: state.catalogFilterTotalMatches
  });
  while (catalogVoiceFilterCache.size > CATALOG_VOICE_FILTER_CACHE_LIMIT) {
    const [oldestKey] = catalogVoiceFilterCache.keys();
    if (!oldestKey) break;
    catalogVoiceFilterCache.delete(oldestKey);
  }
}

function mergeUniqueAliases(list, extra = [], aliasSet = null) {
  const merged = Array.isArray(list) ? list : [];
  const seen = aliasSet || new Set(merged.map((release) => release?.alias).filter(Boolean));

  (Array.isArray(extra) ? extra : []).forEach((release) => {
    if (!release) return;
    const alias = String(release.alias || "").trim();
    if (alias && seen.has(alias)) return;
    if (alias) seen.add(alias);
    merged.push(release);
  });

  return merged;
}

function releaseMatchesCatalogDeepFilters(release, activeGenres = []) {
  if (!releaseMatchesCatalogTypeSelection(release, state.catalogType)) return false;
  if (activeGenres.length && !releaseMatchesGenres(release, activeGenres)) return false;
  if (state.catalogVoice && !releaseMatchesVoiceFilter(release, state.catalogVoice)) return false;
  return true;
}

async function fetchCatalogVoicePage(page, requestOptions, requestToken = "", activeGenres = []) {
  const safePage = Math.max(1, Number(page || 1));
  const cachedPage = state.catalogFilterPageCache.get(safePage);
  if (cachedPage) {
    return cachedPage;
  }
  const startIndex = (safePage - 1) * GRID_PAGE_SIZE;
  const neededCount = startIndex + GRID_PAGE_SIZE + 1;

  while (state.catalogFilterPool.length < neededCount && !state.catalogFilterExhausted) {
    if (requestToken && state.catalogRequestToken !== requestToken) {
      return { items: [], pagination: { current_page: safePage, total_pages: safePage, total: 0 }, hasMore: false, totalKnown: true };
    }

    const firstPage = state.catalogFilterCursor + 1;
    const pages = Array.from({ length: VOICE_FILTER_PREFETCH_PAGES }, (_, index) => firstPage + index);
    const payloads = await Promise.all(
      pages.map((rawPage) => fetchKodikDiscover("catalog", rawPage, GRID_PAGE_SIZE, requestOptions))
    );

    for (let index = 0; index < payloads.length; index += 1) {
      if (requestToken && state.catalogRequestToken !== requestToken) {
        return { items: [], pagination: { current_page: safePage, total_pages: safePage, total: 0 }, hasMore: false, totalKnown: true };
      }

      const rawPage = pages[index];
      const payload = payloads[index];
      const pagination = extractPagination(payload);
      const releases = sortCatalogReleases(buildReleases(payload), state.catalogSort);

      registerGenres(releases);
      registerVoices(releases);

      const matched = releases.filter((release) => releaseMatchesCatalogDeepFilters(release, activeGenres));
      mergeUniqueAliases(state.catalogFilterPool, matched, state.catalogFilterAliasSet);
      state.catalogFilterCursor = rawPage;
      state.catalogFilterExhausted = rawPage >= Math.max(pagination.total_pages || 0, rawPage) || !releases.length;

      if (state.catalogFilterExhausted) {
        state.catalogFilterTotalMatches = state.catalogFilterPool.length;
        break;
      }
      if (state.catalogFilterPool.length >= neededCount) break;
    }
  }

  const items = state.catalogFilterPool.slice(startIndex, startIndex + GRID_PAGE_SIZE);
  const hasMore = state.catalogFilterExhausted
    ? startIndex + GRID_PAGE_SIZE < state.catalogFilterPool.length
    : state.catalogFilterPool.length > startIndex + GRID_PAGE_SIZE || !state.catalogFilterExhausted;
  const totalPages = state.catalogFilterExhausted
    ? Math.max(1, Math.ceil(state.catalogFilterPool.length / GRID_PAGE_SIZE))
    : Math.max(safePage + (hasMore ? 1 : 0), 1);

  const result = {
    items,
    pagination: {
      current_page: safePage,
      total_pages: totalPages,
      total: state.catalogFilterExhausted ? state.catalogFilterPool.length : 0
    },
    hasMore,
    totalKnown: state.catalogFilterExhausted
  };
  state.catalogFilterPageCache.set(safePage, result);
  cacheCatalogVoicePoolState();
  return result;
}

function syncCatalogPager() {
  const currentPageLabel = Math.max(1, state.catalogPage || 1);
  const loadingSuffix = state.catalogLoading ? " • загрузка…" : "";
  if (els.catalogPageLabel) {
    els.catalogPageLabel.textContent = `Страница ${currentPageLabel} из ${Math.max(
      1,
      state.catalogTotalPages || 1
    )}${loadingSuffix}`;
    els.catalogPageLabel.classList.toggle("is-loading", Boolean(state.catalogLoading));
  }

  if (els.catalogPrevBtn) {
    els.catalogPrevBtn.disabled = state.catalogPage <= 1;
  }
  if (els.catalogNextBtn) {
    els.catalogNextBtn.disabled = !state.catalogHasMore;
  }
}

function renderGenreChips() {
  if (!els.catalogGenreChips) return;
  els.catalogGenreChips.innerHTML = "";
  state.catalogGenres = [];
  els.catalogGenreChips.closest(".catalog-filters-panel__chips")?.setAttribute("hidden", "hidden");
}

function getFilteredCatalogItems() {
  return state.catalogItems.filter((release) => {
    if (!releaseMatchesCatalogTypeSelection(release, state.catalogType)) return false;
    if (state.catalogGenre && !releaseMatchesGenres(release, [state.catalogGenre])) return false;
    if (state.catalogGenres.length && !releaseMatchesGenres(release, state.catalogGenres)) return false;
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
  const activeFilters = [...(genreLabels.length ? [`жанры: ${genreLabels.join(", ")}`] : [])];

  if (els.catalogSummary) {
    if (activeFilters.length) {
      const totalLabel = `Найдено ${formatNumber(
        state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length
      )} релизов по фильтрам.${pageLabel}`;
      els.catalogSummary.textContent = `Активные фильтры: ${activeFilters.join(" • ")}. ${totalLabel}`;
    } else {
      els.catalogSummary.textContent = `${formatNumber(
        state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length
      )} тайтлов в полной базе Kodik.${pageLabel}`;
    }
  }

  updateGrid(
    els.catalogGrid,
    items,
    activeFilters.length ? "По выбранным фильтрам пока ничего не найдено." : "Каталог пуст."
  );
  syncCatalogPager();
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
    originalTitle: release.originalTitle || "",
    alternateTitles: Array.isArray(release.alternateTitles) ? release.alternateTitles.slice(0, 6) : [],
    year: release.year,
    type: release.type,
    age: release.age,
    statusLabel: release.statusLabel,
    publishDay: release.publishDay,
    poster: release.poster,
    cardPoster: release.cardPoster,
    thumb: release.thumb,
    genres: release.genres || [],
    episodesTotal: release.episodesTotal || 0,
    publishedEpisode: release.publishedEpisode
      ? {
          ordinal: Number(release.publishedEpisode.ordinal || 0),
          name: String(release.publishedEpisode.name || ""),
          duration: Number(release.publishedEpisode.duration || 0)
        }
      : null,
    identifiers: release.identifiers
      ? {
          shikimoriId: String(release.identifiers.shikimoriId || ""),
          kinopoiskId: String(release.identifiers.kinopoiskId || ""),
          imdbId: String(release.identifiers.imdbId || ""),
          kodikId: String(release.identifiers.kodikId || "")
        }
      : {},
    kodikIdentity: String(release.kodikIdentity || "")
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

function normalizeProfileNickname(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function applyCloudProfile(profile = {}) {
  const displayName = normalizeProfileNickname(profile.displayName);
  if (!displayName || !state.authUser?.localId) return;
  if (normalizeProfileNickname(state.authUser.displayName) === displayName) return;
  state.authUser = {
    ...state.authUser,
    displayName
  };
  if (typeof window.updateAuthUserProfile === "function") {
    window.updateAuthUserProfile({ displayName });
  }
}

async function hydrateCloudSessionData(session = state.authUser) {
  if (!session?.localId || !window.animeCloudSync?.hydrateSessionData) return;

  try {
    const payload = await window.animeCloudSync.hydrateSessionData(session);
    if (Array.isArray(payload?.favorites)) {
      state.favorites = normalizeFavoriteItems(payload.favorites);
    }
    if (payload?.profile) {
      applyCloudProfile(payload.profile);
    }
    renderProfile();
    renderFavoriteButton();
    if (state.currentAnime) {
      renderDetails(state.currentAnime, { deferHeavy: false });
    }
    syncCloudNotifications({ force: true, deep: true }).catch(console.error);
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
    scheduleNotificationSync(600);
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

  const requestToken = `recommend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.personalizedRequestToken = requestToken;
  state.personalizedKey = cacheKey;
  state.personalizedGenres = profile.topGenres;
  renderSkeletonGrid(els.profileRecommendationsGrid, 6);
  if (els.profileRecommendationsSummary) {
    els.profileRecommendationsSummary.textContent = profile.topGenres.length
      ? `Обновляем подборку по жанрам: ${profile.topGenres.join(", ")}…`
      : "Собираем базовую персональную подборку…";
  }

  if (els.profileRecommendationsRefreshBtn) {
    els.profileRecommendationsRefreshBtn.disabled = true;
    els.profileRecommendationsRefreshBtn.textContent = "Обновляем…";
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

    if (state.personalizedRequestToken !== requestToken) return state.personalizedRecommendations;
    state.personalizedRecommendations = (ranked.length ? ranked : fallbackPool.filter((release) => !profile.blockedAliases.has(release.alias))).slice(0, 12);
    renderPersonalRecommendations();
    return state.personalizedRecommendations;
  })()
    .catch((error) => {
      console.error(error);
      if (state.personalizedRequestToken !== requestToken) return state.personalizedRecommendations;
      state.personalizedRecommendations = uniqueReleases(
        [...state.recommended, ...state.popular, ...state.latest].filter((release) => !profile.blockedAliases.has(release?.alias))
      ).slice(0, 12);
      renderPersonalRecommendations();
      return state.personalizedRecommendations;
    })
    .finally(() => {
      if (state.personalizedRequestToken === requestToken) {
        state.personalizedPromise = null;
      }
      if (els.profileRecommendationsRefreshBtn) {
        els.profileRecommendationsRefreshBtn.disabled = false;
        els.profileRecommendationsRefreshBtn.textContent = "Обновить подборку";
      }
    });

  return state.personalizedPromise;
}

function normalizeNotificationPayload(item = {}) {
  const createdAt = Number(item.createdAt || 0);
  const readAt = Number(item.readAt || 0);
  return {
    id: String(item.id || "").trim(),
    type: String(item.type || "new_anime").trim() || "new_anime",
    alias: String(item.alias || "").trim(),
    title: String(item.title || "").trim() || "Обновление каталога",
    body: String(item.body || "").trim() || "Появилось новое обновление.",
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    readAt: Number.isFinite(readAt) && readAt > 0 ? readAt : 0,
    episode: Math.max(0, Number(item.episode || 0)),
    actionLabel: String(item.actionLabel || "").trim()
  };
}

function mergeNotifications(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .map((item) => normalizeNotificationPayload(item))
    .filter((item) => item.id && item.alias)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .slice(0, 120);
}

function formatNotificationTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "только что";
  const diffMs = value - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function unreadNotificationCount() {
  return getVisibleNotifications().length;
}

function getVisibleNotifications() {
  return state.notifications.filter(
    (item) => !item.readAt && !state.notificationDismissedIds.has(item.id)
  );
}

function positionNotificationPopover() {
  if (!els.notificationPopover || !els.notificationBtn || els.notificationPopover.hidden) return;
  const rect = els.notificationBtn.getBoundingClientRect();
  const width = Math.min(380, Math.max(280, window.innerWidth - 24));
  const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
  const maxHeight = Math.min(560, window.innerHeight - 24);
  els.notificationPopover.style.maxHeight = `${maxHeight}px`;
  const estimatedHeight = Math.min(maxHeight, Math.max(220, els.notificationPopover.scrollHeight || 0));
  const belowTop = rect.bottom + 10;
  const aboveTop = rect.top - estimatedHeight - 10;
  const top = belowTop + estimatedHeight > window.innerHeight - 12 && aboveTop >= 12 ? aboveTop : Math.max(16, belowTop);
  els.notificationPopover.style.top = `${top}px`;
  els.notificationPopover.style.left = `${left}px`;
  els.notificationPopover.style.right = "auto";
  els.notificationPopover.style.width = `${Math.min(width, window.innerWidth - 24)}px`;
}

function positionQuickMenu() {
  if (!els.quickMenu || !els.quickMenuBtn || els.quickMenu.hidden) return;
  const rect = els.quickMenuBtn.getBoundingClientRect();
  const width = Math.min(320, Math.max(280, window.innerWidth - 24));
  const maxHeight = Math.min(560, window.innerHeight - 24);
  els.quickMenu.style.maxHeight = `${maxHeight}px`;
  const estimatedHeight = Math.min(maxHeight, Math.max(240, els.quickMenu.scrollHeight || 0));
  const belowTop = rect.bottom + 10;
  const aboveTop = rect.top - estimatedHeight - 10;
  const top = belowTop + estimatedHeight > window.innerHeight - 12 && aboveTop >= 12 ? aboveTop : Math.max(12, belowTop);
  const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
  els.quickMenu.style.top = `${top}px`;
  els.quickMenu.style.left = `${left}px`;
  els.quickMenu.style.right = "auto";
  els.quickMenu.style.width = `${Math.min(width, window.innerWidth - 24)}px`;
}

function closeNotificationPopover() {
  state.notificationPopoverOpen = false;
  if (els.notificationPopover) {
    els.notificationPopover.hidden = true;
  }
  if (els.notificationBtn) {
    els.notificationBtn.setAttribute("aria-expanded", "false");
  }
}

function openNotificationPopover() {
  if (!state.authUser?.localId || !els.notificationPopover) return;
  state.notificationPopoverOpen = true;
  renderNotificationPopover();
  els.notificationPopover.hidden = false;
  if (els.notificationBtn) {
    els.notificationBtn.setAttribute("aria-expanded", "true");
  }
  positionNotificationPopover();
  syncCloudNotifications({ force: true, deep: true }).catch(console.error);
}

function toggleNotificationPopover() {
  if (state.notificationPopoverOpen) {
    closeNotificationPopover();
    return;
  }
  openNotificationPopover();
}

function closeQuickMenu() {
  state.quickMenuOpen = false;
  if (els.quickMenu) {
    els.quickMenu.hidden = true;
  }
  if (els.quickMenuBtn) {
    els.quickMenuBtn.setAttribute("aria-expanded", "false");
  }
}

function openQuickMenu() {
  if (!els.quickMenu) return;
  closeNotificationPopover();
  closeCustomSelect();
  syncInstallButton();
  state.quickMenuOpen = true;
  els.quickMenu.hidden = false;
  if (els.quickMenuBtn) {
    els.quickMenuBtn.setAttribute("aria-expanded", "true");
  }
  positionQuickMenu();
}

function toggleQuickMenu() {
  if (state.quickMenuOpen) {
    closeQuickMenu();
    return;
  }
  openQuickMenu();
}

function setCatalogFiltersOpen(open) {
  state.catalogFiltersOpen = false;
  if (els.catalogLayout) {
    els.catalogLayout.classList.remove("is-filters-open");
  }
  if (els.catalogFiltersPanel) {
    els.catalogFiltersPanel.hidden = false;
  }
  if (els.catalogFiltersToggleBtn) {
    els.catalogFiltersToggleBtn.hidden = true;
    els.catalogFiltersToggleBtn.setAttribute("aria-expanded", "false");
  }
  closeCustomSelect();
}

function toggleCatalogFilters() {
  setCatalogFiltersOpen(!state.catalogFiltersOpen);
}

function syncNotificationButton() {
  const signedIn = Boolean(state.authUser?.localId);
  if (els.notificationBtn) {
    els.notificationBtn.hidden = !signedIn;
  }
  const unread = unreadNotificationCount();
  if (els.notificationBadge) {
    els.notificationBadge.hidden = !signedIn || unread <= 0;
    els.notificationBadge.textContent = String(Math.min(unread, 99));
  }
  if (els.notificationsMarkAllBtn) {
    els.notificationsMarkAllBtn.hidden = !signedIn || unread <= 0;
  }
  if (els.notificationPopoverMarkAllBtn) {
    els.notificationPopoverMarkAllBtn.hidden = !signedIn || unread <= 0;
  }
  if (!signedIn) {
    closeNotificationPopover();
  }
}

function createToast(title, body, actions = []) {
  if (!els.toastViewport) return;
  const toast = document.createElement("article");
  toast.className = "toast-card";

  const heading = document.createElement("h4");
  heading.className = "toast-card__title";
  heading.textContent = title;

  const text = document.createElement("p");
  text.className = "toast-card__body";
  text.textContent = body;

  toast.append(heading, text);

  if (Array.isArray(actions) && actions.length) {
    const actionsRow = document.createElement("div");
    actionsRow.className = "toast-card__actions";
    actions.forEach((action) => {
      if (!action?.label || typeof action.onClick !== "function") return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost-btn";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onClick();
        dismiss();
      });
      actionsRow.appendChild(button);
    });
    if (actionsRow.childElementCount) {
      toast.appendChild(actionsRow);
    }
  }

  const dismiss = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 180);
  };

  els.toastViewport.appendChild(toast);
  setTimeout(dismiss, 5200);
}

const confirmDialogState = {
  root: null,
  title: null,
  body: null,
  confirmBtn: null,
  cancelBtn: null,
  resolver: null,
  promise: null,
  dismissible: true
};

function ensureConfirmDialog() {
  if (confirmDialogState.root) return confirmDialogState;

  const root = document.createElement("div");
  root.className = "confirm-modal";
  root.hidden = true;
  root.innerHTML = `
    <div class="confirm-modal__backdrop" data-confirm-dismiss></div>
    <section class="confirm-modal__panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <p class="confirm-modal__kicker">AnimeCloud</p>
      <h3 class="confirm-modal__title" id="confirm-dialog-title"></h3>
      <p class="confirm-modal__body" id="confirm-dialog-body"></p>
      <div class="confirm-modal__actions">
        <button class="ghost-btn" type="button" data-confirm-cancel>Позже</button>
        <button class="primary-btn" type="button" data-confirm-accept>Обновить</button>
      </div>
    </section>
  `;

  const resolveAndClose = (value) => {
    const resolver = confirmDialogState.resolver;
    confirmDialogState.resolver = null;
    confirmDialogState.promise = null;
    root.hidden = true;
    document.body.classList.remove("is-dialog-open");
    if (resolver) resolver(value);
  };

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (confirmDialogState.dismissible && target instanceof HTMLElement && target.hasAttribute("data-confirm-dismiss")) {
      resolveAndClose(false);
    }
  });

  root.querySelector("[data-confirm-cancel]")?.addEventListener("click", () => resolveAndClose(false));
  root.querySelector("[data-confirm-accept]")?.addEventListener("click", () => resolveAndClose(true));
  document.addEventListener("keydown", (event) => {
    if (!confirmDialogState.root || confirmDialogState.root.hidden) return;
    if (confirmDialogState.dismissible && event.key === "Escape") {
      event.preventDefault();
      resolveAndClose(false);
    }
  });

  document.body.appendChild(root);
  confirmDialogState.root = root;
  confirmDialogState.title = root.querySelector("#confirm-dialog-title");
  confirmDialogState.body = root.querySelector("#confirm-dialog-body");
  confirmDialogState.confirmBtn = root.querySelector("[data-confirm-accept]");
  confirmDialogState.cancelBtn = root.querySelector("[data-confirm-cancel]");
  return confirmDialogState;
}

function showConfirmDialog({
  title = "Подтвердите действие",
  message = "",
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  dismissible = true
} = {}) {
  const dialog = ensureConfirmDialog();
  if (confirmDialogState.promise) {
    return confirmDialogState.promise;
  }
  dialog.title.textContent = title;
  dialog.body.textContent = message;
  dialog.confirmBtn.textContent = confirmLabel;
  dialog.cancelBtn.textContent = cancelLabel;
  confirmDialogState.dismissible = dismissible;
  dialog.root.hidden = false;
  document.body.classList.add("is-dialog-open");
  dialog.confirmBtn.focus();
  confirmDialogState.promise = new Promise((resolve) => {
    dialog.resolver = resolve;
  });
  return confirmDialogState.promise;
}

function renderNotifications() {
  if (!els.notificationsList || !els.notificationsSummary) return;

  if (!state.authUser?.localId) {
    els.notificationsSummary.textContent = "Войдите, чтобы получать облачные уведомления о новых тайтлах и сериях.";
    els.notificationsList.replaceChildren(createEmptyState("Уведомления появятся после входа в аккаунт."));
    syncNotificationButton();
    return;
  }

  const visibleNotifications = getVisibleNotifications();
  const unread = visibleNotifications.length;
  els.notificationsSummary.textContent = unread
    ? `Непрочитанных уведомлений: ${formatNumber(unread)}. Новые серии отслеживаются по вашим сохранённым тайтлам.`
    : "Здесь появятся новые тайтлы и свежие серии для аниме из ваших списков.";

  if (!visibleNotifications.length) {
    els.notificationsList.replaceChildren(createEmptyState("Пока уведомлений нет."));
    syncNotificationButton();
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleNotifications.forEach((item) => {
    const node = document.createElement("article");
    node.className = "notification-item is-unread";

    const top = document.createElement("div");
    top.className = "notification-item__top";

    const title = document.createElement("h4");
    title.className = "notification-item__title";
    title.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "notification-item__meta";
    meta.textContent = formatNotificationTime(item.createdAt);

    top.append(title, meta);

    const body = document.createElement("p");
    body.className = "notification-item__body";
    body.textContent = item.body;

    const actions = document.createElement("div");
    actions.className = "notification-item__actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "ghost-btn";
    openButton.textContent = item.actionLabel || "Открыть";
    openButton.addEventListener("click", () => {
      markNotificationIdsRead([item.id]).catch(console.error);
      openRelease(item.alias).catch(console.error);
    });
    actions.appendChild(openButton);

    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "ghost-btn";
    readButton.textContent = "Прочитано";
    readButton.addEventListener("click", () => {
      markNotificationIdsRead([item.id]).catch(console.error);
    });
    actions.appendChild(readButton);

    node.append(top, body, actions);
    fragment.appendChild(node);
  });

  els.notificationsList.replaceChildren(fragment);
  syncNotificationButton();
  renderNotificationPopover();
}

function renderNotificationPopover() {
  if (!els.notificationPopoverList || !els.notificationPopoverSummary) return;

  if (!state.authUser?.localId) {
    els.notificationPopoverSummary.textContent = "Войдите, чтобы получать уведомления.";
    els.notificationPopoverList.replaceChildren(createEmptyState("Уведомления появятся после входа в аккаунт."));
    syncNotificationButton();
    return;
  }

  const visibleNotifications = getVisibleNotifications();
  const unread = visibleNotifications.length;
  els.notificationPopoverSummary.textContent = unread
    ? `Непрочитанных: ${formatNumber(unread)}`
    : "Новые серии и новые тайтлы появятся здесь.";

  if (!visibleNotifications.length) {
    els.notificationPopoverList.replaceChildren(createEmptyState("Пока уведомлений нет."));
    syncNotificationButton();
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleNotifications.forEach((item) => {
    const node = document.createElement("article");
    node.className = "notification-item is-unread";

    const top = document.createElement("div");
    top.className = "notification-item__top";

    const title = document.createElement("h4");
    title.className = "notification-item__title";
    title.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "notification-item__meta";
    meta.textContent = formatNotificationTime(item.createdAt);

    const body = document.createElement("p");
    body.className = "notification-item__body";
    body.textContent = item.body;

    const actions = document.createElement("div");
    actions.className = "notification-item__actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "ghost-btn";
    openButton.textContent = item.actionLabel || "Открыть";
    openButton.addEventListener("click", () => {
      markNotificationIdsRead([item.id]).catch(console.error);
      closeNotificationPopover();
      openRelease(item.alias).catch(console.error);
    });
    actions.appendChild(openButton);

    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "ghost-btn";
    readButton.textContent = "Прочитано";
    readButton.addEventListener("click", () => {
      markNotificationIdsRead([item.id]).catch(console.error);
    });
    actions.appendChild(readButton);

    node.append(top, body, actions);
    top.append(title, meta);
    fragment.appendChild(node);
  });

  els.notificationPopoverList.replaceChildren(fragment);
  syncNotificationButton();
  positionNotificationPopover();
}

function applyNotifications(items, options = {}) {
  if (options.reset) {
    state.notificationDismissedIds.clear();
  }

  const nextItems = mergeNotifications(items).filter((item) => !state.notificationDismissedIds.has(item.id));
  const shouldPreserveExisting =
    !options.reset &&
    state.authUser?.localId &&
    state.notificationPrimed &&
    !nextItems.length &&
    state.notifications.length > 0;

  if (shouldPreserveExisting) {
    state.notificationKnownIds = new Set(state.notifications.map((item) => item.id));
    renderNotifications();
    renderNotificationPopover();
    return;
  }

  state.notifications = nextItems;
  renderNotifications();
  renderNotificationPopover();

  if (!state.notificationPrimed) {
    state.notificationKnownIds = new Set(state.notifications.map((item) => item.id));
    state.notificationPrimed = true;
    return;
  }

  state.notificationKnownIds = new Set(state.notifications.map((item) => item.id));
}

async function markNotificationIdsRead(ids = []) {
  const unreadIds = [...new Set(ids.filter(Boolean))];
  if (!unreadIds.length) return;

  unreadIds.forEach((id) => state.notificationDismissedIds.add(id));
  state.notifications = state.notifications.filter((item) => !state.notificationDismissedIds.has(item.id));
  renderNotifications();
  renderNotificationPopover();

  if (!state.authUser?.localId || !window.animeCloudSync?.markNotificationsRead) return;
  const next = await window.animeCloudSync.markNotificationsRead(unreadIds, state.authUser);
  applyNotifications(next, { silent: true });
}

async function markAllNotificationsRead() {
  const unreadIds = getVisibleNotifications().map((item) => item.id);
  if (!unreadIds.length) return;
  await markNotificationIdsRead(unreadIds);
}

function getTrackedNotificationItems() {
  return uniqueReleases(getListItems("watching").filter((item) => item?.alias));
}

async function fetchTrackedNotificationReleases(items = [], options = {}) {
  const trackedItems = uniqueReleases((Array.isArray(items) ? items : []).filter((item) => item?.alias));
  if (!trackedItems.length) return [];

  const releases = [];
  let cursor = 0;
  const concurrency = Math.min(4, trackedItems.length);

  async function worker() {
    while (cursor < trackedItems.length) {
      const currentIndex = cursor;
      cursor += 1;
      const item = trackedItems[currentIndex];
      try {
        const payload = await fetchKodikRelease(item, {
          ttl: options.force ? 0 : 10 * 60 * 1000,
          retries: 1
        });
        const release = payload ? buildRelease(payload) : null;
        if (release?.alias) {
          releases.push(release);
        }
      } catch {}
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return uniqueReleases(releases);
}

function applyLiveLatestReleases(payload, releases = []) {
  const liveReleases = uniqueReleases(releases);
  if (!liveReleases.length) return;

  const pagination = extractPagination(payload);
  registerGenres(liveReleases);
  registerVoices(liveReleases);
  state.latest = uniqueReleases([...liveReleases, ...state.latest]).slice(0, Math.max(GRID_PAGE_SIZE, 24));
  state.latestTotal = Math.max(
    Number(state.latestTotal || 0),
    Number(pagination.total || 0),
    state.latest.length
  );
  state.catalogTotal = Math.max(Number(state.catalogTotal || 0), Number(pagination.total || 0), state.catalogItems.length);
  state.catalogMergedTotal = Math.max(
    Number(state.catalogMergedTotal || 0),
    Number(pagination.total || 0),
    state.catalogTotal
  );

  if (state.homeLoaded && els.latestGrid) {
    updateGrid(els.latestGrid, state.latest.slice(0, GRID_PAGE_SIZE), "Свежие релизы пока не найдены.");
  }
  updateStats();
}

async function syncCloudNotifications(options = {}) {
  if (!state.authUser?.localId || !window.animeCloudSync?.syncNotifications) {
    return { items: [], created: [] };
  }

  if (state.notificationSyncInFlight && !options.force) {
    return state.notificationSyncInFlight;
  }

  state.notificationSyncInFlight = (async () => {
    const latestPayload = await fetchJson(
      KODIK_API_BASE,
      { action: "discover", mode: "latest", page: 1, limit: 48 },
      { ttl: options.force ? 0 : 120000, retries: 1 }
    );
    const latestReleases = uniqueReleases(buildReleases(latestPayload));
    applyLiveLatestReleases(latestPayload, latestReleases);
    const trackedItems = getTrackedNotificationItems();
    const trackedReleases =
      options.deep || options.force || !state.notificationPrimed
        ? await fetchTrackedNotificationReleases(trackedItems, { force: options.force })
        : [];
    const result = await window.animeCloudSync.syncNotifications(state.authUser, {
      latestReleases,
      watching: getListItems("watching"),
      tracked: trackedItems,
      trackedReleases
    });
    if (result?.items) {
      applyNotifications(result.items, { silent: !result.created?.length });
    }
    return result || { items: [], created: [] };
  })().finally(() => {
    state.notificationSyncInFlight = null;
  });

  return state.notificationSyncInFlight;
}

function stopNotificationLiveSync() {
  if (typeof state.notificationLiveStop === "function") {
    state.notificationLiveStop();
  }
  state.notificationLiveStop = null;
}

function scheduleNotificationSync(delayMs = 0) {
  if (state.notificationSyncTimer) {
    clearTimeout(state.notificationSyncTimer);
    state.notificationSyncTimer = 0;
  }
  if (!state.authUser?.localId) return;

  state.notificationSyncTimer = window.setTimeout(() => {
    state.notificationSyncTimer = 0;
    if (document.hidden || !navigator.onLine) {
      scheduleNotificationSync(180000);
      return;
    }
    syncCloudNotifications().catch(console.error).finally(() => {
      scheduleNotificationSync(240000);
    });
  }, Math.max(0, Number(delayMs || 0)));
}

function bindNotificationLiveSync() {
  stopNotificationLiveSync();
  if (!state.authUser?.localId || !window.animeCloudSync?.subscribeNotifications) {
    if (state.notificationSyncTimer) {
      clearTimeout(state.notificationSyncTimer);
      state.notificationSyncTimer = 0;
    }
    state.notificationPrimed = false;
    state.notificationKnownIds = new Set();
    state.notificationDismissedIds.clear();
    applyNotifications([], { reset: true, silent: true });
    renderNotifications();
    renderNotificationPopover();
    return;
  }

  state.notificationPrimed = false;
  state.notificationKnownIds = new Set();
  state.notificationLiveStop = window.animeCloudSync.subscribeNotifications(state.authUser, (items) => {
    applyNotifications(items || []);
  });
}

function setupScrollPerformanceMode() {
  let enabled = false;
  const handleScroll = () => {
    if (!enabled) {
      document.body.classList.add("is-scrolling");
      enabled = true;
    }
    if (state.scrollPerfTimer) {
      clearTimeout(state.scrollPerfTimer);
    }
    state.scrollPerfTimer = window.setTimeout(() => {
      document.body.classList.remove("is-scrolling");
      enabled = false;
      state.scrollPerfTimer = 0;
    }, 140);
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
}

async function saveProfileNickname(event) {
  event?.preventDefault?.();
  if (!state.authUser?.localId) {
    if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Войдите в аккаунт, чтобы сохранить ник.";
    return;
  }

  const nickname = normalizeProfileNickname(els.profileNicknameInput?.value || "");
  if (nickname.length < 2) {
    if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Ник должен быть от 2 до 32 символов.";
    return;
  }
  if (!window.animeCloudSync?.saveProfile) {
    if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Облачный профиль пока недоступен.";
    return;
  }

  const submitButton = els.profileNicknameForm?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Сохраняем ник в аккаунте...";

  try {
    const profile = await window.animeCloudSync.saveProfile(state.authUser, { displayName: nickname });
    applyCloudProfile(profile || { displayName: nickname });
    renderProfile();
    if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Ник сохранён в аккаунте.";
    createToast("Ник обновлён", "Новое имя сохранено в Firebase и подтянется после входа на другом устройстве.");
  } catch (error) {
    console.error(error);
    if (els.profileNicknameStatus) els.profileNicknameStatus.textContent = "Не удалось сохранить ник. Проверьте правила Firestore.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
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
  if (els.profileNicknameForm) {
    els.profileNicknameForm.hidden = !user?.localId;
  }
  if (els.profileNicknameInput && document.activeElement !== els.profileNicknameInput) {
    els.profileNicknameInput.value = user?.localId ? normalizeProfileNickname(user.displayName || user.email?.split("@")[0] || "") : "";
  }
  if (els.profileNicknameStatus && !user?.localId) {
    els.profileNicknameStatus.textContent = "";
  }
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
  renderNotifications();
  renderNotificationPopover();
  safeIdle(() => loadPersonalRecommendations().catch(console.error));
  updateListButtons();
  syncNotificationButton();
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
  const stats = getHomeStats(state);
  els.latestCount.textContent = formatNumber(stats.latestTotal);
  els.catalogCount.textContent = formatNumber(stats.catalogTotal || getHeroCandidates().length);
  els.ongoingCount.textContent = formatNumber(stats.ongoingTotal);
  els.topCount.textContent = formatNumber(stats.topTotal);
  repairStaticUiText();
}

async function loadContentStats(force = false) {
  try {
    let stats = null;
    try {
      stats = await fetchJson("/api/content-stats", null, { ttl: force ? 0 : CONTENT_STATS_TTL, retries: 1 });
    } catch {
      stats = await fetchJson("/content-stats.json", null, { ttl: force ? 0 : CONTENT_STATS_TTL, retries: 1 });
    }
    applyContentStats(state, stats, { gridPageSize: GRID_PAGE_SIZE });
    updateStats();
    if (state.catalogLoaded) {
      if (state.catalogGenre || state.catalogGenres.length) {
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
  closeQuickMenu();
  closeNotificationPopover();
  if (view !== "catalog") {
    setCatalogFiltersOpen(false);
  }

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
  repairStaticUiText();

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
  if (els.catalogFiltersPanel) {
    els.catalogFiltersPanel.hidden = false;
  }
  if (els.catalogFiltersToggleBtn) {
    els.catalogFiltersToggleBtn.hidden = true;
  }
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

  state.catalogGenre = normalizeSelectedCatalogGenres([state.catalogGenre], state.genreOptions)[0] || "";
  state.catalogGenres = normalizeSelectedCatalogGenres(state.catalogGenres, state.genreOptions);
  if (els.catalogGenre) {
    els.catalogGenre.value = state.catalogGenre;
  }

  renderGenreChips();
  refreshCustomCatalogSelects();
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
    state.latestTotal = Math.max(Number(state.catalogMergedTotal || 0), Number(state.latestTotal || 0), state.latest.length);
    state.catalogTotal = Math.max(Number(state.catalogMergedTotal || 0), Number(state.catalogTotal || 0), state.popular.length);
    state.catalogTotalPages = Math.max(
      state.catalogTotalPages || 0,
      Math.ceil((state.catalogTotal || state.popular.length) / GRID_PAGE_SIZE)
    );
    state.ongoingTotal = Math.max(
      Number(state.ongoingMergedTotal || 0),
      Number(state.ongoingTotal || 0),
      ongoingPayload?.items?.length || 0
    );
    state.ongoingTotalPages = Math.max(
      state.ongoingTotalPages || 0,
      Math.ceil((state.ongoingTotal || 0) / GRID_PAGE_SIZE)
    );
    state.topTotal = Math.max(Number(state.topMergedTotal || 0), Number(state.topTotal || 0), state.recommended.length);
    state.topTotalPages = Math.max(
      state.topTotalPages || 0,
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
    if (state.authUser?.localId) {
      scheduleNotificationSync(1200);
    }
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
  const requestToken = `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.catalogRequestToken = requestToken;
  state.catalogLoading = true;
  syncCatalogPager();
  await loadReferences();
  if (state.catalogRequestToken !== requestToken) return;
  const reset = Boolean(options.reset);
  const requestedPage = Math.max(1, Number(options.page || (reset ? 1 : state.catalogPage || 1)));
  const mergedCatalogTotal = Math.max(Number(state.catalogMergedTotal || 0), Number(state.catalogTotal || 0));

  if (reset) {
    state.catalogItems = [];
    state.catalogPage = 0;
    state.catalogTotal = mergedCatalogTotal;
    state.catalogTotalPages = 0;
    state.catalogHasMore = false;
    if (els.catalogSummary) els.catalogSummary.textContent = "Загружаем каталог…";
    renderSkeletonGrid(els.catalogGrid, 8);
    syncCatalogPager();
  }

  try {
    if (els.catalogPrevBtn) els.catalogPrevBtn.disabled = true;
    if (els.catalogNextBtn) els.catalogNextBtn.disabled = true;
    const activeGenres = normalizeGenreList([state.catalogGenre, ...state.catalogGenres].filter(Boolean));
    const hasGenreFilters = activeGenres.length > 0;
    const serverGenres = activeGenres.filter((genre) => !isClientOnlyCatalogGenre(genre));
    const needsDeepClientGenreFilter = hasGenreFilters && serverGenres.length !== activeGenres.length;
    const hasClientFilters = hasGenreFilters;
    const kodikTypeConfig = getKodikCatalogTypeConfig(state.catalogType);
    const shouldLoadKodik = kodikTypeConfig.enabled;
    const filterKey = JSON.stringify({
      sort: state.catalogSort,
      type: state.catalogType || "",
      genres: activeGenres
    });

    if (reset || state.catalogFilterKey !== filterKey) {
      resetCatalogVoicePool(filterKey);
    }

    const requestOptions = {
      ttl: 120000,
      ...getKodikSortConfig(state.catalogSort),
      genres: serverGenres,
      animeKinds: kodikTypeConfig.animeKinds,
      mediaTypes: kodikTypeConfig.mediaTypes
    };

    const kodikPayload = shouldLoadKodik
      ? needsDeepClientGenreFilter
        ? await fetchCatalogVoicePage(requestedPage, requestOptions, requestToken, activeGenres)
        : await fetchKodikDiscover("catalog", requestedPage, GRID_PAGE_SIZE, requestOptions)
      : {
          items: [],
          pagination: { current_page: requestedPage, total_pages: requestedPage, total: 0 },
          hasMore: false,
          totalKnown: true
        };
    if (state.catalogRequestToken !== requestToken) return;

    const pagination = extractPagination(kodikPayload);
    const releases = uniqueReleases(sortCatalogReleases(buildReleases(kodikPayload), state.catalogSort));

    registerGenres(releases);
    registerVoices(releases);
    state.catalogItems = releases;
    state.catalogPage = Math.max(pagination.current_page || 0, requestedPage);
    state.catalogTotal = hasGenreFilters
      ? Math.max(state.catalogItems.length, state.catalogTotal || 0)
      : Math.max(mergedCatalogTotal || 0, state.catalogItems.length);
    state.catalogTotalPages = Math.max(
      pagination.total_pages || 0,
      Math.ceil((state.catalogTotal || state.catalogItems.length) / GRID_PAGE_SIZE),
      state.catalogPage ? 1 : 0
    );
    state.catalogHasMore = state.catalogPage < (state.catalogTotalPages || 1);
    state.catalogLoaded = true;

    if (hasClientFilters) {
      const filters = [...(hasGenreFilters ? [`жанры: ${[...new Set(activeGenres)].join(", ")}`] : [])];

      if (els.catalogSummary) {
        els.catalogSummary.textContent = `Активные фильтры: ${filters.join(" • ")}. Найдено ${formatNumber(
          state.catalogTotal || state.catalogItems.length
        )} релизов по фильтрам.`;
      }
      refreshCatalogView(pagination);
    } else {
      if (els.catalogSummary) {
        els.catalogSummary.textContent = `${formatNumber(
          state.catalogMergedTotal || state.catalogTotal
        )} тайтлов в полной базе Kodik. Страница ${state.catalogPage} из ${
          state.catalogTotalPages || 1
        }.`;
      }
      updateGrid(els.catalogGrid, state.catalogItems, "Каталог пуст.");
    }
    syncCatalogPager();
    updateStats();
  } catch (error) {
    if (state.catalogRequestToken !== requestToken) return;
    console.error("loadCatalog failed", error);
    syncCatalogPager();
    const message = getKodikUnavailableMessage(error, "Каталог временно недоступен.");
    if (els.catalogSummary) els.catalogSummary.textContent = message;
    replaceWithErrorState(els.catalogGrid, message, () => loadCatalog({ reset: true }).catch(console.error));
    throw error;
  } finally {
    if (state.catalogRequestToken === requestToken) {
      state.catalogLoading = false;
      syncCatalogPager();
    }
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
    const releases = uniqueReleases(buildReleases(kodikPayload));
    const pagination = extractPagination(kodikPayload);
    const appendedReleases = reset
      ? releases
      : releases.filter((release) => release?.alias && !existingAliases.has(release.alias));

    registerGenres(releases);
    registerVoices(releases);
    state.ongoingItems = reset ? releases : mergeReleaseCollections(state.ongoingItems, releases);
    state.ongoingPage = Math.max(pagination.current_page || 0, nextPage);
    state.ongoingTotal = Math.max(mergedOngoingTotal || 0, state.ongoingItems.length);
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
    const releases = uniqueReleases(buildReleases(kodikPayload));
    const pagination = extractPagination(kodikPayload);
    const appendedReleases = reset
      ? releases
      : releases.filter((release) => release?.alias && !existingAliases.has(release.alias));

    registerGenres(releases);
    registerVoices(releases);
    state.topItems = reset ? releases : mergeReleaseCollections(state.topItems, releases);
    state.topPage = Math.max(pagination.current_page || 0, nextPage);
    state.topTotal = Math.max(mergedTopTotal || 0, state.topItems.length);
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
    state.scheduleItems = uniqueReleases(buildReleases(payload));
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
          ? `Вышла ${release.publishedEpisode.ordinal} серия`
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

function createAnimeCard(release, index, options = {}) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const action = node.querySelector(".anime-card__action");
  const poster = node.querySelector(".anime-card__poster");
  const cardSrc = release.cardPoster || release.thumb || release.poster;
  const card2x = release.poster || release.cardPoster || cardSrc;
  const cardFallback = release.cardPoster || release.thumb || release.poster || "/mc-icon-192.png?v=5";
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
  action.dataset.releaseAlias = release.alias;
  action.setAttribute("aria-label", `${release.title}: открыть релиз`);

  const decoratedNode = decorateCardProgress(node, release);
  if (options.historyCard) {
    return decorateHistoryCardControls(decoratedNode, release);
  }
  return decoratedNode;
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

  scheduleChunkRender(
    target,
    releases,
    (release, index) => createAnimeCard(release, offset + index, options.cardOptions || {}),
    {
    onComplete: options.onComplete
    }
  );
}

function bindPosterFallback(image, release, options = {}) {
  if (!image || !release) return;
  const initialSrc = String(options.initialSrc || image.currentSrc || image.src || "").trim();
  const queue = uniqueStrings([
    ...(Array.isArray(release.posterCandidateQueue) ? release.posterCandidateQueue : []),
    ...(Array.isArray(release.posterDirectQueue) ? release.posterDirectQueue.map((src) => proxiedImageUrl(src)) : []),
    proxiedImageUrl(release.cardPosterDirect),
    proxiedImageUrl(release.thumbDirect),
    proxiedImageUrl(release.posterDirect),
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
  if (state.externalPlayerAssistTimer) {
    clearTimeout(state.externalPlayerAssistTimer);
    state.externalPlayerAssistTimer = null;
  }
  state.externalPlayerUrl = "";
  if (els.externalPlayerActions) {
    els.externalPlayerActions.hidden = true;
  }
  if (els.externalPlayerRetryBtn) {
    els.externalPlayerRetryBtn.hidden = true;
  }
  const currentSrc = els.externalPlayer.getAttribute("src") || "";
  if (currentSrc && currentSrc !== "about:blank") {
    els.externalPlayer.src = "about:blank";
  }
  els.externalPlayer.hidden = true;
  els.player.hidden = false;
}

function showVideoSurface() {
  if (state.externalPlayerAssistTimer) {
    clearTimeout(state.externalPlayerAssistTimer);
    state.externalPlayerAssistTimer = null;
  }
  state.externalPlayerUrl = "";
  if (els.externalPlayerActions) {
    els.externalPlayerActions.hidden = true;
  }
  if (els.externalPlayerRetryBtn) {
    els.externalPlayerRetryBtn.hidden = true;
  }
  els.externalPlayer.hidden = true;
  els.player.hidden = false;
}

function showExternalSurface(url) {
  destroyPlayer();
  if (state.externalPlayerAssistTimer) {
    clearTimeout(state.externalPlayerAssistTimer);
    state.externalPlayerAssistTimer = null;
  }
  const externalUrl = normalizeExternalPlayer(url || "");
  state.externalPlayerUrl = externalUrl;
  if (els.externalPlayerActions) {
    els.externalPlayerActions.hidden = false;
  }
  if (els.externalPlayerRetryBtn) {
    els.externalPlayerRetryBtn.hidden = true;
  }
  els.player.hidden = true;
  els.externalPlayer.hidden = false;
  if (!externalUrl) {
    els.playerNote.textContent = "Для этого источника внешний плеер сейчас недоступен.";
    return;
  }
  els.externalPlayer.src = "about:blank";
  requestAnimationFrame(() => {
    if (state.externalPlayerUrl !== externalUrl) return;
    els.externalPlayer.src = externalUrl;
  });
  state.externalPlayerAssistTimer = setTimeout(() => {
    if (state.externalPlayerUrl !== externalUrl || els.externalPlayer.hidden) return;
    els.playerNote.textContent =
      "Внешний Kodik-плеер долго не отвечает. Попробуйте повторить загрузку.";
    if (els.externalPlayerActions) {
      els.externalPlayerActions.hidden = false;
    }
    if (els.externalPlayerRetryBtn) {
      els.externalPlayerRetryBtn.hidden = false;
    }
  }, 12000);
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
    sources.find((source) => source.externalUrl)?.id ||
    sources.find((source) => source.episodes?.length)?.id ||
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
  const compactLabel = episode.ordinal ? String(episode.ordinal) : episode.name || "Фильм";
  const fullLabel = episode.ordinal ? `${episode.ordinal} серия` : episode.name || "Фильм";
  const durationLabel = formatEpisodeDuration(episode.duration) || "Длительность не указана";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `episode-btn${state.currentEpisode?.id === episode.id ? " is-active" : ""}`;
  button.dataset.episodeId = episode.id || "";
  button.dataset.ordinal = String(episode.ordinal || "");
  button.title = `${fullLabel} • ${durationLabel}`;
  button.setAttribute("aria-label", `${fullLabel}. ${durationLabel}`);
  button.innerHTML = `<strong>${escapeHtml(compactLabel)}</strong><span>${escapeHtml(durationLabel)}</span><small>${escapeHtml(durationLabel)}</small>`;
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

function appendEpisodeMoreButton(release, episodes, nextIndex) {
  if (!els.episodesList || nextIndex >= episodes.length) return;

  const remaining = episodes.length - nextIndex;
  const nextCount = Math.min(EPISODE_PAGE_SIZE, remaining);
  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "episode-btn episode-btn--more";
  moreBtn.innerHTML = `<strong>...</strong><span>Показать ещё ${nextCount} из ${remaining}</span>`;
  moreBtn.addEventListener("click", () => {
    moreBtn.remove();
    const chunk = episodes.slice(nextIndex, nextIndex + EPISODE_PAGE_SIZE);
    const nextCursor = nextIndex + chunk.length;
    scheduleChunkRender(els.episodesList, chunk, createEpisodeNode, {
      batchSize: shouldPreferFastStart() ? 4 : 10,
      onComplete: () => {
        appendEpisodeMoreButton(release, episodes, nextCursor);
        if (state.currentAnime?.alias === release.alias) {
          decorateEpisodeProgress(release);
        }
      }
    });
  });
  els.episodesList.appendChild(moreBtn);
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
  
  const displayLimit = Math.min(12, episodes.length);
  const initialEpisodes = episodes.slice(0, displayLimit);

  scheduleChunkRender(els.episodesList, initialEpisodes, createEpisodeNode, {
    batchSize: shouldPreferFastStart() ? 4 : 10,
    onComplete: () => {
      appendEpisodeMoreButton(release, episodes, displayLimit);
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
  const kodikRatingValue = Number(release?.sortRating || 0);
  const kodikRating =
    Number.isFinite(kodikRatingValue) && kodikRatingValue > 0 && kodikRatingValue <= 10.1
      ? String(kodikRatingValue).replace(/\.0$/, "")
      : "";

  const meta = [
    release.type,
    release.year,
    kodikRating ? `\u0420\u0435\u0439\u0442\u0438\u043d\u0433: ${kodikRating}` : "",
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
    renderCrew(release);
    return;
  }

  queueDetailSectionsRender(release, token);
}

function syncRenderedSourceState() {
  if (!els.sourceSwitch) return;
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
    episode.name && episode.name !== `${episode.ordinal} серия` ? ` • ${episode.name}` : ""
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
        ? "Серии и качество выбираются прямо во встроенном плеере. Если загрузка зависнет, попробуйте повторить загрузку."
        : "Этот плеер загружается во встроенном окне. Если загрузка зависнет, попробуйте повторить загрузку.";
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

function switchSource(sourceId, options = {}) {
  if (!state.currentAnime) return;
  const force = Boolean(options.force);
  if (!force && sourceId === state.currentSource) return;
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
    els.playerNote.textContent =
      source.note || "Этот источник открывается во встроенном Kodik-плеере. Если загрузка зависнет, попробуйте повторить загрузку.";
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
        switchSource(defaultSource?.id || "external", { force: true });
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

  let controllerRefreshInProgress = false;
  let updatePromptInFlight = false;
  const hadController = Boolean(navigator.serviceWorker.controller);

  async function promptForWorkerUpdate(registration) {
    if (!registration?.waiting || !navigator.serviceWorker.controller || updatePromptInFlight) return;
    updatePromptInFlight = true;

    const shouldReload = await showConfirmDialog({
      title: "Доступна новая версия AnimeCloud",
      message: "Обновить страницу сейчас, чтобы применить свежие исправления и убрать старый кэш?",
      confirmLabel: "Обновить",
      cancelLabel: "Позже",
      dismissible: false
    }).finally(() => {
      updatePromptInFlight = false;
    });
    if (!shouldReload) return;

    try {
      await clearSiteRuntimeCaches();
    } catch {}

    registration.waiting.postMessage({ type: "animecloud:skip-waiting" });
  }

  function observeRegistration(registration) {
    if (!registration) return;

    if (registration.waiting) {
      promptForWorkerUpdate(registration).catch(console.error);
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          promptForWorkerUpdate(registration).catch(console.error);
        }
      });
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || controllerRefreshInProgress) return;
    controllerRefreshInProgress = true;
    clearSiteRuntimeCaches()
      .catch(() => {})
      .finally(() => {
        window.location.reload();
      });
  });

  async function registerLatestWorker() {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      observeRegistration(registration);
      registration.update().catch(() => {});

      const readyRegistration = await navigator.serviceWorker.ready;
      observeRegistration(readyRegistration);
      if (readyRegistration.periodicSync) {
        try {
          const permission = await navigator.permissions.query({ name: "periodic-background-sync" }).catch(() => null);
          if (!permission || permission.state === "granted") {
            await readyRegistration.periodicSync.register("animecloud-schedule-refresh", {
              minInterval: 6 * 60 * 60 * 1000
            });
          }
        } catch {}
      }
    } catch (error) {
      console.error("registerServiceWorker failed", error);
    }
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
  const warmCardAction = (target) => {
    const action = target?.closest?.(".anime-card__action[data-release-alias]");
    if (!action || action.dataset.warmed === "1") return;
    action.dataset.warmed = "1";
    const alias = action.dataset.releaseAlias || "";
    if (!alias) return;
    prefetchRelease(alias);
    ensureHlsLibrary().catch(() => {});
  };

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

  document.addEventListener("pointerover", (event) => {
    warmCardAction(event.target);
  });
  document.addEventListener("focusin", (event) => {
    warmCardAction(event.target);
  });
  document.addEventListener(
    "touchstart",
    (event) => {
      warmCardAction(event.target);
    },
    { passive: true }
  );

  window.addEventListener("popstate", handleRoute);
  window.addEventListener("hashchange", handleRoute);
}

function bindEvents() {
  bindViewButtons(els.tabs);
  bindViewButtons(els.mobileTabs);
  bindNavigationDelegates();
  bindListButtons();

  els.brandBtn?.addEventListener("click", () => setView("home"));
  els.refreshBtn?.addEventListener("click", () => {
    closeQuickMenu();
    refreshAll().catch(console.error);
  });
  els.heroOpenBtn?.addEventListener("click", () => state.featured && openRelease(state.featured.alias).catch(console.error));
  els.heroRandomBtn?.addEventListener("click", pickRandomRelease);
  els.installBtn?.addEventListener("click", () => {
    closeQuickMenu();
    handleInstallClick().catch(console.error);
  });
  els.quickMenuBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleQuickMenu();
  });
  els.quickMenuAccountBtn?.addEventListener("click", () => {
    closeQuickMenu();
    setView("profile");
  });
  els.quickMenuLoginBtn?.addEventListener("click", () => {
    closeQuickMenu();
  });
  els.quickMenuProfileBtn?.addEventListener("click", () => {
    closeQuickMenu();
    setView("profile");
  });
  els.quickMenuLogoutBtn?.addEventListener("click", () => {
    closeQuickMenu();
  });
  els.notificationBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeQuickMenu();
    toggleNotificationPopover();
  });
  els.notificationsMarkAllBtn?.addEventListener("click", () => {
    markAllNotificationsRead().catch(console.error);
  });
  els.notificationPopoverMarkAllBtn?.addEventListener("click", () => {
    markAllNotificationsRead().catch(console.error);
  });
  els.profileProgressGrid?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest(".anime-card__remove") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    removeProgressHistoryEntry(button.dataset.historyAlias || "", button.dataset.historyTitle || "").catch(console.error);
  });
  els.externalPlayerOpenBtn?.addEventListener("click", () => {
    if (!state.externalPlayerUrl) return;
    const popup = window.open(state.externalPlayerUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = state.externalPlayerUrl;
    }
  });
  els.externalPlayerRetryBtn?.addEventListener("click", () => {
    if (!state.externalPlayerUrl) return;
    showExternalSurface(state.externalPlayerUrl);
  });
  bindLoadMoreButton(els.ongoingMoreBtn, () => loadOngoing({ reset: false }));
  bindLoadMoreButton(els.topMoreBtn, () => loadTop({ reset: false }));

  els.catalogPrevBtn?.addEventListener("click", () => {
    if (state.catalogPage <= 1) return;
    loadCatalog({ page: state.catalogPage - 1 }).catch(console.error);
  });
  els.catalogNextBtn?.addEventListener("click", () => {
    if (!state.catalogHasMore) return;
    loadCatalog({ page: state.catalogPage + 1 }).catch(console.error);
  });
  els.catalogFiltersToggleBtn?.addEventListener("click", () => {
    toggleCatalogFilters();
  });
  els.catalogFiltersCloseBtn?.addEventListener("click", () => {
    setCatalogFiltersOpen(false);
  });

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
  els.profileRecommendationsRefreshBtn?.addEventListener("click", () => {
    loadPersonalRecommendations({ force: true }).catch(console.error);
  });
  els.profileNicknameForm?.addEventListener("submit", (event) => {
    saveProfileNickname(event).catch(console.error);
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
    const previousUserId = state.authUser?.localId || "";
    state.authUser = event.detail?.user || null;
    if ((state.authUser?.localId || "") !== previousUserId) {
      state.notificationDismissedIds.clear();
    }
    loadFavorites();
    bindNotificationLiveSync();
    renderProfile();
    renderFavoriteButton();
    if (state.authUser?.localId && event.detail?.ready) {
      hydrateCloudSessionData(state.authUser).catch(console.error);
      scheduleNotificationSync(900);
    } else {
      stopNotificationLiveSync();
      applyNotifications([], { reset: true, silent: true });
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
    if (event.key === "Escape" && state.notificationPopoverOpen) {
      closeNotificationPopover();
    }
    if (event.key === "Escape" && state.quickMenuOpen) {
      closeQuickMenu();
    }
    if (event.key === "Escape" && activeCustomSelect) {
      closeCustomSelect();
    }
    if (event.key === "Escape" && state.catalogFiltersOpen) {
      setCatalogFiltersOpen(false);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;

    if (state.notificationPopoverOpen) {
      if (els.notificationBtn?.contains(target) || els.notificationPopover?.contains(target)) {
        return;
      }
      closeNotificationPopover();
    }

    if (state.quickMenuOpen) {
      if (els.quickMenuBtn?.contains(target) || els.quickMenu?.contains(target)) {
        return;
      }
      closeQuickMenu();
    }

    if (activeCustomSelect) {
      const { wrapper, menu, trigger } = activeCustomSelect;
      if (wrapper.contains(target) || menu.contains(target) || trigger.contains(target)) {
        return;
      }
      closeCustomSelect();
    }

    if (state.catalogFiltersOpen) {
      if (els.catalogFiltersToggleBtn?.contains(target) || els.catalogFiltersPanel?.contains(target)) {
        return;
      }
      setCatalogFiltersOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (state.notificationPopoverOpen) {
      positionNotificationPopover();
    }
    if (state.quickMenuOpen) {
      positionQuickMenu();
    }
  });

  window.addEventListener("scroll", () => {
    if (state.notificationPopoverOpen) {
      positionNotificationPopover();
    }
    if (state.quickMenuOpen) {
      positionQuickMenu();
    }
  }, { passive: true });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    syncInstallButton();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.authUser?.localId) {
      scheduleNotificationSync(800);
    }
  });

  window.addEventListener("online", () => {
    if (state.authUser?.localId) {
      scheduleNotificationSync(400);
    }
  });

  window.addEventListener("appinstalled", () => {
    state.installPromptEvent = null;
    syncInstallButton();
  });

  els.player?.addEventListener("loadedmetadata", syncPlayerReadyState);
  els.player?.addEventListener("loadeddata", syncPlayerReadyState);
  els.player?.addEventListener("canplay", syncPlayerReadyState);
  els.player?.addEventListener("playing", syncPlayerReadyState);
  els.externalPlayer?.addEventListener("load", () => {
    if (!state.externalPlayerAssistTimer) return;
    clearTimeout(state.externalPlayerAssistTimer);
    state.externalPlayerAssistTimer = null;
  });
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
  setupScrollPerformanceMode();
  repairStaticUiText();
  registerServiceWorker();
  releaseViewportLocks();

  try {
    state.authUser = typeof window.getAuthUser === "function" ? window.getAuthUser() : null;
  } catch {
    state.authUser = null;
  }

  bindNotificationLiveSync();
  loadFavorites();
  renderProfile();
  renderFavoriteButton();
  renderSearchEmpty();
  syncInstallButton();
  renderNotifications();
  renderNotificationPopover();
  syncNotificationButton();

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
