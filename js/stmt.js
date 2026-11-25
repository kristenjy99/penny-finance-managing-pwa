// Penny v0.6.0 – nhận dạng sao kê (chỉ logic, không đụng giao diện)
// Đầu vào: các dòng, mỗi dòng là mảng ô {t, x0, x1} (CSV/xlsx: x = số thứ tự cột; PDF/ảnh: tọa độ)
// Đầu ra: danh sách khoản {ngay, sign, so_tien, ghi_chu, raw, doan, ...}
import { boDau, okDate } from './util.js';

const p2 = (n) => String(n).padStart(2, '0');
const bd = (s) => boDau(s).replace(/[^0-9a-z]+/g, ' ').trim();

// ---------- Nguồn sao kê ----------
export const NGUON = {
  'Vietcombank': { re: /vietcombank|\bvcb\b|ngoai thuong|mbvcb|ibvcb/, ten: ['vietcombank', 'vcb'] },
  'TPBank': { re: /tpbank|tien phong|\btpb\b/, ten: ['tpbank', 'tpb', 'tien phong'] },
  'MoMo': { re: /\bmomo\b|m service/, ten: ['momo'] },
  'ZaloPay': { re: /zalopay|zalo pay/, ten: ['zalopay', 'zalo'] }
};
/** Nhận ra ngân hàng / ví và sao kê thẻ tín dụng từ toàn bộ chữ trong file */
export function detectSource(text, fileName = '') {
  const t = ' ' + bd(fileName + ' ' + text) + ' ';
  // Tên file và phần đầu file (tiêu đề) nặng ký hơn nội dung giao dịch ("Nạp tiền từ Vietcombank" trong sao kê MoMo)
  const dau = ' ' + bd(fileName) + ' ' + bd(fileName) + ' ' + bd(String(text).split('\n').slice(0, 6).join(' ')) + ' ';
  let bank = '', best = 0;
  Object.entries(NGUON).forEach(([k, v]) => {
    const re = new RegExp(v.re.source, 'g');
    const n = (t.match(re) || []).length + 3 * (dau.match(re) || []).length;
    if (n > best) { best = n; bank = k; }
  });
  const card = /the tin dung|credit card|sao ke the|tong du no|han muc tin dung|statement balance/.test(t);
  return { bank, card };
}

// ---------- Số tiền ----------
function numVal(s) {
  s = s.replace(/[\s  ]/g, '');
  let int = s, frac = '';
  const m = s.match(/^(.*\d)([.,])(\d{1,2})$/);
  if (m) { int = m[1]; frac = m[3]; }
  int = int.replace(/[.,]/g, '');
  if (!/^\d+$/.test(int)) return null;
  return Math.round(Number(int + (frac ? '.' + frac : '')));
}
/** Cả ô là một số tiền: "1.234.567", "-68,000", "(50.000)", "1 234 567 VND", "900.000 CR" -> {v, sign} */
export function amtCell(s) {
  let t = String(s == null ? '' : s).replace(/[  ]/g, ' ').trim();
  if (!t) return null;
  let neg = false, pos = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  t = t.replace(/\s*(vnd|vnđ|đ|₫)\.?$/i, '').replace(/^(vnd|vnđ)\s*/i, '').trim();
  let m = t.match(/^(.*?)\s*\b(cr|dr)$/i);
  if (m) { if (/cr/i.test(m[2])) pos = true; else neg = true; t = m[1]; }
  m = t.match(/^([+\-−–])\s*(.*)$/);
  if (m) { if (m[1] === '+') pos = true; else neg = true; t = m[2]; }
  m = t.match(/^(.*?)\s*([+\-−–])$/);
  if (m) { if (m[2] === '+') pos = true; else neg = true; t = m[1]; }
  if (!/^\d[\d., ]*$/.test(t)) return null;
  if (/ /.test(t) && !/^\d{1,3}( \d{3})+([.,]\d{1,2})?$/.test(t)) return null;
  if (/^\d{1,2}[.]\d{1,2}[.]\d{2,4}$/.test(t)) return null; // ngày 05.10.2026
  const v = numVal(t);
  if (v == null) return null;
  return { v, sign: neg ? -1 : pos ? 1 : 0 };
}
// Số tiền nằm trong một dòng chữ (ảnh chụp app): cần dấu +/−, đơn vị đ/VND hoặc nhóm nghìn
const RE_LAMT = /(^|[\s(:])([+\-−–]\s?)?(\d{1,3}(?:[.,]\d{3})+|\d{4,10})((?:[.,]\d{2})?)\s?(vnd|vnđ|đ|₫|d\b)?(?=$|[\s),;])/gi;
export function amtFind(line) {
  const s = String(line || '');
  const out = [];
  let m;
  RE_LAMT.lastIndex = 0;
  while ((m = RE_LAMT.exec(s))) {
    const sign = m[2] ? (m[2].trim() === '+' ? 1 : -1) : 0;
    const nhom = /[.,]/.test(m[3]);
    if (!sign && !m[5] && !nhom) continue;
    const truoc = bd(s.slice(Math.max(0, m.index - 14), m.index));
    if (/(so du|balance|du no|han muc)$/.test(truoc)) continue;
    const v = numVal(m[3] + m[4]);
    if (v) out.push({ v, sign, cur: !!m[5], i: m.index + m[1].length, len: m[0].length - m[1].length });
  }
  return out;
}

