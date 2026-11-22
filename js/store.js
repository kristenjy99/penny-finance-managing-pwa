// Dữ liệu trong bộ nhớ + lưu IndexedDB + hàng đợi thay đổi + các phép tính
import * as db from './db.js';
import { boDau, nfc, chuanCoDau, chuanKhongDau, nowIso, uid, ym, thisMonth, sum, setNumFormat, today, toDate } from './util.js';
import { setBrandIcon } from './ui.js';

// Loại giao dịch: dùng đúng chuỗi bot ghi trong Sheet
export const L = { CHI: 'chi', THU: 'thu', CHUYEN: 'chuyển', CHO_VAY: 'cho vay', DI_VAY: 'đi vay', THU_NO: 'thu nợ', TRA_NO: 'trả nợ' };
export const NHAN = { 'chi': 'Chi', 'thu': 'Thu', 'chuyển': 'Chuyển khoản', 'cho vay': 'Cho vay', 'đi vay': 'Đi vay', 'thu nợ': 'Thu nợ', 'trả nợ': 'Trả nợ' };
// Chiều tiền với ví: -1 tiền ra, +1 tiền vào
export const DAU = { 'chi': -1, 'thu': 1, 'chuyển': 0, 'cho vay': -1, 'đi vay': 1, 'thu nợ': 1, 'trả nợ': -1 };
export const NO_TYPES = [L.CHO_VAY, L.DI_VAY, L.THU_NO, L.TRA_NO];
export const NHOM_VI = ['Tiền mặt', 'Ví điện tử', 'Ngân hàng', 'Thẻ tín dụng'];
export const NHOM_THE = 'Thẻ tín dụng';
// Nhóm ví hiển thị: nhóm cũ "Tiền mặt & ví điện tử" (trước 0.5.1) tách theo tên ví
export function accGroup(a) {
  const n = nfc(a.nhom);
  if (boDau(n) === 'tien mat & vi dien tu') return /tien mat|cash/.test(boDau(a.ten_vi)) ? 'Tiền mặt' : 'Ví điện tử';
  return n || 'Khác';
}
export const isCard = (a) => accGroup(a) === NHOM_THE;
export const DM_CHUA = 'Chưa phân loại';
export const DM_THU_KHAC = 'Thu nhập khác';

export const S = {
  tx: [], acc: [], cat: [], kw: [], bud: [], ppl: [], set: {},
  sheetName: '', since: '', lastSync: '', apiVer: '', pending: 0, syncing: false, syncErr: '',
  month: thisMonth(), ready: false
};

// ---------- Sự kiện thay đổi ----------
const subs = new Set();
export const onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
let emitT = null;
export const emit = (why = 'data') => { clearTimeout(emitT); emitT = setTimeout(() => subs.forEach((f) => f(why)), 0); };

// ---------- Nạp từ IndexedDB ----------
export async function load() {
  const [tx, tables, meta, q] = await Promise.all([db.getAll('tx'), db.kvGet('tables'), db.kvGet('meta'), db.getAll('queue')]);
  S.tx = (tx || []).map(normTx);
  Object.assign(S, defaults(), tables || {});
  Object.assign(S, meta || {});
  S.pending = q.length;
  applySettings();
  S.ready = true;
}
function defaults() {
  return {
    acc: [{ ten_vi: 'Tiền mặt', nhom: 'Tiền mặt & ví điện tử', so_du_dau: 0 }],
    cat: [{ danh_muc: DM_CHUA, nhom: 'Khác', ky_hieu: '❓', loai: 'chi' }, { danh_muc: DM_THU_KHAC, nhom: 'Thu nhập', ky_hieu: '➕', loai: 'thu' }],
    kw: [], bud: [], ppl: [], set: {}
  };
}
export const saveTables = () => db.kvSet('tables', { acc: S.acc, cat: S.cat, kw: S.kw, bud: S.bud, ppl: S.ppl, set: S.set });
export const saveMeta = () => db.kvSet('meta', { sheetName: S.sheetName, since: S.since, lastSync: S.lastSync, apiVer: S.apiVer });

