const {
  readValue,
  toNumber,
  normalizeText,
  uniqueStrings,
  postKodik,
  collectPreviewReleases,
  buildDiscoverPayload,
  findBestPreviewMatch,
  payloadFromPageUrl
} = require("./_kodik");

const DISCOVER_CACHE_TTL_MS = 5 * 60 * 1000;
const discoverResultCache = new Map();
const discoverCursorCache = new Map();
const discoverUniquePoolCache = new Map();

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120, stale-while-revalidate=600");
  res.end(JSON.stringify(payload));
}

function emptyListPayload() {
  return {
    items: [],
    pagination: {
      current_page: 1,
      total_pages: 1,
      total: 0
    }
  };
}

function dedupeRawResults(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [
      item?.id || "",
      item?.translation?.id || "",
      item?.link || "",
      item?.last_episode || "",
      item?.title || ""
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeCacheValue(value) {
  return JSON.stringify(value);
}

function cleanExpiredEntries(store) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      store.delete(key);
    }
  }
}

function buildDiscoverSignature(mode, limit, sort, order, genres = [], animeKinds = [], mediaTypes = []) {
  return [
    mode,
    limit,
    sort || "",
    order || "",
    escapeCacheValue(uniqueStrings(genres).slice().sort()),
    escapeCacheValue(uniqueStrings(animeKinds).slice().sort()),
    escapeCacheValue(uniqueStrings(mediaTypes).slice().sort())
  ].join("|");
}

function buildDiscoverResultCacheKey(signature, page) {
  return `${signature}|page:${page}`;
}

function getCachedDiscoverResult(signature, page) {
  cleanExpiredEntries(discoverResultCache);
  const cached = discoverResultCache.get(buildDiscoverResultCacheKey(signature, page));
  return cached ? cached.payload : null;
}

function setCachedDiscoverResult(signature, page, payload) {
  discoverResultCache.set(buildDiscoverResultCacheKey(signature, page), {
    expiresAt: Date.now() + DISCOVER_CACHE_TTL_MS,
    payload
  });
}

function getCursorEntry(signature) {
  cleanExpiredEntries(discoverCursorCache);
  const existing = discoverCursorCache.get(signature);
  if (existing) return existing;

  const created = {
    expiresAt: Date.now() + DISCOVER_CACHE_TTL_MS,
    pages: new Map()
  };
  discoverCursorCache.set(signature, created);
  return created;
}

function setCursorPayload(signature, page, payload) {
  const entry = getCursorEntry(signature);
  entry.expiresAt = Date.now() + DISCOVER_CACHE_TTL_MS;
  entry.pages.set(page, payload);
}

function getBestCursorPayload(signature, requestedPage) {
  const entry = getCursorEntry(signature);
  let bestPage = 0;
  let bestPayload = null;

  for (const [page, payload] of entry.pages.entries()) {
    if (page <= requestedPage && page > bestPage) {
      bestPage = page;
      bestPayload = payload;
    }
  }

  return { page: bestPage, payload: bestPayload };
}

function getUniquePoolEntry(signature) {
  cleanExpiredEntries(discoverUniquePoolCache);
  const existing = discoverUniquePoolCache.get(signature);
  if (existing) return existing;

  const created = {
    expiresAt: Date.now() + DISCOVER_CACHE_TTL_MS,
    items: [],
    seenAliases: new Set(),
    totalRaw: 0,
    initialized: false,
    exhausted: false,
    nextPayload: null,
    inflight: null
  };
  discoverUniquePoolCache.set(signature, created);
  return created;
}

function appendUniquePreviewItems(entry, items = []) {
  const list = Array.isArray(items) ? items : [];
  list.forEach((item) => {
    const alias = String(item?.alias || "").trim();
    if (!alias || entry.seenAliases.has(alias)) return;
    entry.seenAliases.add(alias);
    entry.items.push(item);
  });
}

