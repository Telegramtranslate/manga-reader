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
const CLOUD_FAVORITES_LIMIT = 120;
const CLOUD_COMMENTS_LIMIT = 200;

const cloudState = {
  contextPromise: null
};

function cloudReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cloudWriteJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cloudReadSession() {
  return cloudReadJson(CLOUD_AUTH_STORAGE_KEY, null);
}

function cloudFavoriteKey(session) {
  return `${CLOUD_FAVORITES_PREFIX}_${session?.localId || "guest"}`;
}

function cloudGuestFavoriteKey() {
  return `${CLOUD_FAVORITES_PREFIX}_guest`;
}

function mergeFavorites(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((item) => {
    if (!item?.alias || seen.has(item.alias)) return;
    seen.add(item.alias);
    merged.push(item);
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

function isSameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function getCloudContext() {
  if (cloudState.contextPromise) return cloudState.contextPromise;

  cloudState.contextPromise = (async () => {
    const [{ initializeApp, getApp, getApps }, { getFirestore, doc, getDoc, setDoc, serverTimestamp }] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${CLOUD_FIREBASE_SDK_VERSION}/firebase-firestore-lite.js`)
    ]);

    const app = getApps().length ? getApp() : initializeApp(CLOUD_FIREBASE_CONFIG);
    const db = getFirestore(app);

    return { db, doc, getDoc, setDoc, serverTimestamp };
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

async function hydrateSessionData(session = cloudReadSession()) {
  if (!session?.localId) {
    return { favorites: null, progress: null };
  }

  const uid = session.localId;
  const localFavorites = cloudReadJson(cloudFavoriteKey(session), []);
  const guestFavorites = cloudReadJson(cloudGuestFavoriteKey(), []);
  const localProgress = cloudReadJson(CLOUD_PROGRESS_KEY, {});

  const [cloudFavoritesDoc, cloudProgressDoc] = await Promise.all([
    readCloudDoc(["users", uid, "private", "favorites"], { items: [] }),
    readCloudDoc(["users", uid, "private", "progress"], { items: {} })
  ]);

  const mergedFavorites = mergeFavorites(cloudFavoritesDoc?.items || [], localFavorites, guestFavorites);
  const mergedProgress = mergeProgressMaps(cloudProgressDoc?.items || {}, localProgress);

  cloudWriteJson(cloudFavoriteKey(session), mergedFavorites);
  cloudWriteJson(CLOUD_PROGRESS_KEY, mergedProgress);

  if (!isSameJson(cloudFavoritesDoc?.items || [], mergedFavorites)) {
    await writeCloudDoc(["users", uid, "private", "favorites"], {
      uid,
      email: session.email || "",
      items: mergedFavorites
    });
  }

  if (!isSameJson(cloudProgressDoc?.items || {}, mergedProgress)) {
    await writeCloudDoc(["users", uid, "private", "progress"], {
      uid,
      email: session.email || "",
      items: mergedProgress
    });
  }

  return { favorites: mergedFavorites, progress: mergedProgress };
}

async function saveFavorites(session = cloudReadSession(), items = []) {
  if (!session?.localId) return false;
  const next = mergeFavorites(items);
  cloudWriteJson(cloudFavoriteKey(session), next);
  await writeCloudDoc(["users", session.localId, "private", "favorites"], {
    uid: session.localId,
    email: session.email || "",
    items: next
  });
  return true;
}

async function saveProgress(session = cloudReadSession(), map = {}) {
  if (!session?.localId) return false;
  cloudWriteJson(CLOUD_PROGRESS_KEY, map);
  await writeCloudDoc(["users", session.localId, "private", "progress"], {
    uid: session.localId,
    email: session.email || "",
    items: map
  });
  return true;
}

async function loadComments(alias) {
  if (!alias) return [];
  const docData = await readCloudDoc(["anime_comments", alias], { items: [] });
  return Array.isArray(docData?.items) ? docData.items : [];
}

async function saveComments(alias, comments = []) {
  if (!alias) return [];
  const next = Array.isArray(comments) ? comments.slice(-CLOUD_COMMENTS_LIMIT) : [];
  const localMap = cloudReadJson(CLOUD_COMMENTS_KEY, {});
  localMap[alias] = next;
  cloudWriteJson(CLOUD_COMMENTS_KEY, localMap);
  await writeCloudDoc(["anime_comments", alias], {
    alias,
    items: next
  });
  return next;
}

window.animeCloudSync = {
  hydrateSessionData,
  saveFavorites,
  saveProgress,
  loadComments,
  saveComments
};