export function normTx(t) {
  return {
    id: String(t.id || ''), ngay: String(t.ngay || '').slice(0, 10), loai: nfc(t.loai).toLowerCase(),
    so_tien: Math.abs(Math.round(Number(t.so_tien) || 0)), ghi_chu: nfc(t.ghi_chu), danh_muc: nfc(t.danh_muc),
    vi: nfc(t.vi), vi_den: nfc(t.vi_den), nguoi: nfc(t.nguoi), nguon: nfc(t.nguon) || 'web',
    updated_at: String(t.updated_at || ''), da_xoa: !!t.da_xoa
  };
}

// ---------- Cài đặt ----------
export const setting = (k, d = '') => (S.set[k] != null && S.set[k] !== '' ? String(S.set[k]) : d);
export const weekStart = () => (boDau(setting('week_start', 'thứ 2')).includes('chu nhat') ? 0 : 1);
export const defaultAccount = () => setting('default_account', S.acc[0] ? S.acc[0].ten_vi : 'Tiền mặt');
export function themeMode() {
  const t = boDau(setting('theme', localStorage.getItem('penny_theme') || 'auto'));
  return t.startsWith('sang') || t === 'light' ? 'light' : t.startsWith('toi') || t === 'dark' ? 'dark' : 'auto';
}
// ---------- Giao diện riêng: tên app, icon app, màu (Settings: app_name, app_icon, theme_colors) ----------
export const appName = () => setting('app_name', 'Penny');
// Màu giao diện sáng (theme_colors là JSON {preset, acc, bg, bg2, line, bd, inc, exp}); {} = mặc định
export function themeColors() { try { const o = JSON.parse(setting('theme_colors', '{}')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
const HEX = /^#[0-9a-f]{6}$/i;
// Pha 2 màu hex theo tỉ lệ t (0..1)
export function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function applyBrand(dark) {
  const c = themeColors();
  const tok = { acc: '--acc', bg: '--bg', bg2: '--bg2', line: '--line', bd: '--bd', inc: '--inc', exp: '--exp' };
  let css = '';
  Object.entries(tok).forEach(([k, v]) => { if (HEX.test(c[k] || '')) css += `${v}:${c[k]};`; });
  if (HEX.test(c.acc || '')) css += `--acc2:${mixHex(c.acc, '#3A2E4D', 0.25)};`;
  let st = document.getElementById('brand-css');
  if (!st) { st = document.createElement('style'); st.id = 'brand-css'; document.head.appendChild(st); }
  st.textContent = css ? `[data-theme="light"]{${css}}` : '';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#5B4A72' : (HEX.test(c.acc || '') ? c.acc : '#C5B3D3');
  document.title = appName();
  const icon = setting('app_icon');
  setBrandIcon(icon);
  const ok = /^data:image\//.test(icon);
  document.querySelectorAll('link[rel=icon]').forEach((l, i) => {
    if (!l.dataset.goc) l.dataset.goc = l.getAttribute('href') + '|' + (l.getAttribute('type') || '');
    const [href, type] = l.dataset.goc.split('|');
    l.href = ok ? icon : href;
    l.type = ok ? 'image/png' : type;
  });
}
export function applySettings() {
  setNumFormat(setting('number_format', '1.234.567'));
  const mode = themeMode();
  localStorage.setItem('penny_theme', mode);
  const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyBrand(dark);
}

// ---------- Hàng đợi ----------
async function enqueue(op) {
  const q = await db.getAll('queue');
  // Gộp thao tác trùng: cùng giao dịch / cùng khóa cài đặt / cùng ngân sách -> giữ bản sau
  const same = q.filter((x) =>
    (op.t === 'tx' && x.t === 'tx' && (x.row ? x.row.id : x.id) === (op.row ? op.row.id : op.id)) ||
    (op.t === 'set' && x.t === 'set' && x.row.khoa === op.row.khoa) ||
    (op.t === 'bud' && x.t === 'bud' && boDau(x.row.nhom) === boDau(op.row.nhom) && x.row.thang === op.row.thang));
  if (same.length) await db.del('queue', same.map((x) => x.qid));
  await db.put('queue', op);
  S.pending = q.length - same.length + 1;
  emit('queue');
  window.dispatchEvent(new Event('penny-queued'));
}

// ---------- Giao dịch ----------
export const live = () => S.tx.filter((t) => !t.da_xoa);
export const byId = (id) => S.tx.find((t) => t.id === id);

export async function saveTx(t) {
  const x = normTx({ ...t, id: t.id || uid(), updated_at: nowIso(), nguon: t.nguon || 'web', da_xoa: false });
  if (x.loai !== L.CHUYEN) x.vi_den = '';
  const i = S.tx.findIndex((y) => y.id === x.id);
  if (i >= 0) S.tx[i] = x; else S.tx.push(x);
  if (x.nguoi && NO_TYPES.includes(x.loai) && !S.ppl.some((p) => boDau(p.ten) === boDau(x.nguoi))) {
    S.ppl.push({ ten: x.nguoi, ghi_chu: '' });
    await saveTables();
    await enqueue({ t: 'ppl', op: 'put', row: { ten: x.nguoi, ghi_chu: '' } });
  }
  await db.put('tx', x);
  await enqueue({ t: 'tx', op: 'put', row: x });
  emit();
  return x;
}

export async function saveMany(list) {
  const out = [];
  for (const t of list) out.push(await saveTx(t));
  return out;
}

export async function deleteTx(id) {
  const x = byId(id);
  if (!x) return;
  x.da_xoa = true; x.updated_at = nowIso();
  await db.put('tx', x);
  await enqueue({ t: 'tx', op: 'del', id, updated_at: x.updated_at });
  emit();
}

// ---------- Bảng nhỏ ----------
async function tablePut(t, arr, keyCol, row, oldKey) {
  const k = oldKey != null ? oldKey : row[keyCol];
  const i = arr.findIndex((r) => r[keyCol] === k);
  if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
  await saveTables();
  await enqueue({ t, op: 'put', key: k, row });
  emit();
}
async function tableDel(t, arr, keyCol, key) {
  const i = arr.findIndex((r) => r[keyCol] === key);
  if (i >= 0) arr.splice(i, 1);
  await saveTables();
  await enqueue({ t, op: 'del', key });
  emit();
}
// Đổi tên -> sửa luôn giao dịch trên máy (server cũng tự sửa)
async function renameInTx(col, oldV, newV) {
  if (!oldV || oldV === newV) return;
  const ch = S.tx.filter((t) => t[col] === oldV);
  ch.forEach((t) => { t[col] = newV; });
  if (ch.length) await db.put('tx', ch);
}

export async function saveAcc(row, oldKey) {
  const r0 = row;
  row = { ten_vi: nfc(row.ten_vi), nhom: nfc(row.nhom) || NHOM_VI[0], so_du_dau: Math.round(Number(row.so_du_dau) || 0) };
  // Biểu tượng ví (emoji, chữ hoặc ảnh nhỏ data:image) và tên tắt cho bot: chỉ gửi khi có / khi đã từng có
  const cu = S.acc.find((a) => a.ten_vi === (oldKey || row.ten_vi)) || {};
  if (r0.ky_hieu !== undefined && (r0.ky_hieu || cu.ky_hieu)) row.ky_hieu = String(r0.ky_hieu || '');
  if (r0.viet_tat !== undefined && (r0.viet_tat || cu.viet_tat)) row.viet_tat = nfc(r0.viet_tat);
  // Thẻ tín dụng: hạn mức, ngày sao kê, ngày đến hạn, % thanh toán tối thiểu, ví thanh toán
  if (row.nhom === NHOM_THE) {
    const ngay = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 31 ? n : 0; };
    Object.assign(row, { han_muc: Math.round(Math.abs(Number(r0.han_muc) || 0)), ngay_sao_ke: ngay(r0.ngay_sao_ke), ngay_den_han: ngay(r0.ngay_den_han),
      tt_toi_thieu: Math.min(100, Math.max(0, Number(r0.tt_toi_thieu) || 0)), vi_thanh_toan: nfc(r0.vi_thanh_toan) });
  }
  if (oldKey && oldKey !== row.ten_vi) {
    await renameInTx('vi', oldKey, row.ten_vi); await renameInTx('vi_den', oldKey, row.ten_vi);
    if (setting('default_account') === oldKey) S.set.default_account = row.ten_vi;
    S.acc.forEach((a) => { if (a.vi_thanh_toan === oldKey) a.vi_thanh_toan = row.ten_vi; });
  }
  await tablePut('acc', S.acc, 'ten_vi', row, oldKey);
}
export const deleteAcc = (key) => tableDel('acc', S.acc, 'ten_vi', key);

export async function saveCat(row, oldKey) {
  row = { danh_muc: nfc(row.danh_muc), nhom: nfc(row.nhom) || 'Khác', ky_hieu: nfc(row.ky_hieu), loai: row.loai === 'thu' ? 'thu' : 'chi' };
  if (oldKey && oldKey !== row.danh_muc) {
    await renameInTx('danh_muc', oldKey, row.danh_muc);
    S.kw.forEach((k) => { if (k.danh_muc === oldKey) k.danh_muc = row.danh_muc; });
  }
  await tablePut('cat', S.cat, 'danh_muc', row, oldKey);
}
export async function deleteCat(key) {
  S.kw = S.kw.filter((k) => k.danh_muc !== key);
  await tableDel('cat', S.cat, 'danh_muc', key);
}
export async function saveKw(row, oldKey) {
  row = { tu_khoa: nfc(row.tu_khoa).toLowerCase(), danh_muc: nfc(row.danh_muc) };
  const k = oldKey != null ? oldKey : (S.kw.find((x) => x.tu_khoa.toLowerCase() === row.tu_khoa) || {}).tu_khoa;
  await tablePut('kw', S.kw, 'tu_khoa', row, k);
}
export const deleteKw = (key) => tableDel('kw', S.kw, 'tu_khoa', key);
export async function savePerson(row, oldKey) {
  row = { ten: nfc(row.ten), ghi_chu: nfc(row.ghi_chu) };
  if (oldKey && oldKey !== row.ten) await renameInTx('nguoi', oldKey, row.ten);
  await tablePut('ppl', S.ppl, 'ten', row, oldKey);
}
export const deletePerson = (key) => tableDel('ppl', S.ppl, 'ten', key);

// Ngân sách: khóa = nhóm + tháng
export async function saveBudget(nhom, thang, hanMuc, nhomMoi) {
  const i = S.bud.findIndex((b) => boDau(b.nhom) === boDau(nhom) && b.thang === thang);
  const row = { nhom: nhomMoi || nhom, thang, han_muc: Math.round(hanMuc) };
  if (i >= 0) S.bud[i] = row; else S.bud.push(row);
  await saveTables();
  await enqueue({ t: 'bud', op: 'put', row: { nhom, thang, han_muc: row.han_muc, nhom_moi: nhomMoi || '' } });
  emit();
}
// Bỏ ngân sách nhóm cho tháng k: xóa dòng của tháng; nếu vẫn còn hạn mức kế thừa từ tháng trước thì đặt 0
export async function removeBudget(nhom, thang) {
  const i = S.bud.findIndex((b) => boDau(b.nhom) === boDau(nhom) && b.thang === thang);
  if (i >= 0) {
    S.bud.splice(i, 1);
    await saveTables();
    await enqueue({ t: 'bud', op: 'del', row: { nhom, thang } });
  }
  const conLai = effBudget(nhom, thang);
  if (conLai && conLai.han_muc > 0) await saveBudget(nhom, thang, 0);
  emit();
}

/** Đổi tên nhóm: đổi nhóm của mọi danh mục và mọi dòng ngân sách (mọi tháng) đang dùng tên cũ */
export async function renameGroup(oldN, newN) {
  newN = nfc(newN);
  if (!newN || newN === oldN) return;
  const ops = [];
  S.cat.filter((c) => boDau(c.nhom) === boDau(oldN)).forEach((c) => {
    c.nhom = newN;
    ops.push({ t: 'cat', op: 'put', key: c.danh_muc, row: { ...c } });
  });
  S.bud.filter((b) => boDau(b.nhom) === boDau(oldN)).forEach((b) => {
    ops.push({ t: 'bud', op: 'put', row: { nhom: b.nhom, thang: b.thang, han_muc: b.han_muc, nhom_moi: newN } });
    b.nhom = newN;
  });
  await saveTables();
  for (const op of ops) await enqueue(op);
  emit();
}

/** Thêm nhiều giao dịch một lần (nhập CSV): ghi máy + hàng đợi trong một lượt */
export async function importTx(list) {
  const now = nowIso();
  const xs = list.map((t) => {
    const x = normTx({ ...t, id: uid(), updated_at: now, nguon: t.nguon || 'web', da_xoa: false });
    if (x.loai !== L.CHUYEN) x.vi_den = '';
    return x;
  });
  const moi = [];
  xs.forEach((x) => {
    if (x.nguoi && NO_TYPES.includes(x.loai) && !S.ppl.concat(moi).some((p) => boDau(p.ten) === boDau(x.nguoi))) moi.push({ ten: x.nguoi, ghi_chu: '' });
  });
  S.tx.push(...xs);
  if (moi.length) { S.ppl.push(...moi); await saveTables(); }
  await db.put('tx', xs);
  await db.put('queue', moi.map((p) => ({ t: 'ppl', op: 'put', row: p })).concat(xs.map((x) => ({ t: 'tx', op: 'put', row: x }))));
  S.pending = (await db.getAll('queue')).length;
  emit('queue'); emit();
  window.dispatchEvent(new Event('penny-queued'));
  return xs;
}

export async function setSetting(khoa, giaTri) {
  S.set[khoa] = giaTri;
  applySettings();
  await saveTables();
  await enqueue({ t: 'set', op: 'put', row: { khoa, gia_tri: giaTri } });
  emit();
}

// ---------- Danh mục & phân loại ----------
export const catOf = (name) => S.cat.find((c) => c.danh_muc === name) || S.cat.find((c) => boDau(c.danh_muc) === boDau(name));
export const groupOf = (name) => { const c = catOf(name); return c ? c.nhom || 'Khác' : 'Khác'; };
export const symbolOf = (t) => {
  if (NO_TYPES.includes(t.loai)) return (t.nguoi || '?').charAt(0).toUpperCase();
  if (t.loai === L.CHUYEN) return '⇄';
  const c = catOf(t.danh_muc);
  return (c && c.ky_hieu) || (t.danh_muc || t.ghi_chu || '?').charAt(0).toUpperCase();
};
export const catsFor = (loai) => S.cat.filter((c) => (loai === 'thu' ? c.loai === 'thu' : c.loai !== 'thu'));
// Nhóm chi theo thứ tự trong Categories
export function chiGroups() {
  const out = [];
  S.cat.forEach((c) => { if (c.loai !== 'thu' && !out.some((g) => boDau(g) === boDau(c.nhom))) out.push(c.nhom || 'Khác'); });
  return out;
}

/** Tìm danh mục theo từ khóa trong đoạn chữ (giống bot): từ khóa dài nhất thắng, so có dấu rồi không dấu. */
export function classify(text, loai) {
  if (!String(text || '').trim()) return null;
  const want = loai === 'thu' ? 'thu' : 'chi';
  const cap = S.kw.map((k) => ({ tu: k.tu_khoa, dm: catOf(k.danh_muc) }))
    .concat(S.cat.map((c) => ({ tu: c.danh_muc, dm: c })))
    .filter((x) => x.dm && (x.dm.loai === 'thu' ? 'thu' : 'chi') === want && x.dm.danh_muc !== DM_CHUA && x.dm.danh_muc !== DM_THU_KHAC);
  const chon = (chuan) => {
    const c = chuan(text);
    let best = null;
    cap.forEach((x) => {
      const k = chuan(x.tu);
      if (!k.trim()) return;
      const vt = c.indexOf(k);
      if (vt < 0) return;
      if (!best || k.length > best.dai || (k.length === best.dai && vt < best.vt)) best = { dai: k.length, vt, dm: x.dm };
    });
    return best ? best.dm.danh_muc : null;
  };
  return chon(chuanCoDau) || chon(chuanKhongDau);
}
export const fallbackCat = (loai) => (loai === 'thu' ? DM_THU_KHAC : DM_CHUA);

// ---------- Phép tính ----------
export const inMonth = (k, list = live()) => list.filter((t) => t.ngay.slice(0, 7) === k);
export const totals = (list) => ({
  thu: sum(list.filter((t) => t.loai === L.THU), (t) => t.so_tien),
  chi: sum(list.filter((t) => t.loai === L.CHI), (t) => t.so_tien)
});
// Giá trị có dấu để hiển thị một giao dịch
export const signedAmt = (t) => (DAU[t.loai] || 0) * t.so_tien;
// Tổng có dấu của một ngày (thu − chi, không tính chuyển khoản/công nợ)
export const dayNet = (list) => { const s = totals(list); return s.thu - s.chi; };

// Ngày cuối (dạng chuỗi so sánh được) của tháng k; '' = không giới hạn
const endOf = (k) => (k ? k + '-31' : '9999-12-31');

/**
 * Số dư từng ví tính tới hết tháng k: số dư đầu + mọi dòng tiền theo chiều tiền với ví (gồm chuyển khoản, công nợ).
 * thu / chi = tiền vào / ra ví đó trong tháng k (gồm chuyển khoản, công nợ).
 */
export function wallets(k = S.month) {
  const end = endOf(k);
  const map = new Map();
  const get = (name) => {
    if (!map.has(name)) map.set(name, { ten_vi: name, nhom: 'Khác', so_du_dau: 0, bal: 0, thu: 0, chi: 0, ngoai: true });
    return map.get(name);
  };
  S.acc.forEach((a) => map.set(a.ten_vi, { ...a, nhom: accGroup(a), bal: Number(a.so_du_dau) || 0, thu: 0, chi: 0 }));
  live().forEach((t) => {
    if (t.ngay > end) return;
    const trongThang = t.ngay.slice(0, 7) === k;
    if (t.loai === L.CHUYEN) {
      if (t.vi) { const w = get(t.vi); w.bal -= t.so_tien; if (trongThang) w.chi += t.so_tien; }
      if (t.vi_den) { const w = get(t.vi_den); w.bal += t.so_tien; if (trongThang) w.thu += t.so_tien; }
      return;
    }
    if (!t.vi) return;
    const w = get(t.vi);
    const d = DAU[t.loai] || 0;
    w.bal += d * t.so_tien;
    if (trongThang) { if (d > 0) w.thu += t.so_tien; else if (d < 0) w.chi += t.so_tien; }
  });
  return [...map.values()];
}

/**
 * Công nợ từng người (tới hết tháng k, bỏ trống k = mọi thời điểm).
 * du = cho vay + trả nợ − đi vay − thu nợ: du > 0 họ nợ mình (phải thu), du < 0 mình nợ họ (phải trả).
 */
export function debts(k = '') {
  const end = endOf(k);
  const map = new Map();
  const mk = (ten) => ({ ten, du: 0, choVay: 0, diVay: 0, thuNo: 0, traNo: 0, hist: [] });
  S.ppl.forEach((p) => { if (!map.has(boDau(p.ten))) map.set(boDau(p.ten), mk(p.ten)); });
  live().filter((t) => NO_TYPES.includes(t.loai) && t.nguoi && t.ngay <= end).sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)).forEach((t) => {
    const k2 = boDau(t.nguoi);
    if (!map.has(k2)) map.set(k2, mk(t.nguoi));
    const p = map.get(k2);
    if (t.loai === L.CHO_VAY) { p.choVay += t.so_tien; p.du += t.so_tien; }
    if (t.loai === L.TRA_NO) { p.traNo += t.so_tien; p.du += t.so_tien; }
    if (t.loai === L.DI_VAY) { p.diVay += t.so_tien; p.du -= t.so_tien; }
    if (t.loai === L.THU_NO) { p.thuNo += t.so_tien; p.du -= t.so_tien; }
    p.hist.push(t);
  });
  return [...map.values()];
}
// Ảnh hưởng của một giao dịch công nợ lên số dư người đó (+ làm họ nợ mình nhiều hơn)
export const debtSign = (loai) => (loai === L.CHO_VAY || loai === L.TRA_NO ? 1 : -1);

