const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertAppShellMarkup,
  collectInlineScriptHashes,
  collectRewriteSources,
  findInlineScriptsMissingFromCsp,
  findMissingLocalAssets,
  isRouteLikePath,
  rewriteSourceMatches
} = require("../scripts/validate-index");

const ROOT = path.join(__dirname, "..");
const readRootFile = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const fileExistsInRoot = (pathname) => fs.existsSync(path.join(ROOT, pathname.replace(/^\/+/, "")));

test("index.html keeps the static app shell markup", () => {
  const html = readRootFile("index.html");
  assert.doesNotThrow(() => assertAppShellMarkup(html, "index.html"));
});

test("shell-only index.html without app markup is rejected", () => {
  const stub = [
    "<!doctype html>",
    '<html lang="ru"><head><title>AnimeCloud</title></head>',
    '<body><div id="root"></div><noscript>JavaScript required for AnimeCloud</noscript></body></html>'
  ].join("");
  assert.throws(() => assertAppShellMarkup(stub, "index.html"), /missing the static app shell markup/);
});

test("vercel.json rewrites are treated as routes, not as assets", () => {
  const rewriteSources = collectRewriteSources(readRootFile("vercel.json"));
  assert.ok(rewriteSources.includes("/catalog"));
  assert.equal(rewriteSourceMatches("/anime/:path*", "/anime/one-piece"), true);
  assert.equal(rewriteSourceMatches("/anime/:path*", "/anime"), false);
  assert.equal(isRouteLikePath("/catalog", rewriteSources), true);
  assert.equal(isRouteLikePath("/anime/one-piece", rewriteSources), true);
  assert.equal(isRouteLikePath("/sitemap.xml", rewriteSources), true);
  assert.equal(isRouteLikePath("/style-perf.css", rewriteSources), false);
});

test("every asset referenced by index.html exists in the project", () => {
  const missing = findMissingLocalAssets(readRootFile("index.html"), {
    rewriteSources: collectRewriteSources(readRootFile("vercel.json")),
    fileExists: fileExistsInRoot
  });
  assert.deepEqual(missing, []);
});

test("assets that the build never emits are reported", () => {
  const html = '<html><head><link rel="stylesheet" href="/style-perf.css"><script src="/analytics.min.js" defer></script></head><body></body></html>';
  const missing = findMissingLocalAssets(html, {
    rewriteSources: [],
    fileExists: (pathname) => pathname === "/analytics.min.js"
  });
  assert.deepEqual(missing, ["/style-perf.css"]);
});

test("inline scripts in index.html are covered by the CSP in vercel.json", () => {
  const html = readRootFile("index.html");
  const vercelConfig = readRootFile("vercel.json");
  assert.ok(collectInlineScriptHashes(html).length >= 1);
  assert.deepEqual(findInlineScriptsMissingFromCsp(html, vercelConfig), []);
});

test("a changed inline script without a matching CSP hash is reported", () => {
  const html = '<html><head><script>window.ACPerf = {};</script></head><body></body></html>';
  const vercelConfig =
    '{"headers":[{"source":"/(.*)","headers":[{"key":"Content-Security-Policy",' +
    '"value":"default-src \'self\'; script-src \'self\' \'sha256-other=\';"}]}]}';

  const missing = findInlineScriptsMissingFromCsp(html, vercelConfig);
  assert.equal(missing.length, 1);
  assert.match(missing[0].hash, /^sha256-[A-Za-z0-9+/=]+$/);
});