function ingestDiscoverResponse(entry, response, fallbackLimit) {
  entry.expiresAt = Date.now() + DISCOVER_CACHE_TTL_MS;
  const fallbackTotal = entry.items.length;
  entry.totalRaw = Math.max(entry.totalRaw || 0, toNumber(response?.total, fallbackTotal));
  appendUniquePreviewItems(entry, collectPreviewReleases(response?.results || []));
  entry.nextPayload = response?.next_page ? payloadFromPageUrl(response.next_page) : null;
  entry.exhausted = !entry.nextPayload;
  entry.initialized = true;

  if (!entry.totalRaw) {
    entry.totalRaw = Math.max(entry.items.length, toNumber(fallbackLimit, 0));
  }
}

async function ensureUniqueDiscoverPool(entry, targetCount, firstPayload, safeLimit) {
  if (entry.items.length >= targetCount || entry.exhausted) return;

  if (entry.inflight) {
    await entry.inflight;
    return ensureUniqueDiscoverPool(entry, targetCount, firstPayload, safeLimit);
  }

  entry.inflight = (async () => {
    if (!entry.initialized) {
      const firstResponse = await postKodik("list", firstPayload);
      ingestDiscoverResponse(entry, firstResponse, safeLimit);
    }

    while (entry.items.length < targetCount && !entry.exhausted) {
      const payload = entry.nextPayload;
      if (!payload) {
        entry.exhausted = true;
        break;
      }
      const response = await postKodik("list", payload);
      ingestDiscoverResponse(entry, response, safeLimit);
    }
  })().finally(() => {
    entry.inflight = null;
  });

  await entry.inflight;
}

async function fetchDiscoverPage(mode, page, limit, sort, order, genres = [], animeKinds = [], mediaTypes = []) {
  const safePage = Math.max(1, toNumber(page, 1));
  const safeLimit = Math.max(12, Math.min(100, toNumber(limit, 24)));
  const signature = buildDiscoverSignature(mode, safeLimit, sort, order, genres, animeKinds, mediaTypes);
  const cachedResult = getCachedDiscoverResult(signature, safePage);
  if (cachedResult) return cachedResult;

  const basePayload = buildDiscoverPayload(mode, safeLimit, 1, sort, order, genres, animeKinds, mediaTypes);
  setCursorPayload(signature, 1, basePayload);
  const uniquePool = getUniquePoolEntry(signature);
  const requiredItems = safePage * safeLimit + 1;
  await ensureUniqueDiscoverPool(uniquePool, requiredItems, basePayload, safeLimit);

  const sliceStart = (safePage - 1) * safeLimit;
  const sliceEnd = sliceStart + safeLimit;
  const items = uniquePool.items.slice(sliceStart, sliceEnd);
  const hasMore = uniquePool.items.length > sliceEnd || !uniquePool.exhausted;
  const total = uniquePool.exhausted ? uniquePool.items.length : Math.max(uniquePool.totalRaw || 0, uniquePool.items.length);
  const totalPages = uniquePool.exhausted
    ? Math.max(1, Math.ceil(Math.max(uniquePool.items.length, 1) / safeLimit))
    : Math.max(Math.ceil(Math.max(total, 1) / safeLimit), safePage + (hasMore ? 1 : 0));

  const result = {
    items,
    pagination: {
      current_page: safePage,
      total_pages: totalPages,
      total
    }
  };

  setCachedDiscoverResult(signature, safePage, result);
  if (uniquePool.nextPayload) setCursorPayload(signature, safePage + 1, uniquePool.nextPayload);
  return result;
}

async function fetchSearchResults(meta = {}) {
  const query = String(meta.query || meta.title || "").trim();
  const originalTitle = String(meta.originalTitle || "").trim();
  const limit = Math.max(12, Math.min(100, toNumber(meta.limit, 36)));
  const requests = [];

  if (query) {
    requests.push(
      postKodik("search", {
        title: query,
        limit,
        types: "anime,anime-serial",
        with_material_data: "true",
        strict: "false"
      })
    );
  }

  if (originalTitle && normalizeText(originalTitle) !== normalizeText(query)) {
    requests.push(
      postKodik("search", {
        title_orig: originalTitle,
        limit,
        types: "anime,anime-serial",
        with_material_data: "true",
        strict: "false"
      })
    );
  }

  const settled = await Promise.allSettled(requests);
  return dedupeRawResults(
    settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value?.results || [] : []))
  );
}

