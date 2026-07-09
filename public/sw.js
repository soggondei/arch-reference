self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // 캐싱 없음 — 설치 가능 조건 충족을 위한 최소 핸들러
});
