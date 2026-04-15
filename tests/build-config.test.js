const test = require("node:test");
const assert = require("node:assert/strict");
const { isProductionLikeBuild, getMissingRequiredBuildEnv } = require("../scripts/build");
const { resolveSitemapSiteUrl } = require("../scripts/generate-sitemap-anime");

test("production build requires KODIK_TOKEN and SITE_URL", () => {
  assert.deepEqual(
    getMissingRequiredBuildEnv({ VERCEL_ENV: "production", KODIK_TOKEN: "", SITE_URL: "" }),
    ["KODIK_TOKEN", "SITE_URL"]
  );
  assert.equal(isProductionLikeBuild({ NODE_ENV: "production" }), true);
  assert.equal(isProductionLikeBuild({ NODE_ENV: "development" }), false);
});

test("resolveSitemapSiteUrl trims trailing slash and rejects empty input", () => {
  assert.equal(resolveSitemapSiteUrl({ SITE_URL: "https://anime.example/" }), "https://anime.example");
  assert.throws(() => resolveSitemapSiteUrl({ SITE_URL: "" }), /SITE_URL/);
});