function buildIdentityRequest(identity) {
  const value = String(identity || "").trim();
  if (!value || !value.includes(":")) return null;

  const [kind, rawId] = value.split(/:(.+)/, 2);
  if (!kind || !rawId) return null;

  const fieldMap = {
    shikimori: "shikimori_id",
    kinopoisk: "kinopoisk_id",
    imdb: "imdb_id",
    kodik: "id"
  };

  const field = fieldMap[kind];
  if (!field) return null;

  return {
    [field]: rawId,
    limit: 50,
    types: "anime,anime-serial",
    with_material_data: "true",
    with_episodes_data: "true",
    not_blocked_for_me: "true"
  };
}

function readMeta(req) {
  const alternateTitles = String(readValue(req.query?.alternateTitles) || "")
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    identity: String(readValue(req.query?.identity) || "").trim(),
    title: String(readValue(req.query?.title) || "").trim(),
    originalTitle: String(readValue(req.query?.originalTitle) || "").trim(),
    year: toNumber(readValue(req.query?.year), 0),
    alternateTitles
  };
}

async function fetchRelease(meta) {
  const requests = [];
  const identityRequest = buildIdentityRequest(meta.identity);

  if (identityRequest) {
    requests.push(postKodik("search", identityRequest));
  }

  const titleVariants = uniqueStrings([meta.title, meta.originalTitle, ...(meta.alternateTitles || [])]);
  titleVariants.forEach((title, index) => {
    if (!title) return;
    const isOriginal = index > 0 && normalizeText(title) === normalizeText(meta.originalTitle);
    requests.push(
      postKodik("search", {
        [isOriginal ? "title_orig" : "title"]: title,
        limit: 50,
        types: "anime,anime-serial",
        with_material_data: "true",
        with_episodes_data: "true",
        not_blocked_for_me: "true",
        strict: "false"
      })
    );
  });

  const settled = await Promise.allSettled(requests);
  const rawItems = dedupeRawResults(
    settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value?.results || [] : []))
  );

  return findBestPreviewMatch(rawItems, meta);
}

module.exports = async (req, res) => {
  const action = String(readValue(req.query?.action) || "discover").trim();

  if (action === "discover") {
    try {
      const mode = String(readValue(req.query?.mode) || "catalog").trim();
      const page = toNumber(readValue(req.query?.page), 1);
      const limit = toNumber(readValue(req.query?.limit), 24);
      const sort = String(readValue(req.query?.sort) || "").trim();
      const order = String(readValue(req.query?.order) || "").trim();
      const genres = String(readValue(req.query?.genres) || "")
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);
      const animeKinds = String(readValue(req.query?.animeKinds) || "")
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);
      const mediaTypes = String(readValue(req.query?.mediaTypes) || "")
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = await fetchDiscoverPage(mode, page, limit, sort, order, genres, animeKinds, mediaTypes);
      sendJson(res, 200, payload);
      return;
    } catch (error) {
      sendJson(res, 200, {
        ...emptyListPayload(),
        unavailable: true,
        error: "Kodik temporarily unavailable",
        message: String(error?.message || error || "Unknown error")
      });
      return;
    }
  }

  if (action === "search") {
    try {
      const query = String(readValue(req.query?.query) || "").trim();
      if (!query) {
        sendJson(res, 200, emptyListPayload());
        return;
      }

      const limit = toNumber(readValue(req.query?.limit), 36);
      const items = collectPreviewReleases(await fetchSearchResults({ query, limit }));
      sendJson(res, 200, {
        items,
        pagination: { current_page: 1, total_pages: 1, total: items.length }
      });
      return;
    } catch (error) {
      sendJson(res, 200, {
        ...emptyListPayload(),
        unavailable: true,
        error: "Kodik temporarily unavailable",
        message: String(error?.message || error || "Unknown error")
      });
      return;
    }
  }

  if (action === "release") {
    try {
      const meta = readMeta(req);
      const release = await fetchRelease(meta);
      if (!release) {
        sendJson(res, 200, { item: null, notFound: true });
        return;
      }

      sendJson(res, 200, release);
      return;
    } catch (error) {
      sendJson(res, 200, {
        item: null,
        unavailable: true,
        error: "Kodik temporarily unavailable",
        message: String(error?.message || error || "Unknown error")
      });
      return;
    }
  }

  sendJson(res, 400, { error: "Unsupported action" });
};
