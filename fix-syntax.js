const fs = require('fs');
let c = fs.readFileSync('api/_kodik.js', 'utf8');

c = c.replace(
`        primary?.material_data?.premiere_world ||
        ""
  const currentEpisode = Math.max(`,
`        primary?.material_data?.premiere_world ||
        ""
    ) || 0;

  const currentEpisode = Math.max(`
);

fs.writeFileSync('api/_kodik.js', c);
console.log('Fixed syntax error');
