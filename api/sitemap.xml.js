const SITE_URL = "https://color-manga-cloud.vercel.app";
const API_URL = "https://anilibria.top/api/v1/anime/catalog/releases";
const PAGE_LIMIT = 50;
const MAX_RELEASES = 5000;

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteUrl(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://anilibria.top${value}`;
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
      total_pages: fallbackPage,
      total: extractItems(payload).length
    }
  );
}

function buildReleaseUrl(item) {
  const source = item?.release || item || {};
  const alias = String(source?.alias || "").trim();
  if (!alias) return null;

  const poster =
    absoluteUrl(
      source?.poster?.optimized?.src ||
        source?.poster?.src ||
        source?.poster?.optimized?.preview ||
        source?.poster?.preview
    ) || "";

  const updatedAt =
    source?.fresh_at ||
    source?.updated_at ||
    item?.updated_at ||
    item?.fresh_at ||
    null;

  return {
    loc: `${SITE_URL}/anime/${encodeURIComponent(alias)}`,
    lastmod: updatedAt ? new Date(updatedAt).toISOString() : null,
    image: poster
  };
}

async function fetchCatalogPage(page) {
  const url = new URL(API_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "AnimeCloudBot/1.0 (+https://color-manga-cloud.vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`AniLibria sitemap request failed: ${response.status}`);
  }

  return response.json();
}

module.exports = async (req, res) => {
  try {
    const urls = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && urls.length < MAX_RELEASES) {
      const payload = await fetchCatalogPage(page);
      const items = extractItems(payload);
      const pagination = extractPagination(payload, page);
      totalPages = Math.max(1, Number(pagination?.total_pages || totalPages || 1));

      items.forEach((item) => {
        const url = buildReleaseUrl(item);
        if (url) {
          urls.push(url);
        }
      });

      if (!items.length) break;
      page += 1;
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map((entry) => {
    const imageBlock = entry.image
      ? `
    <image:image>
      <image:loc>${xmlEscape(entry.image)}</image:loc>
    </image:image>`
      : "";
    const lastmod = entry.lastmod ? `
    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : "";
    return `  <url>
    <loc>${xmlEscape(entry.loc)}</loc>${lastmod}
    <changefreq>daily</changefreq>
    <priority>0.7</priority>${imageBlock}
  </url>`;
  })
  .join("\n")}
</urlset>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.end(body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Sitemap generation failed: ${error?.message || error}`);
  }
};
