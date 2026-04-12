const fs = require("node:fs/promises");
const path = require("node:path");
const { decryptToken, uniqueStrings } = require("./_utils");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "content-stats.json");
const KODIK_BASE = "https://kodik-api.com";
const KODIK_PAGE_LIMIT = 100;
const KODIK_CONCURRENCY = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTokenCandidates() {
  return uniqueStrings([process.env.KODIK_TOKEN].map(decryptToken));
}

async function postKodik(payload) {
  const tokens = getTokenCandidates();
  if (!tokens.length) {
    throw new Error("KODIK_TOKEN environment variable is required to generate Kodik content stats");
  }

  let lastError = null;
  for (const token of tokens) {
    const body = new URLSearchParams();
    body.set("token", token);
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        body.set(key, String(value));
      }
    });

    try {
      const response = await fetch(`${KODIK_BASE}/list`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json, text/plain, */*",
          "user-agent": "AnimeCloud Kodik Stats Generator/1.0"
        },
        body: body.toString(),
        redirect: "follow",
        cache: "no-store"
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Kodik HTTP ${response.status}`);
      }
      const data = JSON.parse(text);
      if (data?.error) {
        throw new Error(String(data.error));
      }
      return data;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  throw lastError || new Error("Kodik request failed");
}

function payloadFromNextPage(nextPageUrl) {
  const url = new URL(nextPageUrl, KODIK_BASE);
  const payload = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "token") payload[key] = value;
  });
  return payload;
}

function pagePayload(basePayload, page) {
  return {
    ...basePayload,
    page: Math.max(1, Number(page || 1))
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      await worker(next);
    }
  });

  await Promise.all(workers);
}

async function detectDirectKodikPagingSupport(basePayload) {
  const firstPage = await postKodik(pagePayload(basePayload, 1));
  if (!firstPage?.next_page) {
    return { supported: true, firstPage };
  }

  try {
    const viaNext = await postKodik(payloadFromNextPage(firstPage.next_page));
    const directSecond = await postKodik(pagePayload(basePayload, 2));
    const viaNextKey = String(viaNext?.results?.[0]?.id || viaNext?.results?.[0]?.link || "");
    const directKey = String(directSecond?.results?.[0]?.id || directSecond?.results?.[0]?.link || "");

    return {
      supported: Boolean(viaNextKey && directKey && viaNextKey === directKey),
      firstPage
    };
  } catch {
    return { supported: false, firstPage };
  }
}

async function fetchKodikTotal(extraPayload = {}) {
  const basePayload = {
    limit: KODIK_PAGE_LIMIT,
    types: "anime,anime-serial",
    not_blocked_for_me: "true",
    ...extraPayload
  };

  const { supported, firstPage } = await detectDirectKodikPagingSupport(basePayload);
  const firstCount = Array.isArray(firstPage?.results) ? firstPage.results.length : 0;
  const total = Math.max(0, Number(firstPage?.total || firstCount || 0));

  if (supported || !firstPage?.next_page) {
    return total;
  }

  let counted = Array.isArray(firstPage?.results) ? firstPage.results.length : 0;
  let payload = firstPage?.next_page ? payloadFromNextPage(firstPage.next_page) : null;

  while (payload) {
    const response = await postKodik(payload);
    counted += Array.isArray(response?.results) ? response.results.length : 0;
    payload = response?.next_page ? payloadFromNextPage(response.next_page) : null;
  }

  return Math.max(total, counted);
}

async function fetchKodikCatalogTotalWithParallelProbe() {
  const basePayload = {
    limit: KODIK_PAGE_LIMIT,
    types: "anime,anime-serial",
    not_blocked_for_me: "true"
  };

  const { supported, firstPage } = await detectDirectKodikPagingSupport(basePayload);
  const initialTotal = Math.max(
    Number(firstPage?.total || 0),
    Array.isArray(firstPage?.results) ? firstPage.results.length : 0
  );
  const totalPages = Math.max(1, Math.ceil(initialTotal / KODIK_PAGE_LIMIT));

  if (!supported || totalPages <= 1) {
    return Math.max(initialTotal, await fetchKodikTotal());
  }

  let counted = Array.isArray(firstPage?.results) ? firstPage.results.length : 0;
  const pages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  await runWithConcurrency(pages, KODIK_CONCURRENCY, async (page) => {
    const response = await postKodik(pagePayload(basePayload, page));
    counted += Array.isArray(response?.results) ? response.results.length : 0;
  });

  return Math.max(initialTotal, counted);
}

async function main() {
  console.log("Collecting Kodik content stats...");
  const [catalogTotal, ongoingTotal] = await Promise.all([
    fetchKodikCatalogTotalWithParallelProbe(),
    fetchKodikTotal({ anime_status: "ongoing" })
  ]);

  const stats = {
    generatedAt: new Date().toISOString(),
    latestTotal: catalogTotal,
    catalogTotal,
    ongoingTotal,
    topTotal: catalogTotal,
    sources: {
      kodikCatalog: catalogTotal,
      kodikOngoing: ongoingTotal
    }
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  console.log(`Saved stats to ${OUTPUT_PATH}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
