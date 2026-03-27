(function(){
  'use strict';

  const API_BASE = '/api/mangadex';
  const TITLE_BASE = 'https://mangadex.org/title';
  const COVER_BASE = 'https://uploads.mangadex.org/covers';
  const CATALOG_PAGE_SIZE = 24;
  const CATALOG_OFFSETS = [0, 24];
  const FEED_PAGE_SIZE = 500;
  const CHAPTER_CACHE_PREFIX = 'mc_md_chapters_v1_';
  const PAGE_CACHE_PREFIX = 'mc_md_pages_v1_';
  const PAGE_CACHE_INDEX_KEY = 'mc_md_pages_index_v1';
  const PAGE_CACHE_LIMIT = 8;
  const chapterFeedPromises = new Map();
  const chapterPagePromises = new Map();
  let catalogPromise = null;

  const STATUS_MAP = {
    ongoing: 'Продолжается',
    completed: 'Завершен',
    hiatus: 'Пауза',
    cancelled: 'Отменен'
  };

  const TAG_MAP = {
    Action: 'Экшен',
    Adventure: 'Приключения',
    Aliens: 'Пришельцы',
    Animals: 'Животные',
    AwardWinning: 'Награды',
    Crime: 'Криминал',
    Comedy: 'Комедия',
    Cooking: 'Кулинария',
    Delinquents: 'Хулиганы',
    Demons: 'Демоны',
    Drama: 'Драма',
    Doujinshi: 'Додзинси',
    Fantasy: 'Фэнтези',
    FullColor: 'Полноцвет',
    Ghosts: 'Призраки',
    Gyaru: 'Гяру',
    Harem: 'Гарем',
    Historical: 'Историческое',
    Horror: 'Ужасы',
    Isekai: 'Исекай',
    LongStrip: 'Вебтун',
    Magic: 'Магия',
    MartialArts: 'Боевые искусства',
    Mecha: 'Меха',
    Medical: 'Медицина',
    Military: 'Военное',
    MonsterGirls: 'Монстродевушки',
    Monsters: 'Монстры',
    Music: 'Музыка',
    Mystery: 'Детектив',
    Ninja: 'Ниндзя',
    OfficeWorkers: 'Офис',
    Philosophical: 'Философия',
    Police: 'Полиция',
    Psychological: 'Психология',
    Reincarnation: 'Реинкарнация',
    Romance: 'Романтика',
    Samurai: 'Самураи',
    SchoolLife: 'Школа',
    SciFi: 'Научная фантастика',
    SelfPublished: 'Самиздат',
    Shota: 'Сёнен-ай',
    SliceOfLife: 'Повседневность',
    Sports: 'Спорт',
    Superhero: 'Супергерои',
    Supernatural: 'Сверхъестественное',
    Survival: 'Выживание',
    Thriller: 'Триллер',
    TimeTravel: 'Путешествие во времени',
    TraditionalGames: 'Традиционные игры',
    Tragedy: 'Трагедия',
    UserCreated: 'Авторское',
    Vampires: 'Вампиры',
    VideoGames: 'Видеоигры',
    Villainess: 'Злодейка',
    VirtualReality: 'Виртуальная реальность',
    Zombies: 'Зомби'
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
      return safeParse(localStorage.getItem(key), fallback);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function pickLocalized(source, fallback) {
    if (!source || typeof source !== 'object') return fallback || '';
    return source.ru || source['ru-ro'] || source.en || Object.values(source).find(Boolean) || fallback || '';
  }

  function toTimestamp(value) {
    const ts = Date.parse(value || '');
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
  }

  function buildCoverUrl(mangaId, fileName, size) {
    if (!mangaId || !fileName) return 'mc-icon-192.png?v=4';
    return COVER_BASE + '/' + mangaId + '/' + fileName + '.' + size + '.jpg';
  }

  function getRelationship(entity, type) {
    return (entity && entity.relationships || []).find(function(rel) {
      return rel && rel.type === type;
    }) || null;
  }

  function getFormatInfo(originalLanguage) {
    const lang = String(originalLanguage || '').toLowerCase();
    if (lang === 'ja' || lang === 'ja-ro') return { type: 'Манга', origin: 'Япония' };
    if (lang === 'ko') return { type: 'Манхва', origin: 'Корея' };
    if (lang.indexOf('zh') === 0) return { type: 'Маньхуа', origin: 'Китай' };
    return { type: 'Комикс', origin: '' };
  }

  function translateTag(tag) {
    const raw = pickLocalized(tag && tag.attributes && tag.attributes.name, '');
    if (!raw) return '';
    return TAG_MAP[raw] || raw;
  }

  function getAuthorName(entity) {
    const authorRel = getRelationship(entity, 'author') || getRelationship(entity, 'artist');
    if (authorRel && authorRel.attributes && authorRel.attributes.name) return authorRel.attributes.name;
    return 'MangaDex';
  }

  function getDescription(attributes) {
    const raw = pickLocalized(attributes && attributes.description, '').replace(/\s+/g, ' ').trim();
    return raw || 'Описание появится после загрузки главы.';
  }

  function normalizeStatus(status) {
    const key = String(status || '').toLowerCase();
    return STATUS_MAP[key] || 'Продолжается';
  }

  function buildCatalogUrl(offset) {
    const params = new URLSearchParams();
    params.set('limit', String(CATALOG_PAGE_SIZE));
    params.set('offset', String(offset));
    params.set('order[followedCount]', 'desc');
    params.set('order[latestUploadedChapter]', 'desc');
    params.append('availableTranslatedLanguage[]', 'ru');
    params.append('includes[]', 'cover_art');
    params.append('includes[]', 'author');
    params.append('includes[]', 'artist');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    return API_BASE + '/manga?' + params.toString();
  }

  function normalizeManga(entity) {
    const attributes = entity && entity.attributes || {};
    const coverRel = getRelationship(entity, 'cover_art');
    const format = getFormatInfo(attributes.originalLanguage);
    const chapterHint = Number.parseFloat(String(attributes.lastChapter || '').replace(',', '.'));
    const genres = (attributes.tags || []).map(translateTag).filter(Boolean);
    return {
      id: entity.id,
      source: 'mangadex',
      sourceUrl: TITLE_BASE + '/' + entity.id,
      title: pickLocalized(attributes.title, 'Без названия'),
      desc: getDescription(attributes),
      description: getDescription(attributes),
      author: getAuthorName(entity),
      year: Number.isFinite(Number(attributes.year)) ? Number(attributes.year) : '',
      status: normalizeStatus(attributes.status),
      genres: Array.from(new Set(genres)).slice(0, 8),
      cover: buildCoverUrl(entity.id, coverRel && coverRel.attributes && coverRel.attributes.fileName, 512),
      coverThumb: buildCoverUrl(entity.id, coverRel && coverRel.attributes && coverRel.attributes.fileName, 256),
      type: format.type,
      origin: format.origin,
      chapterCount: Number.isFinite(chapterHint) ? Math.max(0, Math.floor(chapterHint)) : 0,
      updatedAt: toTimestamp(attributes.updatedAt || attributes.createdAt),
      chapters: null
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      mode: 'cors',
      credentials: 'omit'
    });
    if (!response.ok) throw new Error('Catalog request failed: ' + response.status);
    return response.json();
  }

  async function loadCatalog(opts) {
    const force = !!(opts && opts.force);
    if (catalogPromise && !force) return catalogPromise;
    catalogPromise = Promise.all(CATALOG_OFFSETS.map(function(offset) {
      return fetchJson(buildCatalogUrl(offset));
    })).then(function(results) {
      const nextCatalog = {};
      results.forEach(function(payload) {
        (payload && payload.data || []).forEach(function(entity) {
          if (!entity || !entity.id || nextCatalog[entity.id]) return;
          nextCatalog[entity.id] = normalizeManga(entity);
        });
      });
      return nextCatalog;
    }).catch(function(error) {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }

  function readChapterCache(mangaId) {
    return readJson(CHAPTER_CACHE_PREFIX + mangaId, null);
  }

  function saveChapterCache(mangaId, chapters) {
    if (!chapters || typeof chapters !== 'object') return;
    const slim = {};
    Object.keys(chapters).forEach(function(key) {
      const chapter = chapters[key];
      slim[key] = {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title || '',
        updatedAt: chapter.updatedAt || 0,
        publishedAt: chapter.publishedAt || 0
      };
    });
    writeJson(CHAPTER_CACHE_PREFIX + mangaId, slim);
  }

  function applyCachedChapters(manga, cached) {
    if (!manga || !cached || typeof cached !== 'object') return false;
    const chapters = {};
    Object.keys(cached).forEach(function(key) {
      const chapter = cached[key] || {};
      const number = Number(chapter.number !== undefined ? chapter.number : key);
      if (!Number.isFinite(number)) return;
      chapters[String(number)] = {
        id: chapter.id,
        number: number,
        title: chapter.title || '',
        updatedAt: chapter.updatedAt || 0,
        publishedAt: chapter.publishedAt || 0,
        pages: null
      };
    });
    if (!Object.keys(chapters).length) return false;
    manga.chapters = chapters;
    manga.chapterCount = Math.max(Number(manga.chapterCount) || 0, Object.keys(chapters).length);
    return true;
  }

  function normalizeChapterFeed(entries) {
    const uniqueByNumber = new Map();
    entries.forEach(function(entity) {
      const attributes = entity && entity.attributes || {};
      const rawNumber = String(attributes.chapter || '').trim().replace(',', '.');
      if (!rawNumber) return;
      const number = Number(rawNumber);
      if (!Number.isFinite(number)) return;
      const candidate = {
        id: entity.id,
        number: number,
        title: String(attributes.title || '').trim(),
        updatedAt: toTimestamp(attributes.updatedAt || attributes.publishAt || attributes.createdAt),
        publishedAt: toTimestamp(attributes.publishAt || attributes.createdAt),
        pages: null
      };
      const previous = uniqueByNumber.get(String(number));
      if (!previous || candidate.updatedAt >= previous.updatedAt) uniqueByNumber.set(String(number), candidate);
    });
    const chapters = {};
    Array.from(uniqueByNumber.values()).sort(function(a, b) {
      return a.number - b.number || a.publishedAt - b.publishedAt;
    }).forEach(function(chapter) {
      chapters[String(chapter.number)] = chapter;
    });
    return chapters;
  }

  function buildFeedUrl(mangaId, offset) {
    const params = new URLSearchParams();
    params.set('limit', String(FEED_PAGE_SIZE));
    params.set('offset', String(offset));
    params.set('order[chapter]', 'asc');
    params.set('order[volume]', 'asc');
    params.append('translatedLanguage[]', 'ru');
    return API_BASE + '/manga/' + mangaId + '/feed?' + params.toString();
  }

  async function ensureTitleChapters(mangaId) {
    const manga = window.mangaDB && window.mangaDB[mangaId];
    if (!manga) return {};
    if (manga.chapters && Object.keys(manga.chapters).length) return manga.chapters;
    if (applyCachedChapters(manga, readChapterCache(mangaId))) return manga.chapters;
    if (chapterFeedPromises.has(mangaId)) return chapterFeedPromises.get(mangaId);

    const promise = (async function() {
      const allEntries = [];
      let offset = 0;
      let total = 1;

      while (offset < total && offset < 2000) {
        const payload = await fetchJson(buildFeedUrl(mangaId, offset));
        const page = Array.isArray(payload && payload.data) ? payload.data : [];
        total = Number(payload && payload.total) || page.length;
        allEntries.push.apply(allEntries, page);
        if (!page.length) break;
        offset += page.length;
      }

      const chapters = normalizeChapterFeed(allEntries);
      manga.chapters = chapters;
      manga.chapterCount = Math.max(Number(manga.chapterCount) || 0, Object.keys(chapters).length);
      saveChapterCache(mangaId, chapters);
      return chapters;
    })().finally(function() {
      chapterFeedPromises.delete(mangaId);
    });

    chapterFeedPromises.set(mangaId, promise);
    return promise;
  }

  function shouldUseDataSaver() {
    if (document.documentElement.getAttribute('data-performance') === 'lite') return true;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return window.innerWidth <= 900;
  }

  function readPageCache(chapterId) {
    const cached = readJson(PAGE_CACHE_PREFIX + chapterId, null);
    return Array.isArray(cached) && cached.length ? cached : null;
  }

  function savePageCache(chapterId, pages) {
    if (!Array.isArray(pages) || !pages.length) return;
    writeJson(PAGE_CACHE_PREFIX + chapterId, pages);
    const index = readJson(PAGE_CACHE_INDEX_KEY, []).filter(function(item) {
      return item && item.id !== chapterId;
    });
    index.unshift({ id: chapterId, ts: Date.now() });
    while (index.length > PAGE_CACHE_LIMIT) {
      const removed = index.pop();
      try {
        localStorage.removeItem(PAGE_CACHE_PREFIX + removed.id);
      } catch (error) {}
    }
    writeJson(PAGE_CACHE_INDEX_KEY, index);
  }

  async function ensureChapterPages(mangaId, chapterNumber) {
    const manga = window.mangaDB && window.mangaDB[mangaId];
    if (!manga) return [];
    await ensureTitleChapters(mangaId);
    const key = String(chapterNumber);
    const chapter = manga.chapters && manga.chapters[key];
    if (!chapter) return [];
    if (Array.isArray(chapter.pages) && chapter.pages.length) return chapter.pages;

    const cachedPages = readPageCache(chapter.id);
    if (cachedPages) {
      chapter.pages = cachedPages;
      return cachedPages;
    }

    if (chapterPagePromises.has(chapter.id)) return chapterPagePromises.get(chapter.id);

    const promise = (async function() {
      const payload = await fetchJson(API_BASE + '/at-home/server/' + chapter.id);
      const details = payload && payload.chapter || {};
      const hash = String(details.hash || '');
      const useSaver = shouldUseDataSaver() && Array.isArray(details.dataSaver) && details.dataSaver.length;
      const files = useSaver ? details.dataSaver : details.data;
      const folder = useSaver ? 'data-saver' : 'data';
      const baseUrl = String(payload && payload.baseUrl || '').replace(/\/+$/, '');
      const pages = (Array.isArray(files) ? files : []).filter(Boolean).map(function(fileName) {
        return baseUrl + '/' + folder + '/' + hash + '/' + fileName;
      });
      chapter.pages = pages;
      savePageCache(chapter.id, pages);
      return pages;
    })().finally(function() {
      chapterPagePromises.delete(chapter.id);
    });

    chapterPagePromises.set(chapter.id, promise);
    return promise;
  }

  function prefetchChapterPages(mangaId, chapterNumber) {
    ensureChapterPages(mangaId, chapterNumber).catch(function() {});
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
    loadCatalog: loadCatalog,
    ensureTitleChapters: ensureTitleChapters,
    ensureChapterPages: ensureChapterPages,
    prefetchChapterPages: prefetchChapterPages,
    getTitleMetaParts: getTitleMetaParts,
    getChapterLabel: getChapterLabel
  };
})();
