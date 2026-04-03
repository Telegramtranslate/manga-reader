const API_BASE = "/api/anilibria";
const ORIGIN_BASE = "https://anilibria.top";
const MEDIA_PROXY_BASE = "/api/anilibria-media";
const CACHE_TTL = 180000;
const DETAIL_TTL = 300000;
const GRID_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE = 280;

const responseCache = new Map();
const requestCache = new Map();

const state = {
  currentView: "home",
  previousView: "home",
  latest: [],
  recommended: [],
  featured: null,
  genres: [],
  sortingOptions: [],
  typeOptions: [],
  searchResults: [],
  searchTimer: null,
  searchAbort: null,
  searchQuery: "",
  catalogItems: [],
  catalogPage: 0,
  catalogTotal: 0,
  catalogHasMore: false,
  catalogSort: "FRESH_AT_DESC",
  catalogType: "",
  ongoingItems: [],
  ongoingPage: 0,
  ongoingTotal: 0,
  ongoingHasMore: false,
  activeGenreId: null,
  genreItems: [],
  genrePage: 0,
  genreTotal: 0,
  genreHasMore: false,
  scheduleItems: [],
  referencesLoaded: false,
  homeLoaded: false,
  catalogLoaded: false,
  ongoingLoaded: false,
  genresLoaded: false,
  scheduleLoaded: false,
  currentAnime: null,
  currentEpisode: null,
  currentQuality: "720",
  currentSource: "anilibria",
  manifestBlobUrl: null,
  hls: null
};

