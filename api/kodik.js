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

async function fetchDiscoverPage(mode, page, limit, sort, genres = []) {
  const safePage = Math.max(1, toNumber(page, 1));
  const safeLimit = Math.max(12, Math.min(100, toNumber(limit, 24)));

  let response = await postKodik("list", buildDiscoverPayload(mode, safeLimit, 1, sort, genres));

  for (let currentPage = 2; currentPage <= safePage; currentPage += 1) {
    if (!response?.next_page) {
      return {
        items: [],
        pagination: {
          current_page: safePage,
          total_pages: Math.max(1, Math.ceil(toNumber(response?.total, 0) / safeLimit)),
          total: toNumber(response?.total, 0)
        }
      };
    }

    response = await postKodik("list", payloadFromPageUrl(response.next_page));
  }

  const items = collectPreviewReleases(response?.results || []);
  return {
    items,
    pagination: {
      current_page: safePage,
      total_pages: Math.max(1, Math.ceil(toNumber(response?.total, items.length) / safeLimit)),
      total: toNumber(response?.total, items.length)
    }
  };
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
      const genres = String(readValue(req.query?.genres) || "")
        .split("||")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = await fetchDiscoverPage(mode, page, limit, sort, genres);
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
