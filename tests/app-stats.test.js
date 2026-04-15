const test = require("node:test");
const assert = require("node:assert/strict");
const { applyContentStats, getHomeStats } = require("../app-stats");

test("applyContentStats merges totals with one consistent source of truth", () => {
  const state = {
    latestTotal: 0,
    catalogMergedTotal: 0,
    ongoingMergedTotal: 0,
    topMergedTotal: 0,
    catalogTotal: 0,
    ongoingTotal: 0,
    topTotal: 0,
    catalogTotalPages: 0,
    ongoingTotalPages: 0,
    topTotalPages: 0
  };

  applyContentStats(
    state,
    {
      latestTotal: 8723,
      catalogTotal: 8723,
      ongoingTotal: 111,
      topTotal: 8723
    },
    { gridPageSize: 24 }
  );

  assert.equal(state.latestTotal, 8723);
  assert.equal(state.catalogTotal, 8723);
  assert.equal(state.ongoingTotal, 111);
  assert.equal(state.topTotal, 8723);
  assert.equal(state.catalogTotalPages, Math.ceil(8723 / 24));
});

test("getHomeStats falls back to loaded state collections when stats are absent", () => {
  const stats = getHomeStats({
    latest: [1, 2, 3],
    recommended: [],
    popular: [1, 2],
    catalogItems: [1],
    ongoingItems: [1, 2],
    topItems: [1, 2, 3, 4]
  });

  assert.deepEqual(stats, {
    latestTotal: 3,
    catalogTotal: 1,
    ongoingTotal: 2,
    topTotal: 4
  });
});
