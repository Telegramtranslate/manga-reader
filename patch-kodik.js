const fs = require('fs');
let c = fs.readFileSync('api/_kodik.js', 'utf8');

const targetBlock = `  const freshAtValue =
    Date.parse(
      primary?.updated_at ||
        primary?.created_at ||
        primary?.material_data?.released_at ||
        primary?.material_data?.premiere_world ||
        ""
    ) || 0;

  const currentEpisode = Math.max(
    toNumber(primary?.material_data?.episodes_aired, 0),
    toNumber(primary?.episodes_count, 0),
    toNumber(primary?.last_episode, 0)
  );`;

const newBlock = `  let freshAtValue = 0;
  let currentEpisode = 0;
  let episodesTotal = 0;

  groupItems.forEach((item) => {
    const itemFresh = Date.parse(
      item?.updated_at ||
      item?.created_at ||
      item?.material_data?.released_at ||
      item?.material_data?.premiere_world ||
      ""
    ) || 0;
    if (itemFresh > freshAtValue) freshAtValue = itemFresh;

    const itemEp = Math.max(
      toNumber(item?.material_data?.episodes_aired, 0),
      toNumber(item?.episodes_count, 0),
      toNumber(item?.last_episode, 0)
    );
    if (itemEp > currentEpisode) currentEpisode = itemEp;
    
    const itemTotal = getEpisodesTotal(item);
    if (itemTotal > episodesTotal) episodesTotal = itemTotal;
  });`;

c = c.replace(targetBlock, newBlock);

// Also replace episodesTotal: getEpisodesTotal(primary), with episodesTotal,
c = c.replace('episodesTotal: getEpisodesTotal(primary),', 'episodesTotal,');

fs.writeFileSync('api/_kodik.js', c);
console.log('Patched api/_kodik.js');
