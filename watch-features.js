const WATCH_APP_CONSTANTS = window.ANIMECLOUD_CONSTANTS || {};
const WATCH_STORAGE_KEYS = WATCH_APP_CONSTANTS.STORAGE_KEYS || {};
const WATCH_FEATURES_PROGRESS_KEY = WATCH_STORAGE_KEYS.progress || "animecloud_watch_progress_v1";
const WATCH_FEATURES_COMMENTS_STORAGE_KEY = WATCH_STORAGE_KEYS.comments || "animecloud_comments_v1";
const WATCH_RATINGS_KEY = WATCH_STORAGE_KEYS.ratings || "animecloud_ratings_v1";
const WATCH_SETTINGS_KEY = WATCH_STORAGE_KEYS.settings || "animecloud_settings_v1";
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
  commentSubmit: document.getElementById("comment-submit"),
  commentUser: document.getElementById("comment-user"),
  commentsSummary: document.getElementById("comments-summary"),
  commentsList: document.getElementById("comments-list"),
  themeToggle: document.getElementById("settings-theme")
};

const watchState = {
  release: null,
  episode: null,
  sourceId: "kodik",
  pendingResume: null,
  lastProgressSave: 0,
  lastProgressPosition: 0,
  progressMap: {},
  commentsMap: {},
  ratingMap: {},
  ratingSummary: {
    average: 0,
    count: 0,
    userValue: 0
  },
  realtimeCommentsStop: null,
  realtimeRatingsStop: null,
  realtimeProgressStop: null,
  settings: {
    theme: "dark"
  },
  lastCommentSubmitAt: 0,
  commentsRenderToken: "",
  ratingBusy: false
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

function normalizeRatingValue(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 1 || numeric > 10) return 0;
  return numeric;
}

function readRatingMap() {
  let next = {};
  try {
    const raw = localStorage.getItem(WATCH_RATINGS_KEY);
    next = raw ? JSON.parse(raw) : {};
  } catch {
    next = {};
  }
  watchState.ratingMap = Object.entries(next).reduce((accumulator, [alias, entry]) => {
    const normalized = normalizeRatingValue(entry?.value ?? entry);
    if (!alias || !normalized) return accumulator;
    accumulator[alias] = {
      value: normalized,
      updatedAt: Number(entry?.updatedAt || Date.now())
    };
    return accumulator;
  }, {});
  return watchState.ratingMap;
}

function writeRatingMap(map) {
  watchState.ratingMap = map || {};
  try {
    localStorage.setItem(WATCH_RATINGS_KEY, JSON.stringify(watchState.ratingMap));
  } catch {}
  return watchState.ratingMap;
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
  if (watchEls.themeToggle) {
    watchEls.themeToggle.checked = watchState.settings.theme !== "light";
  }
}

