(function () {
  if (typeof state === "undefined" || typeof els === "undefined") return;

  const LIST_KEYS = ["watching", "planned", "completed", "paused"];
  const LIST_LABELS = {
    watching: "Смотрю",
    planned: "Запланировано",
    completed: "Просмотрено",
    paused: "Отложено"
  };

  state.catalogGenres = Array.isArray(state.catalogGenres) ? state.catalogGenres : [];
  state.heroPool = Array.isArray(state.heroPool) ? state.heroPool : [];
  state.heroCarouselIndex = Number(state.heroCarouselIndex || 0);
  state.heroCarouselTimer = state.heroCarouselTimer || null;
  state.hlsLoaderPromise = state.hlsLoaderPromise || null;

  Object.assign(els, {
    heroDots: document.getElementById("hero-dots"),
    catalogGenreChips: document.getElementById("catalog-genre-chips"),
    listWatchingGrid: document.getElementById("list-watching-grid"),
    listPlannedGrid: document.getElementById("list-planned-grid"),
    listCompletedGrid: document.getElementById("list-completed-grid"),
    listPausedGrid: document.getElementById("list-paused-grid"),
    settingsAutoplayNext: document.getElementById("settings-autoplay-next"),
    detailListActions: document.getElementById("detail-list-actions"),
    listWatchBtn: document.getElementById("list-watch-btn"),
    listPlanBtn: document.getElementById("list-plan-btn"),
    listCompleteBtn: document.getElementById("list-complete-btn"),
    listPauseBtn: document.getElementById("list-pause-btn"),
    nextEpisodeBtn: document.getElementById("next-episode-btn")
  });

  function relocateInjectedControls() {
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

  function normalizeFavoriteItems(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.alias)
      .map((item) => ({ ...item, listKey: item.listKey || "planned" }))
      .filter((item) => {
        const key = `${item.alias}:${item.listKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 240);
  }

  function snapshotReleaseWithList(release, listKey = "planned") {
    const base = typeof snapshotRelease === "function" ? snapshotRelease(release) : release;
    return { ...base, listKey };
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

  loadFavorites = function () {
    try {
      const raw = localStorage.getItem(favoriteStorageKey());
      state.favorites = normalizeFavoriteItems(raw ? JSON.parse(raw) : []);
    } catch {
      state.favorites = [];
    }
  };

  isFavorite = function (alias) {
    return state.favorites.some((item) => item.alias === alias);
  };

  function persistFavoriteState() {
    state.favorites = normalizeFavoriteItems(state.favorites);
    try {
      localStorage.setItem(favoriteStorageKey(), JSON.stringify(state.favorites));
    } catch {}
    renderProfile();
    renderFavoriteButton();
    updateListButtons();
    if (state.authUser?.localId && window.animeCloudSync?.saveFavorites) {
      window.animeCloudSync.saveFavorites(state.authUser, state.favorites).catch(console.error);
    }
  }

  saveFavorites = persistFavoriteState;

  function setReleaseList(release, listKey) {
    if (!release?.alias) return;
    state.favorites = state.favorites.filter((item) => item.alias !== release.alias);
    if (listKey) {
      state.favorites.unshift(snapshotReleaseWithList(release, listKey));
    }
    persistFavoriteState();
  }

  toggleFavorite = function (release) {
    if (!release?.alias) return;
    const isActive = isFavorite(release.alias);
    setReleaseList(release, isActive ? "" : "planned");
  };

  renderFavoriteButton = function () {
    if (!els.detailFavoriteBtn) return;
    const active = Boolean(state.currentAnime && isFavorite(state.currentAnime.alias));
    els.detailFavoriteBtn.textContent = active ? "В списках" : "Добавить в список";
    els.detailFavoriteBtn.classList.toggle("is-active", active);
    updateListButtons();
  };

  renderProfile = function () {
    if (!els.favoritesGrid) return;
    const user = state.authUser;
    const admin = typeof isAdminUser === "function" ? isAdminUser() : false;
    const total = state.favorites.length;

    if (els.profileAvatar) els.profileAvatar.src = user?.photoUrl || "/mc-icon-192.png?v=4";
    if (els.profileName) els.profileName.textContent = user?.displayName || user?.email?.split("@")[0] || "Гость";
    if (els.profileRoleBadge) els.profileRoleBadge.hidden = !admin;
    if (els.profileEmail) els.profileEmail.textContent = user?.email || "Вход не выполнен";
    if (els.favoritesCount) els.favoritesCount.textContent = formatNumber(total);
    if (els.favoritesMode) els.favoritesMode.textContent = user?.localId ? "Облако + устройство" : "Локально";
    if (els.profileSummary) {
      els.profileSummary.textContent = user?.localId
        ? "Списки, прогресс и комментарии синхронизируются между устройствами. При офлайне изменения уйдут в очередь."
        : "Без входа данные хранятся только в этом браузере. После входа сайт сможет синхронизировать их через Firebase.";
    }
    if (els.adminPanel) els.adminPanel.hidden = !admin;
    if (els.adminNote) {
      els.adminNote.textContent = admin
        ? "Локальные инструменты владельца доступны только в этой сборке сайта."
        : "Панель видна только владельцу.";
    }

    updateGrid(els.listWatchingGrid, getListItems("watching"), "Список «Смотрю» пока пуст.");
    updateGrid(els.listPlannedGrid, getListItems("planned"), "Пока ничего не запланировано.");
    updateGrid(els.listCompletedGrid, getListItems("completed"), "Просмотренные тайтлы пока не отмечены.");
    updateGrid(els.listPausedGrid, getListItems("paused"), "Отложенных тайтлов пока нет.");
    updateGrid(els.favoritesGrid, state.favorites, "Список пока пуст.");
    if (typeof renderContinueWatchingSections === "function") {
      renderContinueWatchingSections();
    }
    updateListButtons();
  };

  const renderDetailsOriginal = renderDetails;
  renderDetails = function (release) {
    renderDetailsOriginal(release);
    renderFavoriteButton();
    updateListButtons();
  };

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

  const registerGenresOriginal = registerGenres;
  registerGenres = function (releases) {
    registerGenresOriginal(releases);
    renderGenreChips();
  };

  const renderCatalogControlsOriginal = renderCatalogControls;
  renderCatalogControls = function () {
    renderCatalogControlsOriginal();
    renderGenreChips();
  };

  getFilteredCatalogItems = function () {
    return state.catalogItems.filter((release) => {
      const genres = release.genres || [];
      if (state.catalogGenre && !genres.includes(state.catalogGenre)) return false;
      if (state.catalogGenres.length && !state.catalogGenres.every((genre) => genres.includes(genre))) return false;
      return true;
    });
  };

  function refreshCatalogView() {
    if (!els.catalogGrid) return;
    const items = getFilteredCatalogItems();
    const genreParts = [];
    if (state.catalogGenre) genreParts.push(state.catalogGenre);
    if (state.catalogGenres.length) genreParts.push(...state.catalogGenres);
    const labels = [...new Set(genreParts)];

    if (els.catalogSummary) {
      els.catalogSummary.textContent = labels.length
        ? `Фильтр по жанрам: ${labels.join(", ")}. Показано ${formatNumber(items.length)} из ${formatNumber(
            state.catalogItems.length
          )} загруженных тайтлов.`
        : `${formatNumber(state.catalogTotal || state.catalogItems.length)} тайтлов в каталоге.`;
    }

    updateGrid(
      els.catalogGrid,
      items,
      labels.length ? `По выбранным жанрам пока ничего не найдено.` : "Каталог пуст."
    );
  }

  const loadCatalogOriginal = loadCatalog;
  loadCatalog = async function (options = {}) {
    if (options.reset || !state.catalogLoaded) {
      renderSkeletonGrid(els.catalogGrid, 8);
    }
    const result = await loadCatalogOriginal(options);
    renderGenreChips();
    refreshCatalogView();
    return result;
  };

  function uniqueReleases(list) {
    const seen = new Set();
    return list.filter((release) => {
      if (!release?.alias || seen.has(release.alias)) return false;
      seen.add(release.alias);
      return true;
    });
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

  const renderHeroOriginal = renderHero;
  renderHero = function (release) {
    renderHeroOriginal(release);
    renderHeroDots();
  };

  const loadHomeOriginal = loadHome;
  loadHome = async function (force = false) {
    const result = await loadHomeOriginal(force);
    state.heroPool = uniqueReleases([state.featured, ...state.latest, ...state.recommended, ...state.popular]).slice(0, 4);
    state.heroCarouselIndex = Math.max(0, state.heroPool.findIndex((item) => item.alias === state.featured?.alias));
    renderHeroDots();
    startHeroCarousel();
    return result;
  };

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

  attachPlayer = async function (manifestUrl) {
    destroyPlayer();
    stopExternalPlayer();
    showVideoSurface();

    const blobUrl = await loadManifestBlob(manifestUrl);
    state.manifestBlobUrl = blobUrl;

    let HlsLib = null;
    try {
      HlsLib = await ensureHlsLibrary();
    } catch {}

    if (HlsLib && HlsLib.isSupported()) {
      state.hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        backBufferLength: 6,
        maxBufferLength: 12,
        maxMaxBufferLength: 18,
        manifestLoadingTimeOut: 9000,
        fragLoadingTimeOut: 12000,
        startLevel: -1
      });
      state.hls.loadSource(blobUrl);
      state.hls.attachMedia(els.player);
      return;
    }

    els.player.src = blobUrl;
  };

  function rebindShareButton() {
    if (!els.detailShareBtn) return;
    const clone = els.detailShareBtn.cloneNode(true);
    els.detailShareBtn.replaceWith(clone);
    els.detailShareBtn = clone;
    clone.addEventListener("click", async () => {
      if (!state.currentAnime) return;
      const url = `${location.origin}${getAnimePath(state.currentAnime.alias)}`;
      try {
        await navigator.clipboard.writeText(url);
        clone.textContent = "Ссылка скопирована";
      } catch {
        clone.textContent = "Не удалось скопировать";
      }
      setTimeout(() => {
        clone.textContent = "Скопировать ссылку";
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

  function bindNextEpisodePlayback() {
    window.addEventListener("animecloud:play-next-episode", (event) => {
      const episode = event.detail?.episode;
      if (!episode) return;
      selectEpisode(episode).catch(console.error);
    });
  }

  async function registerBackgroundTasks() {
    if (!("serviceWorker" in navigator)) return;
    const registerLatestWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js?v=18", { updateViaCache: "none" });
        const registration = await navigator.serviceWorker.ready;
        if (registration.periodicSync) {
          try {
            const permission = await navigator.permissions
              .query({ name: "periodic-background-sync" })
              .catch(() => null);
            if (!permission || permission.state === "granted") {
              await registration.periodicSync.register("animecloud-schedule-refresh", {
                minInterval: 6 * 60 * 60 * 1000
              });
            }
          } catch {}
        }
      } catch {}
    };

    if (document.readyState === "complete") {
      setTimeout(() => {
        registerLatestWorker().catch(console.error);
      }, 0);
      return;
    }

    window.addEventListener(
      "load",
      () => {
        registerLatestWorker().catch(console.error);
      },
      { once: true }
    );
  }

  function refreshInitialState() {
    loadFavorites();
    renderProfile();
    renderFavoriteButton();
    if (state.currentView === "catalog" && state.catalogLoaded) {
      renderGenreChips();
      refreshCatalogView();
    }
    if (state.homeLoaded) {
      state.heroPool = uniqueReleases([state.featured, ...state.latest, ...state.recommended, ...state.popular]).slice(0, 4);
      renderHeroDots();
      startHeroCarousel();
    }
  }

  bindListButtons();
  bindNextEpisodePlayback();
  rebindShareButton();
  relocateInjectedControls();
  refreshInitialState();
  registerBackgroundTasks().catch(console.error);

  window.addEventListener("animecloud:auth", () => {
    loadFavorites();
    renderProfile();
    renderFavoriteButton();
  });

  window.addEventListener("animecloud:progress-updated", () => {
    if (state.currentView === "profile") {
      renderProfile();
    }
  });
})();
