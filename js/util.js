// Tiện ích chung: định dạng tiền, ngày, chữ không dấu

export const VERSION = '0.5.0';

// ---------- Chữ ----------
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Bỏ dấu tiếng Việt, chữ thường
export const boDau = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
export const nfc = (s) => String(s == null ? '' : s).normalize('NFC').trim();
// Chuẩn hóa để so khớp nguyên từ (giống bot)
export const chuanCoDau = (s) => ' ' + String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/[^0-9a-zà-ỹ]+/g, ' ').trim() + ' ';
export const chuanKhongDau = (s) => ' ' + boDau(s).replace(/[^0-9a-z]+/g, ' ').trim() + ' ';
export const chuCai = (s) => (nfc(s).charAt(0) || '?').toUpperCase();

export const uid = (p = 'w') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowIso = () => new Date().toISOString();

// ---------- Số tiền ----------
let numFmt = '1.234.567';
export const setNumFormat = (f) => { numFmt = f || '1.234.567'; };
const sep = () => (numFmt.indexOf(',') === 1 ? ',' : numFmt.indexOf(' ') === 1 ? ' ' : '.');

// 1234567 -> "1.234.567" (giá trị tuyệt đối)
export const num = (n) => Math.round(Math.abs(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep());
export const MINUS = '−';
// Có dấu: luôn +/− (trừ 0)
export const signed = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + num(n);
export const neg = (n) => (n ? MINUS : '') + num(n);
export const money = (n) => (n < 0 ? MINUS : '') + num(n) + ' đ';
export const cls = (n) => (n > 0 ? 'inc' : n < 0 ? 'exp' : '');
// Rút gọn cho ô lịch: 12000000 -> 12.000k
export const kfmt = (n) => {
  const a = Math.abs(n);
  const s = a >= 1000 ? num(Math.round(a / 1000)) + 'k' : num(a);
  return (n > 0 ? '+' : n < 0 ? MINUS : '') + s;
};

/**
 * Đọc số tiền: 38000, 38.000, 38,000, 38k, 1tr, 1,5tr, 1.5tr, 2tr5, 500 nghìn, 38000đ
 * (cùng luật với bot). Trả về số nguyên hoặc null.
 */
export function parseMoney(s) {
  s = String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  const m = s.match(/^[+\-−]?\s*(\d[\d.,\s]*?)\s*(?:(k|nghìn|nghin|ngàn|ngan)|(triệu|trieu|tr|củ|cu)(\d*))?\s*(?:đ|₫|vnđ|vnd)?$/i);
  if (!m) return null;
  const so = m[1].replace(/\s/g, ''), nghin = m[2], trieu = m[3], le = m[4];
  let v;
  if (nghin || trieu) {
    let t = so.replace(/,/g, '.');
    if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    v = parseFloat(t);
    if (le && v === Math.floor(v)) v = parseFloat(v + '.' + le);
    v *= nghin ? 1000 : 1000000;
  } else {
    v = parseFloat(so.replace(/[.,]/g, ''));
  }
  if (!isFinite(v) || v <= 0 || v > 1e12) return null;
  return Math.round(v);
}

// ---------- Ngày (chuỗi 'YYYY-MM-DD' theo giờ máy) ----------
const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
export const today = () => ymd(new Date());
export const ym = (s) => String(s).slice(0, 7);
export const thisMonth = () => ym(today());
export const toDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
export const addMonths = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
export const daysIn = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const THU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const THU_NGAN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const dm = (s) => { const p = String(s).split('-'); return p[2] + '/' + p[1]; };
export const dmy = (s) => { const p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
export const dayLabel = (s) => THU[toDate(s).getDay()] + ', ' + dm(s);
export const monthLabel = (k) => { const [y, m] = k.split('-'); return m + '/' + y; };
export const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : p2(d.getHours()) + ':' + p2(d.getMinutes()); };
// Ngày đầu tuần chứa s; weekStart 1 = thứ Hai, 0 = Chủ Nhật
export const weekStartOf = (s, ws = 1) => { const d = toDate(s); const diff = (d.getDay() - ws + 7) % 7; d.setDate(d.getDate() - diff); return ymd(d); };

// "dd/mm/yyyy", "dd-mm-yy", "yyyy-mm-dd" -> 'YYYY-MM-DD' hoặc null
export function parseDate(s, namMacDinh) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return okDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return okDate(y, +m[2], +m[1]); }
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m) return okDate(namMacDinh || new Date().getFullYear(), +m[2], +m[1]);
  return null;
}
// Số tiền có thể âm hoặc bằng 0 (số dư đầu của ví): "-1.200.000", "−1tr2", "0" -> số nguyên, sai -> null
export function parseSignedMoney(s) {
  s = String(s == null ? '' : s).trim();
  if (/^[+\-−]?\s*0+\s*(đ|₫)?$/i.test(s) || s === '') return 0;
  const am = /^[\-−]/.test(s);
  const v = parseMoney(s.replace(/^[+\-−]\s*/, ''));
  return v == null ? null : am ? -v : v;
}
export function okDate(y, m, d) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d);
  if (t.getMonth() !== m - 1) return null;
  return y + '-' + p2(m) + '-' + p2(d);
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
export const fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
