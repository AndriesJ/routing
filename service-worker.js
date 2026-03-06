const CACHE_NAME = 'runroutes-v1';
const RUNTIME_CACHE = 'runroutes-runtime-v1';

// Get the base path for GitHub Pages
const getBasePath = () => {
    const isGitHubPages = self.location.hostname.includes('github.io');
    if (isGitHubPages) {
        // Extract repository name from path
        const pathParts = self.location.pathname.split('/');
        // Remove empty strings and get the repo name
        const repoName = pathParts[1]; // username.github.io/repo-name/
        return repoName ? `/${repoName}` : '';
    }
    return '';
};

const basePath = getBasePath();

// Assets to cache on install - use relative paths
const PRECACHE_ASSETS = [
    `${basePath}/`,
    `${basePath}/index.html`,
    `${basePath}/manifest.json`,
    `${basePath}/offline.html`,
    `${basePath}/js/app.js`,
    `${basePath}/icons/icon-72.png`,
    `${basePath}/icons/icon-96.png`,
    `${basePath}/icons/icon-128.png`,
    `${basePath}/icons/icon-144.png`,
    `${basePath}/icons/icon-152.png`,
    `${basePath}/icons/icon-192.png`,
    `${basePath}/icons/icon-384.png`,
    `${basePath}/icons/icon-512.png`,
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...', basePath);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching files');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
            })
            .then(cachesToDelete => {
                return Promise.all(cachesToDelete.map(cacheToDelete => {
                    console.log('Service Worker: Deleting old cache', cacheToDelete);
                    return caches.delete(cacheToDelete);
                }));
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event with GitHub Pages path handling
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Handle GitHub Pages root redirect
    if (url.pathname === `${basePath}/` || url.pathname === `${basePath}`) {
        event.respondWith(
            caches.match(`${basePath}/index.html`)
                .then(response => response || fetch(event.request))
        );
        return;
    }
    
    // Skip cross-origin requests that aren't allowed
    if (!url.origin.includes('github.io') && 
        !url.origin.includes('unpkg.com') && 
        !url.origin.includes('cdn.jsdelivr.net') &&
        !url.origin.includes('router.project-osrm.org') && 
        !url.origin.includes('api.open-elevation.com')) {
        return;
    }
    
    // Handle API requests (network-first)
    if (url.origin.includes('router.project-osrm.org') || 
        url.origin.includes('api.open-elevation.com')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(RUNTIME_CACHE).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    // Handle all other requests (cache-first)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200) {
                            return response;
                        }
                        
                        const responseClone = response.clone();
                        caches.open(RUNTIME_CACHE).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                        
                        return response;
                    })
                    .catch(() => {
                        // Return offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match(`${basePath}/offline.html`);
                        }
                    });
            })
    );
});

// Background sync
self.addEventListener('sync', event => {
    if (event.tag === 'sync-routes') {
        console.log('Service Worker: Syncing routes');
        event.waitUntil(syncRoutes());
    }
});

// Push notifications
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: `${basePath}/icons/icon-192.png`,
        badge: `${basePath}/icons/icon-72.png`,
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'View Route'
            },
            {
                action: 'close',
                title: 'Close'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('RunRoutes', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow(`${basePath}/`)
        );
    }
});

async function syncRoutes() {
    console.log('Syncing routes...');
    // Implement route syncing logic here
}