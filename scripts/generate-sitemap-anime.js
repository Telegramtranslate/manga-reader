const fs = require("fs/promises");
const path = require("path");

const SITE_URL = String(process.env.SITE_URL || "https://color-manga-cloud.vercel.app").replace(/\/+$/, "");
const API_URL = "https://anilibria.top/api/v1/anime/catalog/releases";
const PAGE_LIMIT = 50;
const OUTPUT_PATH = path.join(__dirname, "..", "sitemap-anime.xml");

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteUrl(input) {
  const value = String(input || "").trim();
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
      total_pages: fallbackPage
    }
  );
}

async function fetchCatalogPage(page) {
  const url = new URL(API_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));

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

function buildEntry(item) {
  const release = item?.release || item || {};
  const alias = String(release?.alias || "").trim();
  if (!alias) return null;

  const updatedAt =
    release?.fresh_at ||
    release?.updated_at ||
    item?.updated_at ||
    item?.fresh_at ||
    null;

  const poster = absoluteUrl(
    release?.poster?.optimized?.src ||
      release?.poster?.src ||
      release?.poster?.optimized?.preview ||
      release?.poster?.preview
  );

  return {
    loc: `${SITE_URL}/anime/${encodeURIComponent(alias)}`,
    lastmod: updatedAt ? new Date(updatedAt).toISOString() : null,
    image: poster || ""
  };
}

async function main() {
  const entries = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await fetchCatalogPage(page);
    const items = extractItems(payload);
    const pagination = extractPagination(payload, page);
    totalPages = Math.max(1, Number(pagination?.total_pages || totalPages || 1));

    items.forEach((item) => {
      const entry = buildEntry(item);
      if (entry) entries.push(entry);
    });

    if (!items.length) break;
    page += 1;
  }

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
