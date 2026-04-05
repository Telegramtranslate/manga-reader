const WATCH_FEATURES_PROGRESS_KEY = "animecloud_watch_progress_v1";
const WATCH_FEATURES_COMMENTS_STORAGE_KEY = "animecloud_comments_v1";
const WATCH_SETTINGS_KEY = "animecloud_settings_v1";
const WATCH_PROGRESS_MIN_INTERVAL = 15000;
const WATCH_PROGRESS_MIN_DELTA = 15;
const WATCH_COMMENT_MIN_INTERVAL = 10000;

const watchEls = {
  player: document.getElementById("anime-player"),
  resumeBox: document.getElementById("resume-box"),
  resumeText: document.getElementById("resume-text"),
  resumeBtn: document.getElementById("resume-btn"),
  resumeClearBtn: document.getElementById("resume-clear-btn"),
  nextEpisodeBtn: document.getElementById("next-episode-btn"),
  dubBox: document.getElementById("dub-box"),
  dubList: document.getElementById("dub-list"),
  dubNote: document.getElementById("dub-note"),
  commentForm: document.getElementById("comment-form"),
  commentInput: document.getElementById("comment-input"),
  commentUser: document.getElementById("comment-user"),
  commentsSummary: document.getElementById("comments-summary"),
  commentsList: document.getElementById("comments-list"),
  autoplayToggle: document.getElementById("settings-autoplay-next"),
  themeToggle: document.getElementById("settings-theme")
};

const watchState = {
  release: null,
  episode: null,
  sourceId: "anilibria",
  pendingResume: null,
  lastProgressSave: 0,
  lastProgressPosition: 0,
  progressMap: {},
  commentsMap: {},
  realtimeCommentsStop: null,
  realtimeProgressStop: null,
  settings: {
    autoplayNext: true,
    theme: "dark"
  },
  lastCommentSubmitAt: 0
};

function isPermissionDeniedError(error) {
  const code = String(error?.code || error?.message || "").toLowerCase();
  return code.includes("permission-denied") || code.includes("insufficient permissions");
}

function shouldPersistWatchDataLocally() {
  return !getAuthUserSafe()?.localId;
}

function readJson(key, fallback) {
  if (!shouldPersistWatchDataLocally()) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!shouldPersistWatchDataLocally()) {
    return value;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  return value;
}

function getAuthUserSafe() {
  try {
    return typeof getAuthUser === "function" ? getAuthUser() : null;
  } catch {
    return null;
  }
}

function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

function normalizeTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return getSystemTheme();
}

function normalizeSettings(settings = {}) {
  return {
    autoplayNext: settings.autoplayNext !== false,
    theme: normalizeTheme(settings.theme)
  };
}

function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.setAttribute("data-theme", nextTheme);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", nextTheme === "light" ? "#f4efe8" : "#070b14");
  }
  return nextTheme;
}

function syncSettingsControls() {
  if (watchEls.autoplayToggle) {
    watchEls.autoplayToggle.checked = Boolean(watchState.settings.autoplayNext);
  }
  if (watchEls.themeToggle) {
    watchEls.themeToggle.checked = watchState.settings.theme !== "light";
  }
}

function readSettings() {
  const next = normalizeSettings(readJson(WATCH_SETTINGS_KEY, {}) || {});
  watchState.settings = next;
  syncSettingsControls();
  applyTheme(next.theme);
  return next;
}

function saveSettings(patch = {}) {
  watchState.settings = normalizeSettings({
    ...watchState.settings,
    ...patch
  });
  writeJson(WATCH_SETTINGS_KEY, watchState.settings);
  const user = getAuthUserSafe();
  if (user?.localId && window.animeCloudSync?.saveSettings) {
    window.animeCloudSync.saveSettings(user, watchState.settings).catch(console.error);
  }
  syncSettingsControls();
  applyTheme(watchState.settings.theme);
}

function getProgressMap() {
  return watchState.progressMap;
}

async function saveProgressMap(map, options = {}) {
  watchState.progressMap = map || {};
  writeJson(WATCH_FEATURES_PROGRESS_KEY, watchState.progressMap);

  const user = options.user || getAuthUserSafe();
  let cloudWritePromise = null;
  if (!options.skipCloud && user?.localId && window.animeCloudSync?.saveProgress) {
    cloudWritePromise = window.animeCloudSync.saveProgress(user, watchState.progressMap).catch((error) => {
      console.error(error);
      return false;
    });
  }

  window.dispatchEvent(
    new CustomEvent("animecloud:progress-updated", {
      detail: { alias: watchState.release?.alias || "" }
    })
  );

  return cloudWritePromise || true;
}

