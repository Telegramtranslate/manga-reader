const API_BASE = "/api/anilibria";
const ORIGIN_BASE = "https://anilibria.top";
const MEDIA_PROXY_BASE = "/api/anilibria-media";

const state = {
  latest: [],
  recommended: [],
  search: [],
  featured: null,
  currentAnime: null,
  currentEpisode: null,
  currentQuality: "720",
  searchTimer: null,
  manifestUrl: null,
  hls: null
};

const els = {
  latestGrid: document.getElementById("latest-grid"),
  recommendedGrid: document.getElementById("recommended-grid"),
  searchGrid: document.getElementById("search-grid"),
  searchInput: document.getElementById("search-input"),
  refreshBtn: document.getElementById("refresh-btn"),
  brandBtn: document.getElementById("brand-btn"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroMeta: document.getElementById("hero-meta"),
  heroPoster: document.getElementById("hero-poster"),
  heroOpenBtn: document.getElementById("hero-open-btn"),
  heroRandomBtn: document.getElementById("hero-random-btn"),
  latestCount: document.getElementById("latest-count"),
  recommendedCount: document.getElementById("recommended-count"),
  searchCount: document.getElementById("search-count"),
  drawer: document.getElementById("details-drawer"),
  drawerClose: document.getElementById("drawer-close"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  detailPoster: document.getElementById("detail-poster"),
  detailTitle: document.getElementById("detail-title"),
  detailDescription: document.getElementById("detail-description"),
  detailChips: document.getElementById("detail-chips"),
  detailMeta: document.getElementById("detail-meta"),
  voiceList: document.getElementById("voice-list"),
  episodesList: document.getElementById("episodes-list"),
  qualitySwitch: document.getElementById("quality-switch"),
  player: document.getElementById("anime-player"),
  playerTitle: document.getElementById("player-title"),
  playerNote: document.getElementById("player-note"),
  cardTemplate: document.getElementById("anime-card-template")
};

function absoluteUrl(path) {
  if (!path) return "./mc-icon-512.png";
  if (/^https?:\/\//i.test(path)) return path;
  return ORIGIN_BASE + path;
}

function apiUrl(path, params) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

async function fetchJson(path, params) {
  const response = await fetch(apiUrl(path, params), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("API request failed: " + response.status);
  }
  return response.json();
}

function normalizeRelease(item) {
  return {
    id: item.id,
    alias: item.alias,
    title: item.name?.main || item.name?.english || "Без названия",
    englishTitle: item.name?.english || "",
    altTitle: item.name?.alternative || "",
    year: item.year || "—",
    type: item.type?.description || item.type?.value || "—",
    season: item.season?.description || "",
    age: item.age_rating?.label || "—",
    ongoing: Boolean(item.is_ongoing || item.is_in_production),
    poster: absoluteUrl(item.poster?.optimized?.preview || item.poster?.optimized?.src || item.poster?.src),
    thumb: absoluteUrl(item.poster?.optimized?.thumbnail || item.poster?.thumbnail || item.poster?.src),
    description: item.description || "Описание пока не заполнено.",
    genres: Array.isArray(item.genres) ? item.genres.map((genre) => genre.name || genre.description || genre.value).filter(Boolean) : [],
    episodesTotal: item.episodes_total || item.episodes?.length || 0,
    averageDuration: item.average_duration_of_episode || 0,
    updatedAt: item.updated_at || item.fresh_at || "",
    members: Array.isArray(item.members) ? item.members : [],
    episodes: Array.isArray(item.episodes) ? item.episodes : []
  };
}

function renderEmpty(target, message) {
  target.innerHTML = `<div class="empty-state">${message}</div>`;
}

function renderGrid(target, list, emptyMessage) {
  if (!list.length) {
    renderEmpty(target, emptyMessage);
    return;
  }
  target.innerHTML = "";
  list.forEach((item) => {
    const release = normalizeRelease(item);
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".anime-card__poster").src = release.thumb;
    node.querySelector(".anime-card__poster").alt = release.title;
    node.querySelector(".anime-card__age").textContent = release.age;
    node.querySelector(".anime-card__status").textContent = release.ongoing ? "Онгоинг" : "Завершён";
    node.querySelector(".anime-card__title").textContent = release.title;
    node.querySelector(".anime-card__meta").textContent = `${release.type} • ${release.year} • ${release.episodesTotal || "?"} эп.`;
    node.addEventListener("click", () => openRelease(release.alias));
    target.appendChild(node);
  });
}

function renderHero(release) {
  if (!release) return;
  const meta = [
    `${release.type} • ${release.year}`,
    release.season,
    `${release.episodesTotal || "?"} эп.`,
    release.age
  ].filter(Boolean);
  els.heroTitle.textContent = release.title;
  els.heroDescription.textContent = release.description;
  els.heroMeta.innerHTML = meta.map((item) => `<span class="chip">${item}</span>`).join("");
  els.heroPoster.src = release.poster;
  els.heroPoster.alt = release.title;
}

function setCounts() {
  els.latestCount.textContent = String(state.latest.length);
  els.recommendedCount.textContent = String(state.recommended.length);
  els.searchCount.textContent = String(state.search.length);
}

function formatMeta(release) {
  return [
    release.type,
    release.year,
    release.season,
    `${release.episodesTotal || "?"} эпизодов`,
    release.averageDuration ? `${release.averageDuration} мин.` : "",
    release.age
  ].filter(Boolean);
}

function renderVoices(release) {
  const voices = release.members.filter((member) => member.role?.value === "voicing");
  if (!voices.length) {
    renderEmpty(els.voiceList, "Состав озвучки не указан.");
    return;
  }
  els.voiceList.innerHTML = voices
    .map((member) => `<div class="voice-pill">${member.nickname}<small> • озвучка</small></div>`)
    .join("");
}

function renderEpisodes(release) {
  if (!release.episodes.length) {
    renderEmpty(els.episodesList, "Для этого релиза пока нет опубликованных эпизодов.");
    return;
  }

  els.episodesList.innerHTML = "";
  release.episodes
    .slice()
    .sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0))
    .forEach((episode) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "episode-btn";
      if (state.currentEpisode?.id === episode.id) btn.classList.add("is-active");
      btn.innerHTML = `<strong>${episode.ordinal} серия</strong><span>${episode.name || "Без названия"}</span>`;
      btn.addEventListener("click", () => selectEpisode(episode));
      els.episodesList.appendChild(btn);
    });
}

