const WATCH_PROGRESS_KEY = "animecloud_watch_progress_v1";
const COMMENTS_STORAGE_KEY = "animecloud_comments_v1";
const EXTRA_DUBS = ["AniDub", "DEEP", "Studio Band", "AniStar", "Dream Cast"];

const watchEls = {
  player: document.getElementById("anime-player"),
  resumeBox: document.getElementById("resume-box"),
  resumeText: document.getElementById("resume-text"),
  resumeBtn: document.getElementById("resume-btn"),
  resumeClearBtn: document.getElementById("resume-clear-btn"),
  dubBox: document.getElementById("dub-box"),
  dubList: document.getElementById("dub-list"),
  dubNote: document.getElementById("dub-note"),
  commentForm: document.getElementById("comment-form"),
  commentInput: document.getElementById("comment-input"),
  commentUser: document.getElementById("comment-user"),
  commentsSummary: document.getElementById("comments-summary"),
  commentsList: document.getElementById("comments-list")
};

const watchState = {
  release: null,
  episode: null,
  sourceId: "anilibria",
  pendingResume: null,
  lastProgressSave: 0
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem("animecloud_auth_v1") || "null");
  } catch {
    return null;
  }
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeSelector(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function getProgressMap() {
  return readJson(WATCH_PROGRESS_KEY, {});
}

function saveProgressMap(map) {
  writeJson(WATCH_PROGRESS_KEY, map);
}

function getCurrentProgress() {
  if (!watchState.release?.alias) return null;
  return getProgressMap()[watchState.release.alias] || null;
}

function clearCurrentProgress() {
  if (!watchState.release?.alias) return;
  const map = getProgressMap();
  delete map[watchState.release.alias];
  saveProgressMap(map);
  renderResumeBox();
}

function clearAllProgress() {
  saveProgressMap({});
  watchState.pendingResume = null;
  renderResumeBox();
}

function renderDubBox() {
  if (!watchState.release?.externalPlayer) {
    watchEls.dubBox.hidden = true;
    return;
  }

  watchEls.dubBox.hidden = false;
  watchEls.dubList.replaceChildren(
    ...EXTRA_DUBS.map((label) => {
      const node = document.createElement("span");
      node.className = "dub-pill";
      node.textContent = label;
      return node;
    })
  );

  watchEls.dubNote.textContent =
    watchState.sourceId === "external"
      ? "Сейчас открыт мульти-источник. Популярные озвучки выбираются уже внутри внешнего плеера."
      : "Если релиз поддерживает мульти-источник, здесь могут быть AniDub, DEEP, Studio Band и другие озвучки.";
}

function renderCommentUser() {
  const user = getAuthUser();
  watchEls.commentUser.textContent = user?.email
    ? `Комментируете как ${user.displayName || user.email}`
    : "Комментируете как гость";
}

function getCommentsMap() {
  return readJson(COMMENTS_STORAGE_KEY, {});
}

function saveCommentsMap(map) {
  writeJson(COMMENTS_STORAGE_KEY, map);
}

function clearAllComments() {
  saveCommentsMap({});
  renderComments();
}

function getCommentsForCurrentRelease() {
  if (!watchState.release?.alias) return [];
  const map = getCommentsMap();
  return Array.isArray(map[watchState.release.alias]) ? map[watchState.release.alias] : [];
}

function renderComments() {
  renderCommentUser();

  if (!watchState.release?.alias) {
    watchEls.commentsList.innerHTML = "";
    watchEls.commentsSummary.textContent = "Откройте тайтл, чтобы увидеть комментарии.";
    return;
  }

  const comments = getCommentsForCurrentRelease()
    .slice()
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));

  watchEls.commentsSummary.textContent = comments.length
    ? `Комментариев: ${comments.length}. Текущая серия будет указана автоматически, если она выбрана.`
    : "Пока пусто. Напишите первый комментарий по тайтлу или серии.";

  if (!comments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Комментариев пока нет.";
    watchEls.commentsList.replaceChildren(empty);
    return;
  }

  watchEls.commentsList.replaceChildren(
    ...comments.map((comment) => {
      const item = document.createElement("article");
      item.className = "comment-item";
      item.innerHTML = `
        <div class="comment-meta">
          <span class="comment-author">${escapeHtml(comment.author)}</span>
          <span class="comment-episode">${escapeHtml(comment.episodeLabel || "Без привязки к серии")}</span>
          <span class="comment-date">${escapeHtml(new Date(comment.createdAt).toLocaleString("ru-RU"))}</span>
        </div>
        <div class="comment-body">${escapeHtml(comment.body)}</div>
      `;
      return item;
    })
  );
}

function renderResumeBox() {
  const progress = getCurrentProgress();

  if (!watchState.release?.alias || !progress) {
    watchEls.resumeBox.hidden = true;
    return;
  }

  watchEls.resumeBox.hidden = false;
  watchEls.resumeText.textContent =
    `Остановились на ${progress.episodeLabel || "серии"} • ${formatClock(progress.time)}${progress.duration ? ` из ${formatClock(progress.duration)}` : ""}`;
}

