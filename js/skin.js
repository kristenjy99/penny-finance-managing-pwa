// Penny v0.7.0 – mẫu thiết kế "Mới" (thẻ bo góc, header bo đáy, font Be Vietnam Pro) / "Cũ" (tràn viền như v0.5–v0.6)
// Lựa chọn lưu theo từng máy (localStorage penny_skin), mặc định "moi".
const KEY = 'penny_skin';
export function skin() { try { return localStorage.getItem(KEY) === 'cu' ? 'cu' : 'moi'; } catch (e) { return 'moi'; } }
export const isMoi = () => skin() === 'moi';
export function applySkin() {
  const s = skin();
  document.documentElement.dataset.skin = s;
  if (s === 'moi' && !document.getElementById('font-moi')) {
    const l = document.createElement('link');
    l.id = 'font-moi'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
}
export function setSkin(v) { try { localStorage.setItem(KEY, v === 'cu' ? 'cu' : 'moi'); } catch (e) { /* bỏ qua */ } applySkin(); }

// Phần tử nằm ngoài thẻ (dải số liệu, nút rộng, ghi chú…); .cbrk = điểm ngắt thẻ (ẩn)
const NGOAI = '.band, .perbar, .pad, .note, .duebar, .filters, .monthnav, .banner, .split, .st-grid, .dgrid, .setwrap, .tbl, .card, .utabs, .ver, .page-b, .gd-tabs, .soon';
// Gom các phần tử liền nhau thành thẻ: mỗi .sec (trừ tiêu đề ngày .dh) mở một thẻ mới
export function cardify(root) {
  if (!root || !isMoi()) return;
  let card = null;
  [...root.children].forEach((el) => {
    if (el.matches('.cbrk')) { card = null; el.remove(); return; }
    if (el.matches(NGOAI) || (el.matches('.empty') && !card)) { card = null; return; }
    if (!card || el.matches('.sec:not(.dh)')) { card = document.createElement('div'); card.className = 'card'; el.before(card); }
    card.appendChild(el);
  });
}
// Ô chữ cái đầu cho dòng Cài đặt; mũi tên cho dòng lịch sử công nợ
export function decorate(root) {
  if (!root || !isMoi()) return;
  root.querySelectorAll('.set:not(.tall):not(.flat)').forEach((r) => {
    if (r.querySelector(':scope > .sic')) return;
    const t = (r.querySelector('span') || r).textContent.trim();
    const s = document.createElement('span');
    s.className = 'sic'; s.setAttribute('aria-hidden', 'true');
    s.textContent = t.charAt(0).toUpperCase();
    r.prepend(s);
  });
  root.querySelectorAll('.hrow').forEach((r) => {
    if (r.querySelector(':scope > .sic')) return;
    const am = r.querySelector('.num');
    const s = document.createElement('span');
    s.className = 'sic'; s.setAttribute('aria-hidden', 'true');
    s.textContent = am && am.classList.contains('inc') ? '↗' : '↙';
    r.prepend(s);
  });
}
// Áp cho cả vùng nội dung và các cột con của bố cục PC
export function skinContent(c) {
  if (!isMoi() || !c) return;
  [c].concat([...c.querySelectorAll('#gdl, .st-l, .st-r, .dl, .dr, .cal-panel, .setbody')]).forEach(cardify);
  decorate(c);
}

// Bộ màu mẫu mới (giao diện sáng): hdr header/mục chọn, bg nền trang, tile ô chữ/nền phụ, bd viền, pri nút/thanh, inc thu, exp chi
// penny, bacha, dao lấy đúng màu từ hình thiết kế mới; bien, xam suy ra cùng kiểu
export const MOI = {
  penny: { hdr: '#F4C9D8', bg: '#FCF6F8', tile: '#F6E2E9', bd: '#F2E0E6', pri: '#E0709A', inc: '#6953D5', exp: '#D4486B', ink: '#35232E', ink2: '#947986' },
  bacha: { hdr: '#C3E9DB', bg: '#F6FBF9', tile: '#DBEFE8', bd: '#DCEDE6', pri: '#3DB895', inc: '#15896A', exp: '#D95B72', ink: '#1F3A35', ink2: '#709189' },
  dao: { hdr: '#FAD8B8', bg: '#FEF9F3', tile: '#F9E6D1', bd: '#F3E5D5', pri: '#F2925A', inc: '#2D8ED8', exp: '#D85454', ink: '#3B2B1E', ink2: '#9E826D' },
  bien: { hdr: '#C9DDF5', bg: '#F5F9FE', tile: '#E1ECFA', bd: '#DCE6F3', pri: '#4F8FD9', inc: '#3B5BD6', exp: '#D4486B', ink: '#1E2B3D', ink2: '#6E8099' },
  xam: { hdr: '#DEDEE4', bg: '#F8F8FA', tile: '#EDEDF1', bd: '#E3E3E8', pri: '#6B6B7B', inc: '#4E5BD6', exp: '#D4486B', ink: '#26262E', ink2: '#7E7E8C' }
};
// Màu nút suy từ màu header khi người dùng tự chọn màu (giữ sắc độ, tăng độ đậm)
function hexHsl(h) {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** theme_colors (đã lưu) -> bộ màu mẫu mới; {} nếu dùng mặc định */
export function moiColors(c) {
  if (!c || !c.acc) return {};
  if (c.preset && MOI[c.preset]) return { ...MOI[c.preset] };
  const [h, sat] = hexHsl(c.acc);
  return { hdr: c.acc, bg: c.bg, tile: c.bg2, bd: c.bd, pri: hslHex(h, Math.max(0.55, Math.min(0.7, sat)), 0.58), inc: c.inc, exp: c.exp };
}
