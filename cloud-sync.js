const CLOUD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
  authDomain: "oauth-489621.firebaseapp.com",
  projectId: "oauth-489621",
  storageBucket: "oauth-489621.firebasestorage.app",
  messagingSenderId: "263581962151",
  appId: "1:263581962151:web:41538be2d5bae44d037082"
};

const CLOUD_FIREBASE_SDK_VERSION = "10.12.5";
const CLOUD_AUTH_STORAGE_KEY = "animecloud_auth_v1";
const CLOUD_FAVORITES_PREFIX = "animecloud_favorites";
const CLOUD_PROGRESS_KEY = "animecloud_watch_progress_v1";
const CLOUD_COMMENTS_KEY = "animecloud_comments_v1";
const CLOUD_LISTS_KEY = "animecloud_lists_v1";
const CLOUD_SETTINGS_KEY = "animecloud_settings_v1";
const CLOUD_FAVORITES_LIMIT = 200;
const CLOUD_COMMENTS_LIMIT = 200;
const CLOUD_DB_NAME = "animecloud-db";
const CLOUD_DB_VERSION = 1;
const CLOUD_KV_STORE = "kv";
const CLOUD_PENDING_STORE = "pending";
const SYNC_TAG = "animecloud-sync";
const CLOUD_APP_CHECK_SITE_KEY =
  document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
  window.ANIMECLOUD_APP_CHECK_KEY ||
  "";
const CLOUD_APP_CHECK_ENABLED =
  document.querySelector('meta[name="firebase-app-check-enabled"]')?.content === "true" ||
  window.ANIMECLOUD_ENABLE_APP_CHECK === true;

const cloudState = {
  contextPromise: null,
  dbPromise: null,
  progressUnsubscribe: null,
  commentsUnsubscribers: new Map(),
  syncRegistrationPromise: null
};

async function ensureFirebaseAppCheck(app) {
  if (!CLOUD_APP_CHECK_ENABLED || !CLOUD_APP_CHECK_SITE_KEY) return null;
  if (globalThis.__animeCloudAppCheckPromise) {
    return globalThis.__animeCloudAppCheckPromise;
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
  return cloudReadJsonSync(CLOUD_AUTH_STORAGE_KEY, null, { forceLocal: true });
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

function openCloudDatabase() {
  if (cloudState.dbPromise) return cloudState.dbPromise;

  cloudState.dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CLOUD_DB_NAME, CLOUD_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
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
      serverTimestamp,
      onSnapshot,
      collection,
      query,
      getDocs,
      addDoc,
      orderBy,
      limit
    } = firestoreModule;

    const app = getApps().length ? getApp() : initializeApp(CLOUD_FIREBASE_CONFIG);

    await ensureFirebaseAppCheck(app);

    return {
      db: getFirestore(app),
      doc,
      getDoc,
      setDoc,
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
        (error) => console.error(error)
      );
    })
    .catch((error) => console.error(error));

  return () => {
    active = false;
    unsubscribe();
  };
}

async function hydrateSessionData(session = cloudReadSession()) {
  if (!session?.localId) {
    return {
      favorites: (await cloudReadJson(cloudGuestFavoriteKey(), [], { session: null })) || [],
      progress: (await cloudReadJson(CLOUD_PROGRESS_KEY, {}, { session: null })) || {},
      settings: (await cloudReadJson(CLOUD_SETTINGS_KEY, { autoplayNext: true }, { session: null })) || {
        autoplayNext: true
      }
    };
  }

  const uid = session.localId;
  const localFavorites = await cloudReadJson(cloudFavoriteKey(session), [], { forceLocal: true });
  const guestFavorites = await cloudReadJson(cloudGuestFavoriteKey(), [], { forceLocal: true, session: null });
  const localProgress = await cloudReadJson(CLOUD_PROGRESS_KEY, {}, { forceLocal: true });
  const localSettings = await cloudReadJson(CLOUD_SETTINGS_KEY, { autoplayNext: true }, { forceLocal: true });

  const [cloudFavoritesDoc, cloudProgressDoc, cloudSettingsDoc] = await Promise.all([
    readCloudDoc(["users", uid, "private", "favorites"], { items: [] }),
    readCloudDoc(["users", uid, "private", "progress"], { items: {} }),
    readCloudDoc(["users", uid, "private", "settings"], { item: { autoplayNext: true } })
  ]);

  const mergedFavorites = mergeFavorites(cloudFavoritesDoc?.items || [], localFavorites, guestFavorites);
  const mergedProgress = mergeProgressMaps(cloudProgressDoc?.items || {}, localProgress);
  const mergedSettings = {
    autoplayNext: true,
    ...(localSettings || {}),
    ...(cloudSettingsDoc?.item || {})
  };

  await clearAccountLocalCaches(session);

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

  if (!isSameJson(cloudSettingsDoc?.item || { autoplayNext: true }, mergedSettings)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "settings"], {
        uid,
        email: session.email || "",
        item: mergedSettings
      }, { queueOnFailure: false });
    } catch {}
  }

  return { favorites: mergedFavorites, progress: mergedProgress, settings: mergedSettings };
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
    return (await cloudReadJson(CLOUD_SETTINGS_KEY, { autoplayNext: true }, { session: null })) || {
      autoplayNext: true
    };
  }

  try {
    const docData = await readCloudDoc(["users", session.localId, "private", "settings"], {
      item: { autoplayNext: true }
    });
    return {
      autoplayNext: true,
      ...(docData?.item || {})
    };
  } catch {
    return { autoplayNext: true };
  }
}

async function saveSettings(session = cloudReadSession(), settings = {}) {
  const next = {
    autoplayNext: true,
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

  const author = String(comment?.author || session.displayName || session.email?.split("@")[0] || "Пользователь").trim();
  const { db, collection, addDoc, serverTimestamp } = await getCloudContext();

  await addDoc(collection(db, "anime_comments", alias, "comments"), {
    alias,
    author,
    clientId: String(comment?.id || "").trim(),
    uid: session.localId,
    body,
    createdAt: serverTimestamp()
  });

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
    .catch((error) => console.error(error));

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
        (error) => console.error(error)
      );
    })
    .catch((error) => console.error(error));

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
    fetch("/api/anilibria/anime/schedule/week", { cache: "no-store" }).catch(() => {});
  }
}

function bootSyncListeners() {
  window.addEventListener("online", () => {
    flushPendingSync().catch(console.error);
  });

  window.addEventListener("animecloud:auth", (event) => {
    const user = event.detail?.user || null;
    if (!user?.localId) {
      cloudState.progressUnsubscribe?.();
      cloudState.progressUnsubscribe = null;
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
  loadComments,
  saveComments,
  addComment,
  subscribeComments,
  subscribeProgress,
  flushPendingSync,
  readLocalJson: cloudReadJson,
  writeLocalJson: cloudWriteJson
};
