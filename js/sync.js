// Đồng bộ với Apps Script API: đẩy hàng đợi lên trước, rồi kéo dữ liệu về
import * as db from './db.js';
import { S, emit, normTx, saveTables, saveMeta, applySettings } from './store.js';

const KEY = 'penny_cfg';
export function cfg() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
}
export function setCfg(patch) {
  const c = { ...cfg(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(c));
  return c;
}
export const connected = () => { const c = cfg(); return !!(c.url && c.token); };
export const autoOn = () => cfg().auto !== false;

// Gọi API: POST text/plain để tránh CORS preflight
export async function api(action, body = {}, url, token) {
  const c = cfg();
  url = url || c.url; token = token || c.token;
  if (!url || !token) throw new Error('Chưa nhập URL API và secret token (Cài đặt → Kết nối API).');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, ...body })
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Máy chủ phản hồi quá lâu.' : 'Không kết nối được API. Kiểm tra mạng và URL /exec.');
  } finally { clearTimeout(timer); }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new Error(/<html/i.test(text) ? 'URL API trả về trang web thay vì JSON. Kiểm tra URL kết thúc bằng /exec và Web App đã deploy quyền "Bất kỳ ai".' : 'API trả dữ liệu lạ.');
  }
  if (!data.ok) { const err = new Error(data.error || 'API báo lỗi'); err.code = data.code; throw err; }
  return data;
}

let running = null;
let again = false;
// Đang đồng bộ mà có yêu cầu mới (ví dụ vừa thêm giao dịch) -> chạy thêm một lượt ngay sau lượt hiện tại
export function sync(opts = {}) {
  if (running) { again = true; return running; }
  running = doSync(opts).finally(() => {
    running = null;
    if (again) { again = false; sync(); }
  });
  return running;
}

async function doSync({ full = false } = {}) {
  if (!connected()) { S.syncErr = 'Chưa kết nối'; emit('sync'); return { ok: false }; }
  if (!navigator.onLine) { S.syncErr = 'Đang ngoại tuyến'; emit('sync'); return { ok: false }; }
  S.syncing = true; S.syncErr = ''; emit('sync');
  const loi = [];
  try {
    // 1. Đẩy hàng đợi (từng đợt 150 thao tác)
    let q = await db.getAll('queue');
    while (q.length) {
      const part = q.slice(0, 150);
      const r = await api('push', { ops: part.map(({ qid, ...op }) => op) });
      (r.kq || []).forEach((k, i) => { if (!k.ok) loi.push(k.loi || 'Lỗi không rõ'); });
      await db.del('queue', part.map((x) => x.qid));
      q = await db.getAll('queue');
      // Thao tác mới thêm trong lúc đẩy sẽ được đẩy ở vòng sau
      if (q.length && q[0].qid <= part[part.length - 1].qid) break;
    }
    S.pending = (await db.getAll('queue')).length;

    // 2. Kéo dữ liệu
    await pull(full || !S.since);
    S.lastSync = new Date().toISOString();
    await saveMeta();
    if (loi.length) S.syncErr = 'Một số thay đổi bị từ chối: ' + loi[0];
    return { ok: true, loi };
  } catch (e) {
    S.syncErr = e.message;
    if (e.code === 'AUTH') S.syncErr = 'Sai secret token';
    return { ok: false, err: e.message };
  } finally {
    S.syncing = false;
    emit('sync'); emit();
  }
}

async function pull(full) {
  // Lùi mốc 2 phút để không lỡ bản ghi do lệch đồng hồ
  const since = !full && S.since ? new Date(new Date(S.since).getTime() - 120000).toISOString() : '';
  const r = await api('pull', since ? { since } : { full: true });
  const q = await db.getAll('queue');
  const choDay = new Set(q.filter((o) => o.t === 'tx').map((o) => (o.row ? o.row.id : o.id)));

  if (r.full) {
    const keep = S.tx.filter((t) => choDay.has(t.id));
    const m = new Map(r.tx.map((t) => [t.id, normTx(t)]));
    keep.forEach((t) => m.set(t.id, t));
    S.tx = [...m.values()];
    await db.replaceAll('tx', S.tx);
  } else {
    const idx = new Map(S.tx.map((t, i) => [t.id, i]));
    const ch = [];
    r.tx.forEach((raw) => {
      if (choDay.has(raw.id)) return;
      const t = normTx(raw);
      if (idx.has(t.id)) S.tx[idx.get(t.id)] = t; else { idx.set(t.id, S.tx.length); S.tx.push(t); }
      ch.push(t);
    });
    if (ch.length) await db.put('tx', ch);
    // Lệch số dòng (ví dụ xóa hẳn dòng trong Sheet) -> kéo lại toàn bộ
    if (!choDay.size && S.tx.length !== r.n) return pull(true);
  }

  S.acc = r.acc; S.cat = r.cat; S.kw = r.kw; S.bud = r.bud; S.ppl = r.ppl;
  // Giữ giá trị cài đặt đang chờ đẩy
  const set = { ...r.set };
  q.filter((o) => o.t === 'set').forEach((o) => { set[o.row.khoa] = o.row.gia_tri; });
  S.set = set;
  S.sheetName = r.ten || S.sheetName;
  S.since = r.now;
  await saveTables();
  applySettings();
}

// ---------- Tự động đồng bộ ----------
let timer = null;
export function startAuto() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (autoOn() && navigator.onLine && document.visibilityState === 'visible') sync();
  }, 60000);
}
// Có thay đổi mới -> đẩy sớm (sau 2 giây) nếu đang bật tự động
let soon = null;
window.addEventListener('penny-queued', () => {
  if (!autoOn()) return;
  clearTimeout(soon);
  soon = setTimeout(() => { if (navigator.onLine) sync(); }, 2000);
});
window.addEventListener('online', () => { if (autoOn()) sync(); emit('sync'); });
window.addEventListener('offline', () => emit('sync'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && autoOn() && S.lastSync && Date.now() - new Date(S.lastSync).getTime() > 30000) sync();
});

// Link cài nhanh "#cfg=..." (gửi từ menu Kết nối PWA qua Telegram) -> {url, token} hoặc null
export function parseCfg(text) {
  const m = String(text || '').match(/cfg=([A-Za-z0-9_\-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0)));
    const o = JSON.parse(json);
    return o.u && o.t ? { url: String(o.u), token: String(o.t) } : null;
  } catch (e) { return null; }
}
export function readCfgFromHash() {
  if (!/cfg=/.test(location.hash)) return false;
  const c = parseCfg(location.hash);
  if (c) setCfg(c);
  history.replaceState(null, '', location.pathname + location.search + '#/caidat');
  return !!c;
}
