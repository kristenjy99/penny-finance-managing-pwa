// Penny v0.10.1 – màu biểu đồ: tự phối theo màu theme (mặc định) hoặc chọn bộ màu có sẵn; lưu theo máy (localStorage penny_chart_mau)
// Áp cho: biểu đồ tròn, vành khuyên (--c1..--c10), cột (--bar), đường số dư (--c1). Màu thu / chi giữ đúng màu theme để không lẫn nghĩa.

export const BO_MAU = {
  theme: { ten: 'Theo theme (tự phối)', mo: 'Suy ra từ màu theme đang dùng, sáng / tối tự đổi theo' },
  don: { ten: 'Đơn sắc theo theme', mo: 'Các sắc độ đậm nhạt của màu theme' },
  ruc: { ten: 'Rực rỡ', mo: 'Như hình mẫu biểu đồ tròn', ds: ['#F26B5B', '#F7963E', '#F8C447', '#E9DC3F', '#B6DC48', '#6ACC6A', '#58D6C6', '#6FB2EA', '#9A8DEB', '#D98AD6'] },
  pastel: { ten: 'Pastel', mo: 'Màu nhạt, dịu mắt', ds: ['#F4A6BE', '#B6A3E6', '#F2CC8F', '#8FC9E8', '#A8D8B9', '#F7B58B', '#C3B1E1', '#9ED9D3', '#E8C1D9', '#D5E39A'] },
  tram: { ten: 'Trầm', mo: 'Màu đậm, hợp giao diện tối', ds: ['#B5525C', '#C07A3E', '#B79A3B', '#6E9A4E', '#3F8C82', '#4D78A8', '#6A5BA8', '#9A5794', '#7C6C99', '#8A7B70'] }
};
export const chartMau = () => { try { const v = localStorage.getItem('penny_chart_mau'); return BO_MAU[v] ? v : 'theme'; } catch (e) { return 'theme'; } };

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

/** 10 màu biểu đồ theo lựa chọn hiện tại và màu theme đang áp dụng */
export function chartColors(kieu = chartMau()) {
  if (BO_MAU[kieu] && BO_MAU[kieu].ds) return BO_MAU[kieu].ds.slice();
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme === 'dark';
  const goc = toHex(css.getPropertyValue('--pri')) || toHex(css.getPropertyValue('--acc')) || '#C5B3D3';
  const hs = hexToHsl(goc) || [280, 0.4, 0.6];
  // màu theme quá nhạt / xám (vd header pastel): tăng độ bão hòa để biểu đồ rõ
  const S = Math.max(0.45, Math.min(0.72, hs[1] < 0.2 ? 0.45 : hs[1]));
  if (kieu === 'don') {
    // cùng sắc độ, sáng dần (tối: ngược lại)
    return Array.from({ length: 10 }, (_, i) => hslToHex(hs[0] + (i % 2 ? 8 : 0), S * (1 - i * 0.04), dark ? 0.72 - i * 0.045 : 0.46 + i * 0.042));
  }
  // Theo theme: bắt đầu từ màu theme, xoay sắc độ theo bước 36° xen kẽ hai phía để màu cạnh nhau tách biệt nhưng cùng tông
  const L = dark ? 0.66 : 0.6;
  const buoc = [0, 36, -36, 72, -72, 108, -108, 144, -144, 180];
  return buoc.map((d, i) => hslToHex(hs[0] + d, S * (i % 2 ? 0.92 : 1), L + (i % 3 === 2 ? -0.06 : i % 3 === 1 ? 0.04 : 0)));
}

/** Ghi biến CSS cho biểu đồ (gọi sau khi áp màu theme / đổi sáng tối / đổi bộ màu) */
export function applyChartColors() {
  const ds = chartColors();
  let st = document.getElementById('chart-css');
  if (!st) { st = document.createElement('style'); st.id = 'chart-css'; document.head.appendChild(st); }
  st.textContent = `html{${ds.map((c, i) => `--c${i + 1}:${c} !important;`).join('')}--bar:${ds[0]} !important;}`; // !important: thắng biến --cN của từng mẫu / theme
}
export function setChartMau(v) {
  try { localStorage.setItem('penny_chart_mau', BO_MAU[v] ? v : 'theme'); } catch (e) { /* bỏ qua */ }
  applyChartColors();
}
