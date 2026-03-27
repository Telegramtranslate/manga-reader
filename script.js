(function() {
  'use strict';

  // State
  let currentPage = 'catalog';
  let currentMangaId = null;
  let currentChapterNumber = null;
  let currentPageIndex = 0;
  let allManga = {};

  // DOM Elements
  const loaderEl = document.getElementById('loader');
  const navItems = document.querySelectorAll('.nav-item');

  // ============ INITIALIZATION ============
  async function init() {
    try {
      // Load catalog
      const catalog = await mangaCatalogProvider.loadCatalog().catch(async () => {
        console.log('API failed, using fallback catalog');
        return {};
      });
      
      if (!catalog || !Object.keys(catalog).length) {
        console.warn('No catalog loaded, using empty state');
      }
      
      // Merge with fallback if needed
      allManga = Object.assign({}, catalog);
      window.mangaDB = allManga;

      console.log(`Loaded ${Object.keys(allManga).length} manga titles`);

      // Initialize UI
      renderCatalogPage();
      attachEventListeners();
      
      // Hide loader
      setTimeout(() => {
        if (loaderEl) loaderEl.classList.add('out');
      }, 800);
    } catch (error) {
      console.error('Init failed:', error);
      if (loaderEl) loaderEl.classList.add('out');
    }
  }

  // ============ PAGE RENDERING ============
  function renderCatalogPage() {
    currentPage = 'catalog';
    updateNav();
    
    const contentEl = document.querySelector('.content');
    if (!contentEl) return;

    let html = `
      <div class="filters" style="">
        <div class="filters-head">
          <div>
            <div class="filters-head-title">MangaCloud</div>
            <div class="filters-head-sub">Читай мангу онлайн</div>
          </div>
        </div>
      </div>
    `;

    const main = document.querySelector('main');
    if (main && !main.querySelector('.filters')) {
      main.insertAdjacentHTML('afterbegin', html);
    }

    // Render catalog grid
    const titles = Object.values(allManga).sort((a, b) => b.updatedAt - a.updatedAt);
    
    let gridHtml = '<div class="grid">';
    titles.forEach(manga => {
      if (!manga || !manga.id) return;
      
      const statusColor = manga.status === 'Завершен' ? '#10b981' : 
                         manga.status === 'Продолжается' ? '#3b82f6' : '#f59e0b';
      
      gridHtml += `
        <div class="card" onclick="window.app.openManga('${manga.id}')">
          <div class="card-img">
            <img src="${manga.coverThumb}" alt="${manga.title}" loading="lazy">
            <div class="badge b-status" style="background-color: ${statusColor}80; border-color: ${statusColor};">
              ${manga.status}
            </div>
            ${manga.chapterCount > 0 ? `<div class="badge b-rating">${manga.chapterCount} гл.</div>` : ''}
          </div>
          <div class="card-info">
            <h3>${manga.title}</h3>
            <div class="card-sub">
              <span style="color: #9090b8; font-size: 0.7rem;">${manga.author}</span>
            </div>
          </div>
        </div>
      `;
    });
    gridHtml += '</div>';

    contentEl.innerHTML = gridHtml;
    contentEl.offsetHeight; // Trigger reflow
  }

  function renderMangaDetail() {
    if (!currentMangaId || !allManga[currentMangaId]) {
      renderCatalogPage();
      return;
    }

    const manga = allManga[currentMangaId];
    const contentEl = document.querySelector('.content');
    if (!contentEl) return;

    updateNav();

    const chapters = manga.chapters || {};
    const chapterList = Object.values(chapters)
      .filter(ch => ch && ch.number)
      .sort((a, b) => b.number - a.number);

    let html = `
      <div style="margin-bottom: 24px;">
        <button class="btn btn-sec btn-sm" onclick="window.app.backToCatalog()" style="margin-bottom: 12px; width: auto;">
          ← Назад к каталогу
        </button>
        
        <div style="background: var(--card); border-radius: var(--br-lg); border: 1px solid var(--border); overflow: hidden; padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; gap: 20px; margin-bottom: 16px;">
            <img src="${manga.cover}" alt="${manga.title}" style="width: 120px; height: 180px; object-fit: cover; border-radius: var(--br); border: 1px solid var(--border);" />
            <div style="flex: 1;">
              <h1 style="font-family: var(--ff-display); font-size: 1.8rem; font-weight: 800; margin-bottom: 8px;">${manga.title}</h1>
              <p style="color: var(--text2); margin-bottom: 12px; font-size: 0.9rem;">${manga.author} • ${manga.year}</p>
              <p style="color: var(--text3); line-height: 1.6; margin-bottom: 16px; font-size: 0.85rem;">${manga.description}</p>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                ${manga.genres && manga.genres.slice(0, 4).map(g => 
                  `<span style="background: rgba(139, 92, 246, 0.15); color: var(--a3); padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">${g}</span>`
                ).join('')}
              </div>
              <div style="display: flex; gap: 12px; font-size: 0.85rem; color: var(--text2);">
                <span>Статус: <strong style="color: var(--text);">${manga.status}</strong></span>
                <span>Тип: <strong style="color: var(--text);">${manga.type}</strong></span>
                <span>Глав: <strong style="color: var(--text);">${manga.chapterCount || 0}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <div style="background: var(--card); border-radius: var(--br-lg); border: 1px solid var(--border); padding: 16px;">
          <h2 style="font-family: var(--ff-display); font-size: 1.1rem; font-weight: 800; margin-bottom: 12px;">Главы (${chapterList.length})</h2>
          <div style="display: grid; gap: 8px; max-height: 600px; overflow-y: auto;">
            ${chapterList.length ? chapterList.map(ch => `
              <button onclick="window.app.openChapter('${manga.id}', ${ch.number})" 
                      style="text-align: left; background: var(--card2); border: 1px solid var(--border); color: var(--text); padding: 12px; border-radius: 10px; transition: var(--tr); font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: var(--ff-body);"
                      onmouseover="this.style.borderColor='var(--a2)'; this.style.background='var(--card)'"
                      onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--card2)'">
                Глава ${ch.number}${ch.title ? ' • ' + ch.title : ''}
              </button>
            `).join('') : '<div style="color: var(--text2); text-align: center; padding: 20px;">Главы загружаются...</div>'}
          </div>
        </div>
      </div>
    `;

    contentEl.innerHTML = html;
    
    // Load chapters if not loaded
    if (!chapters || !Object.keys(chapters).length) {
      mangaCatalogProvider.ensureTitleChapters(currentMangaId).then(() => {
        renderMangaDetail();
      }).catch(() => {
        console.error('Failed to load chapters');
      });
    }
  }

  function renderChapterReader() {
    if (!currentMangaId || !currentChapterNumber || !allManga[currentMangaId]) {
      renderMangaDetail();
      return;
    }

    const manga = allManga[currentMangaId];
    const chapter = manga.chapters && manga.chapters[String(currentChapterNumber)];
    
    if (!chapter) {
      renderMangaDetail();
      return;
    }

    updateNav();

    const contentEl = document.querySelector('.content');
    if (!contentEl) return;

    let html = `
      <div style="margin-bottom: 24px;">
        <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
          <button class="btn btn-sec btn-sm" onclick="window.app.openManga('${manga.id}')" style="width: auto;">
            ← К манге
          </button>
          <span style="color: var(--text2); padding: 8px 12px;">${manga.title}</span>
        </div>

        <div style="background: var(--card); border-radius: var(--br-lg); border: 1px solid var(--border); padding: 16px; margin-bottom: 16px;">
          <h1 style="font-family: var(--ff-display); font-size: 1.3rem; font-weight: 800; margin-bottom: 8px;">
            ${mangaCatalogProvider.getChapterLabel(chapter, currentChapterNumber)}
          </h1>
          <div style="color: var(--text2); font-size: 0.85rem;">
            <span id="page-info">Загрузка страниц...</span>
          </div>
        </div>

        <div id="reader-container" style="background: var(--card); border-radius: var(--br-lg); border: 1px solid var(--border); padding: 20px; margin-bottom: 16px; text-align: center;">
          <div style="width: 100%; max-width: 600px; margin: 0 auto;">
            <img id="page-image" src="" alt="Страница" style="width: 100%; max-width: 100%; border-radius: 10px; display: none;" />
            <div id="loading-indicator" style="color: var(--text2); padding: 40px; text-align: center;">
              Загрузка страницы...
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
          <button class="btn btn-sec btn-sm" onclick="window.app.prevPage()" style="width: auto;">
            ← Предыдущая
          </button>
          <div style="flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; justify-content: center;">
            <input type="number" id="page-input" min="1" style="width: 60px; text-align: center;" />
            <span style="margin: 0 8px; color: var(--text2);">/</span>
            <span id="total-pages" style="color: var(--text2);">-</span>
          </div>
          <button class="btn btn-sec btn-sm" onclick="window.app.nextPage()" style="width: auto;">
            Следующая →
          </button>
        </div>

        <div style="color: var(--text2); font-size: 0.75rem; text-align: center;">
          Используйте стрелки на клавиатуре для навигации
        </div>
      </div>
    `;

    contentEl.innerHTML = html;
    loadChapterPages();
  }

  async function loadChapterPages() {
    if (!currentMangaId || !currentChapterNumber) return;

    const pages = await mangaCatalogProvider.ensureChapterPages(currentMangaId, currentChapterNumber);
    
    if (!pages || !pages.length) {
      document.getElementById('loading-indicator').innerHTML = 
        '<div style="color: var(--red);">Не удалось загрузить страницы</div>';
      return;
    }

    // Setup pagination
    const pageInput = document.getElementById('page-input');
    const totalPagesEl = document.getElementById('total-pages');
    const pageInfoEl = document.getElementById('page-info');

    totalPagesEl.textContent = pages.length;
    pageInput.max = pages.length;
    pageInput.value = currentPageIndex + 1;

    pageInput.addEventListener('change', function() {
      const pageNum = parseInt(this.value);
      if (pageNum >= 1 && pageNum <= pages.length) {
        currentPageIndex = pageNum - 1;
        loadChapterPages();
      } else {
        this.value = currentPageIndex + 1;
      }
    });

    pageInfoEl.textContent = `Страница ${currentPageIndex + 1} из ${pages.length}`;
    
    // Load current page image
    const imgEl = document.getElementById('page-image');
    const loadingEl = document.getElementById('loading-indicator');
    
    if (currentPageIndex < pages.length) {
      const pageUrl = pages[currentPageIndex];
      imgEl.src = pageUrl;
      imgEl.onload = () => {
        loadingEl.style.display = 'none';
        imgEl.style.display = 'block';
      };
      imgEl.onerror = () => {
        loadingEl.innerHTML = '<div style="color: var(--red);">Ошибка загрузки изображения</div>';
      };
    }
  }

  // ============ NAVIGATION ============
  function updateNav() {
    navItems.forEach(item => item.classList.remove('active'));
    
    const activeItem = document.querySelector(
      currentPage === 'catalog' ? '[onclick*="showCatalog"]' : 
      currentPage === 'manga' ? '[onclick*="showManga"]' :
      '[onclick*="showCatalog"]'
    );
    
    if (activeItem) activeItem.classList.add('active');
  }

  function backToCatalog() {
    currentPageIndex = 0;
    currentMangaId = null;
    currentChapterNumber = null;
    renderCatalogPage();
  }

  // ============ PUBLIC API ============
  window.app = {
    openManga(mangaId) {
      currentPageIndex = 0;
      currentMangaId = mangaId;
      currentChapterNumber = null;
      currentPage = 'manga';
      renderMangaDetail();
    },

    openChapter(mangaId, chapterNumber) {
      currentPageIndex = 0;
      currentMangaId = mangaId;
      currentChapterNumber = chapterNumber;
      currentPage = 'reader';
      renderChapterReader();
      
      // Prefetch next chapter
      const manga = allManga[mangaId];
      if (manga && manga.chapters) {
        const nextChapter = Object.values(manga.chapters)
          .find(ch => ch && ch.number === chapterNumber + 1);
        if (nextChapter) {
          mangaCatalogProvider.prefetchChapterPages(mangaId, nextChapter.number);
        }
      }
    },

    backToCatalog() {
      backToCatalog();
    },

    nextPage() {
      const manga = allManga[currentMangaId];
      const chapter = manga && manga.chapters && manga.chapters[String(currentChapterNumber)];
      const pages = chapter && chapter.pages;
      
      if (pages && currentPageIndex < pages.length - 1) {
        currentPageIndex++;
        loadChapterPages();
      }
    },

    prevPage() {
      if (currentPageIndex > 0) {
        currentPageIndex--;
        loadChapterPages();
      }
    }
  };

  // ============ EVENT LISTENERS ============
  function attachEventListeners() {
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (currentPage === 'reader') {
        if (e.key === 'ArrowRight') window.app.nextPage();
        if (e.key === 'ArrowLeft') window.app.prevPage();
      }
    });
  }

  // ============ START ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
