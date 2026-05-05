(function (root, factory) {
  const api = factory(root);
  root.ANIMECLOUD_SEO = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  function truncateSeoText(text, max = 170) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
  }

  function createSeoRuntime(options = {}) {
    const els = options.els || {};
    const siteUrl = options.siteUrl || ((path = "/") => String(path || "/"));
    const getViewPath = options.getViewPath || ((view) => (view === "home" ? "/" : `/${view}`));
    const getAnimePath = options.getAnimePath || ((alias) => `/anime/${encodeURIComponent(alias)}`);
    const defaultSeoTitle = options.defaultSeoTitle || "AnimeCloud";
    const defaultSeoDescription = options.defaultSeoDescription || "AnimeCloud";
    const defaultImagePath = options.defaultImagePath || "/mc-icon-512.png?v=5";
    const viewSeo = options.viewSeo || {};

    function buildStructuredData(page) {
      return JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "AnimeCloud",
            url: siteUrl("/"),
            inLanguage: "ru",
            description: defaultSeoDescription,
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteUrl("/search")}?q={search_term_string}`
              },
              "query-input": "required name=search_term_string"
            }
          },
          page
        ]
      });
    }

    function buildReleaseStructuredData(release, description, path) {
      const canonical = siteUrl(path);
      const graph = [
        {
          "@type": "TVSeries",
          name: release.title,
          url: canonical,
          description,
          image: release.poster || siteUrl(defaultImagePath),
          genre: release.genres || [],
          inLanguage: "ru",
          numberOfEpisodes: release.episodesTotal || undefined,
          dateCreated: /^\d{4}$/.test(String(release.year || "")) ? String(release.year) : undefined,
          isPartOf: {
            "@type": "WebSite",
            name: "AnimeCloud",
            url: siteUrl("/")
          }
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Каталог", item: siteUrl("/catalog") },
            { "@type": "ListItem", position: 3, name: release.title, item: canonical }
          ]
        }
      ];

      if (release.externalPlayer || (Array.isArray(release.sourceItems) && release.sourceItems.length)) {
        graph.push({
          "@type": "VideoObject",
          name: `${release.title} — смотреть онлайн`,
          description,
          thumbnailUrl: [release.poster || siteUrl(defaultImagePath)],
          embedUrl: release.externalPlayer || undefined,
          uploadDate: /^\d{4}$/.test(String(release.year || "")) ? `${String(release.year)}-01-01T00:00:00Z` : undefined,
          isFamilyFriendly: !/\b(18\+|r|nc-17)\b/i.test(String(release.age || "")),
          potentialAction: { "@type": "WatchAction", target: canonical }
        });
      }

      return JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "AnimeCloud",
            url: siteUrl("/"),
            inLanguage: "ru",
            description: defaultSeoDescription,
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteUrl("/search")}?q={search_term_string}`
              },
              "query-input": "required name=search_term_string"
            }
          },
          ...graph
        ]
      });
    }

    function applySeo({ title, description, path, image, type = "website", structuredData, robots }) {
      const canonical = siteUrl(path || "/");
      if (typeof document !== "undefined") {
        document.title = title || defaultSeoTitle;
      }
      if (els.metaDescription) els.metaDescription.content = description || defaultSeoDescription;
      if (els.metaRobots) {
        els.metaRobots.content = robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
      }
      if (els.canonicalLink) els.canonicalLink.href = canonical;
      if (els.ogType) els.ogType.content = type;
      if (els.ogTitle) els.ogTitle.content = title || defaultSeoTitle;
      if (els.ogDescription) els.ogDescription.content = description || defaultSeoDescription;
      if (els.ogUrl) els.ogUrl.content = canonical;
      if (els.ogImage) els.ogImage.content = image || siteUrl(defaultImagePath);
      if (els.twitterTitle) els.twitterTitle.content = title || defaultSeoTitle;
      if (els.twitterDescription) els.twitterDescription.content = description || defaultSeoDescription;
      if (els.twitterImage) els.twitterImage.content = image || siteUrl(defaultImagePath);
      if (els.structuredData) {
        els.structuredData.textContent =
          structuredData ||
          buildStructuredData({
            "@type": "CollectionPage",
            name: title || defaultSeoTitle,
            url: canonical,
            inLanguage: "ru",
            description: description || defaultSeoDescription,
            isPartOf: {
              "@type": "WebSite",
              name: "AnimeCloud",
              url: siteUrl("/")
            }
          });
      }
    }

    function updateViewSeo(view) {
      const seo = viewSeo[view] || viewSeo.home || { title: defaultSeoTitle, description: defaultSeoDescription };
      applySeo({
        title: seo.title,
        description: seo.description,
        path: getViewPath(view),
        robots: seo.robots,
        structuredData: buildStructuredData({
          "@type": "CollectionPage",
          name: seo.title,
          url: siteUrl(getViewPath(view)),
          inLanguage: "ru",
          description: seo.description,
          isPartOf: {
            "@type": "WebSite",
            name: "AnimeCloud",
            url: siteUrl("/")
          }
        })
      });
    }

    function updateReleaseSeo(release) {
      const description = truncateSeoText(
        `Смотреть аниме ${release.title} ${release.year ? `(${release.year}) ` : ""}онлайн бесплатно все серии подряд в хорошем качестве. ${release.description || defaultSeoDescription} ${release.genres?.length ? `Жанры: ${release.genres.join(", ")}.` : ""} ${
          release.episodesTotal ? `Эпизодов: ${release.episodesTotal}.` : ""
        }`
      );
      const path = getAnimePath(release.alias);
      applySeo({
        title: `Смотреть аниме ${release.title} онлайн все серии подряд бесплатно | AnimeCloud`,
        description,
        path,
        image: release.poster || siteUrl(defaultImagePath),
        type: "video.other",
        structuredData: buildReleaseStructuredData(release, description, path)
      });
    }

    return {
      truncateSeoText,
      buildStructuredData,
      buildReleaseStructuredData,
      applySeo,
      updateViewSeo,
      updateReleaseSeo
    };
  }

  return {
    truncateSeoText,
    createSeoRuntime
  };
});
