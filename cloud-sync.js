const CLOUD_FIREBASE_CONFIG = window.ANIMECLOUD_FIREBASE_CONFIG || null;
const CLOUD_APP_CONSTANTS = window.ANIMECLOUD_CONSTANTS || {};
const CLOUD_STORAGE_KEYS = CLOUD_APP_CONSTANTS.STORAGE_KEYS || {};
const CLOUD_FIREBASE_SDK_VERSION = window.ANIMECLOUD_FIREBASE_SDK_VERSION || "10.12.5";
const CLOUD_AUTH_STORAGE_KEY = CLOUD_STORAGE_KEYS.auth || "animecloud_auth_v1";
const CLOUD_FAVORITES_PREFIX = CLOUD_STORAGE_KEYS.favoritesPrefix || "animecloud_favorites";
const CLOUD_PROGRESS_KEY = CLOUD_STORAGE_KEYS.progress || "animecloud_watch_progress_v1";
const CLOUD_COMMENTS_KEY = CLOUD_STORAGE_KEYS.comments || "animecloud_comments_v1";
const CLOUD_LISTS_KEY = CLOUD_STORAGE_KEYS.lists || "animecloud_lists_v1";
const CLOUD_RATINGS_KEY = CLOUD_STORAGE_KEYS.ratings || "animecloud_ratings_v1";
const CLOUD_SETTINGS_KEY = CLOUD_STORAGE_KEYS.settings || "animecloud_settings_v1";
const CLOUD_NOTIFICATIONS_LIMIT = 120;
const CLOUD_FAVORITES_LIMIT = 120;
const CLOUD_COMMENTS_LIMIT = 200;
const CLOUD_DB_NAME = "animecloud-db";
const CLOUD_DB_VERSION = 2;
const CLOUD_KV_STORE = "kv";
const CLOUD_PENDING_STORE = "pending";
const SYNC_TAG = "animecloud-sync";
const CLOUD_APP_CHECK_SITE_KEY =
  window.ANIMECLOUD_APP_CHECK_KEY ||
  window.__ANIMECLOUD_ENV__?.VITE_APP_CHECK_KEY ||
  "";
const CLOUD_APP_CHECK_ENABLED = window.ANIMECLOUD_ENABLE_APP_CHECK === true;

const cloudState = {
  contextPromise: null,
  dbPromise: null,
  hydrationPromises: new Map(),
  progressUnsubscribe: null,
  commentsUnsubscribers: new Map(),
  ratingsUnsubscribers: new Map(),
  notificationsUnsubscribe: null,
  syncRegistrationPromise: null
};

function isLikelyMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ""));
}

function defaultCloudSettings() {
  return {
    autoplayNext: true,
    theme: "dark"
  };
}

function defaultCloudProfile(session = cloudReadSession()) {
  return {
    displayName: String(session?.displayName || session?.email?.split("@")[0] || "").trim().slice(0, 32)
  };
}

function normalizeCloudProfile(profile = {}, session = cloudReadSession()) {
  const fallback = defaultCloudProfile(session);
  const displayName = String(profile?.displayName || fallback.displayName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return {
    displayName
  };
}

function sanitizeStoredSession(session) {
  if (!session || typeof session !== "object") return null;
  const { idToken, refreshToken, expiresAt, ...rest } = session;
  return rest;
}

function isPermissionDeniedError(error) {
  const code = String(error?.code || error?.message || "").toLowerCase();
  return code.includes("permission-denied") || code.includes("insufficient permissions");
}

async function ensureFirebaseAppCheck(app) {
  if (!CLOUD_APP_CHECK_ENABLED || !CLOUD_APP_CHECK_SITE_KEY) return null;
  if (isLikelyMobileDevice()) return null;
  if (globalThis.__animeCloudAppCheckPromise) {
    return globalThis.__animeCloudAppCheckPromise;
  }

  if (typeof window.animeCloudLoadRecaptchaEnterprise === "function") {
    await window.animeCloudLoadRecaptchaEnterprise().catch(() => null);
  }

  globalThis.__animeCloudAppCheckPromise = import(
    `https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-app-check.js`
  )
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      try {
        return initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(CLOUD_APP_CHECK_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
      } catch (error) {
        const message = String(error?.message || "").toLowerCase();
        if (error?.code === "app-check/already-initialized" || message.includes("already") && message.includes("app check")) {
          return null;
        }
        throw error;
      }
    })
    .catch((error) => {
      console.warn("AnimeCloud App Check skipped", error);
      return null;
    });

  return globalThis.__animeCloudAppCheckPromise;
}

function shouldPersistKeyLocally(key, session, options = {}) {
  if (options.forceLocal) return true;
  if (session === undefined) session = cloudReadSession();
  if (key === CLOUD_AUTH_STORAGE_KEY) return true;
  if (!session?.localId) return true;
  return key === cloudGuestFavoriteKey();
}

function cloudReadJsonSync(key, fallback, options = {}) {
  if (!shouldPersistKeyLocally(key, options.session, options)) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cloudWriteJsonSync(key, value, options = {}) {
  if (!shouldPersistKeyLocally(key, options.session, options)) {
    return value;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  return value;
}

function cloudReadSession() {
  const raw = cloudReadJsonSync(CLOUD_AUTH_STORAGE_KEY, null, { forceLocal: true });
  const sanitized = sanitizeStoredSession(raw);
  if (raw && sanitized && !isSameJson(raw, sanitized)) {
    cloudWriteJsonSync(CLOUD_AUTH_STORAGE_KEY, sanitized, { forceLocal: true });
  }
  return sanitized;
}

function cloudFavoriteKey(session) {
  return `${CLOUD_FAVORITES_PREFIX}_${session?.localId || "guest"}`;
}

function cloudGuestFavoriteKey() {
  return `${CLOUD_FAVORITES_PREFIX}_guest`;
}

function isSameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeFavorites(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((item) => {
    if (!item?.alias) return;
    const listKey = String(item.listKey || "planned");
    const id = `${item.alias}:${listKey}`;
    if (seen.has(id)) return;
    seen.add(id);
    merged.push({ ...item, listKey });
  });
  return merged.slice(0, CLOUD_FAVORITES_LIMIT);
}

function mergeProgressMaps(...maps) {
  const merged = {};
  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([alias, item]) => {
      if (!alias || !item) return;
      const current = merged[alias];
      if (!current || Number(item.updatedAt || 0) >= Number(current.updatedAt || 0)) {
        merged[alias] = item;
      }
    });
  });
  return merged;
}

