// Service worker của Penny: cache khung app để mở được khi mất mạng.
// MỖI LẦN PHÁT HÀNH: đổi VERSION để máy người dùng tải bản mới.
const VERSION = 'penny-v0.10.2';
const LIB_CACHE = 'penny-lib'; // thư viện đọc ảnh/PDF (lib/): cache khi dùng lần đầu, giữ qua các phiên bản
const FONT_CACHE = 'penny-fonts';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/store.js', 'js/sync.js', 'js/ui.js', 'js/form.js',
  'js/screens.js', 'js/manage.js', 'js/csv.js', 'js/xlsx.js', 'js/pick.js',
  'js/scan.js', 'js/stmt.js', 'js/docread.js', 'js/xlsxread.js', 'js/unzip.js', 'js/wipe.js', 'js/skin.js', 'js/list.js', 'js/chart.js', 'js/drill.js', 'js/tk.js', 'js/tkui.js', 'js/combo.js', 'js/chartcolor.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Font Google: lấy từ cache, đồng thời cập nhật ngầm
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Chỉ xử lý file của app (cùng nguồn). Không chặn script.google.com hay API khác.
  if (url.origin !== self.location.origin) return;

  // Thư viện lib/ (Tesseract, pdf.js, dữ liệu ngôn ngữ): lấy cache trước, chưa có thì tải rồi cất (không nằm trong SHELL)
  if (url.pathname.includes('/lib/')) {
    e.respondWith(caches.open(LIB_CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  // Mở trang: trả index.html từ cache (bỏ phần #...), mạng chỉ dùng khi chưa có cache
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: VERSION }).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: VERSION }).then((hit) => hit || fetch(req)));
});