// ---------- Ngày ----------
const RE_DATE = /(?<!\d)(\d{1,2})\s?([/.\-])\s?(\d{1,2})\s?\2\s?(\d{4}|\d{2})(?![\d/])|(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
const RE_DM = /(?<![\d/.:])(\d{1,2})\/(\d{1,2})(?![\d/.:])/;
/** Tìm ngày trong chuỗi -> {iso, i, len} ; ngắn dd/mm chỉ nhận khi cho phép (dùng năm gợi ý) */
export function dateFind(s, year, short = false) {
  s = String(s || '');
  let m = s.match(RE_DATE);
  if (m) {
    let iso = null;
    if (m[5]) iso = okDate(+m[5], +m[6], +m[7]);
    else { let y = +m[4]; if (y < 100) y += 2000; iso = okDate(y, +m[3], +m[1]); }
    if (iso) return { iso, i: m.index, len: m[0].length };
  }
  if (short && year) {
    m = s.match(RE_DM);
    if (m) { const iso = okDate(year, +m[2], +m[1]); if (iso) return { iso, i: m.index, len: m[0].length, short: true }; }
  }
  return null;
}
// v0.8.0: "hôm nay" của file = ngày tham chiếu (ngày chụp/tạo file), không phải ngày nhập vào app
let REF = '', REL = false;
const refDay = () => { if (REF) { const [y, m, d] = REF.split('-').map(Number); return new Date(y, m - 1, d); } return new Date(); };
const homNay = (d = 0) => { const t = refDay(); t.setDate(t.getDate() - d); return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()); };
// Tiêu đề thứ đứng riêng một dòng ("Thứ 7", "Thứ Bảy", "Chủ nhật", "CN") → ngày gần nhất trước ngày tham chiếu có thứ đó
const THU_SO = { cn: 0, 'chu nhat': 0, 2: 1, hai: 1, 3: 2, ba: 2, 4: 3, tu: 3, 5: 4, nam: 4, 6: 5, sau: 5, 7: 6, bay: 6 };
function thuFind(b) {
  const m = b.match(/^(?:thu\s*(2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)|(chu nhat|cn))\s*[,.:]?\s*$/);
  if (!m) return null;
  const want = THU_SO[m[1] || m[2]];
  const t = refDay();
  for (let i = 1; i <= 7; i++) { const x = new Date(t); x.setDate(t.getDate() - i); if (x.getDay() === want) return homNay(i); }
  return null;
}

