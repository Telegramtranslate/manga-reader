const fs = require("fs/promises");
const path = require("path");
const { absoluteKodikUrl, buildAlias, buildIdentity, payloadFromPageUrl, postKodik } = require("../api/_kodik");

const SITE_URL = String(process.env.SITE_URL || "https://color-manga-cloud.vercel.app").replace(/\/+$/, "");
const ANILIBRIA_API_URL = "https://anilibria.top/api/v1/anime/catalog/releases";
const ANILIBRIA_PAGE_LIMIT = 50;
const KODIK_PAGE_LIMIT = 100;
const OUTPUT_PATH = path.join(__dirname, "..", "sitemap-anime.xml");

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteAniUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://anilibria.top${value}`;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(cleaned);
  });

  return result;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0451/g, "\u0435")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractPagination(payload, fallbackPage = 1) {
  return (
    payload?.meta?.pagination ||
    payload?.pagination || {
      current_page: fallbackPage,
      total_pages: fallbackPage
    }
  );
}

function buildAniIdentity(item) {
  const release = item?.release || item || {};
  const shikimoriId = String(release?.shikimori_id || release?.external_ids?.shikimori || release?.external_ids?.shikimori_id || "").trim();
  const kinopoiskId = String(release?.kinopoisk_id || release?.external_ids?.kinopoisk || release?.external_ids?.kinopoisk_id || "").trim();
  const imdbId = String(release?.imdb_id || release?.external_ids?.imdb || release?.external_ids?.imdb_id || "").trim();

  if (shikimoriId) return `shikimori:${shikimoriId}`;
  if (kinopoiskId) return `kinopoisk:${kinopoiskId}`;
  if (imdbId) return `imdb:${imdbId}`;

  const title = uniqueStrings([
    release?.name?.main,
    release?.name?.english,
    ...(Array.isArray(release?.aliases) ? release.aliases : []),
    ...(Array.isArray(release?.names) ? release.names : [])
  ])
    .map(normalizeText)
    .find(Boolean);

  return `title:${title || release?.alias || "release"}:${release?.year || ""}`;
}

async function fetchAniCatalogPage(page) {
  const url = new URL(ANILIBRIA_API_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(ANILIBRIA_PAGE_LIMIT));

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": `AnimeCloudSitemap/1.0 (+${SITE_URL})`
    }
  });

  if (!response.ok) {
    throw new Error(`AniLibria sitemap request failed: ${response.status}`);
  }

  return response.json();
}

function buildAniEntry(item) {
  const release = item?.release || item || {};
  const alias = String(release?.alias || "").trim();
  if (!alias) return null;

  const updatedAt = release?.fresh_at || release?.updated_at || item?.updated_at || item?.fresh_at || null;
  const poster = absoluteAniUrl(
    release?.poster?.optimized?.src ||
      release?.poster?.src ||
      release?.poster?.optimized?.preview ||
      release?.poster?.preview
  );

  return {
    key: buildAniIdentity(item),
    loc: `${SITE_URL}/anime/${encodeURIComponent(alias)}`,
    lastmod: updatedAt ? new Date(updatedAt).toISOString() : null,
    image: poster || "",
    source: "anilibria"
  };
}

function buildKodikEntry(item) {
  const identity = buildIdentity(item);
  if (!identity) return null;

  const updatedAt =
    item?.updated_at ||
    item?.created_at ||
    item?.material_data?.released_at ||
    item?.material_data?.premiere_world ||
    null;

  const poster = absoluteKodikUrl(
    item?.material_data?.poster_url ||
      item?.screenshots?.[0] ||
      item?.material_data?.screenshots?.[0] ||
      item?.material_data?.anime_poster_url
  );

  return {
    key: identity,
    loc: `${SITE_URL}/anime/${encodeURIComponent(buildAlias(identity))}`,
    lastmod: updatedAt ? new Date(updatedAt).toISOString() : null,
    image: poster || "",
    source: "kodik"
  };
}

function mergeEntry(entryMap, entry) {
  if (!entry?.key || !entry?.loc) return;

  const existing = entryMap.get(entry.key);
  if (!existing) {
    entryMap.set(entry.key, entry);
    return;
  }

  const existingTime = existing.lastmod ? Date.parse(existing.lastmod) || 0 : 0;
  const nextTime = entry.lastmod ? Date.parse(entry.lastmod) || 0 : 0;
  const preferNewLoc = existing.source !== "anilibria" && entry.source === "anilibria";

  entryMap.set(entry.key, {
    key: entry.key,
    loc: preferNewLoc ? entry.loc : existing.loc,
    lastmod: nextTime > existingTime ? entry.lastmod : existing.lastmod,
    image: existing.image || entry.image,
    source: preferNewLoc ? entry.source : existing.source
  });
}

async function collectAniEntries(entryMap) {
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await fetchAniCatalogPage(page);
    const items = extractItems(payload);
    const pagination = extractPagination(payload, page);
    totalPages = Math.max(1, Number(pagination?.total_pages || totalPages || 1));

    items.forEach((item) => {
      mergeEntry(entryMap, buildAniEntry(item));
    });

    if (!items.length) break;
    page += 1;
  }
}

async function collectKodikEntries(entryMap) {
  let payload = {
    limit: KODIK_PAGE_LIMIT,
    types: "anime,anime-serial",
    with_material_data: "true",
    not_blocked_for_me: "true"
  };

  while (payload) {
    const response = await postKodik("list", payload);
    const results = Array.isArray(response?.results) ? response.results : [];

    results.forEach((item) => {
      const type = String(item?.type || "").toLowerCase();
      if (type !== "anime" && type !== "anime-serial") return;
      mergeEntry(entryMap, buildKodikEntry(item));
    });

    payload = response?.next_page ? payloadFromPageUrl(response.next_page) : null;
  }
}

async function main() {
  const entryMap = new Map();

  await Promise.all([collectAniEntries(entryMap), collectKodikEntries(entryMap)]);
  const entries = [...entryMap.values()].sort((left, right) => String(left.loc || "").localeCompare(String(right.loc || ""), "en"));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries
  .map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : "";
    const image = entry.image
      ? `\n    <image:image>\n      <image:loc>${xmlEscape(entry.image)}</image:loc>\n    </image:image>`
      : "";
    return `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>${lastmod}\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>${image}\n  </url>`;
  })
  .join("\n")}
</urlset>
`;

  await fs.writeFile(OUTPUT_PATH, xml, "utf8");
  console.log(`Generated ${entries.length} anime URLs -> ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