function mergeCommentLists(...lists) {
  const seen = new Set();
  return lists
    .flat()
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
    .slice(-CLOUD_COMMENTS_LIMIT);
}

function normalizeRatingAlias(alias) {
  return String(alias || "").trim();
}

function normalizeRatingValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > 10) return 0;
  return rounded;
}

function normalizeRatingMap(map = {}) {
  return Object.entries(map || {}).reduce((accumulator, [alias, entry]) => {
    const safeAlias = normalizeRatingAlias(alias);
    const value = normalizeRatingValue(entry?.value ?? entry);
    if (!safeAlias || !value) return accumulator;
    accumulator[safeAlias] = {
      value,
      updatedAt: normalizeTimestampValue(entry?.updatedAt) || Date.now()
    };
    return accumulator;
  }, {});
}

function normalizeNotificationAlias(alias) {
  return String(alias || "").trim();
}

function normalizeNotificationEpisodeValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function uniqueNotificationStrings(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    const key = safeValue.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(safeValue);
  });
  return result;
}

function normalizeNotificationItem(item = {}) {
  const alias = normalizeNotificationAlias(item.alias);
  const type = item.type === "new_episode" ? "new_episode" : "new_anime";
  const id =
    String(item.id || "").trim() ||
    `${type}:${alias}:${normalizeNotificationEpisodeValue(item.episode)}:${normalizeTimestampValue(item.createdAt) || Date.now()}`;
  return {
    id,
    type,
    alias,
    title: String(item.title || "").trim() || "Обновление каталога",
    body: String(item.body || "").trim() || "Появилось новое обновление.",
    createdAt: normalizeTimestampValue(item.createdAt) || Date.now(),
    readAt: normalizeTimestampValue(item.readAt),
    episode: normalizeNotificationEpisodeValue(item.episode),
    actionLabel: String(item.actionLabel || "").trim() || "Открыть"
  };
}

function mergeNotificationLists(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .map((item) => normalizeNotificationItem(item))
    .filter((item) => item.id && item.alias && !item.readAt)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .slice(0, CLOUD_NOTIFICATIONS_LIMIT);
}

function normalizeNotificationState(item = {}) {
  const normalizedAliases = uniqueNotificationStrings(Array.isArray(item.seenNewAnimeAliases) ? item.seenNewAnimeAliases : []).slice(-240);
  const dismissedIds = uniqueNotificationStrings(Array.isArray(item.dismissedIds) ? item.dismissedIds : []).slice(-480);
  const lastEpisodeByAlias = Object.entries(item.lastEpisodeByAlias || {}).reduce((accumulator, [alias, value]) => {
    const safeAlias = normalizeNotificationAlias(alias);
    if (!safeAlias) return accumulator;
    accumulator[safeAlias] = normalizeNotificationEpisodeValue(value);
    return accumulator;
  }, {});

  return {
    seenNewAnimeAliases: normalizedAliases,
    dismissedIds,
    lastEpisodeByAlias,
    initializedAt: normalizeTimestampValue(item.initializedAt),
    lastScanAt: normalizeTimestampValue(item.lastScanAt)
  };
}

function normalizeRatingVoteData(id, data = {}) {
  return {
    id: String(id || "").trim(),
    alias: normalizeRatingAlias(data.alias),
    uid: String(data.uid || "").trim(),
    value: normalizeRatingValue(data.value),
    updatedAt: normalizeTimestampValue(data.updatedAt)
  };
}

function summarizeRatings(alias, votes = [], session = cloudReadSession(), localRatings = {}) {
  const safeAlias = normalizeRatingAlias(alias);
  const normalizedVotes = votes
    .map((item) => normalizeRatingVoteData(item?.id, item))
    .filter((item) => item.alias && item.value);
  const count = normalizedVotes.length;
  const total = normalizedVotes.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const localValue = normalizeRatingValue(localRatings?.[safeAlias]?.value);
  const cloudUserVote = session?.localId
    ? normalizedVotes.find((item) => item.uid === session.localId)?.value || 0
    : 0;
  const userVote = cloudUserVote || localValue;

  return {
    average: count ? Number((total / count).toFixed(1)) : userVote || 0,
    count,
    userValue: userVote || 0
  };
}

function openCloudDatabase() {
  if (cloudState.dbPromise) return cloudState.dbPromise;

  cloudState.dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CLOUD_DB_NAME, CLOUD_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const expectedStores = new Set([CLOUD_KV_STORE, CLOUD_PENDING_STORE]);
      Array.from(db.objectStoreNames).forEach((name) => {
        if (!expectedStores.has(name)) {
          db.deleteObjectStore(name);
        }
      });
      if (!db.objectStoreNames.contains(CLOUD_KV_STORE)) {
        db.createObjectStore(CLOUD_KV_STORE);
      }
      if (!db.objectStoreNames.contains(CLOUD_PENDING_STORE)) {
        const store = db.createObjectStore(CLOUD_PENDING_STORE, { keyPath: "id" });
        store.createIndex("by-created-at", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  }).catch((error) => {
    cloudState.dbPromise = null;
    throw error;
  });

  return cloudState.dbPromise;
}

