const fs = require("node:fs/promises");
const path = require("node:path");
const { absoluteKodikUrl, buildAlias, buildIdentity, payloadFromPageUrl, postKodik } = require("../api/_kodik");

const SITE_URL = String(process.env.SITE_URL || "https://color-manga-cloud.vercel.app").replace(/\/+$/, "");
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
    image: poster || ""
  };
}

async function collectKodikEntries() {
  const entries = new Map();
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
      const entry = buildKodikEntry(item);
      if (entry?.key && entry?.loc && !entries.has(entry.key)) {
        entries.set(entry.key, entry);
      }
    });

    payload = response?.next_page ? payloadFromPageUrl(response.next_page) : null;
  }

  return [...entries.values()].sort((left, right) => String(left.loc || "").localeCompare(String(right.loc || ""), "en"));
}

async function main() {
  const entries = await collectKodikEntries();

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
  console.log(`Generated ${entries.length} Kodik anime URLs -> ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