function pruneUnsupportedKodikUi() {
  watchEls.resumeClearBtn?.remove();
  watchEls.nextEpisodeBtn?.remove();
  const autoplaySetting = document.getElementById("settings-autoplay-next");
  autoplaySetting?.closest(".settings-toggle")?.remove();
  document.getElementById("rating-box")?.remove();
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

  if (options.broadcast !== false) {
    window.dispatchEvent(
      new CustomEvent("animecloud:progress-updated", {
        detail: { alias: watchState.release?.alias || "" }
      })
    );
  }

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

function renderDubBox() {
  if (!watchEls.dubBox) return;

  const externalSources = Array.isArray(watchState.release?.sourceItems)
    ? watchState.release.sourceItems.filter((source) => source.externalUrl || (Array.isArray(source.episodes) && source.episodes.length))
    : [];

  if (!watchState.release?.externalPlayer && !externalSources.length) {
    watchEls.dubBox.hidden = true;
    watchEls.dubList.innerHTML = "";
    return;
  }

  watchEls.dubBox.hidden = false;
  watchEls.dubList.innerHTML = "";

  const labels = externalSources.length
    ? externalSources.map((source) => source.title || source.note).filter(Boolean)
    : ["AniDub", "DEEP", "Studio Band", "AniStar", "Dream Cast"];

  labels.forEach((name) => {
    const item = document.createElement("span");
    item.className = "chip";
    item.textContent = name;
    watchEls.dubList.appendChild(item);
  });

  watchEls.dubNote.textContent =
    "Дополнительные озвучки и источники доступны во внешнем встроенном плеере, если конкретный провайдер их действительно отдаёт.";
}

function currentDisplayName() {
  const user = getAuthUserSafe();
  return user?.displayName || user?.email?.split("@")[0] || "\u0413\u043e\u0441\u0442\u044c";
}

function syncCommentComposer() {
  const user = getAuthUserSafe();
  const signedIn = Boolean(user?.localId);
  const ready = Boolean(watchState.release?.alias);

  if (watchEls.commentInput) {
    watchEls.commentInput.disabled = !signedIn || !ready;
    watchEls.commentInput.placeholder = signedIn
      ? "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u043f\u043e \u0442\u0430\u0439\u0442\u043b\u0443 \u0438\u043b\u0438 \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0441\u0435\u0440\u0438\u0438\u2026"
      : "\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442, \u0447\u0442\u043e\u0431\u044b \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439.";
  }

  if (watchEls.commentSubmit) {
    watchEls.commentSubmit.disabled = !signedIn || !ready;
  }
}

function renderCommentUser() {
  if (!watchEls.commentUser) return;
  const user = getAuthUserSafe();
  watchEls.commentUser.textContent = user?.localId
    ? `\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0438\u0440\u0443\u0435\u0442\u0435 \u043a\u0430\u043a ${currentDisplayName()}`
    : "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0441\u043b\u0435 \u0432\u0445\u043e\u0434\u0430 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442";
}

function renderComments() {
  renderCommentUser();
  syncCommentComposer();

  if (!watchState.release?.alias) {
    watchEls.commentsList.innerHTML = "";
    watchEls.commentsSummary.textContent =
      "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0442\u0430\u0439\u0442\u043b, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438.";
    return;
  }

  const comments = getCommentsForCurrentRelease();
  const signedIn = Boolean(getAuthUserSafe()?.localId);
  watchEls.commentsSummary.textContent = comments.length
    ? `\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432: ${comments.length}. \u041d\u043e\u0432\u044b\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0445\u043e\u0434\u044f\u0442 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.`
    : signedIn
      ? "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u0411\u0443\u0434\u044c\u0442\u0435 \u043f\u0435\u0440\u0432\u044b\u043c."
      : "\u0427\u0438\u0442\u0430\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438 \u043c\u043e\u0436\u043d\u043e \u0438 \u0431\u0435\u0437 \u0432\u0445\u043e\u0434\u0430, \u043d\u043e \u043f\u0438\u0441\u0430\u0442\u044c \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0441\u043b\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438.";

  watchEls.commentsList.innerHTML = "";
  if (!comments.length) return;

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  watchState.commentsRenderToken = token;
  let index = 0;
  const batchSize = window.matchMedia?.("(max-width: 860px)")?.matches ? 4 : 10;

  const queueNextBatch = () => {
    if (watchState.commentsRenderToken !== token || index >= comments.length) return;
    requestAnimationFrame(appendBatch);
  };

  const appendBatch = () => {
    if (watchState.commentsRenderToken !== token) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + batchSize, comments.length);
    while (index < end) {
      const comment = comments[index];
      const article = document.createElement("article");
      article.className = "comment-item";

      const author = document.createElement("strong");
      author.textContent = escapeText(comment.author) || "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c";
      article.appendChild(author);

      const meta = document.createElement("small");
      const time = Number(comment.createdAt || 0);
      meta.textContent = time ? new Date(time).toLocaleString("ru-RU") : "\u0422\u043e\u043b\u044c\u043a\u043e \u0447\u0442\u043e";
      article.appendChild(meta);

      const body = document.createElement("p");
      body.textContent = escapeText(comment.body);
      article.appendChild(body);

      fragment.appendChild(article);
      index += 1;
    }
    watchEls.commentsList.appendChild(fragment);
    if (index < comments.length) {
      queueNextBatch();
    }
  };

  queueNextBatch();
}

function renderResumeBox() {
  if (!watchEls.resumeBox) return;
  const progress = getCurrentProgress();
  watchState.pendingResume = progress;

  if (!progress) {
    watchEls.resumeBox.hidden = true;
    watchEls.resumeText.textContent = "\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d.";
    return;
  }

  watchEls.resumeBox.hidden = false;
  watchEls.resumeText.textContent = `\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b\u0438\u0441\u044c \u043d\u0430 ${progress.episodeLabel || "\u0441\u0435\u0440\u0438\u0438"} \u2022 ${formatClock(
    progress.time
  )}${progress.duration ? ` \u0438\u0437 ${formatClock(progress.duration)}` : ""}`;
}

function getSourceEpisodesForWatch(release, sourceId) {
  if (Array.isArray(release?.sourceItems)) {
    const source =
      release.sourceItems.find((item) => item.id === sourceId) ||
      release.sourceItems.find((item) => Array.isArray(item?.episodes) && item.episodes.length) ||
      release.sourceItems.find((item) => item.externalUrl) ||
      release.sourceItems[0];
    if (Array.isArray(source?.episodes) && source.episodes.length) {
      return source.episodes;
    }
  }

  return Array.isArray(release?.episodes) ? release.episodes : [];
}

function getDefaultWatchSourceId(release) {
  if (!Array.isArray(release?.sourceItems) || !release.sourceItems.length) {
    return "kodik";
  }

  return (
    release.sourceItems.find((item) => Array.isArray(item?.episodes) && item.episodes.length)?.id ||
    release.sourceItems.find((item) => item.externalUrl)?.id ||
    release.sourceItems[0].id ||
    "kodik"
  );
}