// ---------- Ghi chú: bỏ mã tham chiếu, che số tài khoản / số thẻ ----------
const BO_DAU_NGAN = [
  /^(mbvcb|ibvcb|vcb)\.\d+\.\d+\.?/i, /^(mbvcb|ibvcb)\.?/i, /^tpb\s*\d*\s*[:.-]?/i,
  /^(ib|mb|sms|atm|pos)\s*[:.-]\s*/i
];
export function cleanNote(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  BO_DAU_NGAN.forEach((r) => { t = t.replace(r, ''); });
  t = t.replace(/([a-zà-ỹ]{2})\.(?=[A-Za-zÀ-ỹ]{2})/g, '$1 ');
  // Số thẻ / tài khoản (≥ 9 chữ số, có thể có dấu cách, -, X, *) -> *4 số cuối
  t = t.replace(/(?<![\w*])[\dXx*•](?:[\dXx*•\s-]{7,}[\dXx*•])(?![\w*])/g, (g) => {
    const so = g.replace(/[\s-]/g, '');
    if (so.length < 9 || !/\d{3}/.test(so) || !/^[\dXx*•]+$/.test(so)) return g;
    const cuoi = so.match(/(\d{4})$/);
    return cuoi ? '*' + cuoi[1] : '';
  });
  t = t.split(/\s+/).filter((w) => {
    if (/^\*\d{4}$/.test(w)) return true;
    const x = w.replace(/[,;:]+$/, '');
    const so = (x.match(/\d/g) || []).length;
    if (/^[A-Za-z]*\d[\w./_-]*$/.test(x) && so >= 5 && x.length >= 6) return false; // FT24123456, 5213.42350, mã GD
    if (/^\d[\d./_-]*$/.test(x) && so >= 5) return false;
    return true;
  }).join(' ');
  t = t.replace(/\b(ref|trace|ma gd|so gd|ma giao dich|so tham chieu|ft|gd)\s*[:#.]?\s*(?=$|[;,.-])/gi, '');
  t = t.replace(/\s*([;,.:|/-]\s*){2,}/g, ' - ').replace(/^[\s;,.:|/\-–]+|[\s;,.:|/\-–]+$/g, '').replace(/\s{2,}/g, ' ');
  if (t.length > 80) t = t.slice(0, 78).replace(/\s+\S*$/, '') + '…';
  return t;
}

// ---------- Vai trò cột theo tiêu đề ----------
const ROLE = [
  ['bal', /(^| )(so du|balance|du cuoi)( |$)/],
  ['debit', /(ghi no|debit|tien ra|so tien ra|rut ra|withdraw|phat sinh no|^chi$|^dr$)/],
  ['credit', /(ghi co|credit|tien vao|so tien vao|deposit|phat sinh co|^thu$|^cr$)/],
  ['amount', /(so tien|amount|gia tri|tong tien)/],
  ['date', /(^| )(ngay|date|thoi gian|time)( |$)/],
  ['type', /(^loai|loai giao dich|^type$|transaction type|^dich vu$)/],
  ['desc', /(noi dung|mo ta|dien giai|description|detail|chi tiet|ghi chu|remark|narrative|particular|loi nhan)/],
  ['status', /(trang thai|status|ket qua)/],
  ['cat', /^danh muc$/], ['vi', /^vi$/], ['vi_den', /^vi nhan$/], ['nguoi', /^nguoi$/], ['nguon', /^nguon$/],
  ['ref', /(tham chieu|reference|ref no|ma gd|ma giao dich|so ct|doc no|trace|so but toan|^stt$|^so tt$|^no$)/]
];
const roleOf = (t) => { const s = bd(t); if (!s || s.length > 60) return ''; const r = ROLE.find(([, re]) => re.test(s)); return r ? r[0] : ''; };
function headerScore(cells) {
  const roles = new Set(cells.map((c) => roleOf(c.t)).filter(Boolean));
  const ok = roles.has('date') && (roles.has('amount') || roles.has('debit') || roles.has('credit'));
  return ok ? roles.size : 0;
}
const toCells = (row) => row.map((c, i) => (typeof c === 'object' && c ? c : { t: String(c == null ? '' : c), x0: i, x1: i + 1 }));
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));

// Gán ô vào cột tiêu đề (trùng nhiều nhất, không trùng thì cột gần nhất)
function assign(cells, cols, grid) {
  const out = {};
  cells.forEach((c) => {
    if (!String(c.t).trim()) return;
    let best = -1, bv = 0;
    cols.forEach((h, j) => { const v = overlap(c, h); if (v > bv) { bv = v; best = j; } });
    if (best < 0 && !grid) {
      const cx = (c.x0 + c.x1) / 2;
      let bd2 = Infinity;
      cols.forEach((h, j) => { const d = Math.abs(cx - (h.x0 + h.x1) / 2); if (d < bd2) { bd2 = d; best = j; } });
    }
    const r = best >= 0 ? cols[best].role || 'khac' : 'khac';
    (out[r] = out[r] || []).push(String(c.t).trim());
  });
  return out;
}