function renderDetails(release) {
  els.detailPoster.src = release.poster;
  els.detailPoster.alt = release.title;
  els.detailTitle.textContent = release.title;
  els.detailDescription.textContent = release.description;
  els.detailChips.innerHTML = release.genres.slice(0, 8).map((genre) => `<span class="chip">${genre}</span>`).join("");
  els.detailMeta.innerHTML = formatMeta(release).map((item) => `<span class="meta-pill">${item}</span>`).join("");
  renderVoices(release);
  renderEpisodes(release);
}

function openDrawer() {
  els.drawer.classList.add("is-open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
  destroyPlayer();
}

function destroyPlayer() {
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  els.player.pause();
  els.player.removeAttribute("src");
  els.player.load();
  if (state.manifestUrl) {
    URL.revokeObjectURL(state.manifestUrl);
    state.manifestUrl = null;
  }
}

function buildQualityOptions(episode) {
  const options = [
    { key: "480", url: episode.hls_480 },
    { key: "720", url: episode.hls_720 },
    { key: "1080", url: episode.hls_1080 }
  ].filter((entry) => entry.url);
  if (!options.length) return [];
  if (!options.some((entry) => entry.key === state.currentQuality)) {
    state.currentQuality = options[0].key;
  }
  return options;
}

function proxiedMediaUrl(url) {
  if (!url) return "";
  const parsed = new URL(url);
  return `${MEDIA_PROXY_BASE}${parsed.pathname}${parsed.search}`;
}

async function loadManifestBlob(manifestUrl) {
  const response = await fetch(proxiedMediaUrl(manifestUrl), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Manifest request failed: " + response.status);
  }
  const manifest = await response.text();
  const rewritten = manifest.replaceAll("https://cache.libria.fun/", `${window.location.origin}${MEDIA_PROXY_BASE}/`);
  const blob = new Blob([rewritten], { type: "application/vnd.apple.mpegurl" });
  return URL.createObjectURL(blob);
}

async function attachPlayer(manifestUrl) {
  destroyPlayer();
  const blobUrl = await loadManifestBlob(manifestUrl);
  state.manifestUrl = blobUrl;

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

async function selectEpisode(episode) {
  state.currentEpisode = episode;
  els.playerTitle.textContent = `${episode.ordinal} серия${episode.name ? ` • ${episode.name}` : ""}`;
  const qualityOptions = buildQualityOptions(episode);
  els.qualitySwitch.innerHTML = qualityOptions
    .map((option) => `<button class="quality-btn${option.key === state.currentQuality ? " is-active" : ""}" type="button" data-quality="${option.key}">${option.key}p</button>`)
    .join("");
  els.qualitySwitch.querySelectorAll("[data-quality]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentQuality = btn.dataset.quality;
      selectEpisode(episode);
    });
  });

  const selectedSource = qualityOptions.find((option) => option.key === state.currentQuality) || qualityOptions[0];
  if (!selectedSource) {
    els.playerNote.textContent = "У этого эпизода пока нет доступного потока.";
    destroyPlayer();
    renderEpisodes(state.currentAnime);
    return;
  }

  els.playerNote.textContent = "Поток загружается через ваш домен, чтобы браузер нормально воспроизводил HLS.";
  renderEpisodes(state.currentAnime);

  try {
    await attachPlayer(selectedSource.url);
    els.player.play().catch(() => {});
  } catch (error) {
    console.error(error);
    els.playerNote.textContent = "Не удалось загрузить поток. Попробуйте другой эпизод или качество.";
  }
}

