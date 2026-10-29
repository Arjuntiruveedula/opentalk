// OpenTalk Service Worker - Version 1.0.0
const CACHE_NAME = "opentalk-v1.0.0";
const PRECACHE_ASSETS = [
    "/",
    "/static/index.html",
    "/static/app.js",
    "/manifest.json",
    "/static/manifest.json",
    "/static/icons/icon.svg",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

// Install: Cache critical app shell files
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn("Pre-caching partial assets:", err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up older caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for dynamic content, cache-first for static assets
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Bypass API requests, WebSocket upgrades, and external CDNs
    if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/ws/") ||
        event.request.method !== "GET"
    ) {
        return;
    }

    // Network-first strategy with cache fallback for page navigation
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match("/static/index.html") || caches.match("/");
            })
        );
        return;
    }

    // Cache-first strategy for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});