const LOAI_TU = { 'chi': 'chi', 'thu': 'thu', 'chuyen': 'chuyển', 'chuyen khoan': 'chuyển', 'cho vay': 'cho vay', 'di vay': 'đi vay', 'thu no': 'thu nợ', 'tra no': 'trả nợ' };
const DAU_LOAI = { 'chi': -1, 'thu': 1, 'chuyển': 0, 'cho vay': -1, 'đi vay': 1, 'thu nợ': 1, 'trả nợ': -1 };
const RE_TONG = /^(tong|total|cong phat sinh|cong|so du dau|so du cuoi|opening|closing|beginning|ending|balance brought|so du hien tai|tong cong)/;
const RE_HONG = /(that bai|failed|da huy|cancel|khong thanh cong|reject|dang xu ly|pending)/;
const dauTuChu = (s) => {
  const t = bd(s);
  if (!t) return 0;
  if (/(^| )(chi|ghi no|tien ra|rut|thanh toan|chuyen di|chuyen tien den|debit|d|dr|tru|mua)( |$)/.test(t)) return -1;
  if (/(^| )(thu|ghi co|tien vao|nap|nhan|hoan|hoan tien|credit|c|cr|cong|luong|salary|interest|lai|refund|deposit)( |$)/.test(t)) return 1;
  return 0;
};

/** Dòng nào là tiêu đề bảng? -> chỉ số hoặc -1 */
function findHeader(rows) {
  let hi = -1, hs = 0;
  rows.slice(0, 120).forEach((r, i) => { const s = headerScore(r); if (s > hs) { hs = s; hi = i; } });
  return hi;
}

function yearHintOf(rows) {
  const dem = {};
  rows.forEach((r) => r.forEach((c) => { const d = dateFind(c.t); if (d) { const y = d.iso.slice(0, 4); dem[y] = (dem[y] || 0) + 1; } }));
  const y = Object.keys(dem).sort((a, b) => dem[b] - dem[a])[0];
  if (y) return +y;
  REL = true; // không có năm trong file → dùng năm của ngày tham chiếu
  return refDay().getFullYear();
}