function saveProgress(force = false) {
  if (!watchState.release?.alias || !watchState.episode?.id) return;
  if (watchState.sourceId !== "anilibria") return;
  if (watchEls.player.hidden) return;

  const now = Date.now();
  if (!force && now - watchState.lastProgressSave < 4000) return;
  watchState.lastProgressSave = now;

  const map = getProgressMap();
  map[watchState.release.alias] = {
    alias: watchState.release.alias,
    title: watchState.release.title,
    episodeId: watchState.episode.id,
    episodeOrdinal: watchState.episode.ordinal || 0,
    episodeLabel: `${watchState.episode.ordinal || "?"} серия${watchState.episode.name ? ` • ${watchState.episode.name}` : ""}`,
    time: Math.floor(watchEls.player.currentTime || 0),
    duration: Math.floor(watchEls.player.duration || 0),
    updatedAt: now
  };

  saveProgressMap(map);
  renderResumeBox();
}

function applyPendingResume() {
  const progress = watchState.pendingResume;
  if (!progress) return;
  if (!watchState.episode?.id) return;
  if (watchState.episode.id !== progress.episodeId) return;
  if (!watchEls.player.duration || Number.isNaN(watchEls.player.duration)) return;

  const targetTime = Math.max(0, Math.min(progress.time || 0, Math.max(0, watchEls.player.duration - 2)));
  watchEls.player.currentTime = targetTime;
  watchState.pendingResume = null;
}

function resumeFromSavedProgress() {
  const progress = getCurrentProgress();
  if (!progress) return;

  watchState.pendingResume = progress;

  if (watchState.episode?.id === progress.episodeId) {
    applyPendingResume();
    return;
  }

  const byId = document.querySelector(`.episode-btn[data-episode-id="${escapeSelector(progress.episodeId)}"]`);
  if (byId) {
    byId.click();
    return;
  }

  const byOrdinal = document.querySelector(`.episode-btn[data-ordinal="${escapeSelector(String(progress.episodeOrdinal || ""))}"]`);
  if (byOrdinal) {
    byOrdinal.click();
  }
}

function handleCommentSubmit(event) {
  event.preventDefault();
  const body = watchEls.commentInput.value.trim();
  if (!body || !watchState.release?.alias) return;

  const user = getAuthUser();
  const map = getCommentsMap();
  const list = Array.isArray(map[watchState.release.alias]) ? map[watchState.release.alias] : [];

  list.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    author: user?.displayName || user?.email || "Гость",
    episodeId: watchState.episode?.id || "",
    episodeOrdinal: watchState.episode?.ordinal || 0,
    episodeLabel: watchState.episode ? `${watchState.episode.ordinal || "?"} серия` : "Без привязки к серии",
    body,
    createdAt: Date.now()
  });

  map[watchState.release.alias] = list.slice(-200);
  saveCommentsMap(map);
  watchEls.commentInput.value = "";
  renderComments();
}

function bindPlayerTracking() {
  ["timeupdate", "pause", "seeked"].forEach((eventName) => {
    watchEls.player.addEventListener(eventName, () => saveProgress(false));
  });

  watchEls.player.addEventListener("loadedmetadata", applyPendingResume);
  watchEls.player.addEventListener("ended", () => saveProgress(true));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveProgress(true);
    }
  });

  window.addEventListener("beforeunload", () => saveProgress(true));
}

function bindFeatureEvents() {
  watchEls.commentForm.addEventListener("submit", handleCommentSubmit);
  watchEls.resumeBtn.addEventListener("click", resumeFromSavedProgress);
  watchEls.resumeClearBtn.addEventListener("click", clearCurrentProgress);

  window.addEventListener("animecloud:release-opened", (event) => {
    watchState.release = event.detail?.release || null;
    watchState.episode = null;
    watchState.sourceId = "anilibria";
    watchState.pendingResume = getCurrentProgress();
    renderDubBox();
    renderComments();
    renderResumeBox();
  });

  window.addEventListener("animecloud:episode-selected", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.episode = event.detail?.episode || null;
    watchState.sourceId = event.detail?.sourceId || "anilibria";
    renderComments();
    renderResumeBox();
  });

  window.addEventListener("animecloud:source-changed", (event) => {
    watchState.release = event.detail?.release || watchState.release;
    watchState.sourceId = event.detail?.sourceId || watchState.sourceId;
    renderDubBox();
  });

  window.addEventListener("animecloud:auth", () => {
    renderCommentUser();
    renderComments();
  });

  window.addEventListener("animecloud:admin-clear-comments", () => {
    clearAllComments();
  });

  window.addEventListener("animecloud:admin-clear-progress", () => {
    clearAllProgress();
  });
}

function initWatchFeatures() {
  if (!watchEls.player || !watchEls.commentForm) return;
  bindPlayerTracking();
  bindFeatureEvents();
  renderCommentUser();
  renderComments();
  renderResumeBox();
}

initWatchFeatures();