// ---------- Thẻ tín dụng ----------
const p2 = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
// Ngày `d` của tháng (y, m), m tính từ 1, có thể tràn sang năm khác; ngày lớn hơn số ngày của tháng -> ngày cuối tháng
function dayOf(y, m, d) { const t = new Date(y, m - 1, 1); y = t.getFullYear(); m = t.getMonth() + 1; return y + '-' + p2(m) + '-' + p2(Math.min(d, lastDay(y, m))); }
// Dòng tiền có dấu của một ví (vào +, ra −), sắp theo ngày
function flowsOf(name) {
  const out = [];
  live().forEach((t) => {
    if (t.loai === L.CHUYEN) { if (t.vi === name) out.push({ ngay: t.ngay, v: -t.so_tien }); if (t.vi_den === name) out.push({ ngay: t.ngay, v: t.so_tien }); return; }
    if (t.vi === name && DAU[t.loai]) out.push({ ngay: t.ngay, v: DAU[t.loai] * t.so_tien });
  });
  return out;
}
/**
 * Tình trạng thẻ tín dụng tại ngày ref (mặc định: hôm nay nếu đang xem tháng này, không thì cuối tháng đang xem).
 * Dư nợ = −số dư. Kỳ sao kê gần nhất chốt vào ngày sao kê ≤ ref; cần trả = dư nợ lúc chốt − tiền đã trả vào thẻ sau ngày chốt.
 */
