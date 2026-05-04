const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Normalize line endings to \n for the search string
const normalizedContent = content.replace(/\r\n/g, '\n');

const searchStr = `  <meta
    id="twitter-description"
    name="twitter:description"
    content="AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером."
      "url": "/",`;

const replaceStr = `  <meta
    id="twitter-description"
    name="twitter:description"
    content="AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером."
  >
  <meta id="twitter-image" name="twitter:image" content="/mc-icon-512.png">
  <meta property="og:locale" content="ru_RU">
  <meta
    id="meta-description"
    name="description"
    content="AnimeCloud - каталог аниме из базы Kodik с русской озвучкой, быстрым мобильным интерфейсом, подборками и встроенным плеером."
  >
  <title>AnimeCloud - аниме из базы Kodik</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/mc-icon-192.png" sizes="192x192">
  <link rel="apple-touch-icon" href="/mc-icon-192.png">
  <link rel="preconnect" href="https://kodik-api.com" crossorigin>
  <link rel="preconnect" href="https://kodikplayer.com" crossorigin>
  <link rel="preconnect" href="https://apis.google.com" crossorigin>
  <link rel="preload" href="/api/kodik?action=discover&mode=latest&page=1&limit=18" as="fetch" crossorigin="anonymous">
  <link rel="preload" href="/style.css" as="style">
  <link rel="preload" href="/app.min.js" as="script">
  <link rel="stylesheet" href="/style.css">
  <script id="structured-data" type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "name": "AnimeCloud",
      "url": "/",`;

if (normalizedContent.includes(searchStr)) {
  const fixedContent = normalizedContent.replace(searchStr, replaceStr);
  fs.writeFileSync('index.html', fixedContent);
  console.log('Fixed index.html!');
} else {
  console.log('Search string not found!');
}
