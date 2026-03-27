(function(){
  'use strict';

  // AniList GraphQL API
  const ANILIST_API = 'https://graphql.anilist.co';
  const CACHE_PREFIX = 'mc_anilist_';
  const CACHE_EXPIRE = 24 * 60 * 60 * 1000; // 24 hours
  
  let catalogPromise = null;
  const chapterPromises = new Map();

  const STATUS_MAP = {
    ONGOING: 'Продолжается',
    COMPLETED: 'Завершен',
    HIATUS: 'Пауза',
    CANCELLED: 'Отменен',
    NOT_YET_RELEASED: 'Не вышло'
  };

  const GENRE_MAP = {
    Action: 'Экшен',
    Adventure: 'Приключения',
    Comedy: 'Комедия',
    Drama: 'Драма',
    Fantasy: 'Фэнтези',
    Horror: 'Ужасы',
    Isekai: 'Исекай',
    Magic: 'Магия',
    Mystery: 'Детектив',
    Romance: 'Романтика',
    SciFi: 'Научная фантастика',
    SliceofLife: 'Жизненные ситуации',
    Sports: 'Спорт',
    Supernatural: 'Сверхъестественное',
    Thriller: 'Триллер',
    Psychological: 'Психология',
    Demons: 'Демоны',
    Supernatural: 'Сверхъестественное',
    School: 'Школа',
    Timeline: 'Путешествие во времени'
  };

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function readJson(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      if (!val) return fallback;
      const parsed = JSON.parse(val);
      if (parsed.expires && parsed.expires < Date.now()) {
        localStorage.removeItem(key);
        return fallback;
      }
      return parsed.data || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value, ttl = CACHE_EXPIRE) {
    try {
      localStorage.setItem(key, JSON.stringify({
        data: value,
        expires: Date.now() + ttl
      }));
    } catch (error) {}
  }

  async function fetchGraphQL(query, variables = {}) {
    try {
      const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.errors) {
        console.error('GraphQL Error:', data.errors);
        throw new Error(data.errors[0]?.message || 'GraphQL Error');
      }

      return data.data;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  function normalizeStatus(status) {
    return STATUS_MAP[status] || 'Продолжается';
  }

  function formatGenres(genres) {
    if (!Array.isArray(genres)) return [];
    return genres.map(g => GENRE_MAP[g] || g).slice(0, 6);
  }

  function normalizeManga(node) {
    if (!node) return null;

    const title = node.title?.english || node.title?.romaji || node.title?.native || 'Без названия';
    const description = node.description ? 
      node.description.replace(/<[^>]*>/g, '').substring(0, 150) + '...' : 
      'Описание отсутствует';
    
    const type = node.countryOfOrigin === 'CN' ? 'Маньхуа' :
                 node.countryOfOrigin === 'KR' ? 'Манхва' :
                 'Манга';
    
    const origin = node.countryOfOrigin === 'CN' ? 'Китай' :
                   node.countryOfOrigin === 'KR' ? 'Корея' :
                   node.countryOfOrigin === 'JP' ? 'Япония' :
                   node.countryOfOrigin || '';

    return {
      id: 'al_' + node.id,
      source: 'anilist',
      sourceUrl: `https://anilist.co/manga/${node.id}`,
      title: title,
      desc: description,
      description: description,
      author: node.staff?.edges?.[0]?.node?.name?.userPreferred || 'Unknown',
      year: node.startDate?.year || new Date().getFullYear(),
      status: normalizeStatus(node.status),
      genres: formatGenres(node.genres),
      cover: node.coverImage?.extraLarge || 'mc-icon-192.png?v=4',
      coverThumb: node.coverImage?.large || 'mc-icon-192.png?v=4',
      type: type,
      origin: origin,
      chapterCount: node.chapters || 0,
      updatedAt: Math.floor((node.updatedAt || Date.now()) / 1000),
      chapters: null,
      rating: node.meanScore || 0
    };
  }

  async function loadCatalog(opts = {}) {
    const force = !!(opts && opts.force);
    if (catalogPromise && !force) return catalogPromise;

    catalogPromise = (async () => {
      const cacheKey = CACHE_PREFIX + 'catalog_v1';
      
      // Try cache first
      if (!force) {
        const cached = readJson(cacheKey);
        if (cached && Object.keys(cached).length) {
          return cached;
        }
      }

      try {
        // Fetch manga with various filters
        const query = `
          query GetManga($page: Int, $lang: [String!], $sort: [MediaSort]) {
            mangaPage: Page(page: $page, perPage: 50) {
              media(type: MANGA, language: $lang, sort: $sort) {
                id
                title { english romaji native }
                description
                coverImage { extraLarge large }
                genres
                status
                chapters
                countryOfOrigin
                startDate { year }
                updatedAt
                staff(role: "AUTHOR") {
                  edges {
                    node { name { userPreferred } }
                  }
                }
                meanScore
              }
            }
          }
        `;

        const data = await fetchGraphQL(query, {
          page: 1,
          lang: ['RUSSIAN', 'ENGLISH'],
          sort: ['TRENDING_DESC', 'POPULARITY_DESC']
        });

        const catalog = {};
        const media = data?.mangaPage?.media || [];

        media.forEach(node => {
          const normalized = normalizeManga(node);
          if (normalized && normalized.id) {
            catalog[normalized.id] = normalized;
          }
        });

        if (Object.keys(catalog).length) {
          writeJson(cacheKey, catalog);
          return catalog;
        }

        throw new Error('No manga found');
      } catch (error) {
        console.error('Failed to load catalog:', error);
        // Return empty catalog on error
        return {};
      }
    })();

    return catalogPromise;
  }

  async function ensureTitleChapters(mangaId) {
    const manga = window.mangaDB && window.mangaDB[mangaId];
    if (!manga) return {};

    if (manga.chapters && Object.keys(manga.chapters).length) {
      return manga.chapters;
    }

    // For AniList, we don't have individual chapter URLs
    // Create sample chapters based on chapter count
    const chapters = {};
    const count = Math.min(manga.chapterCount || 1, 50);

    for (let i = 1; i <= count; i++) {
      chapters[String(i)] = {
        id: mangaId + '_ch' + i,
        number: i,
        title: `Глава ${i}`,
        updatedAt: manga.updatedAt || Math.floor(Date.now() / 1000),
        publishedAt: manga.updatedAt || Math.floor(Date.now() / 1000),
        pages: null
      };
    }

    if (Object.keys(chapters).length) {
      manga.chapters = chapters;
      return chapters;
    }

    return {};
  }

  async function ensureChapterPages(mangaId, chapterNumber) {
    // AniList doesn't provide direct image URLs for chapters
    // Return placeholder message instead
    return [
      'Для чтения манги перейдите на: https://anilist.co/manga/' + mangaId.replace('al_', '')
    ];
  }

  function getTitleMetaParts(manga) {
    if (!manga) return [];
    return [manga.author, manga.year, manga.status, manga.type, manga.origin].filter(Boolean);
  }

  function getChapterLabel(chapter, chapterNumber) {
    const suffix = chapter && chapter.title ? ' • ' + chapter.title : '';
    return 'Глава ' + chapterNumber + suffix;
  }

  window.mangaCatalogProvider = {
    loadCatalog,
    ensureTitleChapters,
    ensureChapterPages,
    getTitleMetaParts,
    getChapterLabel,
    prefetchChapterPages: function() {}
  };
})();



