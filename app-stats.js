(function (root, factory) {
  const api = factory(root);
  root.ANIMECLOUD_STATS = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  function safeNumber(value) {
    const next = Number(value || 0);
    return Number.isFinite(next) && next >= 0 ? next : 0;
  }

  function applyContentStats(state, stats, options = {}) {
    const pageSize = Math.max(1, Number(options.gridPageSize || 24));
    state.latestTotal = Math.max(safeNumber(stats?.latestTotal), safeNumber(state.latestTotal));
    state.catalogMergedTotal = Math.max(safeNumber(stats?.catalogTotal), safeNumber(state.catalogMergedTotal));
    state.ongoingMergedTotal = Math.max(safeNumber(stats?.ongoingTotal), safeNumber(state.ongoingMergedTotal));
    state.topMergedTotal = Math.max(safeNumber(stats?.topTotal), safeNumber(state.topMergedTotal));
    state.catalogTotal = Math.max(safeNumber(state.catalogMergedTotal), safeNumber(state.catalogTotal));
    state.ongoingTotal = Math.max(safeNumber(state.ongoingMergedTotal), safeNumber(state.ongoingTotal));
    state.topTotal = Math.max(safeNumber(state.topMergedTotal), safeNumber(state.topTotal));
    state.catalogTotalPages = Math.max(safeNumber(state.catalogTotalPages), Math.ceil(safeNumber(state.catalogTotal) / pageSize));
    state.ongoingTotalPages = Math.max(safeNumber(state.ongoingTotalPages), Math.ceil(safeNumber(state.ongoingTotal) / pageSize));
    state.topTotalPages = Math.max(safeNumber(state.topTotalPages), Math.ceil(safeNumber(state.topTotal) / pageSize));
    return state;
  }

  function getHomeStats(state) {
    return {
      latestTotal: safeNumber(state.latestTotal || state.latest.length || state.recommended.length || state.popular.length),
      catalogTotal: safeNumber(state.catalogMergedTotal || state.catalogTotal || state.catalogItems.length),
      ongoingTotal: safeNumber(state.ongoingMergedTotal || state.ongoingTotal || state.ongoingItems.length),
      topTotal: safeNumber(state.topMergedTotal || state.topTotal || state.topItems.length || state.popular.length)
    };
  }

  return {
    applyContentStats,
    getHomeStats
  };
});
