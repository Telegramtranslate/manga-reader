const fs = require("node:fs/promises");
const path = require("node:path");
const { decryptToken, uniqueStrings } = require("./_utils");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "content-stats.json");
const ANILIBRIA_BASE = "https://anilibria.top/api/v1/anime";
const KODIK_BASE = "https://kodik-api.com";
const ANILIBRIA_PAGE_LIMIT = 50;
const KODIK_PAGE_LIMIT = 100;
const KODIK_CONCURRENCY = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getTokenCandidates() {
  return uniqueStrings([process.env.KODIK_TOKEN].map(decryptToken));
}

function primaryIdentityKey(entry) {
  if (entry?.shikimoriId) return `shikimori:${entry.shikimoriId}`;
  if (entry?.kinopoiskId) return `kinopoisk:${entry.kinopoiskId}`;
  if (entry?.imdbId) return `imdb:${entry.imdbId}`;

  const titles = uniqueStrings([entry?.title, entry?.originalTitle, ...(entry?.alternateTitles || [])])
    .map(normalizeText)
    .filter(Boolean);
  const primaryTitle = titles[0] || "release";
  return `title:${primaryTitle}:${entry?.year || ""}`;
}

function mapAniLibriaRelease(item) {
  const release = item?.release || item || {};
  return {
    title: release?.name?.main || release?.name?.english || "",
    originalTitle: release?.name?.english || "",
    alternateTitles: uniqueStrings([
      ...(Array.isArray(release?.aliases) ? release.aliases : []),
      ...(Array.isArray(release?.names) ? release.names : [])
    ]),
    year: Number(release?.year || 0) || 0,
    shikimoriId: String(
      release?.shikimori_id ||
        release?.external_ids?.shikimori ||
        release?.external_ids?.shikimori_id ||
        ""
    ),
    kinopoiskId: String(
      release?.kinopoisk_id ||
        release?.external_ids?.kinopoisk ||
        release?.external_ids?.kinopoisk_id ||
        ""
    ),
    imdbId: String(release?.imdb_id || release?.external_ids?.imdb || release?.external_ids?.imdb_id || "")
  };
}

function mapKodikRelease(item) {
  return {
    title: item?.title || item?.material_data?.anime_title || item?.material_data?.title || "",
    originalTitle: item?.title_orig || item?.material_data?.title_en || "",
    alternateTitles: uniqueStrings([
      ...(String(item?.other_title || "")
        .split(/[\/|;,]+/g)
        .map((part) => part.trim())
        .filter(Boolean) || []),
      ...(Array.isArray(item?.material_data?.other_titles) ? item.material_data.other_titles : []),
      ...(Array.isArray(item?.material_data?.other_titles_en) ? item.material_data.other_titles_en : []),
      ...(Array.isArray(item?.material_data?.other_titles_jp) ? item.material_data.other_titles_jp : [])
    ]),
    year: Number(item?.year || item?.material_data?.year || 0) || 0,
    shikimoriId: String(item?.shikimori_id || ""),
    kinopoiskId: String(item?.kinopoisk_id || ""),
    imdbId: String(item?.imdb_id || "")
  };
}

async function fetchJson(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36 AnimeCloudStats/1.0",
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * attempt);
      }
    }
  }
  throw lastError;
}

async function fetchAniLibriaKeys(extraParams = {}) {
  const keys = new Set();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
      const url = new URL(`${ANILIBRIA_BASE}/catalog/releases`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(ANILIBRIA_PAGE_LIMIT));
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const payload = await fetchJson(url.toString());
    const releases = Array.isArray(payload?.data) ? payload.data : [];
    releases.forEach((item) => keys.add(primaryIdentityKey(mapAniLibriaRelease(item))));

    totalPages = Number(payload?.meta?.pagination?.total_pages || 1);
    page += 1;
  }

  return keys;
}