function getNextEpisode() {
  const episodes = getSourceEpisodesForWatch(watchState.release, watchState.sourceId);
  if (!episodes.length || !watchState.episode?.id) return null;
  const currentIndex = episodes.findIndex((episode) => episode.id === watchState.episode.id);
  return currentIndex >= 0 ? episodes[currentIndex + 1] || null : null;
}

function renderNextEpisodeButton() {
  if (watchEls.nextEpisodeBtn) {
    watchEls.nextEpisodeBtn.hidden = true;
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

  await saveProgressMap(map, { broadcast: force });
  if (force) {
    renderResumeBox();
    renderNextEpisodeButton();
  }
  return true;
}

async function saveEpisodeSelectionProgress() {
  if (!watchState.release?.alias || !watchState.episode?.id) return false;

  const currentMap = { ...getProgressMap() };
  currentMap[watchState.release.alias] = {
    alias: watchState.release.alias,
    title: watchState.release.title,
    poster: watchState.release.poster,
    cardPoster: watchState.release.cardPoster || watchState.release.poster,
    episodeId: watchState.episode.id,
    episodeOrdinal: watchState.episode.ordinal || 0,
    episodeLabel: `${watchState.episode.ordinal || "?"} серия`,
    time: Number(currentMap[watchState.release.alias]?.time || 0),
    duration: Number(currentMap[watchState.release.alias]?.duration || 0),
    updatedAt: Date.now()
  };

  await saveProgressMap(currentMap, { broadcast: true });
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
  const user = getAuthUserSafe();
  if (!user?.localId) {
    watchEls.commentInput?.setCustomValidity("\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442, \u0447\u0442\u043e\u0431\u044b \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439.");
    watchEls.commentInput?.reportValidity();
    setTimeout(() => watchEls.commentInput?.setCustomValidity(""), 80);
    syncCommentComposer();
    return;
  }

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

function ensureRatingUi() {
  document.getElementById("rating-box")?.remove();
}

function renderRatingPanel() {
  ensureRatingUi();
}

async function refreshCurrentRatingSummary() {
  watchState.ratingSummary = { average: 0, count: 0, userValue: 0 };
  return watchState.ratingSummary;
}

async function setCurrentRating(value) {
  return watchState.ratingSummary;
}

function stopRealtimeRatings() {
  if (typeof watchState.realtimeRatingsStop === "function") {
    watchState.realtimeRatingsStop();
  }
  watchState.realtimeRatingsStop = null;
}

function bindRealtimeRatings(alias) {
  stopRealtimeRatings();
  watchState.ratingSummary = { average: 0, count: 0, userValue: 0 };
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
  if (watchEls.themeToggle) {
    watchEls.themeToggle.addEventListener("change", (event) => {
      saveSettings({ theme: event.target.checked ? "dark" : "light" });
    });
  }

  window.addEventListener("animecloud:release-opened", (event) => {
    watchState.release = event.detail?.release || null;
    watchState.episode = null;
    watchState.sourceId = getDefaultWatchSourceId(watchState.release);
    watchState.pendingResume = getCurrentProgress();
    bindRealtimeComments(watchState.release?.alias || "");
    renderDubBox();
    renderComments();
    renderResumeBox();
  });

  window.addEventListener("animecloud:episode-selected", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.episode = event.detail?.episode || null;
    watchState.sourceId = event.detail?.sourceId || "kodik";
    watchState.pendingResume = getCurrentProgress();
    renderResumeBox();
    void saveEpisodeSelectionProgress();
  });

  window.addEventListener("animecloud:source-changed", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.sourceId = event.detail?.sourceId || watchState.sourceId;
    renderDubBox();
  });

  window.addEventListener("animecloud:drawer-closed", () => {
    stopRealtimeComments();
    stopRealtimeRatings();
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
  });
}

async function initWatchFeatures() {
  if (!watchEls.player || !watchEls.commentForm) return;

  pruneUnsupportedKodikUi();
  await hydrateWatchPersistence();

  bindPlayerTracking();
  bindFeatureEvents();
  bindRealtimeProgress();
  renderCommentUser();
  renderComments();
  renderResumeBox();
  renderDubBox();
}

window.animeCloudWatchState = {
  getProgressMap() {
    return watchState.progressMap || {};
  },
  async removeProgress(alias) {
    if (!alias) return false;
    const nextMap = { ...(watchState.progressMap || {}) };
    delete nextMap[alias];
    await saveProgressMap(nextMap, { broadcast: true });
    if (watchState.release?.alias === alias) {
      watchState.pendingResume = null;
      renderResumeBox();
    }
    return true;
  },
  getCommentsMap() {
    return watchState.commentsMap || {};
  },
  getSettings() {
    return watchState.settings || normalizeSettings({});
  }
};

initWatchFeatures().catch(console.error);

