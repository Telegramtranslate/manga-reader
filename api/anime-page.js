const fs = require("node:fs/promises");
const path = require("node:path");
const { findBestPreviewMatch, postKodik } = require("./_kodik");
const { resolveSiteUrl } = require("./_site-url");

const INDEX_TEMPLATE_PATH = path.join(process.cwd(), "index.html");
const ANILIBRIA_RELEASE_BASE = "https://anilibria.top/api/v1/anime/releases";
const DEFAULT_TITLE = "AnimeCloud - аниме с русской озвучкой";
const DEFAULT_DESCRIPTION =
  "AnimeCloud - каталог аниме с русской озвучкой, быстрым мобильным интерфейсом, расписанием, подборками и встроенным плеером из нескольких источников.";

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
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
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
    .replace(/\s*<script id="structured-data-legacy"[\s\S]*?<\/script>/, "")
    .replace(/\s*<script id="structured-data-seo-legacy"[\s\S]*?<\/script>/, "");
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": "AnimeCloud SEO/1.0"
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchAniLibriaMeta(alias, siteUrl) {
  try {
    const payload = await fetchJson(`${ANILIBRIA_RELEASE_BASE}/${encodeURIComponent(alias)}`);
    const release = payload?.release || payload || {};
    if (!release?.alias) return null;

    const poster =
      release?.poster?.optimized?.src ||
      release?.poster?.src ||
      release?.poster?.optimized?.preview ||
      release?.poster?.preview ||
      "/mc-icon-512.png";
    const genres = Array.isArray(release?.genres)
      ? release.genres.map((genre) => genre?.name || genre?.description || genre?.value).filter(Boolean)
      : [];
    const title = release?.name?.main || release?.name?.english || "Без названия";
    const description = truncateSeoText(
      `${release?.description || DEFAULT_DESCRIPTION} ${genres.length ? `Жанры: ${genres.join(", ")}.` : ""} ${
        release?.episodes_total ? `Эпизодов: ${release.episodes_total}.` : ""
      }`
    );

    return {
      alias: release.alias,
      title,
      description,
      image: absoluteUrl(siteUrl, poster),
      year: String(release?.year || ""),
      type: String(release?.type?.description || release?.type?.value || "Аниме"),
      genres,
      episodesTotal: Number(release?.episodes_total || 0),
      hasVideo: Boolean(Array.isArray(release?.episodes) ? release.episodes.length : 0) || Boolean(release?.external_player),
      embedUrl: absoluteUrl(siteUrl, release?.external_player || ""),
      canonical: `${siteUrl}/anime/${encodeURIComponent(release.alias)}`
    };
  } catch {
    return null;
  }
}

async function fetchKodikMeta(alias, siteUrl) {
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

  try {
    const settled = await Promise.allSettled(requests);
    const items = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value?.results || [] : []));
    const release = findBestPreviewMatch(items, parsedAlias);
    if (!release) return null;

    const description = truncateSeoText(
      `${release.description || DEFAULT_DESCRIPTION} ${
        release.genres?.length ? `Жанры: ${release.genres.join(", ")}.` : ""
      } ${release.episodesTotal ? `Эпизодов: ${release.episodesTotal}.` : ""}`
    );

    return {
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
    };
  } catch {
    return null;
  }
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
        {
          "@type": "ListItem",
          position: 1,
          name: "Главная",
          item: siteUrl
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Каталог",
          item: `${siteUrl}/catalog`
        },
        {
          "@type": "ListItem",
          position: 3,
          name: meta.title,
          item: meta.canonical
        }
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
      name: `${meta.title} — смотреть онлайн`,
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
  const alias = String(req.query?.alias || "").trim();
  const siteUrl = resolveSiteUrl(req);

  let template;
  try {
    template = await fs.readFile(INDEX_TEMPLATE_PATH, "utf8");
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Failed to read application template");
    return;
  }

  const meta =
    (await fetchAniLibriaMeta(alias, siteUrl)) ||
    (await fetchKodikMeta(alias, siteUrl));

  const html = meta ? injectAnimeMeta(template, meta, siteUrl) : sanitizeIndexTemplate(template);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=86400");
  res.end(html);
};
