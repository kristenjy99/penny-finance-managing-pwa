// Penny v0.10.2 – màu biểu đồ: tự phối theo màu theme (mặc định) hoặc chọn bộ màu có sẵn; lưu theo máy (localStorage penny_chart_mau)
// Áp cho: biểu đồ tròn, vành khuyên (--c1..--c10), cột (--bar), đường số dư (--c1). Màu thu / chi giữ đúng màu theme để không lẫn nghĩa.

export const BO_MAU = {
  theme: { ten: 'Theo theme', mo: 'Lấy đúng 2 màu chính của theme (màu nút và màu số thu) rồi pha thêm các sắc độ sáng cùng họ; đổi theme hoặc sáng / tối là tự đổi theo' },
  don: { ten: 'Đơn sắc theo theme', mo: 'Một màu chính của theme, đậm nhạt khác nhau' },
  tu: { ten: 'Tự chọn màu gốc', mo: 'Chọn 1 màu bạn thích, app tự pha 10 màu hài hòa từ màu đó' },
  ruc: { ten: 'Rực rỡ', mo: 'Như hình mẫu biểu đồ tròn', ds: ['#F26B5B', '#F7963E', '#F8C447', '#E9DC3F', '#B6DC48', '#6ACC6A', '#58D6C6', '#6FB2EA', '#9A8DEB', '#D98AD6'] },
  pastel: { ten: 'Pastel', mo: 'Màu nhạt, dịu mắt', ds: ['#F4A6BE', '#B6A3E6', '#F2CC8F', '#8FC9E8', '#A8D8B9', '#F7B58B', '#C3B1E1', '#9ED9D3', '#E8C1D9', '#D5E39A'] }
};
export const chartMau = () => { try { const v = localStorage.getItem('penny_chart_mau'); return BO_MAU[v] ? v : 'theme'; } catch (e) { return 'theme'; } };
/** Màu gốc của bộ "Tự chọn màu gốc" (localStorage penny_chart_goc) */
export const chartGoc = () => { try { const v = localStorage.getItem('penny_chart_goc'); return /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#E0709A'; } catch (e) { return '#E0709A'; } };

// ---- chuyển đổi màu ----
function hexToHsl(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60;
  }
  return [hh, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255).toString(16).padStart(2, '0');
  return '#' + f(0) + f(8) + f(4);
}
// rgb(...) / #hex của CSS → #hex
function toHex(v) {
  v = String(v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('');
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : '';
}
/** Độ sáng cảm nhận 0..1 – để chọn chữ đen / trắng trên ô màu */
export function luma(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const chuTren = (hex) => (luma(hex) > 0.36 ? '#2A2230' : '#FFFFFF');

const kep = (x, a, b) => Math.max(a, Math.min(b, x));
const lechSac = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };

// Pha 10 màu từ màu chính A và màu phụ B: xen kẽ 2 họ màu, độ sáng cao (không trầm), lát cạnh nhau khác độ sáng để dễ phân biệt
function phaMau(A, B, dark) {
  let hA = A[0], hB = B ? B[0] : hA + 45;
  if (!B || B[1] < 0.15 || lechSac(hA, hB) < 25) hB = hA + 45; // màu phụ trùng / xám → lấy màu kề bên
  const SA = kep(A[1], 0.5, 0.78), SB = kep(B && B[1] >= 0.15 ? B[1] : SA, 0.42, 0.7), Sm = (SA + SB) / 2;
  // màu giữa: 2 màu gần nhau → nằm giữa; xa nhau (vd cam + xanh dương) → màu kề màu chính để không ra màu lạ
  const d = ((hB - hA) % 360 + 540) % 360 - 180;
  const xa = Math.abs(d) > 110, hM = xa ? hA + 20 : hA + d / 2;
  const dL = dark ? -0.03 : 0;
  const ds = [[hA, SA, 0.64], [hB, SB, 0.68], [hA + 14, SA * 0.9, 0.77], [hM, Sm, 0.71], [hB - 14, SB * 0.9, 0.8],
    [hA - 12, SA * 0.85, 0.82], [hB + 16, SB, 0.58], [xa ? hA - 22 : hM + 18, Sm * 0.85, 0.8], [hA, SA * 0.85, 0.56], [hB, SB * 0.7, 0.84]];
  return ds.map(([h, sat, l]) => hslToHex(h, sat, l + dL));
}

/** 10 màu biểu đồ theo lựa chọn hiện tại và màu theme đang áp dụng */
export function chartColors(kieu = chartMau()) {
  if (BO_MAU[kieu] && BO_MAU[kieu].ds) return BO_MAU[kieu].ds.slice();
  const dark = document.documentElement.dataset.theme === 'dark';
  if (kieu === 'tu') return phaMau(hexToHsl(chartGoc()) || [340, 0.65, 0.66], null, dark);
  const css = getComputedStyle(document.documentElement);
  // màu chính: màu nút (mẫu mới --pri) hoặc header (mẫu cũ --acc); màu phụ: màu số thu (--inc) của theme
  let A = hexToHsl(toHex(css.getPropertyValue('--pri')) || toHex(css.getPropertyValue('--acc'))) || [330, 0.6, 0.65];
  let B = hexToHsl(toHex(css.getPropertyValue('--inc')));
  if (A[1] < 0.15 && B && B[1] >= 0.15) { A = B; B = null; } // theme xám: lấy màu số thu làm màu chính
  if (kieu === 'don') {
    const S = kep(A[1], 0.45, 0.72), Ls = [0.6, 0.76, 0.67, 0.82, 0.55, 0.72, 0.85, 0.63, 0.79, 0.88];
    return Ls.map((l, i) => hslToHex(A[0] + (i % 2 ? 6 : 0), S * (l > 0.8 ? 0.85 : 1), l - (dark ? 0.03 : 0)));
  }
  return phaMau(A, B, dark);
}

/** Ghi biến CSS cho biểu đồ (gọi sau khi áp màu theme / đổi sáng tối / đổi bộ màu) */
export function applyChartColors() {
  const ds = chartColors();
  let st = document.getElementById('chart-css');
  if (!st) { st = document.createElement('style'); st.id = 'chart-css'; document.head.appendChild(st); }
  st.textContent = `html{${ds.map((c, i) => `--c${i + 1}:${c} !important;`).join('')}--bar:${ds[0]} !important;}`; // !important: thắng biến --cN của từng mẫu / theme
}
export function setChartMau(v, goc) {
  try {
    localStorage.setItem('penny_chart_mau', BO_MAU[v] ? v : 'theme');
    if (goc && /^#[0-9a-f]{6}$/i.test(goc)) localStorage.setItem('penny_chart_goc', goc);
  } catch (e) { /* bỏ qua */ }
  applyChartColors();
}
