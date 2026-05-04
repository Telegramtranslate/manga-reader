const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

c = c.replace(
  'const payload = await fetchKodikDiscover("ongoing", 1, 72, { ttl: 60000 });',
  'const payload = await fetchKodikDiscover("latest", 1, 72, { ttl: 60000 });'
);

const oldRender = `  const groups = new Map();
  state.scheduleItems
    .slice()
    .sort((left, right) => {
      const dayDiff = (left.publishDayValue || 0) - (right.publishDayValue || 0);
      return dayDiff !== 0 ? dayDiff : left.title.localeCompare(right.title, "ru");
    })
    .forEach((release) => {
      const key = release.publishDay || "Сейчас доступно в Kodik";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(release);
    });`;

const newRender = `  const groups = new Map();
  state.scheduleItems
    .slice()
    .sort((left, right) => {
      const timeDiff = (right.sortFreshAt || 0) - (left.sortFreshAt || 0);
      return timeDiff !== 0 ? timeDiff : left.title.localeCompare(right.title, "ru");
    })
    .forEach((release) => {
      const date = new Date(release.sortFreshAt || Date.now());
      const now = new Date();
      let key = "";
      if (date.toDateString() === now.toDateString()) {
        key = "Сегодня";
      } else {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
          key = "Вчера";
        } else {
          key = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
        }
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(release);
    });`;

if (c.includes(oldRender)) {
  c = c.replace(oldRender, newRender);
  fs.writeFileSync('app.js', c);
  console.log('Successfully patched schedule rendering.');
} else {
  console.log('Could not find old render block.');
}
