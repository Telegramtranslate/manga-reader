const CACHE_VERSION = "__BUILD_HASH__";
const SHELL_CACHE = `animecloud-shell-${CACHE_VERSION}`;
const API_CACHE = `animecloud-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `animecloud-images-${CACHE_VERSION}`;
const IMAGE_CACHE_LIMIT = 400;

const CRITICAL_SHELL = [
 "/", "/index.html", "/style.css", "/style-overrides.css", "/style-perf.css",
 "/api/runtime-config.js", "/app-constants.min.js", "/app-api-client.min.js", "/app.min.js"
];

const DEFERRED_SHELL = [
 "/app-player-utils.min.js", "/app-seo.min.js", "/app-stats.min.js",
 "/watch-features.min.js", "/manifest.webmanifest",
 "/mc-icon-192.png", "/mc-icon-512.png"
];

function canCache(response) {
 return response && (response.ok || response.type === "opaque");
}

async function precache(cacheName, urls) {
 const cache = await caches.open(cacheName);
 await Promise.allSettled(urls.map(async (url) => {
 const response = await fetch(url, { cache: "reload" });
 if (!canCache(response)) throw new Error(url);
 await cache.put(url, response.clone());
 }));
}

async function trimCache(cacheName, limit) {
 const cache = await caches.open(cacheName);
 const keys = await cache.keys();
 if (keys.length <= limit) return;
 await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

function isApiRequest(url) {
 return url.origin === self.location.origin && /^\/api\/kodik(?:\/|$)/.test(url.pathname);
}
function isMediaStreamRequest(url) {
 return url.origin === self.location.origin && /^\/api\/anilibria-stream(?:\/|$)/.test(url.pathname);
}
function isImageProxy(url) {
 return url.origin === self.location.origin && /^\/api\/anilibria-image(?:\/|$)/.test(url.pathname);
}
function isManifestRequest(url) {
 return url.origin === self.location.origin && url.pathname === "/manifest.webmanifest";
}
function isRuntimeConfigRequest(url) {
 return url.origin === self.location.origin && url.pathname === "/api/runtime-config.js";
}
function isIconRequest(url) {
 return url.origin === self.location.origin && url.pathname.includes("/mc-icon-");
}
function isScheduleRequest(url) {
 return url.origin === self.location.origin && url.pathname === "/api/kodik" &&
 url.searchParams.get("action") === "discover" && url.searchParams.get("mode") === "ongoing";
}
function isPosterRequest(request, url) {
 return request.destination === "image" && url.origin === self.location.origin;
}
function isShellAsset(url) {
 return url.origin === self.location.origin &&
 !url.pathname.startsWith("/api/") &&
 !url.pathname.includes("/videos/media/") &&
 (/\.(css|js|png|svg|webmanifest)$/i.test(url.pathname) ||
 url.pathname === "/" || url.pathname.endsWith("/index.html"));
}
function isImmutableAsset(url) {
 return url.searchParams.has("v") && /\.(js|css|png|svg|webp|woff2)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request, cacheName, cacheKey = request) {
 const cache = await caches.open(cacheName);
 const cached = await cache.match(cacheKey);
 const networkPromise = fetch(request).then((response) => {
 if (canCache(response)) cache.put(cacheKey, response.clone()).catch(() => {});
 return response;
 }).catch(() => null);
 if (cached) { networkPromise.catch(() => {}); return cached; }
 const network = await networkPromise;
 if (network) return network;
 const shellFallback = await caches.match("/index.html");
 return shellFallback || new Response("Offline", { status: 503, statusText: "Offline" });
}

async function cacheFirst(request, cacheName, cacheKey = request) {
 const cache = await caches.open(cacheName);
 const cached = await cache.match(cacheKey);
 if (cached) return cached;
 const response = await fetch(request);
 if (canCache(response)) cache.put(cacheKey, response.clone()).catch(() => {});
 return response;
}

async function networkFirst(request, cacheName, cacheKey = request) {
 const cache = await caches.open(cacheName);
 try {
 const response = await fetch(request);
 if (canCache(response)) cache.put(cacheKey, response.clone()).catch(() => {});
 return response;
 } catch {
 const cached = await cache.match(cacheKey);
 if (cached) return cached;
 const shellFallback = await caches.match("/index.html");
 return shellFallback || new Response("Offline", { status: 503, statusText: "Offline" });
 }
}

self.addEventListener("install", (event) => {
 event.waitUntil(precache(SHELL_CACHE, CRITICAL_SHELL));
 self.skipWaiting();
});

self.addEventListener("activate", (event) => {
 event.waitUntil((async () => {
 if (self.registration.navigationPreload) {
 await self.registration.navigationPreload.enable().catch(() => {});
 }
 const keys = await caches.keys();
 await Promise.all(keys
 .filter((key) => [SHELL_CACHE, API_CACHE, IMAGE_CACHE].includes(key))
 .map((key) => caches.delete(key)));
 await self.clients.claim();
 precache(SHELL_CACHE, DEFERRED_SHELL).catch(() => {});
 })());
});

self.addEventListener("fetch", (event) => {
 if (event.request.method !== "GET") return;
 const url = new URL(event.request.url);

 if (event.request.mode === "navigate") {
 event.respondWith((async () => {
 const preload = await event.preloadResponse;
 if (preload) {
 const clone = preload.clone();
 caches.open(SHELL_CACHE).then((c) => c.put("/index.html", clone).catch(() => {}));
 return preload;
 }
 try {
 const response = await fetch(event.request);
 if (canCache(response)) {
 const clone = response.clone();
 caches.open(SHELL_CACHE).then((c) => c.put("/index.html", clone).catch(() => {}));
 }
 return response;
 } catch {
 return (await caches.match("/index.html")) || new Response("Offline", { status: 503 });
 }
 })());
 return;
 }

 if (isApiRequest(url)) {
 event.respondWith(isScheduleRequest(url)
 ? networkFirst(event.request, API_CACHE)
 : staleWhileRevalidate(event.request, API_CACHE));
 return;
 }
 if (isMediaStreamRequest(url)) { event.respondWith(fetch(event.request)); return; }
 if (isImageProxy(url) || isPosterRequest(event.request, url)) {
 event.respondWith(cacheFirst(event.request, IMAGE_CACHE)
 .finally(() => trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT).catch(() => {})));
 return;
 }
 if (isManifestRequest(url) || isIconRequest(url)) {
 event.respondWith(cacheFirst(event.request, SHELL_CACHE)); return;
 }
 if (isRuntimeConfigRequest(url)) {
 event.respondWith(networkFirst(event.request, SHELL_CACHE)); return;
 }
 if (isImmutableAsset(url)) {
 event.respondWith(cacheFirst(event.request, SHELL_CACHE)); return;
 }
 if (!isShellAsset(url)) return;
 event.respondWith(staleWhileRevalidate(event.request, SHELL_CACHE));
});

self.addEventListener("sync", (event) => {
 if (event.tag !== "animecloud-sync") return;
 event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true })
 .then((clients) => Promise.all(clients.map((c) => c.postMessage({ type: "animecloud:flush-sync" })))));
});

self.addEventListener("periodicsync", (event) => {
 if (event.tag !== "animecloud-schedule-refresh") return;
 event.waitUntil(Promise.all([
 fetch("/api/kodik?action=discover&mode=ongoing&page=1&limit=24", { cache: "no-store" }).catch(() => null),
 self.clients.matchAll({ type: "window", includeUncontrolled: true })
 .then((clients) => Promise.all(clients.map((c) => c.postMessage({ type: "animecloud:warm-schedule" }))))
 ]));
});

self.addEventListener("message", (event) => {
 if (event.data?.type === "animecloud:skip-waiting") self.skipWaiting();
});
