const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAlias, buildIdentity } = require("../api/_kodik");

test("buildIdentity prefers stable external ids", () => {
  assert.equal(buildIdentity({ shikimori_id: "20", id: "serial-6647" }), "shikimori:20");
  assert.equal(buildIdentity({ kinopoisk_id: "12345" }), "kinopoisk:12345");
  assert.equal(buildIdentity({ imdb_id: "tt0409591" }), "imdb:tt0409591");
  assert.equal(buildIdentity({ id: "serial-6647" }), "kodik:serial-6647");
});

test("buildIdentity falls back to normalized title and year", () => {
  assert.equal(buildIdentity({ title: "Наруто [ТВ-1]", year: 2002 }), "title:наруто тв 1:2002");
});

test("buildAlias produces stable url-safe aliases", () => {
  assert.equal(buildAlias("shikimori:20"), "kodik-shikimori-20");
});
