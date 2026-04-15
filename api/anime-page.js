const fs = require("node:fs/promises");
const path = require("node:path");
const { findBestPreviewMatch, postKodik } = require("./_kodik");
const { resolveSiteUrl } = require("./_site-url");

const INDEX_TEMPLATE_PATH = path.resolve(__dirname, "..", "index.html");
const DEFAULT_DESCRIPTION =
  "AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером.";
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000;
const META_CACHE_TTL_MS = 10 * 60 * 1000;
const META_CACHE_LIMIT = 250;

let templateCache = {
  value: "",
  loadedAt: 0,
  pending: null
};

const metaCache = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function truncateSeoText(text, max = 170) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function absoluteUrl(siteUrl, input) {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    return new URL(value, siteUrl).toString();
  } catch {
    return value;
  }
}

function sanitizeIndexTemplate(template) {
  return String(template || "")
    .replace(/\s*<meta name="keywords"[^>]*>\s*/i, "\n")
    .replace(/\s*<script id="structured-data-legacy"[\s\S]*?<\/script>/i, "")
    .replace(/\s*<script id="structured-data-seo-legacy"[\s\S]*?<\/script>/i, "");
}

function replaceMetaContent(html, id, value) {
  const escaped = escapeAttribute(value);
  return html.replace(new RegExp(`(<meta[^>]+id="${id}"[^>]+content=")[^"]*(")`, "i"), `$1${escaped}$2`);
}

function replaceLinkHref(html, id, value) {
  const escaped = escapeAttribute(value);
  return html.replace(new RegExp(`(<link[^>]+id="${id}"[^>]+href=")[^"]*(")`, "i"), `$1${escaped}$2`);
}

function replaceTitle(html, value) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(value)}</title>`);
}

function replaceStructuredData(html, value) {
  return html.replace(
    /<script id="structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script id="structured-data" type="application/ld+json">\n${value}\n  </script>`
  );
}

async function getIndexTemplate() {
  const now = Date.now();
  if (templateCache.value && now - templateCache.loadedAt < TEMPLATE_CACHE_TTL_MS) {
    return templateCache.value;
  }

  if (!templateCache.pending) {
    templateCache.pending = fs
      .readFile(INDEX_TEMPLATE_PATH, "utf8")
      .then((value) => {
        templateCache = {
          value,
          loadedAt: Date.now(),
          pending: null
        };
        return value;
      })
      .catch((error) => {
        templateCache.pending = null;
        throw error;
      });
  }

  return templateCache.pending;
}

function pruneMetaCache() {
  const now = Date.now();
  for (const [key, entry] of metaCache.entries()) {
    if (!entry || now - Number(entry.cachedAt || 0) > META_CACHE_TTL_MS) {
      metaCache.delete(key);
    }
  }

  while (metaCache.size > META_CACHE_LIMIT) {
    const oldestKey = metaCache.keys().next().value;
    if (!oldestKey) break;
    metaCache.delete(oldestKey);
  }
}

function getMetaCacheKey(alias, siteUrl) {
  return `${siteUrl}|${String(alias || "").trim()}`;
}

function readMetaCache(alias, siteUrl) {
  pruneMetaCache();
  const key = getMetaCacheKey(alias, siteUrl);
  const entry = metaCache.get(key);
  if (!entry) return null;
  metaCache.delete(key);
  metaCache.set(key, entry);
  return entry.value;
}

function writeMetaCache(alias, siteUrl, value) {
  const key = getMetaCacheKey(alias, siteUrl);
  metaCache.delete(key);
  metaCache.set(key, {
    value,
    cachedAt: Date.now()
  });
  pruneMetaCache();
  return value;
}

function parseKodikAlias(alias) {
  const value = String(alias || "").trim();
  if (!value.startsWith("kodik-")) return null;
  const body = value.slice(6);
  const idPrefixes = ["shikimori", "kinopoisk", "imdb", "kodik"];

  for (const prefix of idPrefixes) {
    if (body.startsWith(`${prefix}-`)) {
      return {
        identity: `${prefix}:${body.slice(prefix.length + 1)}`,
        title: "",
        year: "",
        alternateTitles: []
      };
    }
  }

  const titleSlug = body.startsWith("title-") ? body.slice(6) : body;
  if (!titleSlug) return null;

  let year = "";
  let slug = titleSlug;
  const yearMatch = slug.match(/-(19|20)\d{2}$/);
  if (yearMatch) {
    year = yearMatch[0].slice(1);
    slug = slug.slice(0, -yearMatch[0].length);
  }

  const title = slug
    .split("-")
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    identity: year ? `title:${title}:${year}` : "",
    title,
    year,
    alternateTitles: title ? [title] : []
  };
}

function readAlias(req) {
  const direct = req?.query?.alias;
  if (Array.isArray(direct)) {
    const joined = direct.map((value) => String(value || "").trim()).filter(Boolean).join("/");
    if (joined) return joined;
  }

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  try {
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const aliases = parsedUrl.searchParams
      .getAll("alias")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (aliases.length > 1) return aliases.join("/");
    if (aliases[0]) return aliases[0];
  } catch {}

  return "";
}

