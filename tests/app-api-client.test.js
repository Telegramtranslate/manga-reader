const test = require("node:test");
const assert = require("node:assert/strict");
const { createApiClient, normalizePath, routeFromLocation } = require("../app-api-client");

test("normalizePath keeps root stable and trims duplicate slashes", () => {
  assert.equal(normalizePath("catalog"), "/catalog");
  assert.equal(normalizePath("//anime//naruto///"), "/anime/naruto");
  assert.equal(normalizePath("/"), "/");
});

test("routeFromLocation resolves catalog, search and anime views", () => {
  assert.deepEqual(routeFromLocation({ pathname: "/catalog", search: "", hash: "" }), {
    type: "view",
    view: "catalog",
    legacy: false,
    query: ""
  });
  assert.deepEqual(routeFromLocation({ pathname: "/search", search: "?q=naruto", hash: "" }), {
    type: "view",
    view: "search",
    legacy: false,
    query: "naruto"
  });
  assert.deepEqual(routeFromLocation({ pathname: "/anime/kodik-shikimori-20", search: "", hash: "" }), {
    type: "anime",
    alias: "kodik-shikimori-20",
    legacy: false
  });
});

test("fetchJson reuses cache for repeated calls", async () => {
  let calls = 0;
  const client = createApiClient({
    location: { origin: "https://example.com", pathname: "/", search: "", hash: "" },
    history: {},
    responseCache: new Map(),
    requestCache: new Map(),
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, calls })
      };
    }
  });

  const first = await client.fetchJson("/api/kodik", { action: "discover" }, { ttl: 60000 });
  const second = await client.fetchJson("/api/kodik", { action: "discover" }, { ttl: 60000 });

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});
