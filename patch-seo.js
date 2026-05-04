const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(
  '<title>AnimeCloud - аниме из базы Kodik</title>',
  '<title>Смотреть аниме онлайн бесплатно | AnimeCloud</title>'
);
html = html.replace(
  /<meta\s+id="og-title"\s+property="og:title"\s+content="[^"]*">/,
  '<meta id="og-title" property="og:title" content="Смотреть аниме онлайн бесплатно | AnimeCloud">'
);
html = html.replace(
  /<meta\s+id="twitter-title"\s+name="twitter:title"\s+content="[^"]*">/,
  '<meta id="twitter-title" name="twitter:title" content="Смотреть аниме онлайн бесплатно | AnimeCloud">'
);
const newDesc = "Смотреть аниме онлайн бесплатно в хорошем качестве с русской озвучкой. Огромный каталог аниме из базы Kodik, быстрый поиск и удобный плеер на AnimeCloud.";
html = html.replace(
  /content="AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером."/g,
  `content="${newDesc}"`
);
fs.writeFileSync('index.html', html);
console.log('Patched index.html');

// 2. Update app.js
let app = fs.readFileSync('app.js', 'utf8');
app = app.replace(
  /const DEFAULT_SEO_TITLE = "[^"]*";/,
  'const DEFAULT_SEO_TITLE = "Смотреть аниме онлайн бесплатно | AnimeCloud";'
);
app = app.replace(
  /const DEFAULT_SEO_DESCRIPTION = "[^"]*";/,
  `const DEFAULT_SEO_DESCRIPTION = "${newDesc}";`
);
app = app.replace(
  'title: "Каталог аниме с русской озвучкой - AnimeCloud"',
  'title: "Каталог аниме смотреть онлайн бесплатно - AnimeCloud"'
);
app = app.replace(
  'title: "Онгоинги аниме с русской озвучкой - AnimeCloud"',
  'title: "Онгоинги аниме смотреть онлайн бесплатно - AnimeCloud"'
);
fs.writeFileSync('app.js', app);
console.log('Patched app.js');

// 3. Update api/anime-page.js
let api = fs.readFileSync('api/anime-page.js', 'utf8');
api = api.replace(
  /const DEFAULT_DESCRIPTION =\s*"[^"]*";/,
  `const DEFAULT_DESCRIPTION = "${newDesc}";`
);
api = api.replace(
  /const description = truncateSeoText\([^)]*\);/g,
  `const description = truncateSeoText(
    \`Смотреть аниме \${release.title} \${release.year ? \`(\${release.year}) \` : ""}онлайн бесплатно все серии подряд в хорошем качестве. \${release.description || DEFAULT_DESCRIPTION} \${
      release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""
    } \${release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""}\`
  );`
);
api = api.replace(
  /const safeTitle = `\${meta.title} - смотреть онлайн с русской озвучкой \| AnimeCloud`;/g,
  'const safeTitle = `Смотреть аниме ${meta.title} онлайн все серии подряд бесплатно | AnimeCloud`;'
);
fs.writeFileSync('api/anime-page.js', api);
console.log('Patched api/anime-page.js');

// 4. Update app-seo.js
let seo = fs.readFileSync('app-seo.js', 'utf8');
seo = seo.replace(
  /const description = truncateSeoText\([^)]*\);/g,
  `const description = truncateSeoText(
        \`Смотреть аниме \${release.title} \${release.year ? \`(\${release.year}) \` : ""}онлайн бесплатно все серии подряд в хорошем качестве. \${release.description || defaultSeoDescription} \${release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""} \${
          release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""
        }\`
      );`
);
seo = seo.replace(
  /title: `\${release.title} - смотреть онлайн с русской озвучкой \| AnimeCloud`,/g,
  'title: `Смотреть аниме ${release.title} онлайн все серии подряд бесплатно | AnimeCloud`,'
);
fs.writeFileSync('app-seo.js', seo);
console.log('Patched app-seo.js');