export function cardInfo(a, ref) {
  if (!ref) { const td = today(); ref = S.month >= ym(td) ? td : S.month + '-' + p2(lastDay(+S.month.slice(0, 4), +S.month.slice(5))); }
  const fl = flowsOf(a.ten_vi);
  const balAt = (d) => (Number(a.so_du_dau) || 0) + sum(fl.filter((x) => x.ngay <= d), (x) => x.v);
  const no = Math.max(0, -balAt(ref));
  const lim = Number(a.han_muc) || 0;
  const o = { ref, no, lim, con: lim - no, ratio: lim ? no / lim : 0 };
  const sk = Number(a.ngay_sao_ke) || 0, dh = Number(a.ngay_den_han) || 0;
  if (!sk) return o;
  const [y, m] = ref.split('-').map(Number);
  let ngaySk = dayOf(y, m, sk);
  if (ngaySk > ref) ngaySk = dayOf(y, m - 1, sk);
  const [ys, ms] = ngaySk.split('-').map(Number);
  o.ngaySk = ngaySk;
  o.skSau = dayOf(ys, ms + 1, sk);
  o.noSk = Math.max(0, -balAt(ngaySk));
  o.daTra = sum(fl.filter((x) => x.ngay > ngaySk && x.ngay <= ref && x.v > 0), (x) => x.v);
  o.chiKy = sum(fl.filter((x) => x.ngay > ngaySk && x.ngay <= ref && x.v < 0), (x) => -x.v);
  o.canTra = Math.max(0, o.noSk - o.daTra);
  const pct = Number(a.tt_toi_thieu) || 0;
  o.toiThieu = pct ? Math.min(o.canTra, Math.max(0, Math.ceil(o.noSk * pct / 100) - o.daTra)) : 0;
  if (dh) {
    o.hanTra = dayOf(ys, dh > sk ? ms : ms + 1, dh);
    o.conNgay = Math.round((toDate(o.hanTra) - toDate(ref)) / 864e5);
    o.quaHan = o.canTra > 0 && ref > o.hanTra;
  }
  return o;
}

