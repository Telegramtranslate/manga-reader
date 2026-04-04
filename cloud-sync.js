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
const CLOUD_FAVORITES_LIMIT = 200;
const CLOUD_COMMENTS_LIMIT = 200;
const CLOUD_DB_NAME = "animecloud-db";
const CLOUD_DB_VERSION = 1;
const CLOUD_KV_STORE = "kv";
const CLOUD_PENDING_STORE = "pending";
const SYNC_TAG = "animecloud-sync";
const APP_CHECK_KEY =
  document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
  window.ANIMECLOUD_APP_CHECK_KEY ||
  "";

const cloudState = {
  contextPromise: null,
  dbPromise: null,
  progressUnsubscribe: null,
  commentsUnsubscribers: new Map(),
  syncRegistrationPromise: null
};

function cloudReadJsonSync(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cloudWriteJsonSync(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function cloudReadSession() {
  return cloudReadJsonSync(CLOUD_AUTH_STORAGE_KEY, null);
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
      const id = item.id || `${item.author || ""}:${item.createdAt || 0}:${item.body || ""}`;
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

async function cloudReadJson(key, fallback) {
  try {
    const raw = await withStore(CLOUD_KV_STORE, "readonly", (store) => requestToPromise(store.get(key)));
    if (raw === undefined) return fallback;
    return raw ?? fallback;
  } catch {
    return cloudReadJsonSync(key, fallback);
  }
}

async function cloudWriteJson(key, value) {
  cloudWriteJsonSync(key, value);
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
      onSnapshot
    } = firestoreModule;

    const app = getApps().length ? getApp() : initializeApp(CLOUD_FIREBASE_CONFIG);

    if (APP_CHECK_KEY) {
      try {
        const { initializeAppCheck, ReCaptchaV3Provider } = await import(
          `https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-app-check.js`
        );
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(APP_CHECK_KEY),
          isTokenAutoRefreshEnabled: true
        });
      } catch (error) {
        console.warn("AnimeCloud App Check skipped", error);
      }
    }

    return {
      db: getFirestore(app),
      doc,
      getDoc,
      setDoc,
      serverTimestamp,
      onSnapshot
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

async function writeCloudDocQueued(pathParts, data) {
  try {
    await writeCloudDoc(pathParts, data);
    return true;
  } catch (error) {
    await enqueuePendingOperation({
      type: "setDoc",
      pathParts,
      data
    });
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
      favorites: (await cloudReadJson(cloudGuestFavoriteKey(), [])) || [],
      progress: (await cloudReadJson(CLOUD_PROGRESS_KEY, {})) || {}
    };
  }

  const uid = session.localId;
  const localFavorites = await cloudReadJson(cloudFavoriteKey(session), []);
  const guestFavorites = await cloudReadJson(cloudGuestFavoriteKey(), []);
  const localProgress = await cloudReadJson(CLOUD_PROGRESS_KEY, {});

  const [cloudFavoritesDoc, cloudProgressDoc] = await Promise.all([
    readCloudDoc(["users", uid, "private", "favorites"], { items: [] }),
    readCloudDoc(["users", uid, "private", "progress"], { items: {} })
  ]);

  const mergedFavorites = mergeFavorites(cloudFavoritesDoc?.items || [], localFavorites, guestFavorites);
  const mergedProgress = mergeProgressMaps(cloudProgressDoc?.items || {}, localProgress);

  await Promise.all([
    cloudWriteJson(cloudFavoriteKey(session), mergedFavorites),
    cloudWriteJson(CLOUD_LISTS_KEY, mergedFavorites),
    cloudWriteJson(CLOUD_PROGRESS_KEY, mergedProgress)
  ]);

  if (!isSameJson(cloudFavoritesDoc?.items || [], mergedFavorites)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "favorites"], {
        uid,
        email: session.email || "",
        items: mergedFavorites
      });
    } catch {}
  }

  if (!isSameJson(cloudProgressDoc?.items || {}, mergedProgress)) {
    try {
      await writeCloudDocQueued(["users", uid, "private", "progress"], {
        uid,
        email: session.email || "",
        items: mergedProgress
      });
    } catch {}
  }

  return { favorites: mergedFavorites, progress: mergedProgress };
}

async function saveFavorites(session = cloudReadSession(), items = []) {
  const next = mergeFavorites(items);
  await cloudWriteJson(cloudFavoriteKey(session), next);
  await cloudWriteJson(CLOUD_LISTS_KEY, next);

  if (!session?.localId) return false;

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "favorites"], {
      uid: session.localId,
      email: session.email || "",
      items: next
    });
  } catch {}

  return true;
}

async function saveProgress(session = cloudReadSession(), map = {}) {
  await cloudWriteJson(CLOUD_PROGRESS_KEY, map);

  if (!session?.localId) return false;

  try {
    await writeCloudDocQueued(["users", session.localId, "private", "progress"], {
      uid: session.localId,
      email: session.email || "",
      items: map
    });
  } catch {}

  return true;
}

async function loadComments(alias) {
  if (!alias) return [];

  const localMap = await cloudReadJson(CLOUD_COMMENTS_KEY, {});
  const localItems = Array.isArray(localMap?.[alias]) ? localMap[alias] : [];

  try {
    const docData = await readCloudDoc(["anime_comments", alias], { items: [] });
    const next = mergeCommentLists(localItems, Array.isArray(docData?.items) ? docData.items : []);
    const mergedMap = { ...(localMap || {}), [alias]: next };
    await cloudWriteJson(CLOUD_COMMENTS_KEY, mergedMap);
    return next;
  } catch {
    return localItems;
  }
}

async function saveComments(alias, comments = []) {
  if (!alias) return [];
  const next = Array.isArray(comments) ? comments.slice(-CLOUD_COMMENTS_LIMIT) : [];
  const localMap = await cloudReadJson(CLOUD_COMMENTS_KEY, {});
  localMap[alias] = next;
  await cloudWriteJson(CLOUD_COMMENTS_KEY, localMap);

  try {
    await writeCloudDocQueued(["anime_comments", alias], {
      alias,
      items: next
    });
  } catch {}

  return next;
}

function subscribeComments(alias, callback) {
  if (!alias || typeof callback !== "function") return () => {};
  const current = cloudState.commentsUnsubscribers.get(alias);
  if (current) current();

  const unsubscribe = subscribeDoc(["anime_comments", alias], { items: [] }, async (data) => {
    const list = Array.isArray(data?.items) ? data.items : [];
    const localMap = await cloudReadJson(CLOUD_COMMENTS_KEY, {});
    localMap[alias] = mergeCommentLists(localMap[alias], list);
    await cloudWriteJson(CLOUD_COMMENTS_KEY, localMap);
    callback(localMap[alias]);
  });

  cloudState.commentsUnsubscribers.set(alias, unsubscribe);
  return () => {
    unsubscribe();
    cloudState.commentsUnsubscribers.delete(alias);
  };
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
    async (data) => {
      const next = mergeProgressMaps(await cloudReadJson(CLOUD_PROGRESS_KEY, {}), data?.items || {});
      await cloudWriteJson(CLOUD_PROGRESS_KEY, next);
      callback(next);
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
  loadComments,
  saveComments,
  subscribeComments,
  subscribeProgress,
  flushPendingSync,
  readLocalJson: cloudReadJson,
  writeLocalJson: cloudWriteJson
};
