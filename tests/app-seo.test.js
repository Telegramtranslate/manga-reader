const test = require("node:test");
const assert = require("node:assert/strict");
const { truncateSeoText, createSeoRuntime } = require("../app-seo");

test("truncateSeoText keeps short text and trims long text with ellipsis", () => {
  assert.equal(truncateSeoText("Короткий текст", 100), "Короткий текст");
  assert.match(truncateSeoText("a".repeat(220), 50), /…$/);
});

test("release structured data contains breadcrumbs and video object when player exists", () => {
  const seo = createSeoRuntime({
    siteUrl: (path = "/") => new URL(path, "https://anime.example").toString(),
    getAnimePath: (alias) => `/anime/${alias}`,
    defaultSeoDescription: "Описание"
  });

  const payload = JSON.parse(
    seo.buildReleaseStructuredData(
      {
        alias: "kodik-shikimori-20",
        title: "Наруто",
        poster: "https://anime.example/poster.jpg",
        genres: ["Экшен"],
        sourceItems: [{ id: "main" }],
        externalPlayer: "https://kodikplayer.com/player",
        episodesTotal: 220,
        year: 2002
      },
      "Описание релиза",
      "/anime/kodik-shikimori-20"
    )
  );

  const graphTypes = payload["@graph"].map((item) => item["@type"]);
  assert.ok(graphTypes.includes("BreadcrumbList"));
  assert.ok(graphTypes.includes("VideoObject"));
});
