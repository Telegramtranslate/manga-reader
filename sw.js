const CACHE_NAME = "mangacloud-shell-v19";
const APP_SHELL = [
  "./",
  "./index.html",
  "./catalog-provider.js?v=12",
  "./catalog-seed.json?v=2",
  "./catalog-fallback.json?v=7",
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
    if (response && (response.ok || response.type === "opaque")) {
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
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

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

  if (url.origin === self.location.origin && (url.pathname === "/api/mangabuff" || url.pathname.startsWith("/api/mangabuff/"))) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (
    url.hostname === "mangabuff.ru" ||
    url.hostname === "custom.mangabuff.ru"
  ) {
    const isImageRequest = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:$|\?)/i.test(url.pathname) ||
      url.pathname.indexOf("/chapters/") !== -1 ||
      url.pathname.indexOf("/posters/") !== -1;
    event.respondWith(isImageRequest ? staleWhileRevalidate(event.request) : networkFirst(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