async function fetchKodikMeta(alias, siteUrl) {
  const cached = readMetaCache(alias, siteUrl);
  if (cached) return cached;

  const parsedAlias = parseKodikAlias(alias);
  if (!parsedAlias) return null;

  const requests = [];
  if (parsedAlias.identity) {
    const [kind, rawId] = parsedAlias.identity.split(/:(.+)/, 2);
    const fieldMap = {
      shikimori: "shikimori_id",
      kinopoisk: "kinopoisk_id",
      imdb: "imdb_id",
      kodik: "id"
    };
    const field = fieldMap[kind];
    if (field && rawId) {
      requests.push(
        postKodik("search", {
          [field]: rawId,
          limit: 50,
          types: "anime,anime-serial",
          with_material_data: "true",
          with_episodes_data: "true",
          not_blocked_for_me: "true"
        })
      );
    }
  }

  if (parsedAlias.title) {
    requests.push(
      postKodik("search", {
        title: parsedAlias.title,
        limit: 50,
        types: "anime,anime-serial",
        with_material_data: "true",
        with_episodes_data: "true",
        not_blocked_for_me: "true",
        strict: "false"
      })
    );
  }

  if (!requests.length) return null;

  const settled = await Promise.allSettled(requests);
  const items = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value?.results || [] : []));
  const release = findBestPreviewMatch(items, parsedAlias);
  if (!release) return null;

  const description = truncateSeoText(
    `${release.description || DEFAULT_DESCRIPTION} ${
      release.genres?.length ? `Жанры: ${release.genres.join(", ")}.` : ""
    } ${release.episodesTotal ? `Эпизодов: ${release.episodesTotal}.` : ""}`
  );

  return writeMetaCache(alias, siteUrl, {
    alias: release.alias || alias,
    title: release.title || "Без названия",
    description,
    image: absoluteUrl(siteUrl, release.poster || "/mc-icon-512.png"),
    year: String(release.year || ""),
    type: String(release.type || "Аниме"),
    genres: Array.isArray(release.genres) ? release.genres : [],
    episodesTotal: Number(release.episodesTotal || 0),
    hasVideo: Boolean(release.externalPlayer) || Boolean(Array.isArray(release.episodes) ? release.episodes.length : 0),
    embedUrl: absoluteUrl(siteUrl, release.externalPlayer || ""),
    canonical: `${siteUrl}/anime/${encodeURIComponent(alias)}`
  });
}

function buildAnimeStructuredData(meta, siteUrl) {
  const graph = [
    {
      "@type": "WebSite",
      name: "AnimeCloud",
      url: siteUrl,
      inLanguage: "ru",
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/search?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Каталог", item: `${siteUrl}/catalog` },
        { "@type": "ListItem", position: 3, name: meta.title, item: meta.canonical }
      ]
    },
    {
      "@type": /фильм/i.test(meta.type) ? "Movie" : "TVSeries",
      name: meta.title,
      url: meta.canonical,
      description: meta.description,
      image: meta.image,
      genre: meta.genres || [],
      inLanguage: "ru",
      numberOfEpisodes: meta.episodesTotal || undefined,
      dateCreated: /^\d{4}$/.test(String(meta.year || "")) ? String(meta.year) : undefined,
      isPartOf: {
        "@type": "WebSite",
        name: "AnimeCloud",
        url: siteUrl
      }
    }
  ];

  if (meta.hasVideo) {
    graph.push({
      "@type": "VideoObject",
      name: `${meta.title} - смотреть онлайн`,
      description: meta.description,
      thumbnailUrl: [meta.image],
      embedUrl: meta.embedUrl || undefined,
      potentialAction: {
        "@type": "WatchAction",
        target: meta.canonical
      }
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function injectAnimeMeta(template, meta, siteUrl) {
  const safeTitle = `${meta.title} - смотреть онлайн с русской озвучкой | AnimeCloud`;
  const safeDescription = meta.description || DEFAULT_DESCRIPTION;
  const safeImage = meta.image || `${siteUrl}/mc-icon-512.png`;
  const canonical = meta.canonical || `${siteUrl}/anime/${encodeURIComponent(meta.alias || "")}`;

  let html = sanitizeIndexTemplate(template);
  html = replaceTitle(html, safeTitle);
  html = replaceMetaContent(html, "meta-description", safeDescription);
  html = replaceMetaContent(html, "og-title", safeTitle);
  html = replaceMetaContent(html, "og-description", safeDescription);
  html = replaceMetaContent(html, "og-url", canonical);
  html = replaceMetaContent(html, "og-image", safeImage);
  html = replaceMetaContent(html, "twitter-title", safeTitle);
  html = replaceMetaContent(html, "twitter-description", safeDescription);
  html = replaceMetaContent(html, "twitter-image", safeImage);
  html = replaceMetaContent(html, "og-type", "video.other");
  html = replaceLinkHref(html, "canonical-link", canonical);
  html = replaceStructuredData(html, buildAnimeStructuredData({ ...meta, canonical }, siteUrl));
  return html;
}

module.exports = async (req, res) => {
  const alias = readAlias(req);
  const siteUrl = resolveSiteUrl(req);

  let template;
  try {
    template = await getIndexTemplate();
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Failed to read application template");
    return;
  }

  const meta = await fetchKodikMeta(alias, siteUrl).catch(() => null);
  const html = meta ? injectAnimeMeta(template, meta, siteUrl) : sanitizeIndexTemplate(template);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
  res.end(html);
};