function withStore(storeName, mode, handler) {
  return openCloudDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = handler(store, tx);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed: ${storeName}`));
        tx.onabort = () => reject(tx.error || new Error(`IndexedDB transaction aborted: ${storeName}`));
      })
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

async function cloudReadJson(key, fallback, options = {}) {
  if (!shouldPersistKeyLocally(key, options.session, options)) {
    return fallback;
  }
  try {
    const raw = await withStore(CLOUD_KV_STORE, "readonly", (store) => requestToPromise(store.get(key)));
    if (raw === undefined) return fallback;
    return raw ?? fallback;
  } catch {
    return cloudReadJsonSync(key, fallback, options);
  }
}

async function cloudWriteJson(key, value, options = {}) {
  if (!shouldPersistKeyLocally(key, options.session, options)) {
    await deleteCloudJson(key, { forceLocal: true });
    return value;
  }

  cloudWriteJsonSync(key, value, options);
  try {
    await withStore(CLOUD_KV_STORE, "readwrite", (store) => requestToPromise(store.put(value, key)));
  } catch {}
  return value;
}

async function deleteCloudJson(key) {
  try {
    await withStore(CLOUD_KV_STORE, "readwrite", (store) => requestToPromise(store.delete(key)));
  } catch {}
  try {
    localStorage.removeItem(key);
  } catch {}
}

async function listPendingOperations() {
  try {
    const items = await withStore(CLOUD_PENDING_STORE, "readonly", (store) => requestToPromise(store.getAll()));
    return Array.isArray(items) ? items.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)) : [];
  } catch {
    return [];
  }
}

async function enqueuePendingOperation(operation) {
  const payload = {
    ...operation,
    id: operation.id || `${operation.type}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    createdAt: Number(operation.createdAt || Date.now())
  };
  try {
    await withStore(CLOUD_PENDING_STORE, "readwrite", (store) => requestToPromise(store.put(payload)));
  } catch {}
  queueBackgroundSync();
  return payload;
}

async function clearAccountLocalCaches(session = cloudReadSession()) {
  if (!session?.localId) return;
  await Promise.all([
    deleteCloudJson(cloudFavoriteKey(session), { forceLocal: true }),
    deleteCloudJson(CLOUD_LISTS_KEY, { forceLocal: true }),
    deleteCloudJson(CLOUD_PROGRESS_KEY, { forceLocal: true }),
    deleteCloudJson(CLOUD_COMMENTS_KEY, { forceLocal: true }),
    deleteCloudJson(CLOUD_RATINGS_KEY, { forceLocal: true }),
    deleteCloudJson(CLOUD_SETTINGS_KEY, { forceLocal: true })
  ]);
  try {
    await withStore(CLOUD_PENDING_STORE, "readwrite", (store) => requestToPromise(store.clear()));
  } catch {}
}

async function removePendingOperation(id) {
  try {
    await withStore(CLOUD_PENDING_STORE, "readwrite", (store) => requestToPromise(store.delete(id)));
  } catch {}
}

