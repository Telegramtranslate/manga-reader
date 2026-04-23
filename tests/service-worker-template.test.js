const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("service worker source keeps build placeholder and kodik-only api matcher", () => {
  const source = fs.readFileSync("C:/manga-reader/sw.js", "utf8");
  assert.match(source, /const CACHE_VERSION = "__BUILD_HASH__";/);
  assert.match(source, /\^\\\/api\\\/kodik\(\?:\\\/\|\$\)/);
  assert.doesNotMatch(source, /url\.pathname\.startsWith\("\/api\/anilibria"\)/);
  assert.match(source, /"\/app-api-client\.min\.js"/);
  assert.match(source, /"\/app-seo\.min\.js"/);
  assert.match(source, /"\/app-stats\.min\.js"/);
});

test("index source no longer contains mojibake markers", () => {
  const source = fs.readFileSync("C:/manga-reader/index.html", "utf8");
  assert.ok(source.includes("\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0440\u0435\u043B\u0438\u0437\u044B"));
  assert.ok(source.includes("\u041A\u0430\u0442\u0430\u043B\u043E\u0433 AnimeCloud"));
  assert.doesNotMatch(source, /Рџ|РЎ|вЂ|Ð|Ñ|�|\?{4,}/);
  assert.doesNotMatch(source, /source-wrap|dub-box|catalog-filters-toggle/);
});
