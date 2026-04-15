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
  commentUser: document.getElementById("comment-user"),
  commentsSummary: document.getElementById("comments-summary"),
  commentsList: document.getElementById("comments-list"),
  autoplayToggle: document.getElementById("settings-autoplay-next"),
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
    autoplayNext: true,
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

function renderCommentUser() {
  if (!watchEls.commentUser) return;
  const user = getAuthUserSafe();
  watchEls.commentUser.textContent = user?.localId
    ? `\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0438\u0440\u0443\u0435\u0442\u0435 \u043a\u0430\u043a ${currentDisplayName()}`
    : "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0438\u0440\u0443\u0435\u0442\u0435 \u043a\u0430\u043a \u0433\u043e\u0441\u0442\u044c";
}

function renderComments() {
  renderCommentUser();

  if (!watchState.release?.alias) {
    watchEls.commentsList.innerHTML = "";
    watchEls.commentsSummary.textContent =
      "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0442\u0430\u0439\u0442\u043b, \u0447\u0442\u043e\u0431\u044b \u0443\u0432\u0438\u0434\u0435\u0442\u044c \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438.";
    return;
  }

  const comments = getCommentsForCurrentRelease();
  watchEls.commentsSummary.textContent = comments.length
    ? `\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432: ${comments.length}. \u041d\u043e\u0432\u044b\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0445\u043e\u0434\u044f\u0442 \u0432 \u0440\u0435\u0430\u043b\u044c\u043d\u043e\u043c \u0432\u0440\u0435\u043c\u0435\u043d\u0438.`
    : "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u0411\u0443\u0434\u044c\u0442\u0435 \u043f\u0435\u0440\u0432\u044b\u043c.";

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
  readRatingMap();

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
  await refreshCurrentRatingSummary();
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

function ensureRatingUi() {
  const detailCopy = document.querySelector(".detail-copy");
  if (detailCopy && !document.getElementById("rating-box")) {
    const box = document.createElement("section");
    box.className = "rating-box";
    box.id = "rating-box";
    box.innerHTML = `
      <div class="detail-label">Оценка зрителей</div>
      <div class="rating-box__summary">
        <strong id="rating-average">—</strong>
        <div class="rating-box__meta">
          <span id="rating-count">Пока нет оценок</span>
          <small id="rating-note">Войдите, чтобы оценка синхронизировалась между устройствами.</small>
        </div>
      </div>
      <div class="rating-box__actions" id="rating-actions"></div>
      <button class="ghost-btn rating-box__clear" type="button" id="rating-clear-btn" hidden>Сбросить оценку</button>
    `;
    detailCopy.appendChild(box);
  }

  watchEls.ratingBox = document.getElementById("rating-box");
  watchEls.ratingAverage = document.getElementById("rating-average");
  watchEls.ratingCount = document.getElementById("rating-count");
  watchEls.ratingNote = document.getElementById("rating-note");
  watchEls.ratingActions = document.getElementById("rating-actions");
  watchEls.ratingClearBtn = document.getElementById("rating-clear-btn");
}

function renderRatingPanel() {
  ensureRatingUi();
  if (!watchEls.ratingBox || !watchEls.ratingActions) return;

  const summary = watchState.ratingSummary || { average: 0, count: 0, userValue: 0 };
  const user = getAuthUserSafe();
  const averageText = summary.count ? String(summary.average).replace(/\.0$/, "") : summary.userValue ? String(summary.userValue) : "—";

  watchEls.ratingAverage.textContent = averageText;
  watchEls.ratingCount.textContent = summary.count
    ? `${summary.count} ${summary.count === 1 ? "оценка" : summary.count < 5 ? "оценки" : "оценок"}`
    : "Пока нет оценок";
  watchEls.ratingNote.textContent = summary.userValue
    ? `Ваша оценка: ${summary.userValue}/10.${user?.localId ? " Синхронизирована в профиле." : " Сохранена локально в этом браузере."}`
    : user?.localId
      ? "Поставьте оценку от 1 до 10. Она сохранится в вашем облачном профиле."
      : "Поставьте локальную оценку. После входа можно будет оценивать из облачного профиля.";

  watchEls.ratingActions.innerHTML = "";
  for (let value = 1; value <= 10; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rating-chip${summary.userValue === value ? " is-active" : ""}`;
    button.textContent = String(value);
    button.disabled = watchState.ratingBusy || !watchState.release?.alias;
    button.addEventListener("click", () => {
      void setCurrentRating(value);
    });
    watchEls.ratingActions.appendChild(button);
  }

  watchEls.ratingClearBtn.hidden = !summary.userValue;
  watchEls.ratingClearBtn.disabled = watchState.ratingBusy;
}

async function refreshCurrentRatingSummary() {
  ensureRatingUi();
  if (!watchState.release?.alias) {
    watchState.ratingSummary = { average: 0, count: 0, userValue: 0 };
    renderRatingPanel();
    return watchState.ratingSummary;
  }

  try {
    if (window.animeCloudSync?.loadRatingSummary) {
      watchState.ratingSummary = await window.animeCloudSync.loadRatingSummary(
        watchState.release.alias,
        getAuthUserSafe()
      );
    } else {
      const localValue = normalizeRatingValue(readRatingMap()?.[watchState.release.alias]?.value);
      watchState.ratingSummary = {
        average: localValue || 0,
        count: localValue ? 1 : 0,
        userValue: localValue
      };
    }
  } catch (error) {
    console.error(error);
    const localValue = normalizeRatingValue(readRatingMap()?.[watchState.release.alias]?.value);
    watchState.ratingSummary = {
      average: localValue || 0,
      count: localValue ? 1 : 0,
      userValue: localValue
    };
  }

  renderRatingPanel();
  return watchState.ratingSummary;
}

async function setCurrentRating(value) {
  if (!watchState.release?.alias || watchState.ratingBusy) return;
  const safeAlias = watchState.release.alias;
  const normalized = normalizeRatingValue(value);
  const previousSummary = { ...(watchState.ratingSummary || { average: 0, count: 0, userValue: 0 }) };
  const nextLocalMap = { ...readRatingMap() };

  if (normalized) {
    nextLocalMap[safeAlias] = { value: normalized, updatedAt: Date.now() };
  } else {
    delete nextLocalMap[safeAlias];
  }

  writeRatingMap(nextLocalMap);
  watchState.ratingSummary = {
    average: normalized || 0,
    count: normalized ? Math.max(previousSummary.count || 0, 1) : 0,
    userValue: normalized
  };
  watchState.ratingBusy = true;
  renderRatingPanel();

  try {
    if (window.animeCloudSync?.saveRating) {
      watchState.ratingSummary = await window.animeCloudSync.saveRating(
        safeAlias,
        value,
        getAuthUserSafe()
      );
      if (watchState.ratingSummary?.userValue) {
        nextLocalMap[safeAlias] = {
          value: normalizeRatingValue(watchState.ratingSummary.userValue),
          updatedAt: Date.now()
        };
      } else {
        delete nextLocalMap[safeAlias];
      }
      writeRatingMap(nextLocalMap);
    } else {
      watchState.ratingSummary = {
        average: normalized || 0,
        count: normalized ? 1 : 0,
        userValue: normalized
      };
    }
  } catch (error) {
    console.error(error);
    watchState.ratingSummary = {
      average: normalized || 0,
      count: normalized ? Math.max(previousSummary.count || 0, 1) : 0,
      userValue: normalized
    };
  } finally {
    watchState.ratingBusy = false;
    renderRatingPanel();
  }
}

function stopRealtimeRatings() {
  if (typeof watchState.realtimeRatingsStop === "function") {
    watchState.realtimeRatingsStop();
  }
  watchState.realtimeRatingsStop = null;
}

function bindRealtimeRatings(alias) {
  stopRealtimeRatings();
  if (!alias) {
    watchState.ratingSummary = { average: 0, count: 0, userValue: 0 };
    renderRatingPanel();
    return;
  }

  if (!window.animeCloudSync?.subscribeRatings) {
    void refreshCurrentRatingSummary();
    return;
  }

  watchState.realtimeRatingsStop = window.animeCloudSync.subscribeRatings(
    alias,
    (summary) => {
      watchState.ratingSummary = summary || { average: 0, count: 0, userValue: 0 };
      renderRatingPanel();
    },
    getAuthUserSafe()
  );
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
  watchEls.ratingClearBtn?.addEventListener("click", () => {
    void setCurrentRating(0);
  });

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
    watchState.sourceId = getDefaultWatchSourceId(watchState.release);
    watchState.pendingResume = getCurrentProgress();
    watchState.ratingSummary = { average: 0, count: 0, userValue: 0 };
    renderRatingPanel();
    bindRealtimeComments(watchState.release?.alias || "");
    bindRealtimeRatings(watchState.release?.alias || "");
    renderDubBox();
    renderComments();
    renderResumeBox();
    renderNextEpisodeButton();
  });

  window.addEventListener("animecloud:episode-selected", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.episode = event.detail?.episode || null;
    watchState.sourceId = event.detail?.sourceId || "kodik";
    watchState.pendingResume = getCurrentProgress();
    renderResumeBox();
    renderNextEpisodeButton();
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
    bindRealtimeRatings(watchState.release?.alias || "");
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

  ensureRatingUi();
  await hydrateWatchPersistence();

  bindPlayerTracking();
  bindFeatureEvents();
  bindRealtimeProgress();
  bindRealtimeRatings(watchState.release?.alias || "");
  renderCommentUser();
  renderComments();
  renderResumeBox();
  renderDubBox();
  renderRatingPanel();
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