function getCommentsMap() {
  return watchState.commentsMap;
}

function saveCommentsMap(map, options = {}) {
  watchState.commentsMap = map || {};
  writeJson(WATCH_FEATURES_COMMENTS_STORAGE_KEY, watchState.commentsMap);

  const alias = options.alias || watchState.release?.alias;
  const user = getAuthUserSafe();
  if (!options.skipCloud && alias && !user?.localId && window.animeCloudSync?.saveComments) {
    const comments = Array.isArray(watchState.commentsMap[alias]) ? watchState.commentsMap[alias] : [];
    window.animeCloudSync.saveComments(alias, comments).catch(console.error);
  }
}

function getCurrentProgress() {
  return watchState.release?.alias ? watchState.progressMap[watchState.release.alias] || null : null;
}

function getCommentsForCurrentRelease() {
  return watchState.release?.alias ? watchState.commentsMap[watchState.release.alias] || [] : [];
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

function currentDisplayName() {
  const user = getAuthUserSafe();
  return user?.displayName || user?.email?.split("@")[0] || "Гость";
}

function escapeText(value) {
  return String(value || "").trim();
}

function renderCommentUser() {
  if (!watchEls.commentUser) return;
  const user = getAuthUserSafe();
  watchEls.commentUser.textContent = user?.localId
    ? `Комментируете как ${currentDisplayName()}`
    : "Комментируете как гость";
}

function mergeComments(localItems, cloudItems) {
  const seen = new Set();
  return [...(cloudItems || []), ...(localItems || [])]
    .filter(Boolean)
    .filter((item) => {
      const id =
        item.clientId ||
        item.id ||
        `${item.author || ""}:${item.createdAt || 0}:${item.body || ""}`;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((left, right) => Number(left?.createdAt || 0) - Number(right?.createdAt || 0))
    .slice(-200);
}

function renderComments() {
  renderCommentUser();

  if (!watchState.release?.alias) {
    watchEls.commentsList.innerHTML = "";
    watchEls.commentsSummary.textContent = "Откройте тайтл, чтобы увидеть комментарии.";
    return;
  }

  const comments = getCommentsForCurrentRelease();
  watchEls.commentsSummary.textContent = comments.length
    ? `Комментариев: ${comments.length}. Новые сообщения приходят в реальном времени.`
    : "Комментариев пока нет. Будьте первым.";

  watchEls.commentsList.innerHTML = "";
  if (!comments.length) return;

  const fragment = document.createDocumentFragment();
  comments.forEach((comment) => {
    const article = document.createElement("article");
    article.className = "comment-item";

    const author = document.createElement("strong");
    author.textContent = escapeText(comment.author) || "Пользователь";
    article.appendChild(author);

    const meta = document.createElement("small");
    const time = Number(comment.createdAt || 0);
    meta.textContent = time ? new Date(time).toLocaleString("ru-RU") : "Только что";
    article.appendChild(meta);

    const body = document.createElement("p");
    body.textContent = escapeText(comment.body);
    article.appendChild(body);

    fragment.appendChild(article);
  });

  watchEls.commentsList.appendChild(fragment);
}

function renderResumeBox() {
  if (!watchEls.resumeBox) return;
  const progress = getCurrentProgress();
  watchState.pendingResume = progress;

  if (!progress) {
    watchEls.resumeBox.hidden = true;
    watchEls.resumeText.textContent = "Прогресс пока не сохранён.";
    return;
  }

  watchEls.resumeBox.hidden = false;
  watchEls.resumeText.textContent = `Остановились на ${progress.episodeLabel || "серии"} • ${formatClock(
    progress.time
  )}${progress.duration ? ` из ${formatClock(progress.duration)}` : ""}`;
}

function renderDubBox() {
  if (!watchEls.dubBox) return;

  if (!watchState.release?.externalPlayer) {
    watchEls.dubBox.hidden = true;
    watchEls.dubList.innerHTML = "";
    return;
  }

  watchEls.dubBox.hidden = false;
  watchEls.dubList.innerHTML = "";

  ["AniDub", "DEEP", "Studio Band", "AniStar", "Dream Cast"].forEach((name) => {
    const item = document.createElement("span");
    item.className = "chip";
    item.textContent = name;
    watchEls.dubList.appendChild(item);
  });

  watchEls.dubNote.textContent =
    "Дополнительные озвучки доступны во внешнем плеере, если конкретный источник действительно их отдаёт.";
}

function getNextEpisode() {
  if (!watchState.release?.episodes?.length || !watchState.episode?.id) return null;
  const currentIndex = watchState.release.episodes.findIndex((episode) => episode.id === watchState.episode.id);
  return currentIndex >= 0 ? watchState.release.episodes[currentIndex + 1] || null : null;
}

function renderNextEpisodeButton() {
  if (!watchEls.nextEpisodeBtn) return;
  const nextEpisode = getNextEpisode();
  watchEls.nextEpisodeBtn.hidden = !nextEpisode;
  watchEls.nextEpisodeBtn.disabled = !nextEpisode;
  if (nextEpisode) {
    watchEls.nextEpisodeBtn.textContent = `Следующая серия: ${nextEpisode.ordinal}`;
  }
}

function clearCurrentProgress() {
  if (!watchState.release?.alias) return;
  const map = { ...getProgressMap() };
  delete map[watchState.release.alias];
  void saveProgressMap(map);
  renderResumeBox();
}

function clearAllProgress() {
  void saveProgressMap({});
  watchState.pendingResume = null;
  renderResumeBox();
}

function clearAllComments() {
  saveCommentsMap({});
  renderComments();
}

async function saveProgress(force = false) {
  if (!watchState.release?.alias || !watchState.episode?.id) return false;
  if (watchState.sourceId !== "anilibria") return false;
  if (watchEls.player.hidden) return false;

  const now = Date.now();
  const currentTime = Number(watchEls.player.currentTime || 0);
  const duration = Number(watchEls.player.duration || 0);

  if (
    !force &&
    now - watchState.lastProgressSave < WATCH_PROGRESS_MIN_INTERVAL &&
    Math.abs(currentTime - Number(watchState.lastProgressPosition || 0)) < WATCH_PROGRESS_MIN_DELTA
  ) {
    return false;
  }
  if (!force && currentTime < 5) return false;

  watchState.lastProgressSave = now;
  watchState.lastProgressPosition = currentTime;

  const map = { ...getProgressMap() };
  map[watchState.release.alias] = {
    alias: watchState.release.alias,
    title: watchState.release.title,
    poster: watchState.release.poster,
    cardPoster: watchState.release.cardPoster || watchState.release.poster,
    episodeId: watchState.episode.id,
    episodeOrdinal: watchState.episode.ordinal || 0,
    episodeLabel: `${watchState.episode.ordinal || "?"} серия`,
    time: currentTime,
    duration,
    updatedAt: now
  };

  await saveProgressMap(map);
  renderResumeBox();
  renderNextEpisodeButton();
  return true;
}

function applyPendingResume() {
  const progress = watchState.pendingResume;
  if (!progress || !watchState.episode?.id) return;

  const sameEpisode =
    (progress.episodeId && progress.episodeId === watchState.episode.id) ||
    String(progress.episodeOrdinal || "") === String(watchState.episode.ordinal || "");

  if (!sameEpisode || !progress.time) return;

  try {
    watchEls.player.currentTime = Math.max(0, Number(progress.time || 0));
  } catch {}
}

function resumeFromSavedProgress() {
  const progress = getCurrentProgress();
  if (!progress) return;
  watchState.pendingResume = progress;
  applyPendingResume();
}

async function hydrateLocalCachesFromIndexedDb() {
  if (!shouldPersistWatchDataLocally()) return;
  if (!window.animeCloudSync?.readLocalJson) return;

  try {
    const [progressMap, commentsMap] = await Promise.all([
      window.animeCloudSync.readLocalJson(WATCH_FEATURES_PROGRESS_KEY, readJson(WATCH_FEATURES_PROGRESS_KEY, {})),
      window.animeCloudSync.readLocalJson(
        WATCH_FEATURES_COMMENTS_STORAGE_KEY,
        readJson(WATCH_FEATURES_COMMENTS_STORAGE_KEY, {})
      )
    ]);

    watchState.progressMap = progressMap || {};
    watchState.commentsMap = commentsMap || {};

    writeJson(WATCH_FEATURES_PROGRESS_KEY, watchState.progressMap);
    writeJson(WATCH_FEATURES_COMMENTS_STORAGE_KEY, watchState.commentsMap);
  } catch (error) {
    console.error(error);
  }
}

async function hydrateWatchPersistence() {
  const user = getAuthUserSafe();

  if (user?.localId && window.animeCloudSync?.hydrateSessionData) {
    try {
      const [payload, settings] = await Promise.all([
        window.animeCloudSync.hydrateSessionData(user),
        window.animeCloudSync.loadSettings ? window.animeCloudSync.loadSettings(user) : Promise.resolve({})
      ]);

      watchState.progressMap = payload?.progress || {};
      watchState.commentsMap = {};
      watchState.settings = normalizeSettings(settings || payload?.settings || {});
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
      readSettings();
      watchState.progressMap = readJson(WATCH_FEATURES_PROGRESS_KEY, {});
      watchState.commentsMap = readJson(WATCH_FEATURES_COMMENTS_STORAGE_KEY, {});
      await hydrateLocalCachesFromIndexedDb();
    }
  } else {
    readSettings();
    watchState.progressMap = readJson(WATCH_FEATURES_PROGRESS_KEY, {});
    watchState.commentsMap = readJson(WATCH_FEATURES_COMMENTS_STORAGE_KEY, {});
    await hydrateLocalCachesFromIndexedDb();
  }

  syncSettingsControls();
  applyTheme(watchState.settings.theme);
}

function handleCommentSubmit(event) {
  event.preventDefault();

  if (!watchState.release?.alias) return;

  const body = escapeText(watchEls.commentInput.value);
  if (!body) return;

  const now = Date.now();
  if (now - watchState.lastCommentSubmitAt < WATCH_COMMENT_MIN_INTERVAL) {
    const secondsLeft = Math.max(1, Math.ceil((WATCH_COMMENT_MIN_INTERVAL - (now - watchState.lastCommentSubmitAt)) / 1000));
    watchEls.commentInput.setCustomValidity(`Подождите ${secondsLeft} сек. перед следующим комментарием.`);
    watchEls.commentInput.reportValidity();
    setTimeout(() => watchEls.commentInput.setCustomValidity(""), 50);
    return;
  }

  watchEls.commentInput.setCustomValidity("");
  watchState.lastCommentSubmitAt = now;

  const user = getAuthUserSafe();
  const map = { ...getCommentsMap() };
  const list = Array.isArray(map[watchState.release.alias]) ? [...map[watchState.release.alias]] : [];

  const nextComment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    author: currentDisplayName(),
    uid: user?.localId || "",
    body,
    createdAt: Date.now()
  };

  list.push(nextComment);

  map[watchState.release.alias] = list.slice(-200);
  saveCommentsMap(map, { alias: watchState.release.alias, skipCloud: true });
  if (user?.localId && window.animeCloudSync?.addComment) {
    window.animeCloudSync.addComment(watchState.release.alias, nextComment, user).catch(console.error);
  } else if (!user?.localId && window.animeCloudSync?.saveComments) {
    window.animeCloudSync.saveComments(watchState.release.alias, map[watchState.release.alias]).catch(console.error);
  }
  watchEls.commentInput.value = "";
  renderComments();
}

function stopRealtimeComments() {
  if (typeof watchState.realtimeCommentsStop === "function") {
    watchState.realtimeCommentsStop();
  }
  watchState.realtimeCommentsStop = null;
}

function bindRealtimeComments(alias) {
  stopRealtimeComments();
  if (!alias || !window.animeCloudSync?.subscribeComments) return;

  watchState.realtimeCommentsStop = window.animeCloudSync.subscribeComments(alias, (items) => {
    const map = { ...getCommentsMap() };
    map[alias] = mergeComments(map[alias], items);
    saveCommentsMap(map, { alias, skipCloud: true });
    if (watchState.release?.alias === alias) {
      renderComments();
    }
  });
}

function stopRealtimeProgress() {
  if (typeof watchState.realtimeProgressStop === "function") {
    watchState.realtimeProgressStop();
  }
  watchState.realtimeProgressStop = null;
}

function bindRealtimeProgress() {
  stopRealtimeProgress();
  const user = getAuthUserSafe();
  if (!user?.localId || !window.animeCloudSync?.subscribeProgress) return;

  watchState.realtimeProgressStop = window.animeCloudSync.subscribeProgress(user, (map) => {
    watchState.progressMap = map || {};
    writeJson(WATCH_FEATURES_PROGRESS_KEY, watchState.progressMap);
    renderResumeBox();
    renderNextEpisodeButton();
    window.dispatchEvent(
      new CustomEvent("animecloud:progress-updated", {
        detail: { alias: watchState.release?.alias || "", remote: true }
      })
    );
  });
}

function playNextEpisode() {
  const nextEpisode = getNextEpisode();
  if (!nextEpisode) return;
  window.dispatchEvent(
    new CustomEvent("animecloud:play-next-episode", {
      detail: {
        release: watchState.release,
        episode: nextEpisode
      }
    })
  );
}

function handlePlayerTimeupdate() {
  void saveProgress(false);
}

function handlePlayerSeeked() {
  void saveProgress(true);
}

function handlePlayerPause() {
  void saveProgress(true);
}

async function handlePlayerEnded() {
  try {
    await saveProgress(true);
  } catch (error) {
    console.error(error);
  }
  if (watchState.settings.autoplayNext) {
    requestAnimationFrame(() => playNextEpisode());
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    void saveProgress(true);
  }
}

function handlePlayerKeyboard(event) {
  if (!watchEls.player || watchEls.player.hidden) return;
  const activeTag = String(document.activeElement?.tagName || "").toUpperCase();
  const isTypingTarget =
    activeTag === "INPUT" ||
    activeTag === "TEXTAREA" ||
    document.activeElement?.isContentEditable;

  if (event.key === " " && !isTypingTarget) {
    event.preventDefault();
    if (watchEls.player.paused) {
      watchEls.player.play().catch(() => {});
    } else {
      watchEls.player.pause();
    }
    return;
  }

  if (event.key === "ArrowRight" && !isTypingTarget) {
    event.preventDefault();
    playNextEpisode();
  }
}

function bindPlayerTracking() {
  watchEls.player.addEventListener("timeupdate", handlePlayerTimeupdate, { passive: true });
  watchEls.player.addEventListener("pause", handlePlayerPause, { passive: true });
  watchEls.player.addEventListener("seeked", handlePlayerSeeked, { passive: true });
  watchEls.player.addEventListener("loadedmetadata", applyPendingResume);
  watchEls.player.addEventListener("ended", handlePlayerEnded);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("keydown", handlePlayerKeyboard);
  window.addEventListener("beforeunload", () => {
    void saveProgress(true);
  });
}

function bindFeatureEvents() {
  watchEls.commentForm.addEventListener("submit", handleCommentSubmit);
  watchEls.resumeBtn.addEventListener("click", resumeFromSavedProgress);
  watchEls.resumeClearBtn.addEventListener("click", clearCurrentProgress);

  if (watchEls.nextEpisodeBtn) {
    watchEls.nextEpisodeBtn.addEventListener("click", playNextEpisode);
  }

  if (watchEls.autoplayToggle) {
    watchEls.autoplayToggle.addEventListener("change", (event) => {
      saveSettings({ autoplayNext: Boolean(event.target.checked) });
    });
  }
  if (watchEls.themeToggle) {
    watchEls.themeToggle.addEventListener("change", (event) => {
      saveSettings({ theme: event.target.checked ? "dark" : "light" });
    });
  }

  window.addEventListener("animecloud:release-opened", (event) => {
    watchState.release = event.detail?.release || null;
    watchState.episode = null;
    watchState.sourceId = "anilibria";
    watchState.pendingResume = getCurrentProgress();
    bindRealtimeComments(watchState.release?.alias || "");
    renderDubBox();
    renderComments();
    renderResumeBox();
    renderNextEpisodeButton();
  });

  window.addEventListener("animecloud:episode-selected", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.episode = event.detail?.episode || null;
    watchState.sourceId = event.detail?.sourceId || "anilibria";
    watchState.pendingResume = getCurrentProgress();
    renderResumeBox();
    renderNextEpisodeButton();
  });

  window.addEventListener("animecloud:source-changed", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.sourceId = event.detail?.sourceId || watchState.sourceId;
    renderDubBox();
  });

  window.addEventListener("animecloud:drawer-closed", () => {
    stopRealtimeComments();
  });

  window.addEventListener("animecloud:auth", async (event) => {
    if (getAuthUserSafe()?.localId && !event.detail?.ready) {
      renderCommentUser();
      return;
    }
    await hydrateWatchPersistence();
    renderCommentUser();
    renderComments();
    renderResumeBox();
    bindRealtimeProgress();
    bindRealtimeComments(watchState.release?.alias || "");
  });

  window.addEventListener("animecloud:admin-clear-comments", () => {
    clearAllComments();
  });

  window.addEventListener("animecloud:admin-clear-progress", () => {
    clearAllProgress();
  });

  window.addEventListener("animecloud:progress-updated", () => {
    renderResumeBox();
    renderNextEpisodeButton();
  });
}

async function initWatchFeatures() {
  if (!watchEls.player || !watchEls.commentForm) return;

  await hydrateWatchPersistence();

  bindPlayerTracking();
  bindFeatureEvents();
  bindRealtimeProgress();
  renderCommentUser();
  renderComments();
  renderResumeBox();
  renderDubBox();
  renderNextEpisodeButton();
}

window.animeCloudWatchState = {
  getProgressMap() {
    return watchState.progressMap || {};
  },
  getCommentsMap() {
    return watchState.commentsMap || {};
  },
  getSettings() {
    return watchState.settings || normalizeSettings({});
  }
};

initWatchFeatures().catch(console.error);
