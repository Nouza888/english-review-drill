const workerUrl = new URL(self.location.href);
const buildVersion = workerUrl.searchParams.get("v") || "development";
const cacheName = `english-review-drill-${buildVersion}`;
const scopeUrl = new URL(self.registration.scope);
const basePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const appShellUrl = new URL(basePath, self.location.origin).href;
const dataUrl = new URL(`${basePath}data/cards.json`, self.location.origin).href;
const libraryUrl = new URL(`${basePath}data/library.json`, self.location.origin).href;

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("english-review-drill-") && key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(basePath)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, appShellUrl));
    return;
  }

  if (url.href === dataUrl || url.href === libraryUrl) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheAppShell() {
  const cache = await caches.open(cacheName);
  const coreUrls = [
    appShellUrl,
    dataUrl,
    libraryUrl,
    new URL(`${basePath}manifest.webmanifest`, self.location.origin).href,
    new URL(`${basePath}icons/icon.svg`, self.location.origin).href,
    new URL(`${basePath}icons/icon-192.png`, self.location.origin).href,
    new URL(`${basePath}icons/icon-512.png`, self.location.origin).href,
    new URL(`${basePath}icons/apple-touch-icon.png`, self.location.origin).href,
  ];

  const pageResponse = await fetch(appShellUrl, { cache: "reload" });
  if (!pageResponse.ok) throw new Error("App shell could not be fetched.");

  await cache.put(appShellUrl, pageResponse.clone());
  const html = await pageResponse.text();
  const referencedUrls = extractLocalAssetUrls(html);
  const urlsToCache = [...new Set([...coreUrls.slice(1), ...referencedUrls])];

  await Promise.all(
    urlsToCache.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Core resource could not be fetched (${response.status}).`);
      await cache.put(url, response);
    }),
  );
}

function extractLocalAssetUrls(html) {
  const urls = [];
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attributePattern)) {
    const url = new URL(match[1], appShellUrl);
    if (url.origin === self.location.origin && url.pathname.startsWith(basePath)) urls.push(url.href);
  }
  return urls;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}