async function openRelease(alias) {
  try {
    const detail = normalizeRelease(await fetchJson(`/anime/releases/${encodeURIComponent(alias)}`));
    state.currentAnime = detail;
    state.currentEpisode = null;
    state.currentQuality = "720";
    renderDetails(detail);
    openDrawer();
    if (detail.episodes.length) {
      await selectEpisode(detail.episodes[0]);
    } else {
      destroyPlayer();
      els.playerTitle.textContent = "Эпизоды отсутствуют";
      els.playerNote.textContent = "У релиза пока нет опубликованных серий.";
    }
  } catch (error) {
    console.error(error);
    alert("Не удалось открыть релиз. Проверьте API AniLibria.");
  }
}

async function loadRandomRelease() {
  try {
    const release = normalizeRelease(await fetchJson("/anime/releases/random"));
    await openRelease(release.alias);
  } catch (error) {
    console.error(error);
  }
}

async function runSearch(query) {
  const clean = query.trim();
  if (!clean) {
    state.search = [];
    renderEmpty(els.searchGrid, "Введите название аниме, чтобы увидеть результаты поиска.");
    setCounts();
    return;
  }

  try {
    const results = await fetchJson("/app/search/releases", { query: clean });
    state.search = Array.isArray(results) ? results.slice(0, 24) : [];
    renderGrid(els.searchGrid, state.search, "По этому запросу ничего не найдено.");
    setCounts();
  } catch (error) {
    console.error(error);
    renderEmpty(els.searchGrid, "Поиск временно недоступен.");
  }
}

async function loadHome() {
  destroyPlayer();
  renderEmpty(els.latestGrid, "Загрузка последних релизов...");
  renderEmpty(els.recommendedGrid, "Загрузка рекомендаций...");
  renderEmpty(els.searchGrid, "Введите название аниме, чтобы увидеть результаты поиска.");

  const [latest, recommended] = await Promise.all([
    fetchJson("/anime/releases/latest", { limit: 18 }),
    fetchJson("/anime/releases/recommended", { limit: 12 })
  ]);

  state.latest = Array.isArray(latest) ? latest : [];
  state.recommended = Array.isArray(recommended) ? recommended : [];
  state.featured = normalizeRelease(state.latest[0] || state.recommended[0]);

  renderHero(state.featured);
  renderGrid(els.latestGrid, state.latest, "Последние релизы пока не найдены.");
  renderGrid(els.recommendedGrid, state.recommended, "Подборка пока не заполнена.");
  setCounts();
}

function bindEvents() {
  els.refreshBtn.addEventListener("click", () => loadHome().catch(console.error));
  els.brandBtn.addEventListener("click", () => {
    closeDrawer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  els.heroOpenBtn.addEventListener("click", () => {
    if (state.featured) openRelease(state.featured.alias);
  });
  els.heroRandomBtn.addEventListener("click", () => loadRandomRelease());
  els.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runSearch(els.searchInput.value), 320);
  });
  els.drawerClose.addEventListener("click", closeDrawer);
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
}

async function init() {
  bindEvents();
  try {
    await loadHome();
  } catch (error) {
    console.error(error);
    renderEmpty(els.latestGrid, "Каталог не загрузился. Проверьте rewrite на AniLibria в vercel.json.");
    renderEmpty(els.recommendedGrid, "Рекомендации не загрузились.");
    renderEmpty(els.searchGrid, "Поиск будет доступен после восстановления API.");
    els.heroTitle.textContent = "AniLibria API недоступен";
    els.heroDescription.textContent = "Проверьте, что сайт работает через rewrite /api/anilibria и /api/anilibria-media.";
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(console.error);
    });
  }
}

init();
