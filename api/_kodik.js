const KODIK_API_ORIGIN = "https://kodik-api.com";
const DEFAULT_KODIK_TOKENS = [
  "==QO0ADM3kTZmRTNiRDNjFDM==QOxkDMzQjZ4ADZ4YzNhZTN",
  "==QNyE2NzIjM4ETM3MmNklDM==gY5EzNxIzY0gjZ1kDZkFDN",
  "==wMjhDN5QzYkNjZyQmM2ETO==QYjZjYkRjNxMWZ3YTNidzN"
];
const GENRE_LABEL_ALIASES = new Map([
  ["сенен", "Сёнен"],
  ["сёнен", "Сёнен"],
  ["седзе", "Сёдзё"],
  ["сёдзё", "Сёдзё"],
  ["сенен ай", "Сёнен-ай"],
  ["сёнен ай", "Сёнен-ай"],
  ["седзе ай", "Сёдзё-ай"],
  ["сёдзё ай", "Сёдзё-ай"],
  ["сэйнэн", "Сэйнэн"],
  ["сейнен", "Сэйнэн"],
  ["сеинен", "Сэйнэн"],
  ["дзесей", "Дзёсэй"],
  ["дзёсэй", "Дзёсэй"],
  ["джосей", "Дзёсэй"],
  ["экшн", "Экшен"],
  ["action", "Экшен"],
  ["adventure", "Приключения"],
  ["comedy", "Комедия"],
  ["drama", "Драма"],
  ["fantasy", "Фэнтези"],
  ["romance", "Романтика"],
  ["исекай", "Исэкай"],
  ["исэкай", "Исэкай"],
  ["isekai", "Исэкай"],
  ["cgdct", "Милые девочки"],
  ["cute girls doing cute things", "Милые девочки"],
  ["science fiction", "Фантастика"],
  ["sci fi", "Фантастика"],
  ["slice of life", "Повседневность"],
  ["sports", "Спорт"],
  ["supernatural", "Сверхъестественное"],
  ["thriller", "Триллер"]
]);

function readValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function isPlainKodikToken(value) {
  return /^[a-f0-9]{32}$/i.test(String(value || "").trim());
}

function decodeEncryptedKodikToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isPlainKodikToken(raw)) return raw;
  if (raw.length < 4 || raw.length % 2 !== 0) return raw;

  try {
    const middle = raw.length / 2;
    const left = raw.slice(0, middle).split("").reverse().join("");
    const right = raw.slice(middle).split("").reverse().join("");
    const decoded = Buffer.from(right, "base64").toString("utf8") + Buffer.from(left, "base64").toString("utf8");
    return isPlainKodikToken(decoded) ? decoded : raw;
  } catch {
    return raw;
  }
}