// ---------- Gợi ý danh mục (cùng cách với bot) ----------
// Khoảng cách chỉnh sửa giữa 2 chuỗi ngắn, để bắt lỗi gõ
function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let pr = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cu = [i];
    for (let j = 1; j <= b.length; j++) cu.push(Math.min(pr[j] + 1, cu[j - 1] + 1, pr[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    pr = cu;
  }
  return pr[b.length];
}
const words = (s) => boDau(s).split(/[^0-9a-z]+/).filter((w) => w.length >= 2);
// Danh mục sắp theo nhóm (thứ tự nhóm = lần đầu xuất hiện trong Categories), giữ thứ tự trong nhóm
export function catsSorted(loai) {
  const list = loai ? catsFor(loai) : S.cat.slice();
  const order = [];
  list.forEach((c) => { const g = c.nhom || 'Khác'; if (!order.includes(g)) order.push(g); });
  return list.map((c, i) => [c, i]).sort((a, b) => order.indexOf(a[0].nhom || 'Khác') - order.indexOf(b[0].nhom || 'Khác') || a[1] - b[1]).map((x) => x[0]);
}
/**
 * Gợi ý danh mục cho chữ q (người gõ tìm) và ghi chú note. Trả về [{c, diem, khop}] sắp giảm dần.
 * khop = có khớp chữ/ghi chú (không chỉ do dùng nhiều).
 */
export function suggestCats(q, note, loai) {
  const lo = loai === L.THU ? 'thu' : 'chi';
  const bo = fallbackCat(lo);
  const dms = catsFor(lo).filter((c) => c.danh_muc !== bo);
  const diem = new Map();
  const dat = (ten, v) => { if (v > (diem.get(ten) || 0)) diem.set(ten, v); };
  const qq = boDau(q);
  if (qq) {
    const qt = words(q);
    dms.forEach((c) => {
      const k = boDau(c.danh_muc), g = boDau(c.nhom);
      if (k === qq) dat(c.danh_muc, 100);
      else if (k.startsWith(qq) || qq.startsWith(k)) dat(c.danh_muc, 80);
      else if (k.includes(qq) || qq.includes(k)) dat(c.danh_muc, 60);
      else if (words(c.danh_muc).some((w) => qt.includes(w))) dat(c.danh_muc, 45);
      else if (editDist(k, qq) <= (qq.length > 5 ? 2 : 1)) dat(c.danh_muc, 40);
      else if (g.includes(qq)) dat(c.danh_muc, 25);
    });
    S.kw.forEach((x) => {
      const c = dms.find((d) => d.danh_muc === x.danh_muc);
      if (!c) return;
      const k = boDau(x.tu_khoa);
      if (k === qq) dat(c.danh_muc, 75); else if (k.includes(qq) || (k.length >= 3 && qq.includes(k))) dat(c.danh_muc, 50);
    });
  }
  const nn = boDau(note);
  if (nn) { const k = classify(note, lo); if (k && k !== bo) dat(k, 85); }
  const dem = new Map();
  const nt = words(note);
  live().filter((t) => t.loai === lo && t.danh_muc && t.danh_muc !== bo).slice(-400).forEach((t) => {
    if (!dms.some((d) => d.danh_muc === t.danh_muc)) return;
    dem.set(t.danh_muc, (dem.get(t.danh_muc) || 0) + 1);
    if (!nn) return;
    if (boDau(t.ghi_chu) === nn) dat(t.danh_muc, 90);
    else if (words(t.ghi_chu).some((w) => w.length >= 3 && nt.includes(w))) dat(t.danh_muc, 30);
  });
  const maxDem = Math.max(1, ...dem.values());
  return dms.map((c, i) => ({ c, i, khop: diem.has(c.danh_muc), diem: (diem.get(c.danh_muc) || 0) + 10 * (dem.get(c.danh_muc) || 0) / maxDem }))
    .sort((a, b) => b.diem - a.diem || a.i - b.i);
}

/** Tài sản, nợ, phải thu, phải trả, vốn ròng tính tới hết tháng k */
export function netWorth(k = S.month) {
  const ws = wallets(k);
  const assets = sum(ws.filter((w) => w.bal > 0), (w) => w.bal);
  const liab = sum(ws.filter((w) => w.bal < 0), (w) => -w.bal);
  const ds = debts(k);
  const recv = sum(ds.filter((d) => d.du > 0), (d) => d.du);
  const pay = sum(ds.filter((d) => d.du < 0), (d) => -d.du);
  return { assets, liab, recv, pay, net: assets + recv - liab - pay, total: assets - liab };
}

/** Hạn mức hiệu lực của nhóm cho tháng k: tháng đó, nếu chưa đặt thì tháng gần nhất trước đó (giống bot). */
export function effBudget(nhom, k) {
  let best = null;
  S.bud.forEach((b) => {
    if (boDau(b.nhom) !== boDau(nhom) || !b.thang || b.thang > k) return;
    if (!best || b.thang > best.thang) best = b;
  });
  return best;
}
export function budgets(k = S.month) {
  const names = [];
  const add = (n) => { if (n && !names.some((x) => boDau(x) === boDau(n))) names.push(n); };
  chiGroups().forEach(add);
  S.bud.forEach((b) => add(b.nhom));
  const spent = {};
  inMonth(k).filter((t) => t.loai === L.CHI).forEach((t) => { const g = boDau(groupOf(t.danh_muc)); spent[g] = (spent[g] || 0) + t.so_tien; });
  return names.map((n) => {
    const b = effBudget(n, k);
    const lim = b ? Number(b.han_muc) || 0 : 0;
    const chi = spent[boDau(n)] || 0;
    return { nhom: n, lim, chi, ratio: lim ? chi / lim : 0, inherited: b && b.thang !== k ? b.thang : '' };
  }).filter((x) => x.lim > 0);
}
// Ngưỡng màu giống /tong: dưới 80% / 80–100% / trên 100%
export const level = (r) => (r > 1 ? 'over' : r >= 0.8 ? 'mid' : '');

// Ví đã biết (Accounts + tên xuất hiện trong giao dịch)
export const walletNames = () => wallets('').map((w) => w.ten_vi);
export const personNames = () => debts().map((d) => d.ten);
