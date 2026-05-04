const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');
const targets = [
  'setStaticText("#catalog-summary", STATIC_UI_TEXT.catalog.summary);',
  'setStaticText("#ongoing-summary", STATIC_UI_TEXT.ongoing.summary);',
  'setStaticText("#top-summary", STATIC_UI_TEXT.top.summary);',
  'setStaticText("#schedule-summary", STATIC_UI_TEXT.schedule.summary);',
  'setStaticText("#search-summary", STATIC_UI_TEXT.search.summary);',
  'setStaticText("#profile-summary", STATIC_UI_TEXT.profile.summary);'
];
const lines = c.split('\n');
const newLines = lines.filter(l => !targets.some(t => l.includes(t)));
fs.writeFileSync('app.js', newLines.join('\n'));
console.log('Removed', lines.length - newLines.length, 'lines.');