async function getCloudContext() {
  if (cloudState.contextPromise) return cloudState.contextPromise;

  cloudState.contextPromise = (async () => {
    const firebaseImports = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-firestore.js`)
    ]);

    const [{ initializeApp, getApp, getApps }, firestoreModule] = firebaseImports;
    const {
      getFirestore,
      doc,
      getDoc,
      setDoc,
      deleteDoc,
      serverTimestamp,
      onSnapshot,
      collection,
      query,
      getDocs,
      addDoc,
      orderBy,
      limit
    } = firestoreModule;

    if (!CLOUD_FIREBASE_CONFIG) {
      throw new Error("AnimeCloud Firebase config is missing");
    }

    const app = getApps().length ? getApp() : initializeApp(CLOUD_FIREBASE_CONFIG);

    Promise.resolve()
      .then(() => ensureFirebaseAppCheck(app))
      .catch((error) => {
        console.warn("AnimeCloud Cloud App Check init skipped", error);
      });

    return {
      db: getFirestore(app),
      doc,
      getDoc,
      setDoc,
      deleteDoc,
      serverTimestamp,
      onSnapshot,
      collection,
      query,
      getDocs,
      addDoc,
      orderBy,
      limit
    };
  })().catch((error) => {
    cloudState.contextPromise = null;
    throw error;
  });

  return cloudState.contextPromise;
}

async function readCloudDoc(pathParts, fallback) {
  const { db, doc, getDoc } = await getCloudContext();
  const snap = await getDoc(doc(db, ...pathParts));
  return snap.exists() ? snap.data() : fallback;
}

function normalizeTimestampValue(value) {
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return Number(value.seconds) * 1000;
  return 0;
}

function normalizeCommentData(id, data = {}) {
  return {
    id: id || "",
    clientId: String(data.clientId || "").trim(),
    alias: String(data.alias || ""),
    author: String(data.author || "").trim(),
    uid: String(data.uid || "").trim(),
    body: String(data.body || "").trim(),
    createdAt: normalizeTimestampValue(data.createdAt)
  };
}

function normalizeCommentClientId(alias, comment, index = 0) {
  const raw =
    String(comment?.clientId || comment?.id || "").trim() ||
    `${alias}-${normalizeTimestampValue(comment?.createdAt) || 0}-${index}-${String(comment?.body || "").slice(0, 48)}`;

  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || `comment-${Date.now()}-${index}`;
}

function buildCommentDocumentId(session, alias, comment, index = 0) {
  const clientId = normalizeCommentClientId(alias, comment, index);
  return `${String(session?.localId || "guest").slice(0, 48)}-${clientId}`.slice(0, 180);
}

function normalizeCommentAuthorForCloud(comment, session) {
  const author = String(comment?.author || "").trim();
  const lowered = author.toLowerCase();
  if (!author || lowered === "\u0433\u043e\u0441\u0442\u044c" || lowered === "\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c") {
    return String(session?.displayName || session?.email?.split("@")[0] || "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c").trim();
  }
  return author;
}

async function readLegacyComments(alias) {
  try {
    const docData = await readCloudDoc(["anime_comments", alias], { items: [] });
    return Array.isArray(docData?.items) ? docData.items : [];
  } catch {
    return [];
  }
}

async function loadCommentCollection(alias) {
  if (!alias) return [];
  const { db, collection, query, getDocs, orderBy, limit } = await getCloudContext();
  const commentsQuery = query(
    collection(db, "anime_comments", alias, "comments"),
    orderBy("createdAt", "asc"),
    limit(CLOUD_COMMENTS_LIMIT)
  );
  const snapshot = await getDocs(commentsQuery);
  return snapshot.docs.map((item) => normalizeCommentData(item.id, item.data()));
}

async function writeCloudDoc(pathParts, data) {
  const { db, doc, setDoc, serverTimestamp } = await getCloudContext();
  await setDoc(
    doc(db, ...pathParts),
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function writeCloudRatingVote(alias, value, session = cloudReadSession()) {
  const safeAlias = normalizeRatingAlias(alias);
  if (!safeAlias || !session?.localId) return false;

  const normalizedValue = normalizeRatingValue(value);
  const { db, doc, setDoc, deleteDoc, serverTimestamp } = await getCloudContext();
  const voteRef = doc(db, "anime_ratings", safeAlias, "votes", session.localId);

  if (normalizedValue) {
    await setDoc(voteRef, {
      alias: safeAlias,
      uid: session.localId,
      value: normalizedValue,
      updatedAt: serverTimestamp()
    });
  } else {
    await deleteDoc(voteRef);
  }

  return true;
}

async function writeCloudDocQueued(pathParts, data, options = {}) {
  try {
    await writeCloudDoc(pathParts, data);
    return true;
  } catch (error) {
    if (options.queueOnFailure !== false) {
      await enqueuePendingOperation({
        type: "setDoc",
        pathParts,
        data
      });
    }
    throw error;
  }
}

async function flushPendingSync() {
  const operations = await listPendingOperations();
  for (const item of operations) {
    try {
      if (item.type === "setDoc") {
        await writeCloudDoc(item.pathParts, item.data);
      } else if (item.type === "ratingVote") {
        const session = cloudReadSession();
        if (!session?.localId || session.localId !== item.uid) {
          break;
        }
        await writeCloudRatingVote(item.alias, item.value, session);
      }
      await removePendingOperation(item.id);
    } catch {
      break;
    }
  }
}

async function queueBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration?.sync?.register) return;
    cloudState.syncRegistrationPromise = registration.sync.register(SYNC_TAG).catch(() => null);
    await cloudState.syncRegistrationPromise;
  } catch {}
}

function subscribeDoc(pathParts, fallback, callback) {
  let active = true;
  let unsubscribe = () => {};

  getCloudContext()
    .then(({ db, doc, onSnapshot }) => {
      if (!active) return;
      unsubscribe = onSnapshot(
        doc(db, ...pathParts),
        (snapshot) => {
          const next = snapshot.exists() ? snapshot.data() : fallback;
          callback(next);
        },
        (error) => {
          if (!isPermissionDeniedError(error)) {
            console.error(error);
          }
          callback(fallback);
        }
      );
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
      callback(fallback);
    });

  return () => {
    active = false;
    unsubscribe();
  };
}

async function migrateGuestCommentsToCloud(session, guestCommentsMap = {}) {
  if (!session?.localId) return guestCommentsMap || {};

  const remaining = {};
  for (const [alias, items] of Object.entries(guestCommentsMap || {})) {
    if (!alias || !Array.isArray(items) || !items.length) continue;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item?.body) continue;

      try {
        await addComment(
          alias,
          {
            ...item,
            id: normalizeCommentClientId(alias, item, index),
            author: normalizeCommentAuthorForCloud(item, session)
          },
          session
        );
      } catch (error) {
        if (!remaining[alias]) remaining[alias] = [];
        remaining[alias].push(item);
        if (!isPermissionDeniedError(error)) {
          console.error(error);
        }
      }
    }
  }

  return remaining;
}

async function runHydrateSessionData(session = cloudReadSession()) {
  if (!session?.localId) {
    return {
      favorites: (await cloudReadJson(cloudGuestFavoriteKey(), [], { session: null })) || [],
      progress: (await cloudReadJson(CLOUD_PROGRESS_KEY, {}, { session: null })) || {},
      settings: (await cloudReadJson(CLOUD_SETTINGS_KEY, defaultCloudSettings(), { session: null })) || defaultCloudSettings(),
      profile: defaultCloudProfile(session)
    };
  }

  const uid = session.localId;
  const localFavorites = await cloudReadJson(cloudFavoriteKey(session), [], { forceLocal: true });
  const guestFavorites = await cloudReadJson(cloudGuestFavoriteKey(), [], { forceLocal: true, session: null });
  const localProgress = await cloudReadJson(CLOUD_PROGRESS_KEY, {}, { forceLocal: true });
  const guestComments = await cloudReadJson(CLOUD_COMMENTS_KEY, {}, { forceLocal: true, session: null });
  const localSettings = await cloudReadJson(CLOUD_SETTINGS_KEY, defaultCloudSettings(), { forceLocal: true });

  const [cloudFavoritesDoc, cloudProgressDoc, cloudSettingsDoc, cloudProfileDoc] = await Promise.all([
    readCloudDoc(["users", uid, "private", "favorites"], { items: [] }),
    readCloudDoc(["users", uid, "private", "progress"], { items: {} }),
    readCloudDoc(["users", uid, "private", "settings"], { item: defaultCloudSettings() }),
    readCloudDoc(["users", uid, "private", "profile"], { item: defaultCloudProfile(session) })
  ]);

  const mergedFavorites = mergeFavorites(cloudFavoritesDoc?.items || [], localFavorites, guestFavorites);
  const mergedProgress = mergeProgressMaps(cloudProgressDoc?.items || {}, localProgress);
  const mergedSettings = {
    ...defaultCloudSettings(),
    ...(localSettings || {}),
    ...(cloudSettingsDoc?.item || {})
  };
  const mergedProfile = normalizeCloudProfile(cloudProfileDoc?.item || {}, session);

  const remainingGuestComments = await migrateGuestCommentsToCloud(session, guestComments);

  if (!isSameJson(cloudFavoritesDoc?.items || [], mergedFavorites)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "favorites"], {
        uid,
        email: session.email || "",
        items: mergedFavorites
      }, { queueOnFailure: false });
    } catch {}
  }

  if (!isSameJson(cloudProgressDoc?.items || {}, mergedProgress)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "progress"], {
        uid,
        email: session.email || "",
        items: mergedProgress
      }, { queueOnFailure: false });
    } catch {}
  }

  if (!isSameJson(cloudSettingsDoc?.item || defaultCloudSettings(), mergedSettings)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "settings"], {
        uid,
        email: session.email || "",
        item: mergedSettings
      }, { queueOnFailure: false });
    } catch {}
  }

  if (!isSameJson(normalizeCloudProfile(cloudProfileDoc?.item || {}, session), mergedProfile)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "profile"], {
        uid,
        email: session.email || "",
        item: mergedProfile
      }, { queueOnFailure: false });
    } catch {}
  }

  await clearAccountLocalCaches(session);

  if (Object.keys(remainingGuestComments).length) {
    await cloudWriteJson(CLOUD_COMMENTS_KEY, remainingGuestComments, { forceLocal: true, session: null });
  }

  return { favorites: mergedFavorites, progress: mergedProgress, settings: mergedSettings, profile: mergedProfile };
}

async function hydrateSessionData(session = cloudReadSession()) {
  if (!session?.localId) {
    return runHydrateSessionData(session);
  }

  const existingPromise = cloudState.hydrationPromises.get(session.localId);
  if (existingPromise) return existingPromise;

  const nextPromise = runHydrateSessionData(session).finally(() => {
    cloudState.hydrationPromises.delete(session.localId);
  });

  cloudState.hydrationPromises.set(session.localId, nextPromise);
  return nextPromise;
}

async function saveFavorites(session = cloudReadSession(), items = []) {
  const next = mergeFavorites(items);
  if (!session?.localId) {
    await cloudWriteJson(cloudFavoriteKey(session), next, { session: null });
    await cloudWriteJson(CLOUD_LISTS_KEY, next, { session: null });
  }

  if (!session?.localId) return false;

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "favorites"], {
      uid: session.localId,
      email: session.email || "",
      items: next
    }, { queueOnFailure: false });
  } catch {}

  return true;
}

async function saveProgress(session = cloudReadSession(), map = {}) {
  if (!session?.localId) {
    await cloudWriteJson(CLOUD_PROGRESS_KEY, map, { session: null });
  }

  if (!session?.localId) return false;

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "progress"], {
      uid: session.localId,
      email: session.email || "",
      items: map
    }, { queueOnFailure: false });
  } catch {}

  return true;
}

async function loadSettings(session = cloudReadSession()) {
  if (!session?.localId) {
    return (await cloudReadJson(CLOUD_SETTINGS_KEY, defaultCloudSettings(), { session: null })) || defaultCloudSettings();
  }

  try {
    const docData = await readCloudDoc(["users", session.localId, "private", "settings"], {
      item: defaultCloudSettings()
    });
    return {
      ...defaultCloudSettings(),
      ...(docData?.item || {})
    };
  } catch {
    return defaultCloudSettings();
  }
}

async function saveSettings(session = cloudReadSession(), settings = {}) {
  const next = {
    ...defaultCloudSettings(),
    ...(settings || {})
  };

  if (!session?.localId) {
    await cloudWriteJson(CLOUD_SETTINGS_KEY, next, { session: null });
    return false;
  }

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "settings"], {
      uid: session.localId,
      email: session.email || "",
      item: next
    }, { queueOnFailure: false });
  } catch {}

  return true;
}

async function loadProfile(session = cloudReadSession()) {
  if (!session?.localId) return defaultCloudProfile(session);

  try {
    const docData = await readCloudDoc(["users", session.localId, "private", "profile"], {
      item: defaultCloudProfile(session)
    });
    return normalizeCloudProfile(docData?.item || {}, session);
  } catch {
    return defaultCloudProfile(session);
  }
}

async function saveProfile(session = cloudReadSession(), profile = {}) {
  const next = normalizeCloudProfile(profile, session);
  if (!session?.localId) return next;

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "profile"], {
      uid: session.localId,
      email: session.email || "",
      item: next
    }, { queueOnFailure: false });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
    throw error;
  }

  return next;
}

async function loadNotifications(session = cloudReadSession()) {
  if (!session?.localId) return [];

  try {
    const docData = await readCloudDoc(["users", session.localId, "private", "notifications"], {
      items: []
    });
    return mergeNotificationLists(docData?.items || []);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
    return [];
  }
}

async function saveNotifications(session = cloudReadSession(), items = []) {
  if (!session?.localId) return [];
  const next = mergeNotificationLists(items);

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "notifications"], {
      uid: session.localId,
      email: session.email || "",
      items: next
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
  }

  return next;
}

async function loadNotificationState(session = cloudReadSession()) {
  if (!session?.localId) return normalizeNotificationState();

  try {
    const docData = await readCloudDoc(["users", session.localId, "private", "notification_state"], {
      item: {}
    });
    return normalizeNotificationState(docData?.item || {});
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
    return normalizeNotificationState();
  }
}

async function saveNotificationState(session = cloudReadSession(), item = {}) {
  if (!session?.localId) return normalizeNotificationState(item);
  const next = normalizeNotificationState(item);

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "notification_state"], {
      uid: session.localId,
      email: session.email || "",
      item: next
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
  }

  return next;
}

function buildNotificationTrackedEpisodeMap(trackedItems = [], liveByAlias = new Map()) {
  return (Array.isArray(trackedItems) ? trackedItems : []).reduce((accumulator, item) => {
    const alias = normalizeNotificationAlias(item?.alias);
    if (!alias) return accumulator;

    const liveRelease = liveByAlias.get(alias);
    const episodeValue = normalizeNotificationEpisodeValue(
      liveRelease?.publishedEpisode?.ordinal ||
        liveRelease?.episodesTotal ||
        item?.publishedEpisode?.ordinal ||
        item?.episodesTotal
    );

    accumulator[alias] = episodeValue;
    return accumulator;
  }, {});
}

function buildNewAnimeNotification(release, createdAt) {
  const alias = normalizeNotificationAlias(release?.alias);
  const title = String(release?.title || "").trim() || "Новый тайтл";
  return normalizeNotificationItem({
    id: `new_anime:${alias}`,
    type: "new_anime",
    alias,
    title,
    body: `В каталоге появился новый тайтл: ${title}.`,
    createdAt,
    actionLabel: "Открыть"
  });
}

function buildNewEpisodeNotification(release, episodeNumber, createdAt) {
  const alias = normalizeNotificationAlias(release?.alias);
  const title = String(release?.title || "").trim() || "Новое обновление";
  const safeEpisode = normalizeNotificationEpisodeValue(episodeNumber);
  return normalizeNotificationItem({
    id: `new_episode:${alias}:${safeEpisode || "latest"}`,
    type: "new_episode",
    alias,
    title,
    body: safeEpisode
      ? `Вышла ${safeEpisode} серия для «${title}».`
      : `Для «${title}» вышла новая серия.`,
    createdAt,
    episode: safeEpisode,
    actionLabel: "Открыть"
  });
}

async function markNotificationsRead(ids = [], session = cloudReadSession()) {
  const safeIds = [...new Set((Array.isArray(ids) ? ids : []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!safeIds.length || !session?.localId) {
    return loadNotifications(session);
  }

  const [current, currentState] = await Promise.all([loadNotifications(session), loadNotificationState(session)]);
  const idSet = new Set(safeIds);
  let changed = false;
  const timestamp = Date.now();
  const next = current.map((item) => {
    if (!idSet.has(item.id) || item.readAt) return item;
    changed = true;
    return normalizeNotificationItem({
      ...item,
      readAt: timestamp
    });
  });

  if (changed) {
    const nextState = normalizeNotificationState({
      ...currentState,
      dismissedIds: [...(currentState.dismissedIds || []), ...safeIds],
      lastScanAt: timestamp
    });
    await Promise.all([saveNotificationState(session, nextState), saveNotifications(session, next)]);
  }

  const dismissedIds = new Set((currentState.dismissedIds || []).concat(safeIds));
  return mergeNotificationLists(next).filter((item) => !dismissedIds.has(item.id));
}

async function syncNotifications(session = cloudReadSession(), payload = {}) {
  if (!session?.localId) {
    return { items: [], created: [] };
  }

  const latestReleases = Array.isArray(payload?.latestReleases)
    ? payload.latestReleases.filter((release) => normalizeNotificationAlias(release?.alias))
    : [];
  const trackedItems = Array.isArray(payload?.tracked)
    ? payload.tracked.filter((item) => normalizeNotificationAlias(item?.alias))
    : Array.isArray(payload?.watching)
      ? payload.watching.filter((item) => normalizeNotificationAlias(item?.alias))
      : [];
  const trackedReleases = Array.isArray(payload?.trackedReleases)
    ? payload.trackedReleases.filter((release) => normalizeNotificationAlias(release?.alias))
    : [];
  const liveByAlias = new Map();
  [...latestReleases, ...trackedReleases].forEach((release) => {
    const alias = normalizeNotificationAlias(release?.alias);
    if (!alias) return;
    liveByAlias.set(alias, release);
  });
  const now = Date.now();
  const [existingItems, currentState] = await Promise.all([
    loadNotifications(session),
    loadNotificationState(session)
  ]);
  const trackedEpisodeMap = buildNotificationTrackedEpisodeMap(trackedItems, liveByAlias);
  const dismissedIds = new Set(currentState.dismissedIds || []);

  if (!currentState.initializedAt) {
    const created = [];
    latestReleases.slice(0, 12).forEach((release, index) => {
      const notification = buildNewAnimeNotification(release, now + index);
      if (!dismissedIds.has(notification.id)) {
        created.push(notification);
      }
    });

    trackedItems.forEach((item, index) => {
      const alias = normalizeNotificationAlias(item?.alias);
      if (!alias) return;
      const currentEpisode = normalizeNotificationEpisodeValue(trackedEpisodeMap[alias]);
      const baselineEpisode = normalizeNotificationEpisodeValue(
        item?.publishedEpisode?.ordinal || item?.episodesTotal
      );
      if (!currentEpisode || currentEpisode <= baselineEpisode || !liveByAlias.has(alias)) return;
      const notification = buildNewEpisodeNotification(
        liveByAlias.get(alias),
        currentEpisode,
        now + latestReleases.length + index + created.length
      );
      if (!dismissedIds.has(notification.id)) {
        created.push(notification);
      }
    });

    const nextState = {
      seenNewAnimeAliases: uniqueNotificationStrings(latestReleases.map((release) => release.alias)).slice(-240),
      dismissedIds: currentState.dismissedIds || [],
      lastEpisodeByAlias: trackedEpisodeMap,
      initializedAt: now,
      lastScanAt: now
    };
    const nextItems = (created.length ? mergeNotificationLists(created, existingItems) : existingItems).filter(
      (item) => !dismissedIds.has(item.id)
    );
    await saveNotificationState(session, nextState);
    if (created.length) {
      await saveNotifications(session, nextItems);
    }
    return { items: nextItems, created };
  }

  const created = [];
  const seenAliases = new Set(uniqueNotificationStrings(currentState.seenNewAnimeAliases));
  latestReleases.forEach((release, index) => {
    const alias = normalizeNotificationAlias(release.alias);
    if (!alias || seenAliases.has(alias)) return;
    seenAliases.add(alias);
    const notification = buildNewAnimeNotification(release, now + index);
    if (!dismissedIds.has(notification.id)) {
      created.push(notification);
    }
  });

  const nextEpisodeState = { ...(currentState.lastEpisodeByAlias || {}) };
  const trackedItemMap = new Map(
    trackedItems
      .map((item) => [normalizeNotificationAlias(item?.alias), item])
      .filter(([alias]) => Boolean(alias))
  );
  Object.entries(trackedEpisodeMap).forEach(([alias, episodeValue]) => {
    const currentEpisode = normalizeNotificationEpisodeValue(episodeValue);
    const fallbackBaseline = normalizeNotificationEpisodeValue(
      trackedItemMap.get(alias)?.publishedEpisode?.ordinal ||
        trackedItemMap.get(alias)?.episodesTotal
    );
    const previousEpisode = normalizeNotificationEpisodeValue(nextEpisodeState[alias]) || fallbackBaseline;
    if (!previousEpisode) {
      nextEpisodeState[alias] = currentEpisode;
      return;
    }
    if (!liveByAlias.has(alias) || currentEpisode <= previousEpisode) return;
    const notification = buildNewEpisodeNotification(
      liveByAlias.get(alias),
      currentEpisode,
      now + latestReleases.length + created.length
    );
    if (!dismissedIds.has(notification.id)) {
      created.push(notification);
    }
    nextEpisodeState[alias] = currentEpisode;
  });

  const nextItems = (created.length ? mergeNotificationLists(created, existingItems) : existingItems).filter(
    (item) => !dismissedIds.has(item.id)
  );
  const nextState = normalizeNotificationState({
    seenNewAnimeAliases: uniqueNotificationStrings([...seenAliases]).slice(-240),
    dismissedIds: currentState.dismissedIds || [],
    lastEpisodeByAlias: nextEpisodeState,
    initializedAt: currentState.initializedAt || now,
    lastScanAt: now
  });

  await saveNotificationState(session, nextState);
  if (created.length) {
    await saveNotifications(session, nextItems);
  }

  return {
    items: nextItems,
    created
  };
}

function subscribeNotifications(session, callback) {
  if (!session?.localId || typeof callback !== "function") return () => {};

  const current = cloudState.notificationsUnsubscribe;
  if (typeof current === "function") {
    current();
  }

  let active = true;
  const unsubscribe = subscribeDoc(
    ["users", session.localId, "private", "notifications"],
    { items: [] },
    (data) => {
      if (!active) return;
      callback(mergeNotificationLists(data?.items || []));
    }
  );

  loadNotifications(session)
    .then((items) => {
      if (active) callback(items);
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
    });

  const stop = () => {
    active = false;
    unsubscribe();
    if (cloudState.notificationsUnsubscribe === stop) {
      cloudState.notificationsUnsubscribe = null;
    }
  };

  cloudState.notificationsUnsubscribe = stop;
  return stop;
}

async function readRatingMap(session = cloudReadSession()) {
  if (session?.localId) return {};
  const localRatings = await cloudReadJson(CLOUD_RATINGS_KEY, {}, { session: null });
  return normalizeRatingMap(localRatings || {});
}

async function writeRatingMap(map, session = cloudReadSession()) {
  const normalized = normalizeRatingMap(map || {});
  if (!session?.localId) {
    await cloudWriteJson(CLOUD_RATINGS_KEY, normalized, { session: null });
  }
  return normalized;
}

async function readFallbackRatingMap() {
  const localRatings = await cloudReadJson(CLOUD_RATINGS_KEY, {}, { session: null, forceLocal: true });
  return normalizeRatingMap(localRatings || {});
}

async function writeFallbackRatingMap(map) {
  const normalized = normalizeRatingMap(map || {});
  await cloudWriteJson(CLOUD_RATINGS_KEY, normalized, { session: null, forceLocal: true });
  return normalized;
}

async function loadRatingSummary(alias, session = cloudReadSession()) {
  const safeAlias = normalizeRatingAlias(alias);
  if (!safeAlias) {
    return { average: 0, count: 0, userValue: 0 };
  }

  const localRatings = await readFallbackRatingMap();
  let votes = [];

  try {
    if (!CLOUD_FIREBASE_CONFIG) {
      throw new Error("AnimeCloud Firebase config is missing");
    }
    const { db, collection, query, getDocs, limit } = await getCloudContext();
    const snapshot = await getDocs(query(collection(db, "anime_ratings", safeAlias, "votes"), limit(500)));
    votes = snapshot.docs.map((item) => normalizeRatingVoteData(item.id, item.data())).filter((item) => item.value);
  } catch (error) {
    if (session?.localId && !isPermissionDeniedError(error)) {
      console.error(error);
    }
  }

  if (!votes.length && !session?.localId) {
    const userValue = normalizeRatingValue(localRatings?.[safeAlias]?.value);
    return { average: userValue || 0, count: userValue ? 1 : 0, userValue };
  }

  return summarizeRatings(
    safeAlias,
    votes.map((vote) => ({ ...vote, alias: safeAlias })),
    session,
    { [safeAlias]: localRatings[safeAlias] }
  );
}

async function saveRating(alias, value, session = cloudReadSession()) {
  const safeAlias = normalizeRatingAlias(alias);
  if (!safeAlias) return { average: 0, count: 0, userValue: 0 };

  const normalizedValue = normalizeRatingValue(value);
  const localRatings = await readFallbackRatingMap();
  const next = { ...localRatings };

  if (normalizedValue) {
    next[safeAlias] = {
      value: normalizedValue,
      updatedAt: Date.now()
    };
  } else {
    delete next[safeAlias];
  }

  if (!session?.localId) {
    await writeRatingMap(next, session);
    return {
      average: normalizedValue || 0,
      count: normalizedValue ? 1 : 0,
      userValue: normalizedValue
    };
  }

  try {
    await writeCloudRatingVote(safeAlias, normalizedValue, session);
    await writeFallbackRatingMap(next);
    return loadRatingSummary(safeAlias, session);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      console.error(error);
    }
    await enqueuePendingOperation({
      type: "ratingVote",
      uid: session.localId,
      alias: safeAlias,
      value: normalizedValue
    });
    await writeFallbackRatingMap(next);
    return summarizeRatings(safeAlias, [], session, { [safeAlias]: next[safeAlias] });
  }
}

function subscribeRatings(alias, callback, session = cloudReadSession()) {
  const safeAlias = normalizeRatingAlias(alias);
  if (!safeAlias || typeof callback !== "function") return () => {};

  const current = cloudState.ratingsUnsubscribers.get(safeAlias);
  if (current) current();

  let active = true;
  let unsubscribe = null;

  const stop = () => {
    active = false;
    if (typeof unsubscribe === "function") unsubscribe();
    cloudState.ratingsUnsubscribers.delete(safeAlias);
  };

  loadRatingSummary(safeAlias, session)
    .then((summary) => {
      if (active) callback(summary);
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
    });

  if (!CLOUD_FIREBASE_CONFIG) {
    return stop;
  }

  getCloudContext()
    .then(async ({ db, collection, query, onSnapshot, limit }) => {
      if (!active) return;
      const votesQuery = query(collection(db, "anime_ratings", safeAlias, "votes"), limit(500));
      unsubscribe = onSnapshot(
        votesQuery,
          async (snapshot) => {
            const localRatings = await readFallbackRatingMap();
            const votes = snapshot.docs
              .map((item) => normalizeRatingVoteData(item.id, item.data()))
              .filter((item) => item.value);
            callback(
              summarizeRatings(
              safeAlias,
              votes.map((vote) => ({ ...vote, alias: safeAlias })),
              session,
              { [safeAlias]: localRatings[safeAlias] }
            )
          );
        },
        (error) => {
          if (!isPermissionDeniedError(error)) {
            console.error(error);
          }
        }
      );
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
    });

  cloudState.ratingsUnsubscribers.set(safeAlias, stop);
  return stop;
}

async function loadComments(alias) {
  if (!alias) return [];

  const session = cloudReadSession();
  const localMap = session?.localId
    ? {}
    : await cloudReadJson(CLOUD_COMMENTS_KEY, {}, { session: null });
  const localItems = Array.isArray(localMap?.[alias]) ? localMap[alias] : [];

  try {
    const [legacyItems, collectionItems] = await Promise.all([
      readLegacyComments(alias),
      loadCommentCollection(alias)
    ]);
    const next = mergeCommentLists(localItems, legacyItems, collectionItems);
    if (!session?.localId) {
      const mergedMap = { ...(localMap || {}), [alias]: next };
      await cloudWriteJson(CLOUD_COMMENTS_KEY, mergedMap, { session: null });
    }
    return next;
  } catch {
    return localItems;
  }
}

async function saveComments(alias, comments = []) {
  if (!alias) return [];
  const next = Array.isArray(comments) ? comments.slice(-CLOUD_COMMENTS_LIMIT) : [];
  const session = cloudReadSession();

  if (!session?.localId) {
    const localMap = await cloudReadJson(CLOUD_COMMENTS_KEY, {}, { session: null });
    localMap[alias] = next;
    await cloudWriteJson(CLOUD_COMMENTS_KEY, localMap, { session: null });
    return next;
  }

  return next;
}

async function addComment(alias, comment, session = cloudReadSession()) {
  if (!alias || !session?.localId) return false;

  const body = String(comment?.body || "").trim();
  if (!body) return false;

  const author = normalizeCommentAuthorForCloud(comment, session);
  const clientId = normalizeCommentClientId(alias, comment);
  const { db, collection, addDoc, doc, getDoc, serverTimestamp, setDoc } = await getCloudContext();

  const payload = {
    alias,
    author,
    clientId,
    uid: session.localId,
    body,
    createdAt: serverTimestamp()
  };

  const documentId = buildCommentDocumentId(session, alias, comment);
  if (documentId) {
    const commentRef = doc(db, "anime_comments", alias, "comments", documentId);
    const existing = await getDoc(commentRef);
    if (existing.exists()) return true;
    await setDoc(commentRef, payload);
    return true;
  }

  await addDoc(collection(db, "anime_comments", alias, "comments"), payload);

  return true;
}

function subscribeComments(alias, callback) {
  if (!alias || typeof callback !== "function") return () => {};
  const current = cloudState.commentsUnsubscribers.get(alias);
  if (current) current();

  let active = true;
  let unsubscribe = () => {};
  const stop = () => {
    active = false;
    unsubscribe();
    cloudState.commentsUnsubscribers.delete(alias);
  };

  loadComments(alias)
    .then((items) => {
      if (active) callback(items);
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
    });

  getCloudContext()
    .then(({ db, collection, query, onSnapshot, orderBy, limit }) => {
      if (!active) return;

      const commentsQuery = query(
        collection(db, "anime_comments", alias, "comments"),
        orderBy("createdAt", "asc"),
        limit(CLOUD_COMMENTS_LIMIT)
      );

      unsubscribe = onSnapshot(
        commentsQuery,
        async (snapshot) => {
          const liveItems = snapshot.docs.map((item) => normalizeCommentData(item.id, item.data()));
          const legacyItems = await readLegacyComments(alias);
          const session = cloudReadSession();
          const next = mergeCommentLists(legacyItems, liveItems);

          if (session?.localId) {
            callback(next);
            return;
          }

          const localMap = await cloudReadJson(CLOUD_COMMENTS_KEY, {}, { session: null });
          localMap[alias] = mergeCommentLists(localMap[alias], next);
          await cloudWriteJson(CLOUD_COMMENTS_KEY, localMap, { session: null });
          callback(localMap[alias]);
        },
        (error) => {
          if (!isPermissionDeniedError(error)) {
            console.error(error);
          }
        }
      );
    })
    .catch((error) => {
      if (!isPermissionDeniedError(error)) {
        console.error(error);
      }
    });

  cloudState.commentsUnsubscribers.set(alias, stop);
  return stop;
}

function subscribeProgress(session, callback) {
  if (!session?.localId || typeof callback !== "function") return () => {};

  if (cloudState.progressUnsubscribe) {
    cloudState.progressUnsubscribe();
    cloudState.progressUnsubscribe = null;
  }

  cloudState.progressUnsubscribe = subscribeDoc(
    ["users", session.localId, "private", "progress"],
    { items: {} },
    (data) => {
      callback(data?.items || {});
    }
  );

  return () => {
    cloudState.progressUnsubscribe?.();
    cloudState.progressUnsubscribe = null;
  };
}

function handleServiceWorkerMessage(event) {
  const type = event.data?.type;
  if (type === "animecloud:flush-sync") {
    flushPendingSync().catch(console.error);
    return;
  }
  if (type === "animecloud:warm-schedule") {
    fetch("/api/kodik?action=discover&mode=ongoing&page=1&limit=24", { cache: "no-store" }).catch(() => {});
  }
}

function bootSyncListeners() {
  window.addEventListener("online", () => {
    flushPendingSync().catch(console.error);
  });

  window.addEventListener("animecloud:auth", (event) => {
    const user = event.detail?.user || null;
    if (!user?.localId) {
      cloudState.hydrationPromises.clear();
      cloudState.progressUnsubscribe?.();
      cloudState.progressUnsubscribe = null;
      cloudState.notificationsUnsubscribe?.();
      cloudState.notificationsUnsubscribe = null;
      return;
    }
    flushPendingSync().catch(console.error);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    navigator.serviceWorker.ready
      .then(async (registration) => {
        try {
          if (registration.sync?.register) {
            await registration.sync.register(SYNC_TAG);
          }
        } catch {}
      })
      .catch(() => {});
  }
}

bootSyncListeners();
flushPendingSync().catch(console.error);

window.animeCloudSync = {
  hydrateSessionData,
  saveFavorites,
  saveProgress,
  loadSettings,
  saveSettings,
  loadProfile,
  saveProfile,
  loadNotifications,
  markNotificationsRead,
  subscribeNotifications,
  syncNotifications,
  loadRatingSummary,
  saveRating,
  subscribeRatings,
  loadComments,
  saveComments,
  addComment,
  subscribeComments,
  subscribeProgress,
  flushPendingSync,
  readLocalJson: cloudReadJson,
  writeLocalJson: cloudWriteJson
};
