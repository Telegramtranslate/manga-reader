const CACHE_NAME = "mangacloud-shell-v13";
const APP_SHELL = [
  "./",
  "./index.html",
  "./catalog-provider.js",
  "./catalog-provider.js?v=5",
  "./catalog-fallback.json",
  "./catalog-fallback.json?v=1",
  "./manifest.webmanifest",
  "./manifest.webmanifest?v=4",
  "./robots.txt",
  "./mc-icon-192.png",
  "./mc-icon-192.png?v=4",
  "./mc-icon-512.png",
  "./mc-icon-512.png?v=4",
  "./mc-icon-192.svg",
  "./mc-icon-512.svg"
];

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackUrl || request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(fallbackUrl || request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return caches.match("./index.html");
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  if (url.origin === self.location.origin && url.pathname === "/api/mangadex" && url.searchParams.get("endpoint")) {
    const endpoint = url.searchParams.get("endpoint").replace(/^\/+/, "");
    const proxyUrl = new URL("/api/mangadex/" + endpoint, self.location.origin);
    url.searchParams.forEach((value, key) => {
      if (key !== "endpoint") proxyUrl.searchParams.append(key, value);
    });
    event.respondWith(networkFirst(new Request(proxyUrl.toString(), event.request), proxyUrl.toString()));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/mangadex/")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (
    url.hostname === "api.mangadex.org" ||
    url.hostname === "uploads.mangadex.org" ||
    url.hostname.endsWith(".mangadex.network")
  ) {
    event.respondWith(
      url.hostname === "api.mangadex.org"
        ? networkFirst(event.request)
        : staleWhileRevalidate(event.request)
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});


