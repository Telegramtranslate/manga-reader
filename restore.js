const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');
const lines = c.split(/\r?\n/);
const toInsert = `    } else {
      if (els.catalogSummary) {
        els.catalogSummary.textContent = \`\${formatNumber(
          state.catalogMergedTotal || state.catalogTotal
        )} тайтлов в полной базе Kodik. Страница \${state.catalogPage} из \${
          state.catalogTotalPages || 1
        }.\`;
      }
      updateGrid(els.catalogGrid, state.catalogItems, "Каталог пуст.");
    }
    syncCatalogPager();
    updateStats();
  } catch (error) {
    if (state.catalogRequestToken !== requestToken) return;
    console.error("loadCatalog failed", error);
    syncCatalogPager();
    const message = getKodikUnavailableMessage(error, "Каталог временно недоступен.");
    if (els.catalogSummary) els.catalogSummary.textContent = message;
    replaceWithErrorState(els.catalogGrid, message, () => loadCatalog({ reset: true }).catch(console.error));
    throw error;
  } finally {
    if (state.catalogRequestToken === requestToken) {
      state.catalogLoading = false;
      syncCatalogPager();
    }
  }
}

async function loadOngoing(options = {}) {
  await loadReferences();
  const reset = Boolean(options.reset);
  const nextPage = reset ? 1 : state.ongoingPage + 1;
  const existingAliases = new Set(state.ongoingItems.map((release) => release.alias).filter(Boolean));
  const previousCount = reset ? 0 : state.ongoingItems.length;
  const mergedOngoingTotal = Math.max(Number(state.ongoingMergedTotal || 0), Number(state.ongoingTotal || 0));

  if (reset) {
    state.ongoingItems = [];
    state.ongoingPage = 0;
    state.ongoingTotal = mergedOngoingTotal;`;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("refreshCatalogView(pagination);") && lines[i+1].includes("state.ongoingTotalPages = 0;")) {
    lines.splice(i + 1, 0, toInsert);
    fs.writeFileSync('app.js', lines.join('\n'));
    console.log('Restored successfully.');
    process.exit(0);
  }
}
console.log('Not found');
