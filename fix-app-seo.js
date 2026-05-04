const fs = require('fs');
let seo = fs.readFileSync('app-seo.js', 'utf8');

const targetDesc = `      const description = truncateSeoText(
        \`\${release.description || defaultSeoDescription} \${release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""} \${
          release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""
        }\`
      );`;

const newDesc = `      const description = truncateSeoText(
        \`Смотреть аниме \${release.title} \${release.year ? \`(\${release.year}) \` : ""}онлайн бесплатно все серии подряд в хорошем качестве. \${release.description || defaultSeoDescription} \${release.genres?.length ? \`Жанры: \${release.genres.join(", ")}.\` : ""} \${
          release.episodesTotal ? \`Эпизодов: \${release.episodesTotal}.\` : ""
        }\`
      );`;

seo = seo.replace(targetDesc, newDesc);
fs.writeFileSync('app-seo.js', seo);
console.log('Fixed app-seo.js description');