// ---------- Bảng có tiêu đề ----------
function parseTable(rows, hi, grid) {
  let head = rows[hi].map((c) => ({ ...c }));
  // Tiêu đề xuống dòng (PDF): gộp 1–2 dòng sau nếu không có ngày / số tiền
  for (let k = 1; k <= 2 && rows[hi + k]; k++) {
    const r = rows[hi + k];
    if (r.some((c) => dateFind(c.t) || amtCell(c.t))) break;
    if (r.every((c) => !roleOf(c.t) && bd(c.t).length > 25)) break;
    r.forEach((c) => {
      let best = -1, bv = 0;
      head.forEach((h, j) => { const v = overlap(c, h); if (v > bv) { bv = v; best = j; } });
      if (best >= 0) head[best].t += ' ' + c.t;
    });
    hi++;
  }
  head = head.map((c) => ({ ...c, role: roleOf(c.t) }));
  const roles = head.map((h) => h.role);
  // Hai cột "Số tiền" mà không có ghi nợ/ghi có: cột trái = ghi nợ, cột phải = ghi có
  if (roles.filter((r) => r === 'amount').length === 2 && !roles.includes('debit') && !roles.includes('credit')) {
    const idx = roles.map((r, i) => (r === 'amount' ? i : -1)).filter((i) => i >= 0);
    head[idx[0]].role = 'debit'; head[idx[1]].role = 'credit';
  }
  // Mỗi vai trò chỉ lấy cột đầu tiên (trừ ghi chú gộp nhiều cột)
  const seen = new Set();
  head.forEach((h) => { if (h.role && h.role !== 'desc') { if (seen.has(h.role)) h.role = 'khac'; else seen.add(h.role); } });
  const hasDesc = head.some((h) => h.role === 'desc');
  const year = yearHintOf(rows);
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.so_tien) out.push(cur); cur = null; };
  for (let i = hi + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells.some((c) => String(c.t).trim())) continue;
    if (headerScore(cells) >= 2) { flush(); continue; } // tiêu đề lặp lại ở trang sau
    const a = assign(cells, head, grid);
    const j = (r) => (a[r] || []).join(' ').trim();
    const all = cells.map((c) => c.t).join(' ');
    const desc = hasDesc ? j('desc') : [j('khac'), j('type')].filter(Boolean).join(' ');
    const d = dateFind(j('date'), year, true);
    if (!d && RE_TONG.test(bd(desc || all))) { flush(); continue; }
    if (RE_HONG.test(bd(j('status')))) { flush(); continue; }
    // Số tiền
    let amt = null;
    const lay = (r, sg) => {
      const parts = a[r] || [];
      for (const p of parts) { const v = amtCell(p); if (v && v.v) return { v: v.v, sign: sg || v.sign }; }
      return null;
    };
    const no = lay('debit', -1), co = lay('credit', 1), sotien = lay('amount', 0);
    if (no && co) amt = { v: Math.abs(co.v - no.v), sign: co.v >= no.v ? 1 : -1 };
    else amt = no || co || sotien;
    let doan = false, loaiFile = '';
    const cot1 = !no && !co && !!sotien, sgnGoc = amt ? amt.sign : 0;
    if (amt && !amt.sign) {
      loaiFile = LOAI_TU[bd(j('type'))] || '';
      amt.sign = loaiFile ? DAU_LOAI[loaiFile] : dauTuChu(j('type'));
      if (!amt.sign && !loaiFile) { amt.sign = dauTuChu(desc) || -1; doan = true; }
    } else if (amt) loaiFile = LOAI_TU[bd(j('type'))] || '';
    if (d) {
      flush();
      cur = { ngay: d.iso, sign: amt ? amt.sign : 0, so_tien: amt ? amt.v : 0, raw: desc, doan, cot1, sgnGoc };
      if (loaiFile) cur.loaiFile = loaiFile;
      ['cat', 'vi', 'vi_den', 'nguoi'].forEach((k) => { if (j(k)) cur[k] = j(k).replace(/^'(?=[=+\-@])/, ''); });
      if (/\d{1,2}:\d{2}/.test(j('date'))) cur.gio = j('date').match(/\d{1,2}:\d{2}/)[0];
    } else if (cur && amt && !cur.so_tien) { cur.so_tien = amt.v; cur.sign = amt.sign; cur.doan = doan; if (desc) cur.raw = (cur.raw + ' ' + desc).trim(); }
    else if (cur && !amt && desc) cur.raw = (cur.raw + ' ' + desc).trim();
  }
  flush();
  // Một cột số tiền: nếu file ghi dấu − cho tiền ra (và không có dấu +) thì số không dấu là tiền vào, và ngược lại
  const c1 = out.filter((t) => t.cot1);
  const am = c1.some((t) => t.sgnGoc < 0), duong = c1.some((t) => t.sgnGoc > 0);
  if (am !== duong) c1.forEach((t) => { if (t.doan) { t.sign = am ? 1 : -1; t.doan = false; } });
  return out;
}

// ---------- Không có tiêu đề: đọc theo dòng (ảnh chụp app, PDF lạ) ----------
function parseLines(rows) {
  const lines = rows.map((r) => r.map((c) => c.t).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const year = yearHintOf(rows);
  const info = lines.map((s) => {
    const b = bd(s);
    let d = dateFind(s, year, true);
    if (!d && /^(hom nay|today)\b/.test(b)) { d = { iso: homNay(0), i: 0, len: 0, hdr: true }; REL = true; }
    if (!d && /^(hom qua|yesterday)\b/.test(b)) { d = { iso: homNay(1), i: 0, len: 0, hdr: true }; REL = true; }
    if (!d && /^hom kia\b/.test(b)) { d = { iso: homNay(2), i: 0, len: 0, hdr: true }; REL = true; }
    if (!d) { const iso = thuFind(b); if (iso) { d = { iso, i: 0, len: 0, hdr: true }; REL = true; } }
    // "Thứ Bảy, 12/09", "Hôm nay 05/10": dòng tiêu đề ngày có kèm thứ → cũng là tiêu đề nhóm
    if (d && d.len && /^(thu\s*(\d|hai|ba|tu|nam|sau|bay)|chu nhat|cn|hom nay|hom qua)\b/.test(b)) d.hdr = true;
    const am = amtFind(s).filter((x) => !d || x.i + x.len <= d.i || x.i >= d.i + d.len);
    const amt = am.find((x) => x.sign) || am.find((x) => x.cur) || am[am.length - 1] || null;
    let rest = s;
    if (amt) rest = rest.slice(0, amt.i) + ' ' + rest.slice(amt.i + amt.len);
    if (d && d.len) rest = rest.replace(s.substr(d.i, d.len), ' ');
    rest = rest.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ').replace(/^[\s\-–|•·]+|[\s\-–|•·]+$/g, '').replace(/\s+/g, ' ').trim();
    const chu = (rest.match(/[A-Za-zÀ-ỹ]/g) || []).length;
    const tong = RE_TONG.test(b) || /(so du|balance)/.test(b);
    return { s, d, amt, rest, chu, tong, hong: RE_HONG.test(b) };
  });
  const out = [];
  let lastDate = null;
  info.forEach((x, i) => {
    if (x.d && !x.amt) lastDate = x.d.iso;
    if (!x.amt || x.tong) return;
    if (!x.amt.sign && !x.amt.cur) return;
    const prev = info[i - 1], next = info[i + 1];
    let ngay = x.d ? x.d.iso : null;
    // tiêu đề tương đối (Hôm nay, Thứ 7…) luôn đứng TRÊN nhóm giao dịch của nó nên không lấy cho dòng phía trên
    if (!ngay && next && next.d && !next.amt && !next.d.hdr) ngay = next.d.iso;
    if (!ngay && prev && prev.d && !prev.amt && prev.chu < 4) ngay = prev.d.iso;
    if (!ngay) ngay = lastDate;
    if (!ngay) return;
    let note = x.chu >= 3 ? x.rest : '';
    if (!note && prev && !prev.amt && prev.chu >= 3 && !prev.tong) note = prev.rest;
    if (!note && next && !next.amt && next.chu >= 3 && !(next.d && next.chu < 4)) note = next.rest;
    const hong = x.hong || (next && !next.amt && next.hong && next.chu < 25);
    if (hong) return;
    const dg = x.amt.sign ? 0 : dauTuChu(note);
    out.push({ ngay, sign: x.amt.sign || dg || -1, so_tien: x.amt.v, raw: note, doan: !x.amt.sign && !dg });
  });
  return out;
}

/**
 * Phân tích sao kê. rows: mảng dòng (mảng chuỗi hoặc ô {t,x0,x1}); opts.grid = true với CSV/xlsx.
 * -> { items, mode, bank, card, year }
 */
export function parseStatement(rows, { grid = false, fileName = '', ref = '' } = {}) {
  REF = /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : ''; REL = false;
  rows = (rows || []).map(toCells).filter((r) => r.some((c) => String(c.t).trim()));
  const text = rows.map((r) => r.map((c) => c.t).join(' ')).join('\n');
  const src = detectSource(text, fileName);
  const hi = findHeader(rows);
  let items = hi >= 0 ? parseTable(rows, hi, grid) : [];
  let mode = 'table';
  if (!items.length) { items = parseLines(rows); mode = 'lines'; }
  // Sao kê thẻ tín dụng một cột số tiền: số không dấu = chi tiêu, số âm / CR = thanh toán vào thẻ
  if (src.card && mode === 'table') items.forEach((t) => { if (t.cot1 && !t.loaiFile) { t.sign = t.sgnGoc ? 1 : -1; t.doan = false; } });
  // Năm không chắc (dd/mm) mà rơi vào tương lai -> lùi 1 năm
  const mai = homNay(-1);
  items.forEach((t) => {
    if (t.ngay > mai) { const y = +t.ngay.slice(0, 4) - 1; const iso = okDate(y, +t.ngay.slice(5, 7), +t.ngay.slice(8, 10)); if (iso) t.ngay = iso; }
    t.ghi_chu = cleanNote(t.raw) || (src.bank ? 'Giao dịch ' + src.bank : 'Giao dịch sao kê');
  });
  return { items, mode, bank: src.bank, card: src.card, text, ref: homNay(0), rel: REL };
}