function getKodikTokenCandidates() {
  return uniqueStrings([process.env.KODIK_TOKEN, ...DEFAULT_KODIK_TOKENS].map(decodeEncryptedKodikToken));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGenreKey(value) {
  return normalizeText(value).replace(/-/g, " ");
}

function normalizeGenreLabel(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const key = normalizeGenreKey(raw);
  if (!key) return "";
  return GENRE_LABEL_ALIASES.get(key) || raw;
}

function normalizeGenreList(values = []) {
  const map = new Map();

  values.forEach((value) => {
    const label = normalizeGenreLabel(value);
    const key = normalizeGenreKey(label);
    if (!key || map.has(key)) return;
    map.set(key, label);
  });

  return [...map.values()];
}

function splitOtherTitles(value) {
  return String(value || "")
    .split(/[\/|;,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function absoluteKodikUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function mapTypeLabel(item) {
  const type = String(item?.type || "").trim();
  const animeKind = String(item?.material_data?.anime_kind || "").trim();
  const typeMap = {
    anime: "Фильм",
    "anime-serial": "ТВ сериал",
    "foreign-serial": "Сериал",
    "foreign-movie": "Фильм",
    "cartoon-serial": "Мультсериал"
  };

  if (animeKind) {
    const animeKindMap = {
      tv: "ТВ сериал",
      tv13: "ТВ сериал",
      tv24: "ТВ сериал",
      tv48: "ТВ сериал",
      movie: "Фильм",
      ova: "OVA",
      ona: "ONA",
      special: "Спецвыпуск",
      music: "Клип"
    };

    if (animeKindMap[animeKind]) {
      return animeKindMap[animeKind];
    }
  }

  return typeMap[type] || "Kodik";
}

function mapCatalogTypeValue(item) {
  const animeKind = String(item?.material_data?.anime_kind || "").trim().toLowerCase();
  const type = String(item?.type || "").trim().toLowerCase();

  if (["tv", "tv13", "tv24", "tv48"].includes(animeKind)) return "TV";
  if (animeKind === "movie") return "MOVIE";
  if (animeKind === "ova") return "OVA";
  if (animeKind === "ona") return "ONA";
  if (animeKind === "special") return "SPECIAL";
  if (type === "anime") return "MOVIE";
  if (type.includes("serial")) return "TV";
  return "";
}

function getPosterCandidates(item) {
  const candidates = [
    item?.material_data?.poster_url,
    item?.screenshots?.[0],
    item?.material_data?.screenshots?.[0],
    item?.material_data?.anime_poster_url
  ]
    .map(absoluteKodikUrl)
    .filter(Boolean);

  const preferred = candidates.filter((url) => !/shikimori\./i.test(url));
  return preferred.length ? [...preferred, ...candidates.filter((url) => /shikimori\./i.test(url))] : candidates;
}

function getPosterUrl(item) {
  return getPosterCandidates(item)[0] || "";
}

function getDescription(item) {
  return (
    String(item?.material_data?.anime_description || "").trim() ||
    String(item?.material_data?.description || "").trim() ||
    "Описание пока не заполнено."
  );
}

function getAgeLabel(item) {
  const minimalAge = toNumber(item?.material_data?.minimal_age, 0);
  if (minimalAge > 0) return `${minimalAge}+`;

  const mpaa = String(item?.material_data?.rating_mpaa || "").trim();
  return mpaa ? mpaa.toUpperCase() : "-";
}

function getGenres(item) {
  return normalizeGenreList([
    ...(Array.isArray(item?.material_data?.anime_genres) ? item.material_data.anime_genres : []),
    ...(Array.isArray(item?.material_data?.genres) ? item.material_data.genres : []),
    ...(Array.isArray(item?.material_data?.all_genres) ? item.material_data.all_genres : [])
  ]).slice(0, 12);
}

function isOngoing(item) {
  return String(item?.material_data?.anime_status || item?.material_data?.all_status || "").toLowerCase() === "ongoing";
}

function getEpisodesTotal(item) {
  return Math.max(
    toNumber(item?.material_data?.episodes_total, 0),
    toNumber(item?.material_data?.episodes_aired, 0),
    toNumber(item?.episodes_count, 0),
    toNumber(item?.last_episode, 0)
  );
}

function getEpisodeRange(episodes = []) {
  if (!Array.isArray(episodes) || !episodes.length) {
    return { first: 0, last: 0 };
  }

  return {
    first: toNumber(episodes[0]?.ordinal, 0),
    last: toNumber(episodes[episodes.length - 1]?.ordinal, 0)
  };
}

function getTitleVariants(item) {
  return uniqueStrings([
    item?.title,
    item?.title_orig,
    ...(splitOtherTitles(item?.other_title) || []),
    item?.material_data?.title,
    item?.material_data?.anime_title,
    item?.material_data?.title_en,
    ...(Array.isArray(item?.material_data?.other_titles) ? item.material_data.other_titles : []),
    ...(Array.isArray(item?.material_data?.other_titles_en) ? item.material_data.other_titles_en : []),
    ...(Array.isArray(item?.material_data?.other_titles_jp) ? item.material_data.other_titles_jp : [])
  ]);
}

function buildIdentity(item) {
  if (item?.shikimori_id) return `shikimori:${item.shikimori_id}`;
  if (item?.kinopoisk_id) return `kinopoisk:${item.kinopoisk_id}`;
  if (item?.imdb_id) return `imdb:${item.imdb_id}`;
  if (item?.id) return `kodik:${item.id}`;

  const fallback = `${normalizeText(item?.title || item?.material_data?.anime_title || "release")}:${item?.year || ""}`;
  return `title:${fallback}`;
}

function hasMovieKeywords(values = []) {
  return values.some((value) => /\b(movie|film|фильм|полнометраж|ova|special|спецвыпуск)\b/i.test(String(value || "")));
}

function isMovieItem(item) {
  const animeKind = String(item?.material_data?.anime_kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  return animeKind === "movie" || type === "anime";
}

function isSerialItem(item) {
  const animeKind = String(item?.material_data?.anime_kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  return ["tv", "tv13", "tv24", "tv48", "ona", "ova", "special"].includes(animeKind) || type.includes("serial");
}

function titleMatchScore(requested, candidate) {
  if (!requested || !candidate) return 0;
  if (candidate === requested) return 80;
  if (candidate.startsWith(requested) || requested.startsWith(candidate)) return 52;
  if (candidate.includes(requested) || requested.includes(candidate)) return 30;
  return 0;
}

function scoreGroupMatch(groupItems, meta = {}) {
  const primary = choosePrimary(groupItems);
  const requestTitles = uniqueStrings([meta.title, meta.originalTitle, ...(meta.alternateTitles || [])]).map(normalizeText);
  const candidateTitles = uniqueStrings(groupItems.flatMap((item) => getTitleVariants(item))).map(normalizeText);
  const requestYear = toNumber(meta.year, 0);
  const episodesTotal = getEpisodesTotal(primary);

  let score = 0;

  if (meta.identity && groupItems.some((item) => buildIdentity(item) === meta.identity)) {
    score += 140;
  }

  requestTitles.forEach((requested) => {
    candidateTitles.forEach((candidate) => {
      score = Math.max(score, titleMatchScore(requested, candidate));
    });
  });

  if (requestYear) {
    const itemYear = toNumber(primary?.year || primary?.material_data?.year, 0);
    if (itemYear === requestYear) score += 28;
    else if (itemYear && Math.abs(itemYear - requestYear) === 1) score += 10;
    else if (itemYear) score -= 18;
  }

  if (isSerialItem(primary)) score += 12;
  if (episodesTotal > 3) score += 12;
  if (episodesTotal > 12) score += 8;

  const requestHasMovieKeywords = hasMovieKeywords(requestTitles);
  if (!requestHasMovieKeywords && isMovieItem(primary)) score -= 18;
  if (requestHasMovieKeywords && isMovieItem(primary)) score += 10;

  return score;
}

function buildAlias(identity) {
  return `kodik-${String(identity || "release").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function choosePrimary(items) {
  return (
    items
      .slice()
      .sort((left, right) => {
        const leftScore =
          (left?.material_data ? 20 : 0) + (left?.translation?.type === "voice" ? 5 : 0) + (getEpisodesTotal(left) > 1 ? 3 : 0);
        const rightScore =
          (right?.material_data ? 20 : 0) +
          (right?.translation?.type === "voice" ? 5 : 0) +
          (getEpisodesTotal(right) > 1 ? 3 : 0);
        return rightScore - leftScore;
      })[0] || items[0]
  );
}

function groupByIdentity(items = []) {
  const groups = new Map();

  items.forEach((item) => {
    const identity = buildIdentity(item);
    if (!groups.has(identity)) {
      groups.set(identity, []);
    }
    groups.get(identity).push(item);
  });

  return groups;
}

function buildPreviewRelease(groupItems) {
  const primary = choosePrimary(groupItems);
  const identity = buildIdentity(primary);
  const poster = getPosterUrl(primary);
  const posterSources = getPosterCandidates(primary);
  const voices = uniqueStrings(groupItems.map((item) => item?.translation?.title).filter(Boolean));
  const ongoing = isOngoing(primary);
  const year = primary?.year || primary?.material_data?.year || "-";
  const ratingValue = Math.max(
    toNumber(primary?.material_data?.shikimori_rating, 0),
    toNumber(primary?.material_data?.kinopoisk_rating, 0),
    toNumber(primary?.material_data?.imdb_rating, 0),
    0
  );
  const freshAtValue =
    Date.parse(
      primary?.updated_at ||
        primary?.created_at ||
        primary?.material_data?.released_at ||
        primary?.material_data?.premiere_world ||
        ""
    ) || 0;

  return {
    provider: "kodik",
    id: identity,
    alias: buildAlias(identity),
    title: String(primary?.title || primary?.material_data?.anime_title || primary?.material_data?.title || "Без названия"),
    originalTitle: String(primary?.title_orig || primary?.material_data?.title_en || ""),
    alternateTitles: getTitleVariants(primary),
    year,
    type: mapTypeLabel(primary),
    typeValue: mapCatalogTypeValue(primary),
    season: "",
    age: getAgeLabel(primary),
    ageValue: "",
    ongoing,
    statusLabel: ongoing ? "Онгоинг" : "Есть в Kodik",
    publishDay: "",
    publishDayValue: 0,
    sortFreshAt: freshAtValue,
    sortRating: ratingValue,
    description: getDescription(primary),
    posterSources,
    poster,
    posterDirect: poster,
    heroPoster: poster,
    heroPosterDirect: poster,
    cardPoster: poster,
    cardPosterDirect: poster,
    thumb: poster,
    thumbDirect: poster,
    genres: getGenres(primary),
    episodesTotal: getEpisodesTotal(primary),
    averageDuration: toNumber(primary?.material_data?.duration, 0),
    favorites: Math.max(
      toNumber(primary?.material_data?.shikimori_votes, 0),
      toNumber(primary?.material_data?.kinopoisk_votes, 0),
      toNumber(primary?.material_data?.imdb_votes, 0)
    ),
    externalPlayer: "",
    voices,
    crew: [],
    episodes: [],
    publishedEpisode: toNumber(primary?.last_episode, 0)
      ? {
          ordinal: toNumber(primary.last_episode, 0),
          name: "Последняя доступная серия",
          duration: 0
        }
      : null,
    nextEpisodeNumber: null,
    identifiers: {
      shikimoriId: String(primary?.shikimori_id || ""),
      kinopoiskId: String(primary?.kinopoisk_id || ""),
      imdbId: String(primary?.imdb_id || ""),
      kodikId: String(primary?.id || "")
    },
    kodikIdentity: identity,
    providerSet: ["kodik"],
    sourceItems: []
  };
}

function extractEpisodes(item, sourceId) {
  const results = [];
  const seen = new Set();
  const seasons = item?.seasons && typeof item.seasons === "object" ? item.seasons : null;

  if (seasons) {
    Object.entries(seasons).forEach(([seasonKey, season]) => {
      const seasonLink = absoluteKodikUrl(season?.link || item?.link);
      const seasonOrdinal = toNumber(seasonKey, 0);
      const episodes = season?.episodes && typeof season.episodes === "object" ? season.episodes : null;

      if (episodes) {
        Object.entries(episodes).forEach(([episodeKey, episode]) => {
          const ordinal = toNumber(episodeKey, 0);
          const externalUrl = absoluteKodikUrl(episode?.link || seasonLink || item?.link);
          const dedupeKey = `${seasonOrdinal}:${ordinal}:${externalUrl}`;
          if (!externalUrl || seen.has(dedupeKey)) return;

          seen.add(dedupeKey);
          results.push({
            id: `${sourceId}:${seasonOrdinal || 1}:${ordinal || 0}`,
            ordinal: ordinal || 0,
            seasonOrdinal,
            name: String(episode?.title || (ordinal ? `${ordinal} серия` : "Фильм")),
            duration: 0,
            externalUrl,
            previewUrl: String(episode?.screenshots?.[0] || ""),
            provider: "kodik",
            sourceId
          });
        });
      } else if (seasonLink) {
        const ordinal = toNumber(item?.last_episode || item?.episodes_count, 0);
        const dedupeKey = `${seasonOrdinal}:${ordinal}:${seasonLink}`;
        if (seen.has(dedupeKey)) return;

        seen.add(dedupeKey);
        results.push({
          id: `${sourceId}:${seasonOrdinal || 1}:${ordinal || 0}`,
          ordinal,
          seasonOrdinal,
          name: ordinal ? `${ordinal} серия` : "Фильм",
          duration: 0,
          externalUrl: seasonLink,
          previewUrl: "",
          provider: "kodik",
          sourceId
        });
      }
    });
  }

  if (!results.length) {
    const externalUrl = absoluteKodikUrl(item?.link);
    if (externalUrl) {
      const ordinal = toNumber(item?.last_episode || item?.episodes_count, 0);
      results.push({
        id: `${sourceId}:${ordinal || 0}`,
        ordinal,
        seasonOrdinal: 0,
        name: ordinal ? `${ordinal} серия` : "Фильм",
        duration: 0,
        externalUrl,
        previewUrl: "",
        provider: "kodik",
        sourceId
      });
    }
  }

  return results.sort((left, right) => (left.ordinal || 0) - (right.ordinal || 0));
}

function buildSourceFromTranslation(groupItems) {
  const primary = choosePrimary(groupItems);
  const translationId = String(primary?.translation?.id || primary?.id || "default");
  const sourceId = `kodik:${translationId}`;
  const extractedEpisodes = groupItems.flatMap((item) => extractEpisodes(item, sourceId));
  const dedupedEpisodes = [];
  const seenEpisodes = new Set();

  extractedEpisodes.forEach((episode) => {
    const key = `${episode.ordinal || 0}:${episode.externalUrl}`;
    if (seenEpisodes.has(key)) return;
    seenEpisodes.add(key);
    dedupedEpisodes.push(episode);
  });

  const translationTitle = String(primary?.translation?.title || "Озвучка");
  const translationType = String(primary?.translation?.type || "voice");
  const episodesCount = Math.max(dedupedEpisodes.length, getEpisodesTotal(primary));
  const { first, last } = getEpisodeRange(dedupedEpisodes);
  const typeLabel = translationType === "subtitles" ? "субтитры" : "озвучка";
  const rangeLabel =
    first > 0 && last >= first
      ? first === 1 && (!episodesCount || last >= episodesCount)
        ? `${episodesCount || dedupedEpisodes.length} эп.`
        : `${first}-${last} эп.`
      : `${episodesCount || "?"} эп.`;

  return {
    id: sourceId,
    provider: "kodik",
    kind: dedupedEpisodes.length ? "iframe-episodes" : "iframe",
    title: `Kodik · ${translationTitle}`,
    note: `${rangeLabel} · ${typeLabel}`,
    voices: [translationTitle],
    translationId,
    externalUrl: absoluteKodikUrl(primary?.link),
    episodes: dedupedEpisodes
  };
}

function sortSourceItems(sourceItems = []) {
  return sourceItems.slice().sort((left, right) => {
    const leftRange = getEpisodeRange(left?.episodes || []);
    const rightRange = getEpisodeRange(right?.episodes || []);
    const leftStartsAtOne = leftRange.first <= 1 ? 1 : 0;
    const rightStartsAtOne = rightRange.first <= 1 ? 1 : 0;
    if (leftStartsAtOne !== rightStartsAtOne) {
      return rightStartsAtOne - leftStartsAtOne;
    }

    const leftEpisodes = Array.isArray(left?.episodes) ? left.episodes.length : 0;
    const rightEpisodes = Array.isArray(right?.episodes) ? right.episodes.length : 0;
    if (leftEpisodes !== rightEpisodes) {
      return rightEpisodes - leftEpisodes;
    }

    const leftSubtitle = /субтитр/i.test(`${left?.title || ""} ${left?.note || ""}`);
    const rightSubtitle = /субтитр/i.test(`${right?.title || ""} ${right?.note || ""}`);
    if (leftSubtitle !== rightSubtitle) {
      return leftSubtitle ? 1 : -1;
    }

    return String(left?.title || "").localeCompare(String(right?.title || ""), "ru");
  });
}

function buildFullRelease(groupItems) {
  const preview = buildPreviewRelease(groupItems);
  const translationGroups = new Map();

  groupItems.forEach((item) => {
    const key = String(item?.translation?.id || item?.id || "default");
    if (!translationGroups.has(key)) {
      translationGroups.set(key, []);
    }
    translationGroups.get(key).push(item);
  });

  const sourceItems = sortSourceItems(Array.from(translationGroups.values()).map(buildSourceFromTranslation));
  const firstSource = sourceItems[0] || null;

  return {
    ...preview,
    sourceItems,
    voices: uniqueStrings(sourceItems.flatMap((source) => source.voices || [])),
    externalPlayer: firstSource?.externalUrl || "",
    episodes: firstSource?.episodes || []
  };
}

async function postKodik(endpoint, payload = {}) {
  const tokens = getKodikTokenCandidates();
  if (!tokens.length) {
    throw new Error("Kodik token is missing");
  }

  let lastError = null;

  for (const token of tokens) {
    const body = new URLSearchParams();
    body.set("token", token);
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      body.set(key, String(value));
    });

    try {
      const response = await fetch(`${KODIK_API_ORIGIN}/${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json, text/plain, */*",
          "user-agent": "AnimeCloud/1.0 (+https://color-manga-cloud.vercel.app)"
        },
        body: body.toString(),
        redirect: "follow"
      });

      const rawText = await response.text();
      let data = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(`Kodik API request failed: ${response.status}`);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Kodik API returned invalid payload");
      }

      if (data.error) {
        throw new Error(String(data.error));
      }

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Kodik API request failed");
}

function filterAnimeResults(items = []) {
  return items.filter((item) => {
    const type = String(item?.type || "").toLowerCase();
    return type === "anime" || type === "anime-serial";
  });
}

function collectPreviewReleases(items = []) {
  return Array.from(groupByIdentity(filterAnimeResults(items)).values()).map(buildPreviewRelease);
}

function matchesRequestedMeta(groupItems, meta = {}) {
  const requestTitles = uniqueStrings([meta.title, meta.originalTitle, ...(meta.alternateTitles || [])]).map(normalizeText);
  const requestYear = toNumber(meta.year, 0);

  if (!requestTitles.length) return true;

  const groupTitles = uniqueStrings(groupItems.flatMap((item) => getTitleVariants(item))).map(normalizeText);
  const titleMatched = requestTitles.some((requested) =>
    groupTitles.some((candidate) => candidate === requested || candidate.includes(requested) || requested.includes(candidate))
  );

  if (!titleMatched) return false;
  if (!requestYear) return true;

  return groupItems.some((item) => {
    const itemYear = toNumber(item?.year || item?.material_data?.year, 0);
    return !itemYear || Math.abs(itemYear - requestYear) <= 1;
  });
}

function findBestPreviewMatch(items = [], meta = {}) {
  const groups = Array.from(groupByIdentity(filterAnimeResults(items)).values());
  const matched = groups.filter((group) => matchesRequestedMeta(group, meta));
  const candidates = matched.length ? matched : groups;

  if (!candidates.length) return null;
  const bestGroup =
    candidates
      .slice()
      .sort((left, right) => {
        const scoreDiff = scoreGroupMatch(right, meta) - scoreGroupMatch(left, meta);
        if (scoreDiff !== 0) return scoreDiff;

        const episodeDiff = getEpisodesTotal(choosePrimary(right)) - getEpisodesTotal(choosePrimary(left));
        if (episodeDiff !== 0) return episodeDiff;

        return toNumber(choosePrimary(right)?.year, 0) - toNumber(choosePrimary(left)?.year, 0);
      })[0] || candidates[0];

  return buildFullRelease(bestGroup);
}

function buildDiscoverPayload(mode, limit, page, sort, order, genres = [], animeKinds = [], mediaTypes = []) {
  const safeLimit = Math.max(12, Math.min(100, limit));
  const normalizedMediaTypes = uniqueStrings(Array.isArray(mediaTypes) ? mediaTypes : [mediaTypes])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const payload = {
    limit: safeLimit,
    types: normalizedMediaTypes.length ? normalizedMediaTypes.join(",") : "anime,anime-serial",
    with_material_data: "true",
    not_blocked_for_me: "true"
  };

  switch (mode) {
    case "top":
      payload.sort = "shikimori_rating";
      payload.order = "desc";
      break;
    case "ongoing":
      payload.sort = "shikimori_rating";
      payload.order = "desc";
      payload.anime_status = "ongoing";
      break;
    case "catalog":
      payload.sort = sort || "updated_at";
      payload.order = String(order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
      break;
    case "latest":
    default:
      payload.sort = "updated_at";
      payload.order = "desc";
      break;
  }

  const normalizedGenres = normalizeGenreList(Array.isArray(genres) ? genres : [genres]);
  if (normalizedGenres.length) {
    payload.anime_genres = normalizedGenres.join(",");
  }

  const normalizedAnimeKinds = uniqueStrings(Array.isArray(animeKinds) ? animeKinds : [animeKinds])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (normalizedAnimeKinds.length) {
    payload.anime_kind = normalizedAnimeKinds.join(",");
  }

  payload.__page = Math.max(1, page);
  return payload;
}

function payloadFromPageUrl(rawUrl) {
  const absolute = new URL(rawUrl, KODIK_API_ORIGIN);
  const payload = {};

  absolute.searchParams.forEach((value, key) => {
    if (key === "token") return;
    payload[key] = value;
  });

  return payload;
}

module.exports = {
  KODIK_API_ORIGIN,
  DEFAULT_KODIK_TOKENS,
  readValue,
  toNumber,
  uniqueStrings,
  normalizeText,
  absoluteKodikUrl,
  buildAlias,
  buildIdentity,
  getTitleVariants,
  postKodik,
  buildFullRelease,
  buildPreviewRelease,
  collectPreviewReleases,
  buildDiscoverPayload,
  findBestPreviewMatch,
  payloadFromPageUrl
};
