const fs = require('fs');
let api = fs.readFileSync('api/anime-page.js', 'utf8');

const targetDesc = `  const description = truncateSeoText(
    \`\${release.description || DEFAULT_DESCRIPTION} \${
      release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""
    } \${release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""}\`
  );`;

const newDesc = `  const description = truncateSeoText(
    \`Смотреть аниме \${release.title} \${release.year ? \`(\${release.year}) \` : ""}онлайн бесплатно все серии подряд в хорошем качестве. \${release.description || DEFAULT_DESCRIPTION} \${
      release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""
    } \${release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""}\`
  );`;

api = api.replace(targetDesc, newDesc);
fs.writeFileSync('api/anime-page.js', api);
console.log('Fixed api/anime-page.js description');