const els = {
  tabs: Array.from(document.querySelectorAll("[data-view]")),
  panels: Array.from(document.querySelectorAll("[data-view-panel]")),
  brandBtn: document.getElementById("brand-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  searchInput: document.getElementById("search-input"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroMeta: document.getElementById("hero-meta"),
  heroPoster: document.getElementById("hero-poster"),
  heroOpenBtn: document.getElementById("hero-open-btn"),
  heroRandomBtn: document.getElementById("hero-random-btn"),
  latestCount: document.getElementById("latest-count"),
  catalogCount: document.getElementById("catalog-count"),
  ongoingCount: document.getElementById("ongoing-count"),
  genresCount: document.getElementById("genres-count"),
  latestGrid: document.getElementById("latest-grid"),
  recommendedGrid: document.getElementById("recommended-grid"),
  catalogGrid: document.getElementById("catalog-grid"),
  ongoingGrid: document.getElementById("ongoing-grid"),
  genreGrid: document.getElementById("genre-grid"),
  scheduleGrid: document.getElementById("schedule-grid"),
  searchGrid: document.getElementById("search-grid"),
  catalogSort: document.getElementById("catalog-sort"),
  catalogType: document.getElementById("catalog-type"),
  catalogSummary: document.getElementById("catalog-summary"),
  ongoingSummary: document.getElementById("ongoing-summary"),
  genreSummary: document.getElementById("genre-summary"),
  searchSummary: document.getElementById("search-summary"),
  catalogMoreBtn: document.getElementById("catalog-more-btn"),
  ongoingMoreBtn: document.getElementById("ongoing-more-btn"),
  genreMoreBtn: document.getElementById("genre-more-btn"),
  genreStrip: document.getElementById("genre-strip"),
  drawer: document.getElementById("details-drawer"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  drawerClose: document.getElementById("drawer-close"),
  detailPoster: document.getElementById("detail-poster"),
  detailTitle: document.getElementById("detail-title"),
  detailDescription: document.getElementById("detail-description"),
  detailMeta: document.getElementById("detail-meta"),
  detailChips: document.getElementById("detail-chips"),
  sourceSwitch: document.getElementById("source-switch"),
  voiceList: document.getElementById("voice-list"),
  crewList: document.getElementById("crew-list"),
  episodesList: document.getElementById("episodes-list"),
  playerTitle: document.getElementById("player-title"),
  playerNote: document.getElementById("player-note"),
  qualitySwitch: document.getElementById("quality-switch"),
  player: document.getElementById("anime-player"),
  externalPlayer: document.getElementById("external-player"),
  cardTemplate: document.getElementById("anime-card-template")
};

function applyStaticText() {
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const brandSub = document.querySelector(".brand-sub");
  const searchLabel = document.querySelector(".search-box__label");
  const topTabs = document.querySelector(".top-tabs");
  const homeSections = document.querySelectorAll('[data-view-panel="home"] .section-shell');
  const catalogPanel = document.querySelector('[data-view-panel="catalog"]');
  const ongoingPanel = document.querySelector('[data-view-panel="ongoing"]');
  const genresPanel = document.querySelector('[data-view-panel="genres"]');
  const schedulePanel = document.querySelector('[data-view-panel="schedule"]');
  const searchPanel = document.querySelector('[data-view-panel="search"]');
  const statLabels = document.querySelectorAll(".stat-card small");
  const detailKicker = document.querySelector(".detail-hero .section-kicker");
  const playerKicker = document.querySelector(".player-toolbar .section-kicker");
  const detailLabels = document.querySelectorAll(".side-card .detail-label");
  const voiceLabel = document.querySelector(".voice-block .detail-label");

  document.title = "AnimeCloud — аниме с русской озвучкой";
  if (descriptionMeta) {
    descriptionMeta.setAttribute("content", "AnimeCloud — каталог аниме с русской озвучкой на базе AniLibria: новинки, каталог, онгоинги, расписание и встроенный плеер.");
  }
  if (topTabs) {
    topTabs.setAttribute("aria-label", "Разделы сайта");
  }
  if (brandSub) {
    brandSub.textContent = "Каталог, расписание и просмотр аниме с русской озвучкой через AniLibria API.";
  }
  if (searchLabel) {
    searchLabel.textContent = "Поиск по AniLibria";
  }
  if (els.searchInput) {
    els.searchInput.placeholder = "Например: Naruto, Bleach, Dorohedoro";
  }
  if (els.refreshBtn) {
    els.refreshBtn.textContent = "Обновить";
  }
  if (els.heroOpenBtn) {
    els.heroOpenBtn.textContent = "Открыть релиз";
  }
  if (els.heroRandomBtn) {
    els.heroRandomBtn.textContent = "Случайный тайтл";
  }
  if (els.drawerClose) {
    els.drawerClose.setAttribute("aria-label", "Закрыть");
  }
  if (els.drawer) {
    els.drawer.setAttribute("aria-hidden", "true");
  }

  els.tabs.forEach((button) => {
    const labels = {
      home: "Главная",
      catalog: "Каталог",
      ongoing: "Онгоинги",
      genres: "Жанры",
      schedule: "Расписание",
      search: "Поиск"
    };
    button.textContent = labels[button.dataset.view] || button.textContent;
  });

  if (homeSections[0]) {
    homeSections[0].querySelector(".section-kicker").textContent = "Лента";
    homeSections[0].querySelector("h2").textContent = "Последние релизы";
  }
  if (homeSections[1]) {
    homeSections[1].querySelector(".section-kicker").textContent = "Подборка";
    homeSections[1].querySelector("h2").textContent = "Что посмотреть";
  }
  if (catalogPanel) {
    catalogPanel.querySelector(".section-kicker").textContent = "Полная база";
    catalogPanel.querySelector("h2").textContent = "Каталог AniLibria";
    catalogPanel.querySelector(".select-control span").textContent = "Сортировка";
    catalogPanel.querySelectorAll(".select-control span")[1].textContent = "Формат";
    els.catalogMoreBtn.textContent = "Показать ещё";
  }
  if (ongoingPanel) {
    ongoingPanel.querySelector(".section-kicker").textContent = "Сейчас выходят";
    ongoingPanel.querySelector("h2").textContent = "Онгоинги";
    els.ongoingMoreBtn.textContent = "Показать ещё";
  }
  if (genresPanel) {
    genresPanel.querySelector(".section-kicker").textContent = "Навигация по жанрам";
    genresPanel.querySelector("h2").textContent = "Жанры";
    els.genreMoreBtn.textContent = "Показать ещё";
  }
  if (schedulePanel) {
    schedulePanel.querySelector(".section-kicker").textContent = "Недельный план";
    schedulePanel.querySelector("h2").textContent = "Расписание выхода";
    schedulePanel.querySelector(".section-summary").textContent = "Компактный список по дням недели без тяжёлого рендера больших сеток.";
  }
  if (searchPanel) {
    searchPanel.querySelector(".section-kicker").textContent = "Поиск";
    searchPanel.querySelector("h2").textContent = "Результаты";
  }

  if (statLabels[0]) statLabels[0].textContent = "последних релизов";
  if (statLabels[1]) statLabels[1].textContent = "тайтлов в каталоге";
  if (statLabels[2]) statLabels[2].textContent = "онгоингов";
  if (statLabels[3]) statLabels[3].textContent = "жанров";

  if (detailKicker) detailKicker.textContent = "Карточка релиза";
  if (playerKicker) playerKicker.textContent = "Плеер";
  if (voiceLabel) voiceLabel.textContent = "Озвучка релиза";
  if (detailLabels[0]) detailLabels[0].textContent = "Серии";
  if (detailLabels[1]) detailLabels[1].textContent = "Команда релиза";
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}

function absoluteUrl(path) {
  if (!path) return "./mc-icon-512.png?v=4";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("//")) return `https:${path}`;
  return ORIGIN_BASE + path;
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
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        if (value.length) url.searchParams.set(key, value.join(","));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function fetchJson(path, params, options = {}) {
  const ttl = options.ttl ?? CACHE_TTL;
  const url = apiUrl(path, params);
  const now = Date.now();
  const cached = responseCache.get(url);

  if (ttl > 0 && cached && now - cached.time < ttl) {
    return cached.data;
  }

  if (requestCache.has(url)) {
    return requestCache.get(url);
  }

  const promise = fetch(url, {
    cache: "no-store",
    signal: options.signal
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      const data = await response.json();
      if (ttl > 0) {
        responseCache.set(url, { time: Date.now(), data });
      }
      return data;
    })
    .finally(() => {
      requestCache.delete(url);
    });

  requestCache.set(url, promise);
  return promise;
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function extractPagination(payload) {
  const pagination = payload?.meta?.pagination;
  if (pagination) return pagination;
  return {
    current_page: 1,
    total_pages: 1,
    total: extractList(payload).length
  };
}

function buildRelease(item) {
  const source = item?.release || item || {};
  const publishedEpisode = item?.published_release_episode || source.published_release_episode || null;
  const members = Array.isArray(source.members) ? source.members : [];
  const genres = Array.isArray(source.genres)
    ? source.genres.map((genre) => genre?.name || genre?.description || genre?.value).filter(Boolean)
    : [];

  return {
    id: source.id,
    alias: source.alias,
    title: source.name?.main || source.name?.english || "Без названия",
    englishTitle: source.name?.english || "",
    altTitle: source.name?.alternative || "",
    year: source.year || "—",
    type: source.type?.description || source.type?.value || "Не указан",
    typeValue: source.type?.value || "",
    season: source.season?.description || "",
    seasonValue: source.season?.value || "",
    age: source.age_rating?.label || "—",
    ageValue: source.age_rating?.value || "",
    ongoing: Boolean(source.is_ongoing || source.is_in_production),
    statusLabel: source.is_ongoing || source.is_in_production ? "Онгоинг" : "Завершён",
    publishDay: source.publish_day?.description || "",
    publishDayValue: source.publish_day?.value || 0,
    description: source.description || "Описание пока не заполнено.",
    poster: absoluteUrl(
      source.poster?.optimized?.src ||
        source.poster?.optimized?.preview ||
        source.poster?.preview ||
        source.poster?.src ||
        source.poster?.optimized?.thumbnail ||
        source.poster?.thumbnail
    ),
    cardPoster: absoluteUrl(
      source.poster?.optimized?.preview ||
        source.poster?.preview ||
        source.poster?.optimized?.src ||
        source.poster?.src ||
        source.poster?.optimized?.thumbnail ||
        source.poster?.thumbnail
    ),
    thumb: absoluteUrl(
      source.poster?.optimized?.thumbnail ||
        source.poster?.thumbnail ||
        source.poster?.optimized?.preview ||
        source.poster?.preview ||
        source.poster?.src
    ),
    genres,
    episodesTotal: source.episodes_total || source.episodes?.length || 0,
    averageDuration: source.average_duration_of_episode || 0,
    favorites: source.added_in_users_favorites || 0,
    updatedAt: source.updated_at || source.fresh_at || "",
    members,
    voices: members.filter((member) => member?.role?.value === "voicing").map((member) => member.nickname).filter(Boolean),
    crew: members
      .map((member) => ({
        name: member?.nickname,
        role: member?.role?.description || member?.role?.value || "Команда"
      }))
      .filter((member) => member.name),
    episodes: Array.isArray(source.episodes)
      ? source.episodes.slice().sort((left, right) => (left.ordinal || 0) - (right.ordinal || 0))
      : [],
    externalPlayer: normalizeExternalPlayer(source.external_player),
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

function buildReleases(payload) {
  return extractList(payload).map(buildRelease);
}

function formatDurationMinutes(minutes) {
  if (!minutes) return "";
  return `${minutes} мин.`;
}

function formatEpisodeDuration(seconds) {
  if (!seconds) return "";
  return `${Math.max(1, Math.round(seconds / 60))} мин.`;
}

function createEmptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = message;
  return node;
}

function scheduleChunkAppend(target, nodes) {
  const token = `${Date.now()}-${Math.random()}`;
  target.dataset.renderToken = token;
  let index = 0;

  function appendBatch() {
    if (target.dataset.renderToken !== token) return;
    const fragment = document.createDocumentFragment();
    const batchEnd = Math.min(index + 10, nodes.length);

    while (index < batchEnd) {
      fragment.appendChild(nodes[index]);
      index += 1;
    }

    target.appendChild(fragment);

    if (index < nodes.length) {
      requestAnimationFrame(appendBatch);
    }
  }

  requestAnimationFrame(appendBatch);
}

function updateGrid(target, releases, emptyMessage, options = {}) {
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

  const nodes = releases.map((release, index) => createAnimeCard(release, offset + index));
  scheduleChunkAppend(target, nodes);
}

function createTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function createAnimeCard(release, index) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const button = node.querySelector(".anime-card__action");
  const poster = node.querySelector(".anime-card__poster");
  const age = node.querySelector(".anime-card__age");
  const status = node.querySelector(".anime-card__status");
  const title = node.querySelector(".anime-card__title");
  const meta = node.querySelector(".anime-card__meta");
  const tags = node.querySelector(".anime-card__tags");

  poster.src = release.cardPoster;
  poster.alt = release.title;
  poster.loading = index < 6 ? "eager" : "lazy";
  poster.decoding = "async";
  poster.srcset = `${release.cardPoster} 1x, ${release.poster} 2x`;
  poster.sizes = "(max-width: 560px) 46vw, (max-width: 920px) 32vw, 220px";

  age.textContent = release.age;
  status.textContent = release.statusLabel;
  title.textContent = release.title;
  meta.textContent = [release.type, release.year, `${release.episodesTotal || "?"} эп.`].filter(Boolean).join(" • ");

  const tagValues = release.genres.slice(0, 2);
  if (!tagValues.length && release.publishDay) tagValues.push(release.publishDay);
  tagValues.forEach((value) => tags.appendChild(createTag(value)));

  button.addEventListener("click", () => {
    openRelease(release.alias).catch((error) => console.error(error));
  });

  button.addEventListener("mouseenter", () => prefetchRelease(release.alias), { once: true });
  button.addEventListener("focus", () => prefetchRelease(release.alias), { once: true });

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

function renderHero(release) {
  if (!release) return;
  const metaItems = [
    `${release.type} • ${release.year}`,
    release.season,
    `${release.episodesTotal || "?"} эп.`,
    release.publishDay ? `Выходит: ${release.publishDay}` : "",
    release.age
  ].filter(Boolean);

  els.heroTitle.textContent = release.title;
  els.heroDescription.textContent = release.description;
  els.heroMeta.replaceChildren(...metaItems.map(createMetaPill));
  els.heroPoster.src = release.poster;
  els.heroPoster.alt = release.title;
}

function updateStats() {
  els.latestCount.textContent = formatNumber(state.latest.length);
  els.catalogCount.textContent = formatNumber(state.catalogTotal);
  els.ongoingCount.textContent = formatNumber(state.ongoingTotal);
  els.genresCount.textContent = formatNumber(state.genres.length);
}

function setView(view) {
  state.currentView = view;
  if (view !== "search") {
    state.previousView = view;
  }

  els.tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  els.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });

  ensureViewLoaded(view).catch((error) => console.error(error));
}

async function ensureViewLoaded(view) {
  switch (view) {
    case "home":
      if (!state.homeLoaded) await loadHome();
      break;
    case "catalog":
      if (!state.catalogLoaded) await loadCatalog({ reset: true });
      break;
    case "ongoing":
      if (!state.ongoingLoaded) await loadOngoing({ reset: true });
      break;
    case "genres":
      if (!state.genresLoaded) await loadGenresView();
      break;
    case "schedule":
      if (!state.scheduleLoaded) await loadSchedule();
      break;
    case "search":
      if (!state.searchQuery.trim()) {
        renderSearchEmpty();
      }
      break;
    default:
      break;
  }
}

async function loadReferences(force = false) {
  if (state.referencesLoaded && !force) return;

  const [genresPayload, sortingPayload, typesPayload] = await Promise.all([
    fetchJson("/anime/catalog/references/genres", null, { ttl: DETAIL_TTL }),
    fetchJson("/anime/catalog/references/sorting", null, { ttl: DETAIL_TTL }),
    fetchJson("/anime/catalog/references/types", null, { ttl: DETAIL_TTL })
  ]);

  state.genres = Array.isArray(genresPayload) ? genresPayload : [];
  state.sortingOptions = Array.isArray(sortingPayload) ? sortingPayload : [];
  state.typeOptions = Array.isArray(typesPayload) ? typesPayload : [];
  state.referencesLoaded = true;

  renderCatalogControls();
  renderGenreButtons();
  updateStats();
}

function renderCatalogControls() {
  els.catalogSort.innerHTML = "";
  els.catalogType.innerHTML = '<option value="">Все форматы</option>';

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
}

function renderGenreButtons() {
  els.genreStrip.innerHTML = "";
  if (!state.genres.length) {
    els.genreStrip.appendChild(createEmptyState("Жанры не загрузились."));
    return;
  }

  const fragment = document.createDocumentFragment();
  state.genres.forEach((genre, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "genre-btn";
    button.textContent = genre.name;
    if ((state.activeGenreId || state.genres[0].id) === genre.id) {
      button.classList.add("is-active");
    }
    if (!state.activeGenreId && index === 0) {
      state.activeGenreId = genre.id;
      button.classList.add("is-active");
    }
    button.addEventListener("click", () => {
      if (state.activeGenreId === genre.id) return;
      state.activeGenreId = genre.id;
      renderGenreButtons();
      loadGenreReleases({ reset: true }).catch((error) => console.error(error));
    });
    fragment.appendChild(button);
  });
  els.genreStrip.appendChild(fragment);
}

async function loadHome(force = false) {
  if (state.homeLoaded && !force) return;

  updateGrid(els.latestGrid, [], "Загрузка последних релизов…");
  updateGrid(els.recommendedGrid, [], "Загрузка подборки…");

  const [latestPayload, recommendedPayload] = await Promise.all([
    fetchJson("/anime/releases/latest", { limit: 18 }, { ttl: 60000 }),
    fetchJson("/anime/releases/recommended", { limit: 12 }, { ttl: 60000 })
  ]);

  state.latest = buildReleases(latestPayload);
  state.recommended = buildReleases(recommendedPayload);
  state.featured = state.latest[0] || state.recommended[0] || null;
  state.homeLoaded = true;

  renderHero(state.featured);
  updateGrid(els.latestGrid, state.latest, "Последние релизы пока не найдены.");
  updateGrid(els.recommendedGrid, state.recommended, "Подборка пока не заполнена.");
  updateStats();
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
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.catalogPage + 1;

  if (reset) {
    state.catalogItems = [];
    state.catalogPage = 0;
    state.catalogHasMore = false;
    els.catalogSummary.textContent = "Загрузка каталога…";
    updateGrid(els.catalogGrid, [], "Загрузка каталога…");
  }

  els.catalogMoreBtn.disabled = true;
  const payload = await fetchJson("/anime/catalog/releases", buildCatalogParams(nextPage), { ttl: 120000 });
  const releases = buildReleases(payload);
  const pagination = extractPagination(payload);

  state.catalogItems = reset ? releases : state.catalogItems.concat(releases);
  state.catalogPage = pagination.current_page || nextPage;
  state.catalogTotal = pagination.total || state.catalogItems.length;
  state.catalogHasMore = state.catalogPage < (pagination.total_pages || 1);
  state.catalogLoaded = true;

  els.catalogSummary.textContent = `${formatNumber(state.catalogTotal)} тайтлов. Страница ${state.catalogPage} из ${pagination.total_pages || 1}.`;
  if (reset) {
    updateGrid(els.catalogGrid, state.catalogItems, "Каталог пуст.");
  } else {
    updateGrid(els.catalogGrid, releases, "Каталог пуст.", { append: true, offset: state.catalogItems.length - releases.length });
  }

  els.catalogMoreBtn.hidden = !state.catalogHasMore;
  els.catalogMoreBtn.disabled = !state.catalogHasMore;
  updateStats();
}

async function loadOngoing(options = {}) {
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.ongoingPage + 1;

  if (reset) {
    state.ongoingItems = [];
    state.ongoingPage = 0;
    state.ongoingHasMore = false;
    els.ongoingSummary.textContent = "Загрузка онгоингов…";
    updateGrid(els.ongoingGrid, [], "Загрузка онгоингов…");
  }

  els.ongoingMoreBtn.disabled = true;
  const payload = await fetchJson(
    "/anime/catalog/releases",
    buildCatalogParams(nextPage, {
      "f[publish_statuses]": "IS_ONGOING"
    }),
    { ttl: 120000 }
  );
  const releases = buildReleases(payload);
  const pagination = extractPagination(payload);

  state.ongoingItems = reset ? releases : state.ongoingItems.concat(releases);
  state.ongoingPage = pagination.current_page || nextPage;
  state.ongoingTotal = pagination.total || state.ongoingItems.length;
  state.ongoingHasMore = state.ongoingPage < (pagination.total_pages || 1);
  state.ongoingLoaded = true;

  els.ongoingSummary.textContent = `${formatNumber(state.ongoingTotal)} активных релизов. Страница ${state.ongoingPage} из ${pagination.total_pages || 1}.`;
  if (reset) {
    updateGrid(els.ongoingGrid, state.ongoingItems, "Онгоинги не найдены.");
  } else {
    updateGrid(els.ongoingGrid, releases, "Онгоинги не найдены.", { append: true, offset: state.ongoingItems.length - releases.length });
  }

  els.ongoingMoreBtn.hidden = !state.ongoingHasMore;
  els.ongoingMoreBtn.disabled = !state.ongoingHasMore;
  updateStats();
}

async function loadGenresView() {
  if (!state.referencesLoaded) {
    await loadReferences();
  }
  state.genresLoaded = true;
  renderGenreButtons();
  await loadGenreReleases({ reset: true });
}

async function loadGenreReleases(options = {}) {
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.genrePage + 1;

  if (!state.activeGenreId) {
    els.genreSummary.textContent = "Жанр не выбран.";
    updateGrid(els.genreGrid, [], "Сначала выберите жанр.");
    return;
  }

  if (reset) {
    state.genreItems = [];
    state.genrePage = 0;
    state.genreHasMore = false;
    const currentGenre = state.genres.find((genre) => genre.id === state.activeGenreId);
    els.genreSummary.textContent = currentGenre ? `Загрузка жанра «${currentGenre.name}»…` : "Загрузка жанра…";
    updateGrid(els.genreGrid, [], "Загрузка жанра…");
  }

  els.genreMoreBtn.disabled = true;
  const payload = await fetchJson(`/anime/genres/${encodeURIComponent(state.activeGenreId)}/releases`, { page: nextPage, limit: GRID_PAGE_SIZE }, { ttl: 120000 });
  const releases = buildReleases(payload);
  const pagination = extractPagination(payload);
  const currentGenre = state.genres.find((genre) => genre.id === state.activeGenreId);

  state.genreItems = reset ? releases : state.genreItems.concat(releases);
  state.genrePage = pagination.current_page || nextPage;
  state.genreTotal = pagination.total || state.genreItems.length;
  state.genreHasMore = state.genrePage < (pagination.total_pages || 1);

  els.genreSummary.textContent = currentGenre
    ? `${currentGenre.name}: ${formatNumber(state.genreTotal)} тайтлов. Страница ${state.genrePage} из ${pagination.total_pages || 1}.`
    : `${formatNumber(state.genreTotal)} тайтлов.`;

  if (reset) {
    updateGrid(els.genreGrid, state.genreItems, "В этом жанре пока ничего нет.");
  } else {
    updateGrid(els.genreGrid, releases, "В этом жанре пока ничего нет.", { append: true, offset: state.genreItems.length - releases.length });
  }

  els.genreMoreBtn.hidden = !state.genreHasMore;
  els.genreMoreBtn.disabled = !state.genreHasMore;
}

async function loadSchedule() {
  state.scheduleLoaded = true;
  els.scheduleGrid.replaceChildren(createEmptyState("Загрузка расписания…"));

  const payload = await fetchJson("/anime/schedule/week", null, { ttl: 60000 });
  state.scheduleItems = buildReleases(payload);
  renderSchedule();
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
      if (dayDiff !== 0) return dayDiff;
      return left.title.localeCompare(right.title, "ru");
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
      button.innerHTML = `
        <img src="${release.thumb}" alt="${release.title}" loading="lazy" decoding="async">
        <div class="schedule-item__body">
          <strong>${release.title}</strong>
          <span>${release.type} • ${release.year}</span>
          <small>${
            release.publishedEpisode
              ? `Доступна ${release.publishedEpisode.ordinal} серия`
              : release.nextEpisodeNumber
                ? `Следующая серия: ${release.nextEpisodeNumber}`
                : `${release.episodesTotal || "?"} эп.`
          }</small>
        </div>
      `;
      button.addEventListener("click", () => {
        openRelease(release.alias).catch((error) => console.error(error));
      });
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
  els.searchSummary.textContent = "Введите название в строке поиска сверху.";
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
  updateGrid(els.searchGrid, [], "Ищем релизы…");

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

function prefetchRelease(alias) {
  fetchJson(`/anime/releases/${encodeURIComponent(alias)}`, null, { ttl: DETAIL_TTL }).catch(() => {});
}

function openDrawer() {
  els.drawer.classList.add("is-open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  destroyPlayer();
  stopExternalPlayer();
}

function destroyPlayer() {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  els.player.pause();
  els.player.removeAttribute("src");
  els.player.load();
  if (state.manifestBlobUrl) {
    URL.revokeObjectURL(state.manifestBlobUrl);
    state.manifestBlobUrl = null;
  }
}

function stopExternalPlayer() {
  els.externalPlayer.src = "about:blank";
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

  if (!options.some((item) => item.key === state.currentQuality)) {
    const preferred = options.find((item) => item.key === "720") || options[0];
    state.currentQuality = preferred ? preferred.key : "720";
  }

  return options;
}

function proxiedMediaUrl(url) {
  const normalized = url.startsWith("//") ? `https:${url}` : url;
  const parsed = new URL(normalized);
  return `${MEDIA_PROXY_BASE}${parsed.pathname}${parsed.search}`;
}

function rewriteManifestLine(line, manifestUrl) {
  if (!line || line.startsWith("#")) return line;
  try {
    const absolute = new URL(line, manifestUrl).toString();
    return `${window.location.origin}${proxiedMediaUrl(absolute)}`;
  } catch {
    return line;
  }
}

async function loadManifestBlob(manifestUrl) {
  const response = await fetch(proxiedMediaUrl(manifestUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  const manifestText = await response.text();
  const rewrittenText = manifestText
    .split("\n")
    .map((line) => rewriteManifestLine(line.trim(), manifestUrl))
    .join("\n");
  const blob = new Blob([rewrittenText], { type: "application/vnd.apple.mpegurl" });
  return URL.createObjectURL(blob);
}

async function attachPlayer(manifestUrl) {
  destroyPlayer();
  stopExternalPlayer();
  showVideoSurface();

  const blobUrl = await loadManifestBlob(manifestUrl);
  state.manifestBlobUrl = blobUrl;

  if (window.Hls && window.Hls.isSupported()) {
    state.hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });
    state.hls.loadSource(blobUrl);
    state.hls.attachMedia(els.player);
    return;
  }

  els.player.src = blobUrl;
}

function buildSourceList(release) {
  const sources = [
    {
      id: "anilibria",
      title: "AniLibria",
      note: release.voices.length ? release.voices.slice(0, 3).join(", ") : "Русская озвучка"
    }
  ];

  if (release.externalPlayer) {
    sources.push({
      id: "external",
      title: "Доп. источник",
      note: "Внешний плеер"
    });
  }

  return sources;
}

function renderSourceSwitch(release) {
  const sources = buildSourceList(release);
  els.sourceSwitch.innerHTML = "";

  sources.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-btn${state.currentSource === source.id ? " is-active" : ""}`;
    button.innerHTML = `<strong>${source.title}</strong><small>${source.note}</small>`;
    button.addEventListener("click", () => {
      switchSource(source.id);
    });
    els.sourceSwitch.appendChild(button);
  });
}

function renderVoices(release) {
  els.voiceList.innerHTML = "";
  if (!release.voices.length) {
    els.voiceList.appendChild(createEmptyState("Состав озвучки не указан."));
    return;
  }

  release.voices.forEach((name) => {
    const pill = document.createElement("div");
    pill.className = "voice-pill";
    pill.innerHTML = `<strong>${name}</strong><small>озвучка</small>`;
    els.voiceList.appendChild(pill);
  });
}

function renderCrew(release) {
  els.crewList.innerHTML = "";
  if (!release.crew.length) {
    els.crewList.appendChild(createEmptyState("Команда релиза не указана."));
    return;
  }

  release.crew.forEach((member) => {
    const pill = document.createElement("div");
    pill.className = "crew-pill";
    pill.innerHTML = `<strong>${member.name}</strong><small>${member.role}</small>`;
    els.crewList.appendChild(pill);
  });
}

function renderEpisodes(release) {
  els.episodesList.innerHTML = "";

  if (!release.episodes.length) {
    els.episodesList.appendChild(createEmptyState("У этого релиза пока нет опубликованных серий."));
    return;
  }

  release.episodes.forEach((episode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `episode-btn${state.currentEpisode?.id === episode.id ? " is-active" : ""}`;
    button.innerHTML = `
      <strong>${episode.ordinal} серия</strong>
      <span>${episode.name || "Без названия"}</span>
      <small>${formatEpisodeDuration(episode.duration) || "Длительность не указана"}</small>
    `;
    button.addEventListener("click", () => {
      selectEpisode(episode).catch((error) => console.error(error));
    });
    els.episodesList.appendChild(button);
  });
}

function renderDetails(release) {
  els.detailPoster.src = release.poster;
  els.detailPoster.alt = release.title;
  els.detailTitle.textContent = release.title;
  els.detailDescription.textContent = release.description;

  const metaItems = [
    release.type,
    release.year,
    release.season,
    `${release.episodesTotal || "?"} эп.`,
    formatDurationMinutes(release.averageDuration),
    release.publishDay ? `Выходит: ${release.publishDay}` : "",
    release.favorites ? `${formatNumber(release.favorites)} в избранном` : "",
    release.age
  ].filter(Boolean);

  els.detailMeta.replaceChildren(...metaItems.map(createMetaPill));
  els.detailChips.replaceChildren(...release.genres.slice(0, 10).map(createChip));
  renderVoices(release);
  renderCrew(release);
  renderEpisodes(release);
  renderSourceSwitch(release);
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
      selectEpisode(episode).catch((error) => console.error(error));
    });
    els.qualitySwitch.appendChild(button);
  });

  return qualities;
}

async function selectEpisode(episode) {
  if (!state.currentAnime) return;

  state.currentSource = "anilibria";
  state.currentEpisode = episode;
  renderEpisodes(state.currentAnime);
  renderSourceSwitch(state.currentAnime);
  showVideoSurface();
  stopExternalPlayer();

  const qualities = renderQualityButtons(episode);
  const selectedQuality = qualities.find((quality) => quality.key === state.currentQuality) || qualities[0];

  els.playerTitle.textContent = `${episode.ordinal} серия${episode.name ? ` • ${episode.name}` : ""}`;

  if (!selectedQuality) {
    destroyPlayer();
    els.playerNote.textContent = "У этой серии пока нет доступного потока.";
    return;
  }

  els.playerNote.textContent = "Поток загружается через ваш домен, поэтому браузер не упирается в CORS внешнего CDN.";

  try {
    await attachPlayer(selectedQuality.url);
    els.player.play().catch(() => {});
  } catch (error) {
    console.error(error);
    els.playerNote.textContent = "Не удалось загрузить поток. Попробуйте другую серию или другое качество.";
  }
}

function switchSource(sourceId) {
  if (!state.currentAnime) return;
  state.currentSource = sourceId;
  renderSourceSwitch(state.currentAnime);

  if (sourceId === "external" && state.currentAnime.externalPlayer) {
    showExternalSurface(state.currentAnime.externalPlayer);
    els.qualitySwitch.innerHTML = "";
    els.playerTitle.textContent = "Альтернативный плеер";
    els.playerNote.textContent = "Если в этом источнике доступны свои серии или дополнительные варианты, они управляются внутри самого плеера.";
    return;
  }

  if (state.currentEpisode) {
    selectEpisode(state.currentEpisode).catch((error) => console.error(error));
    return;
  }

  if (state.currentAnime.episodes.length) {
    selectEpisode(state.currentAnime.episodes[0]).catch((error) => console.error(error));
    return;
  }

  destroyPlayer();
  stopExternalPlayer();
  els.qualitySwitch.innerHTML = "";
  els.playerTitle.textContent = "Серии отсутствуют";
  els.playerNote.textContent = "Для этого релиза пока нет опубликованных эпизодов.";
}

async function openRelease(alias) {
  const payload = await fetchJson(`/anime/releases/${encodeURIComponent(alias)}`, null, { ttl: DETAIL_TTL });
  const release = buildRelease(payload);

  state.currentAnime = release;
  state.currentEpisode = null;
  state.currentQuality = "720";
  state.currentSource = "anilibria";

  renderDetails(release);
  openDrawer();

  if (release.episodes.length) {
    await selectEpisode(release.episodes[0]);
    return;
  }

  if (release.externalPlayer) {
    switchSource("external");
    return;
  }

  destroyPlayer();
  stopExternalPlayer();
  els.qualitySwitch.innerHTML = "";
  els.playerTitle.textContent = "Серии отсутствуют";
  els.playerNote.textContent = "У релиза пока нет доступных серий.";
}

async function loadRandomRelease() {
  const release = buildRelease(await fetchJson("/anime/releases/random", null, { ttl: 60000 }));
  await openRelease(release.alias);
}

function resetStateForRefresh() {
  responseCache.clear();
  requestCache.clear();
  state.homeLoaded = false;
  state.catalogLoaded = false;
  state.ongoingLoaded = false;
  state.genresLoaded = false;
  state.scheduleLoaded = false;
  state.catalogItems = [];
  state.ongoingItems = [];
  state.genreItems = [];
  state.scheduleItems = [];
}

async function refreshCurrentView() {
  resetStateForRefresh();
  await loadReferences(true);
  await loadHome(true);

  if (state.currentView === "catalog") {
    await loadCatalog({ reset: true });
  } else if (state.currentView === "ongoing") {
    await loadOngoing({ reset: true });
  } else if (state.currentView === "genres") {
    await loadGenresView();
  } else if (state.currentView === "schedule") {
    await loadSchedule();
  } else if (state.currentView === "search" && state.searchQuery) {
    await runSearch(state.searchQuery);
  }
}

function bindEvents() {
  els.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  els.brandBtn.addEventListener("click", () => {
    els.searchInput.value = "";
    state.searchQuery = "";
    state.searchResults = [];
    closeDrawer();
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.refreshBtn.addEventListener("click", () => {
    refreshCurrentView().catch((error) => console.error(error));
  });

  els.heroOpenBtn.addEventListener("click", () => {
    if (!state.featured) return;
    openRelease(state.featured.alias).catch((error) => console.error(error));
  });

  els.heroRandomBtn.addEventListener("click", () => {
    loadRandomRelease().catch((error) => console.error(error));
  });

  els.catalogSort.addEventListener("change", () => {
    state.catalogSort = els.catalogSort.value;
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch((error) => console.error(error));
  });

  els.catalogType.addEventListener("change", () => {
    state.catalogType = els.catalogType.value;
    state.catalogLoaded = false;
    loadCatalog({ reset: true }).catch((error) => console.error(error));
  });

  els.catalogMoreBtn.addEventListener("click", () => {
    if (!state.catalogHasMore) return;
    loadCatalog().catch((error) => console.error(error));
  });

  els.ongoingMoreBtn.addEventListener("click", () => {
    if (!state.ongoingHasMore) return;
    loadOngoing().catch((error) => console.error(error));
  });

  els.genreMoreBtn.addEventListener("click", () => {
    if (!state.genreHasMore) return;
    loadGenreReleases().catch((error) => console.error(error));
  });

  els.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      runSearch(els.searchInput.value).catch((error) => console.error(error));
    }, SEARCH_DEBOUNCE);
  });

  els.drawerClose.addEventListener("click", closeDrawer);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
    }
  });
}

async function init() {
  applyStaticText();
  bindEvents();

  try {
    await loadReferences();
    await loadHome();
  } catch (error) {
    console.error(error);
    els.heroTitle.textContent = "AniLibria API недоступен";
    els.heroDescription.textContent = "Проверьте rewrites /api/anilibria и /api/anilibria-media в vercel.json.";
    updateGrid(els.latestGrid, [], "Каталог не загрузился.");
    updateGrid(els.recommendedGrid, [], "Подборка не загрузилась.");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch((error) => console.error(error));
    });
  }
}

init();