async function postKodik(payload) {
  const tokens = getTokenCandidates();
  if (!tokens.length) {
    throw new Error("KODIK_TOKEN environment variable is required to generate merged content stats");
  }
  let lastError = null;

  for (const token of tokens) {
    const body = new URLSearchParams();
    body.set("token", token);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        body.set(key, String(value));
      }
    });

    try {
      const response = await fetch(`${KODIK_BASE}/list`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json, text/plain, */*",
          "user-agent": "AnimeCloud Stats Generator/1.0"
        },
        body: body.toString(),
        redirect: "follow",
        cache: "no-store"
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Kodik HTTP ${response.status}`);
      }
      const data = JSON.parse(text);
      if (data?.error) {
        throw new Error(String(data.error));
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Kodik request failed");
}

function payloadFromNextPage(nextPageUrl) {
  const url = new URL(nextPageUrl, KODIK_BASE);
  const payload = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "token") payload[key] = value;
  });
  return payload;
}

function pagePayload(basePayload, page) {
  return {
    ...basePayload,
    page: Math.max(1, Number(page || 1))
  };
}

function pageNumberFromPayload(payload) {
  return Math.max(0, Number(payload?.page || 0));
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      await worker(next);
    }
  });

  await Promise.all(workers);
}

async function detectDirectKodikPagingSupport(basePayload) {
  const firstPage = await postKodik(pagePayload(basePayload, 1));
  if (!firstPage?.next_page) {
    return { supported: true, firstPage };
  }

  try {
    const viaNext = await postKodik(payloadFromNextPage(firstPage.next_page));
    const directSecond = await postKodik(pagePayload(basePayload, 2));
    const viaNextKey = String(viaNext?.results?.[0]?.id || viaNext?.results?.[0]?.link || "");
    const directKey = String(directSecond?.results?.[0]?.id || directSecond?.results?.[0]?.link || "");

    return {
      supported: Boolean(viaNextKey && directKey && viaNextKey === directKey),
      firstPage
    };
  } catch {
    return { supported: false, firstPage };
  }
}

async function fetchKodikKeys(extraPayload = {}) {
  const keys = new Set();
  const basePayload = {
    limit: KODIK_PAGE_LIMIT,
    types: "anime,anime-serial",
    not_blocked_for_me: "true",
    ...extraPayload
  };

  const { supported, firstPage } = await detectDirectKodikPagingSupport(basePayload);
  const firstResults = Array.isArray(firstPage?.results) ? firstPage.results : [];
  firstResults.forEach((item) => keys.add(primaryIdentityKey(mapKodikRelease(item))));

  const totalPages = Math.max(1, Math.ceil(Number(firstPage?.total || firstResults.length || 0) / KODIK_PAGE_LIMIT));

  if (supported && totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
    await runWithConcurrency(pages, KODIK_CONCURRENCY, async (page) => {
      const response = await postKodik(pagePayload(basePayload, page));
      const results = Array.isArray(response?.results) ? response.results : [];
      results.forEach((item) => keys.add(primaryIdentityKey(mapKodikRelease(item))));
    });
    return keys;
  }

  let payload = firstPage?.next_page ? payloadFromNextPage(firstPage.next_page) : null;
  while (payload) {
    const response = await postKodik(payload);
    const results = Array.isArray(response?.results) ? response.results : [];
    results.forEach((item) => keys.add(primaryIdentityKey(mapKodikRelease(item))));

    if (!response?.next_page) break;
    payload = payloadFromNextPage(response.next_page);
  }

  return keys;
}

async function main() {
  console.log("Collecting AniLibria catalog keys...");
  const [aniCatalogKeys, aniOngoingKeys] = await Promise.all([
    fetchAniLibriaKeys({ "f[sorting]": "FRESH_AT_DESC" }),
    fetchAniLibriaKeys({ "f[publish_statuses]": "IS_ONGOING" })
  ]);

  console.log("Collecting Kodik catalog keys...");
  const [kodikCatalogKeys, kodikOngoingKeys] = await Promise.all([
    fetchKodikKeys(),
    fetchKodikKeys({ anime_status: "ongoing" })
  ]);

  const mergedCatalogKeys = new Set([...aniCatalogKeys, ...kodikCatalogKeys]);
  const mergedOngoingKeys = new Set([...aniOngoingKeys, ...kodikOngoingKeys]);

  const stats = {
    generatedAt: new Date().toISOString(),
    latestTotal: mergedCatalogKeys.size,
    catalogTotal: mergedCatalogKeys.size,
    ongoingTotal: mergedOngoingKeys.size,
    topTotal: mergedCatalogKeys.size,
    sources: {
      anilibriaCatalog: aniCatalogKeys.size,
      anilibriaOngoing: aniOngoingKeys.size,
      kodikCatalog: kodikCatalogKeys.size,
      kodikOngoing: kodikOngoingKeys.size
    }
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  console.log(`Saved stats to ${OUTPUT_PATH}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
