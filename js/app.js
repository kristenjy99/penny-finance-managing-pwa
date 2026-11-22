// Penny PWA v0.4.0 – khung app, điều hướng, các màn hình
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L, NHAN, NO_TYPES, DAU } from './store.js';
import * as sy from './sync.js';
import * as db from './db.js';
import { ICON, piggySvg, isPC, toast, openSheet, closeAllSheets, confirmBox, pickOne, monthPick, monthPill } from './ui.js';
import { mountTxForm } from './form.js';

const $ = (s) => document.querySelector(s);
const API_VER = '0.3.0';

// Trạng thái giao diện
const V = { route: 'gd', sub: 'ngay', id: '', day: '', dayMonth: '', q: '', fVi: '', fCat: '', openWeek: '', setSec: 'tt', fromList: false };
let layoutKey = '';
let panelKey = '';
let deferredInstall = null;

const NAV = [
  { r: 'gd', t: 'Giao dịch', i: 'tx' },
  { r: 'lich', t: 'Lịch', i: 'cal', pcOnly: true },
  { r: 'thongke', t: 'Thống kê', i: 'stats' },
  { r: 'vi', t: 'Ví', i: 'wallet' },
  { r: 'ngansach', t: 'Ngân sách', i: 'budget' },
  { r: 'congno', t: 'Công nợ', i: 'debt' },
  { r: 'caidat', t: 'Cài đặt', i: 'set' }
];
const SUBS = [['ngay', 'Ngày'], ['lich', 'Lịch'], ['tuan', 'Tuần'], ['thang', 'Tháng'], ['tongket', 'Tổng kết']];
const SOON = { thongke: 'Thống kê', vi: 'Ví', ngansach: 'Ngân sách', congno: 'Công nợ' };

// ================= ĐIỀU HƯỚNG =================
function parseHash() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let r = p[0] || 'gd', sub = 'ngay', id = '';
  if (r === 'gd' && p[1]) sub = SUBS.some((s) => s[0] === p[1]) ? p[1] : 'ngay';
  if (r === 'sua') id = decodeURIComponent(p[1] || '');
  if (!NAV.some((n) => n.r === r) && r !== 'sua') r = 'gd';
  // Lịch: mobile nằm trong Giao dịch, PC là mục riêng
  if (r === 'lich' && !isPC()) { r = 'gd'; sub = 'lich'; }
  if (r === 'gd' && sub === 'lich' && isPC()) { r = 'lich'; sub = 'ngay'; }
  if (r === 'sua' && !st.byId(id)) { r = 'gd'; id = ''; }
  V.route = r; V.sub = sub; V.id = id;
  if (r === 'sua' && isPC()) { const t = st.byId(id); if (t && U.ym(t.ngay) !== S.month) setMonth(U.ym(t.ngay)); }
}
const go = (h) => { if (location.hash !== h) location.hash = h; else render(); };

function setMonth(k) {
  S.month = k;
  V.openWeek = '';
}

// ================= TÍNH TOÁN =================
const sortDesc = (list) => list.map((t, i) => [t, i]).sort((a, b) => (a[0].ngay < b[0].ngay ? 1 : a[0].ngay > b[0].ngay ? -1 : a[1] - b[1])).map((x) => x[0]);
function filtered(list) {
  if (!isPC()) return list;
  const q = U.boDau(V.q);
  return list.filter((t) => (!q || U.boDau(t.ghi_chu + ' ' + t.danh_muc + ' ' + t.nguoi + ' ' + t.vi).includes(q))
    && (!V.fVi || t.vi === V.fVi || t.vi_den === V.fVi)
    && (!V.fCat || t.danh_muc === V.fCat));
}
const monthList = () => st.inMonth(S.month);
// Ngày được chọn ở Lịch: hôm nay nếu thuộc tháng, không thì ngày gần nhất có giao dịch
function selDay() {
  if (V.day && V.dayMonth === S.month) return V.day;
  const td = U.today();
  let d = U.ym(td) === S.month ? td : '';
  if (!d) { const l = monthList().map((t) => t.ngay).sort(); d = l.length ? l[l.length - 1] : S.month + '-01'; }
  V.day = d; V.dayMonth = S.month;
  return d;
}

// ================= ĐỊNH DẠNG =================
const plus = (n) => (n ? '+' : '') + num(n);
const minus = (n) => (n ? MINUS : '') + num(n);
const net = (n) => (n < 0 ? MINUS : '') + num(n);
const netSigned = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + num(n);

function band(list) {
  const s = st.totals(list);
  return `<div class="band">
    <div><div class="lb">Thu</div><div class="vl num inc">${plus(s.thu)}</div></div>
    <div><div class="lb">Chi</div><div class="vl num exp">${minus(s.chi)}</div></div>
    <div><div class="lb">Tổng</div><div class="vl num">${net(s.thu - s.chi)}</div></div></div>`;
}

// Một dòng giao dịch
function rowHtml(t, pc = isPC()) {
  let t2, amt, c;
  if (t.loai === L.CHUYEN) {
    t2 = `Chuyển khoản · ${t.vi || '?'} → ${t.vi_den || '?'}`;
    amt = num(t.so_tien); c = 'neu';
  } else if (NO_TYPES.includes(t.loai)) {
    t2 = NHAN[t.loai] + (t.nguoi ? ' · ' + t.nguoi : '') + (pc && t.vi ? ' · ' + t.vi : '');
    amt = (DAU[t.loai] > 0 ? '+' : MINUS) + num(t.so_tien); c = 'neu';
  } else {
    t2 = (t.danh_muc || st.fallbackCat(t.loai)) + (pc && t.vi ? ' · ' + t.vi : '');
    amt = (t.loai === L.THU ? '+' : MINUS) + num(t.so_tien); c = t.loai === L.THU ? 'inc' : 'exp';
  }
  const t1 = t.ghi_chu || t.danh_muc || NHAN[t.loai] || t.loai;
  const on = V.route === 'sua' && V.id === t.id ? ' on' : '';
  return `<button class="row${on}" data-act="edit" data-id="${esc(t.id)}">
    <span class="av" aria-hidden="true">${esc(st.symbolOf(t))}</span>
    <span class="mid"><span class="t1" style="display:block">${esc(t1)}</span><span class="t2" style="display:block">${esc(t2)}</span></span>
    <span class="amt num ${c}">${amt}</span></button>`;
}
const dayHead = (d, list) => `<div class="sec"><span>${U.dayLabel(d)}</span><span class="r num">${netSigned(st.dayNet(list))} đ</span></div>`;

// Danh sách nhóm theo ngày
function dayGroups(list) {
  if (!list.length) return '';
  const out = [];
  let cur = null, buf = [];
  const flush = () => { if (cur) out.push(dayHead(cur, buf) + buf.map((t) => rowHtml(t)).join('')); };
  sortDesc(list).forEach((t) => { if (t.ngay !== cur) { flush(); cur = t.ngay; buf = []; } buf.push(t); });
  flush();
  return out.join('');
}

function budgetBlock() {
  const b = st.budgets(S.month);
  if (!b.length) return '';
  return `<div class="sec"><span>Ngân sách</span></div>` + b.map((x) => {
    const pct = Math.round(x.ratio * 100);
    return `<div class="bud"><div class="h">${esc(x.nhom)} · ${num(x.chi)} / ${num(x.lim)} · <span class="${x.ratio > 1 ? 'exp' : ''}">${pct}%</span></div>
      <div class="bar ${st.level(x.ratio)}" role="progressbar" aria-valuenow="${pct}" aria-label="${esc(x.nhom)}"><i style="width:${Math.min(100, pct)}%"></i></div></div>`;
  }).join('');
}

const notConnected = () => (sy.connected() ? '' : `<button class="banner" data-act="conn"><span class="piggy">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span>
  <span>Chưa kết nối Google Sheet<small>Bấm để nhập URL API và secret token. Giao dịch nhập lúc này vẫn được lưu trên máy.</small></span><span aria-hidden="true">›</span></button>`);

// ================= LỊCH =================
function calendar(pc) {
  const ws = st.weekStart();
  const first = S.month + '-01';
  const start = U.weekStartOf(first, ws);
  const n = U.daysIn(S.month);
  const offset = Math.round((U.toDate(first) - U.toDate(start)) / 864e5);
  const cells = Math.ceil((offset + n) / 7) * 7;
  const per = {};
  monthList().forEach((t) => {
    const p = per[t.ngay] || (per[t.ngay] = { thu: 0, chi: 0 });
    if (t.loai === L.THU) p.thu += t.so_tien;
    if (t.loai === L.CHI) p.chi += t.so_tien;
  });
  const sel = selDay();
  const today = U.today();
  const TEN_PC = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  let h = '';
  for (let i = 0; i < 7; i++) {
    const w = (ws + i) % 7;
    h += `<div class="wd ${w === 0 && !pc ? 'sun' : ''}">${pc ? TEN_PC[w] : U.THU_NGAN[w]}</div>`;
  }
  for (let i = 0; i < cells; i++) {
    const d = U.addDays(start, i);
    const out = U.ym(d) !== S.month;
    const p = !out && per[d];
    let v = '';
    if (p) {
      if (p.thu) v += `<span class="v inc">${pc ? '+' + num(p.thu) : U.kfmt(p.thu)}</span>`;
      if (p.chi) v += `<span class="v exp">${pc ? MINUS + num(p.chi) : U.kfmt(-p.chi)}</span>`;
    }
    h += `<button class="d${out ? ' out' : ''}${d === sel ? ' sel' : ''}${d === today ? ' today' : ''}" data-act="day" data-day="${d}" aria-label="${U.dmy(d)}" aria-pressed="${d === sel}">
      <span class="n">${+d.slice(8)}</span>${v}</button>`;
  }
  return `<div class="cal">${h}</div>`;
}
function dayDetail() {
  const d = selDay();
  const list = st.live().filter((t) => t.ngay === d);
  return dayHead(d, list) + (list.length ? sortDesc(list).map((t) => rowHtml(t)).join('') : '<div class="empty">Không có giao dịch trong ngày này.</div>');
}

// ================= TUẦN / THÁNG / TỔNG KẾT =================
function weeksView() {
  const ws = st.weekStart();
  const k = S.month, last = k + '-' + String(U.daysIn(k)).padStart(2, '0');
  const list = filtered(monthList());
  let s = U.weekStartOf(k + '-01', ws), h = '';
  while (s <= last) {
    const e = U.addDays(s, 6);
    const a = s < k + '-01' ? k + '-01' : s, b = e > last ? last : e;
    const wl = list.filter((t) => t.ngay >= a && t.ngay <= b);
    const tt = st.totals(wl);
    const open = V.openWeek === s;
    h += `<button class="row sum${open ? ' on' : ''}" data-act="week" data-wk="${s}" aria-expanded="${open}">
      <span class="av" aria-hidden="true">${open ? '▾' : '▸'}</span>
      <span class="mid"><span class="t1" style="display:block">${U.dm(a)} – ${U.dm(b)}</span>
      <span class="t2" style="display:block"><span class="inc">${plus(tt.thu)}</span> · <span class="exp">${minus(tt.chi)}</span> · ${wl.length} GD</span></span>
      <span class="amt num">${netSigned(tt.thu - tt.chi)}</span></button>`;
    if (open) h += dayGroups(wl) || '<div class="empty">Không có giao dịch.</div>';
    s = U.addDays(s, 7);
  }
  return h;
}
function monthsView() {
  const y = S.month.slice(0, 4);
  let h = '', tThu = 0, tChi = 0;
  for (let m = 12; m >= 1; m--) {
    const k = y + '-' + String(m).padStart(2, '0');
    const ml = st.inMonth(k);
    const tt = st.totals(ml);
    tThu += tt.thu; tChi += tt.chi;
    h += `<button class="row sum${k === S.month ? ' on' : ''}" data-act="month" data-m="${k}">
      <span class="av" aria-hidden="true">${m}</span>
      <span class="mid"><span class="t1" style="display:block">Tháng ${m}/${y}</span>
      <span class="t2" style="display:block">${ml.length ? `<span class="inc">${plus(tt.thu)}</span> · <span class="exp">${minus(tt.chi)}</span>` : 'Chưa có giao dịch'}</span></span>
      <span class="amt num">${ml.length ? netSigned(tt.thu - tt.chi) : ''}</span></button>`;
  }
  return `<div class="sec"><span>Năm ${y}</span><span class="r num">${netSigned(tThu - tChi)} đ</span></div>` + h;
}
function summaryView() {
  const list = monthList();
  const tt = st.totals(list);
  const byCat = (loai) => {
    const m = new Map();
    list.filter((t) => t.loai === loai).forEach((t) => {
      const k = t.danh_muc || st.fallbackCat(loai);
      const x = m.get(k) || { k, sum: 0, n: 0, sym: st.symbolOf(t) };
      x.sum += t.so_tien; x.n++; m.set(k, x);
    });
    return [...m.values()].sort((a, b) => b.sum - a.sum);
  };
  const part = (title, loai, total) => {
    const rows = byCat(loai);
    if (!rows.length) return '';
    return `<div class="sec"><span>${title}</span><span class="r num">${loai === L.THU ? plus(total) : minus(total)} đ</span></div>` + rows.map((x) => `<div class="row">
      <span class="av" aria-hidden="true">${esc(x.sym)}</span>
      <span class="mid"><span class="t1" style="display:block">${esc(x.k)}</span><span class="t2" style="display:block">${Math.round(x.sum / total * 100)}% · ${x.n} giao dịch</span></span>
      <span class="amt num ${loai === L.THU ? 'inc' : 'exp'}">${loai === L.THU ? '+' : MINUS}${num(x.sum)}</span></div>`).join('');
  };
  const other = [L.CHUYEN, ...NO_TYPES].map((l) => {
    const ls = list.filter((t) => t.loai === l);
    if (!ls.length) return '';
    return `<div class="row"><span class="av" aria-hidden="true">${l === L.CHUYEN ? '⇄' : NHAN[l].charAt(0)}</span>
      <span class="mid"><span class="t1" style="display:block">${NHAN[l]}</span><span class="t2" style="display:block">${ls.length} giao dịch</span></span>
      <span class="amt num neu">${num(U.sum(ls, (t) => t.so_tien))}</span></div>`;
  }).join('');
  const body = part('Chi theo danh mục', L.CHI, tt.chi) + part('Thu theo danh mục', L.THU, tt.thu)
    + (other ? `<div class="sec"><span>Chuyển khoản & công nợ</span><span class="r" style="font-weight:600;font-size:13px">không tính vào Thu/Chi</span></div>` + other : '');
  return body || '<div class="empty">Chưa có giao dịch trong tháng này.</div>';
}

// ================= KHUNG =================
function renderSide() {
  const items = NAV.map((n) => `<a href="#/${n.r}" class="${navOn(n.r) ? 'on' : ''}">${ICON[n.i]}<span>${n.t}</span></a>`).join('');
  const s = syncState();
  $('#side').innerHTML = `<div class="logo"><span class="piggy">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span>Penny</div>
    <nav aria-label="Điều hướng">${items}</nav>
    <div class="syncbox"><div class="s1">Google Sheet</div><div class="s2">${esc(s.line)}</div>
      <button class="btn" data-act="sync" ${S.syncing ? 'disabled' : ''}>${S.syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</button>
      ${s.extra ? `<div class="s3 ${s.bad ? 'err' : ''}">${esc(s.extra)}</div>` : ''}</div>`;
  $('#tabbar').innerHTML = NAV.filter((n) => !n.pcOnly).map((n) => `<a href="#/${n.r}" class="${navOn(n.r) ? 'on' : ''}" aria-current="${navOn(n.r) ? 'page' : 'false'}">${ICON[n.i]}<span>${n.t}</span></a>`).join('');
}
function navOn(r) {
  const cur = V.route === 'sua' ? 'gd' : V.route;
  return cur === r;
}
function syncState() {
  const pend = S.pending ? `${S.pending} thay đổi chờ` : '';
  if (!sy.connected()) return { line: 'Chưa kết nối', extra: pend || 'Mở Cài đặt để kết nối', bad: false };
  if (S.syncing) return { line: 'Đang đồng bộ…', extra: pend };
  if (!navigator.onLine) return { line: 'Ngoại tuyến', extra: pend || 'Thay đổi sẽ tự đẩy lên khi có mạng' };
  const line = S.lastSync ? 'Đã đồng bộ ' + U.hhmm(S.lastSync) : 'Chưa đồng bộ';
  if (S.syncErr) return { line, extra: S.syncErr + (pend ? ' · ' + pend : ''), bad: true };
  return { line, extra: pend };
}

function renderTop() {
  const pc = isPC();
  const top = $('#top');
  const piggy = `<span class="piggy" aria-hidden="true">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span>`;
  const addBtn = `<button class="tbtn" data-act="add">+ Thêm giao dịch</button>`;
  let title = 'Giao dịch', right = '', tabs = '', back = '';
  if (V.route === 'gd' || (V.route === 'sua' && pc)) {
    if (pc) right = monthPill(S.month) + addBtn;
    else {
      title = V.sub === 'lich' ? 'Lịch' : 'Giao dịch';
      right = V.sub === 'lich' ? piggy : monthPill(S.month);
      tabs = `<div class="utabs" role="tablist">${SUBS.map(([k, t]) => `<button role="tab" class="${k === V.sub ? 'on' : ''}" aria-selected="${k === V.sub}" data-act="sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
    }
  } else if (V.route === 'lich') { title = 'Lịch'; right = monthPill(S.month) + addBtn; }
  else if (V.route === 'sua') { title = 'Sửa giao dịch'; back = `<button class="back" data-act="back" aria-label="Quay lại">‹</button>`; }
  else if (V.route === 'caidat') { title = 'Cài đặt'; right = pc ? '' : piggy; }
  else { title = SOON[V.route]; right = pc ? addBtn : piggy; }
  top.className = 'top' + (tabs ? ' has-tabs' : '');
  top.innerHTML = `<div class="top-row"><div class="top-l">${back}<h1>${title}</h1></div><div class="top-right">${right}</div></div>${tabs}`;
  document.title = title === 'Giao dịch' ? 'Penny' : title + ' · Penny';
}

// ================= NỘI DUNG =================
function renderContent() {
  const pc = isPC();
  const c = $('#content');
  const key = [V.route, V.sub, pc ? 'pc' : 'm', V.route === 'sua' && !pc ? V.id : ''].join('|');
  const fresh = key !== layoutKey;
  // Giữ ô đang gõ (ô tìm kiếm) khi vẽ lại
  const ae = document.activeElement;
  const keep = ae && ae.id && c.contains(ae) && !ae.closest('.side-panel') ? { id: ae.id, s: ae.selectionStart } : null;

  $('#app').classList.toggle('no-nav', V.route === 'sua' && !pc);
  $('#app').classList.toggle('no-fab', V.route === 'caidat');

  if (V.route === 'gd' || (V.route === 'sua' && pc)) {
    if (pc) {
      if (fresh) { c.innerHTML = `<div class="split"><div id="gdl"></div><aside class="side-panel" id="gdp" aria-label="Thêm / sửa giao dịch"></aside></div>`; panelKey = ''; }
      $('#gdl').innerHTML = pcList();
      mountPanel();
    } else {
      c.innerHTML = mobileGd();
    }
  } else if (V.route === 'lich') {
    c.innerHTML = band(monthList()) + `<div class="split cal-split"><div>${calendar(true)}</div><aside class="side-panel"><div class="cal-panel">${dayDetail()}</div></aside></div>`;
  } else if (V.route === 'sua') {
    if (fresh) {
      c.innerHTML = '<div class="page-b" id="editp"></div>';
      mountTxForm($('#editp'), { tx: st.byId(V.id), variant: 'page', onDone: leaveEdit });
    }
  } else if (V.route === 'caidat') {
    c.innerHTML = settingsHtml(pc);
  } else {
    c.innerHTML = `<div class="soon"><span class="piggy">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span><b>${SOON[V.route]}</b>Có ở bản v0.5.0</div>`;
  }
  if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus(); try { n.setSelectionRange(keep.s, keep.s); } catch (e) { /* bỏ qua */ } } }
  if (fresh) { layoutKey = key; window.scrollTo(0, 0); }
}

function mobileGd() {
  const list = monthList();
  const nc = notConnected();
  if (V.sub === 'lich') {
    const [y, m] = S.month.split('-');
    return nc + `<div class="monthnav"><button data-act="mprev" aria-label="Tháng trước">‹</button><b>Tháng ${+m} · ${y}</b><button data-act="mnext" aria-label="Tháng sau">›</button></div>`
      + band(list) + calendar(false) + dayDetail();
  }
  if (V.sub === 'tuan') return nc + band(list) + weeksView();
  if (V.sub === 'thang') return nc + monthsView();
  if (V.sub === 'tongket') return nc + band(list) + summaryView();
  return nc + band(list) + (dayGroups(list) || '<div class="empty">Chưa có giao dịch trong tháng này.<br>Bấm + để thêm.</div>') + budgetBlock();
}

function pcList() {
  const list = monthList();
  const tabs = `<div class="utabs gd-tabs" role="tablist">${SUBS.map(([k, t]) => `<button role="tab" class="${k === V.sub ? 'on' : ''}" aria-selected="${k === V.sub}" data-act="sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
  const sub = V.route === 'sua' ? 'ngay' : V.sub;
  const fil = (sub === 'ngay' || sub === 'tuan') ? `<div class="filters">
      <input class="inp grow" id="q" type="search" placeholder="Tìm ghi chú…" value="${esc(V.q)}" autocomplete="off" aria-label="Tìm ghi chú">
      <button class="inp ${V.fVi ? 'set' : ''}" data-act="fvi"><span class="v">${esc(V.fVi || 'Tất cả ví')}</span></button>
      <button class="inp ${V.fCat ? 'set' : ''}" data-act="fcat"><span class="v">${esc(V.fCat || 'Tất cả danh mục')}</span></button></div>` : '';
  let body;
  if (sub === 'tuan') body = weeksView();
  else if (sub === 'thang') body = monthsView();
  else if (sub === 'tongket') body = summaryView();
  else {
    const fl = filtered(list);
    body = dayGroups(fl) || `<div class="empty">${list.length ? 'Không có giao dịch khớp bộ lọc.' : 'Chưa có giao dịch trong tháng này.'}</div>`;
  }
  return notConnected() + (sub === 'thang' ? '' : band(list)) + tabs + fil + body;
}

// Panel phải PC: form thêm mới, hoặc sửa khi đang ở #/sua/<id>
function mountPanel() {
  const k = V.route === 'sua' ? 'e:' + V.id : 'add';
  if (k === panelKey) return;
  panelKey = k;
  const el = $('#gdp');
  el.innerHTML = '<div class="panel-b"></div>';
  mountTxForm(el.firstChild, {
    tx: V.route === 'sua' ? st.byId(V.id) : null,
    variant: 'panel',
    onDone: (t) => { if (V.route === 'sua') leaveEdit(); else if (!t) { panelKey = ''; mountPanel(); } }
  });
}
function leaveEdit() {
  if (V.fromList && history.length > 1) { V.fromList = false; history.back(); } else go('#/gd');
}

// ================= THÊM GIAO DỊCH (popup) =================
function openAdd() {
  openSheet({
    title: 'Thêm giao dịch', cls: 'mid', raw: true,
    body: `<div class="utabs" role="tablist"><button role="tab" class="on" data-tab="tay" aria-selected="true">Nhập tay</button><button role="tab" data-tab="anh" aria-selected="false">Ảnh / Sao kê</button></div>
      <div class="sheet-b" data-pane="tay"></div>
      <div class="sheet-b" data-pane="anh" hidden><div class="stub"><span class="piggy">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span>
        <div><b>Có ở bản v0.6.0</b><span>Thêm giao dịch từ ảnh chụp, PDF, CSV hoặc Excel sao kê ngân hàng, đọc ngay trên máy.</span></div></div></div>`,
    onMount: (b, close) => {
      mountTxForm(b.querySelector('[data-pane=tay]'), { variant: 'sheet', onDone: () => close() });
      b.querySelector('.utabs').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (!t) return;
        b.querySelectorAll('[data-tab]').forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); });
        b.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      });
    }
  });
}

// ================= CÀI ĐẶT =================
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function settingsHtml(pc) {
  const set = S.set;
  const theme = st.themeMode();
  const dim = (t, v) => `<div class="set dim" aria-disabled="true"><span>${t}<span class="tag">sắp có</span></span><span class="val">${esc(v)}</span></div>`;
  const s = syncState();
  const tg = set.telegram_chat_id ? 'Đã liên kết' : 'Chưa liên kết';
  const ws = st.weekStart() === 0 ? 'Chủ Nhật' : 'Thứ Hai';
  const inst = installed() ? 'Đã cài' : deferredInstall ? 'Cài ngay ›' : 'Hướng dẫn ›';
  const sub = sy.connected() ? `${s.line} · ${S.pending} thay đổi chờ` : 'Chưa kết nối';
  const body = `${notConnected()}
    <div class="sec" id="s-tt">Thông tin</div>
    ${dim('Tên hiển thị', set.display_name || '')}
    ${dim('Tiền tệ', (set.currency || 'VND') + ' (₫)')}
    <div class="set"><span>Telegram bot</span><span class="val">${tg}</span></div>
    <div class="sec" id="s-ht">Hiển thị</div>
    <div class="set tall"><span>Giao diện</span><span class="seg" role="radiogroup" aria-label="Giao diện">
      ${[['light', 'Sáng', 'sáng'], ['dark', 'Tối', 'tối'], ['auto', 'Tự động', 'tự động']].map(([k, t, v]) => `<button role="radio" aria-checked="${theme === k}" class="${theme === k ? 'on' : ''}" data-act="theme" data-v="${v}">${t}</button>`).join('')}</span></div>
    ${dim('Định dạng số', '1.234.567 đ')}
    ${dim('Tuần bắt đầu', ws)}
    <div class="sec" id="s-dm">Danh mục & từ khóa</div>
    ${dim('Quản lý danh mục', '')}
    ${dim('Từ khóa tự phân loại', '')}
    <div class="sec" id="s-db">Đồng bộ & dữ liệu</div>
    <div class="set sheetrow"><span class="grow">Google Sheet · ${esc(S.sheetName || '—')}<span class="t2">${esc(sub)}</span>
      ${S.syncErr && sy.connected() ? `<span class="t2 exp" style="font-weight:700">${esc(S.syncErr)}</span>` : ''}</span>
      <button class="btn sm pri" data-act="sync" ${S.syncing || !sy.connected() ? 'disabled' : ''}>Đồng bộ ngay</button></div>
    <label class="set"><span>Tự động đồng bộ</span><span class="switch"><input type="checkbox" data-act="auto" ${sy.autoOn() ? 'checked' : ''} aria-label="Tự động đồng bộ"><i></i></span></label>
    <button class="set" data-act="conn"><span>Kết nối API</span><span class="val">${sy.connected() ? 'Đã kết nối' : 'Chưa kết nối'} ›</span></button>
    ${dim('Nhập / Xuất CSV', '')}
    <button class="set" data-act="install"><span>Cài ứng dụng lên máy</span><span class="val">${inst}</span></button>
    <button class="set danger" data-act="wipe"><span>Xóa dữ liệu trên máy</span><span class="val">›</span></button>
    <div class="ver">Penny v${U.VERSION} · API v${API_VER}</div>`;
  if (!pc) return body;
  const nav = [['tt', 'Thông tin'], ['ht', 'Hiển thị'], ['dm', 'Danh mục & từ khóa'], ['db', 'Đồng bộ & dữ liệu']]
    .map(([k, t]) => `<button class="${V.setSec === k ? 'on' : ''}" data-act="setsec" data-sec="${k}">${t}</button>`).join('');
  return `<div class="setwrap"><nav class="setnav" aria-label="Mục cài đặt">${nav}</nav><div class="setbody">${body}</div></div>`;
}

// Hộp thoại nhập URL API + secret token
function openConn() {
  const c = sy.cfg();
  openSheet({
    title: 'Kết nối Google Sheet', cls: 'mid',
    body: `<form novalidate>
      <div class="fld"><label for="c-u">URL API (Web App, kết thúc bằng /exec)</label>
        <input class="inp" id="c-u" name="u" type="url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></div>
      <div class="fld"><label for="c-t">Secret token</label>
        <div style="display:flex;gap:8px"><input class="inp" id="c-t" name="t" type="password" value="${esc(c.token || '')}" autocomplete="off" spellcheck="false">
        <button type="button" class="btn" data-show style="flex:none">Hiện</button></div>
        <div class="hint">Lấy ở Google Sheet: menu 🐷 Penny → 📱 Kết nối PWA. Có thể dán nguyên link cài nhanh bot gửi qua Telegram vào ô URL.</div></div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-ping>Kiểm tra kết nối</button><button class="btn pri">Lưu</button></div>
    </form>`,
    onMount: (b, close) => {
      const u = b.querySelector('[name=u]'), t = b.querySelector('[name=t]'), msg = b.querySelector('[data-msg]');
      const show = (ok, text) => { msg.className = 'okmsg ' + (ok ? 'ok' : 'no'); msg.textContent = text; };
      const val = () => {
        const url = u.value.trim(), token = t.value.trim();
        if (!/^https?:\/\/\S+$/.test(url)) { show(false, 'URL API chưa đúng.'); u.focus(); return null; }
        if (!token) { show(false, 'Chưa nhập secret token.'); t.focus(); return null; }
        return { url, token };
      };
      // Dán nguyên link cài nhanh (…#cfg=…) vào ô URL -> tự tách URL và token
      u.addEventListener('input', () => {
        const c = sy.parseCfg(u.value);
        if (c) { u.value = c.url; t.value = c.token; show(true, 'Đã đọc link cài nhanh. Bấm Lưu.'); }
      });
      b.querySelector('[data-show]').onclick = (e) => { const h = t.type === 'password'; t.type = h ? 'text' : 'password'; e.target.textContent = h ? 'Ẩn' : 'Hiện'; };
      b.querySelector('[data-ping]').onclick = async (e) => {
        const v = val();
        if (!v) return;
        e.target.disabled = true; show(true, 'Đang kiểm tra…');
        try {
          const r = await sy.api('ping', {}, v.url, v.token);
          show(true, `✓ Kết nối được: Google Sheet “${r.ten}” · API v${r.version}`);
        } catch (err) { show(false, '✗ ' + err.message); }
        e.target.disabled = false;
      };
      b.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const v = val();
        if (!v) return;
        sy.setCfg({ url: v.url, token: v.token });
        close();
        toast('Đã lưu kết nối. Đang đồng bộ…');
        st.emit();
        doSync(true);
      };
    }
  });
}

function installHelp() {
  const ios = isIOS();
  openSheet({
    title: 'Cài Penny lên máy', cls: 'mid',
    body: ios
      ? `<ol><li>Mở trang này bằng <b>Safari</b>.</li><li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) ở thanh dưới.</li><li>Kéo xuống, chọn <b>Thêm vào MH chính</b>.</li><li>Bấm <b>Thêm</b>. Biểu tượng heo đất đỏ xuất hiện trên màn hình chính.</li></ol>`
      : `<p><b>Android (Chrome):</b> bấm menu ⋮ góc trên → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào màn hình chính</b>) → Cài đặt.</p>
         <p><b>Máy tính (Chrome / Edge):</b> bấm biểu tượng cài đặt ở cuối thanh địa chỉ, hoặc menu ⋮ → <b>Truyền, lưu và chia sẻ</b> → <b>Cài đặt trang dưới dạng ứng dụng</b>.</p>
         <p>Nếu không thấy mục cài: tải lại trang một lần rồi thử lại.</p>`
  });
}

async function doSync(full = false, manual = false) {
  if (!sy.connected()) { if (manual) openConn(); return; }
  if (manual && !navigator.onLine) { toast('Đang ngoại tuyến. Thay đổi sẽ tự đẩy lên khi có mạng.'); return; }
  const r = await sy.sync({ full });
  if (manual) toast(r.ok ? (r.loi && r.loi.length ? 'Đồng bộ xong, có thay đổi bị từ chối' : 'Đã đồng bộ') : 'Lỗi đồng bộ: ' + (r.err || S.syncErr));
}

// ================= VẼ LẠI =================
let rendering = false;
function render() {
  if (rendering) return;
  rendering = true;
  try { renderSide(); renderTop(); renderContent(); } finally { rendering = false; }
}

// ================= SỰ KIỆN =================
async function onAct(b, e) {
  const a = b.dataset.act;
  switch (a) {
    case 'add': openAdd(); break;
    case 'mprev': setMonth(U.addMonths(S.month, -1)); render(); break;
    case 'mnext': setMonth(U.addMonths(S.month, 1)); render(); break;
    case 'mpick': { const k = await monthPick(S.month); if (k) { setMonth(k); render(); } break; }
    case 'sync': doSync(true, true); break;
    case 'sub': go(b.dataset.sub === 'lich' && isPC() ? '#/lich' : '#/gd' + (b.dataset.sub === 'ngay' ? '' : '/' + b.dataset.sub)); break;
    case 'edit': V.fromList = true; go('#/sua/' + encodeURIComponent(b.dataset.id)); break;
    case 'back': leaveEdit(); break;
    case 'day': {
      const d = b.dataset.day;
      if (U.ym(d) !== S.month) setMonth(U.ym(d));
      V.day = d; V.dayMonth = S.month; render(); break;
    }
    case 'week': V.openWeek = V.openWeek === b.dataset.wk ? '' : b.dataset.wk; render(); break;
    case 'month': setMonth(b.dataset.m); go('#/gd'); break;
    case 'fvi': {
      const v = await pickOne({ title: 'Lọc theo ví', value: V.fVi, options: [{ v: '', label: 'Tất cả ví' }].concat(st.walletNames().map((w) => ({ v: w, label: w }))) });
      if (v !== undefined) { V.fVi = v; render(); }
      break;
    }
    case 'fcat': {
      const v = await pickOne({ title: 'Lọc theo danh mục', value: V.fCat, options: [{ v: '', label: 'Tất cả danh mục' }].concat(S.cat.map((c) => ({ v: c.danh_muc, label: (c.ky_hieu ? c.ky_hieu + '  ' : '') + c.danh_muc, group: c.nhom }))) });
      if (v !== undefined) { V.fCat = v; render(); }
      break;
    }
    case 'theme': await st.setSetting('theme', b.dataset.v); break;
    case 'conn': openConn(); break;
    case 'setsec': {
      V.setSec = b.dataset.sec;
      const el = document.getElementById('s-' + V.setSec);
      render();
      if (el) document.getElementById('s-' + V.setSec).scrollIntoView({ block: 'start', behavior: 'smooth' });
      break;
    }
    case 'install':
      if (installed()) toast('Penny đã được cài trên máy này');
      else if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => null); deferredInstall = null; render(); }
      else installHelp();
      break;
    case 'wipe': {
      const ok = await confirmBox(`Xóa toàn bộ dữ liệu Penny lưu trên máy này${S.pending ? ` (kể cả ${S.pending} thay đổi chưa đồng bộ)` : ''} và thông tin kết nối? Dữ liệu trên Google Sheet không bị ảnh hưởng.`, 'Xóa', true);
      if (!ok) return;
      await db.wipe();
      localStorage.removeItem('penny_cfg');
      location.hash = '#/caidat';
      location.reload();
      break;
    }
    default: break;
  }
}

function bind() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    if (b.closest('#layer') && !['conn'].includes(b.dataset.act)) return; // form trong popup tự xử lý
    e.preventDefault();
    onAct(b, e);
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.act === 'auto') {
      sy.setCfg({ auto: e.target.checked });
      if (e.target.checked) doSync(false);
      render();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { V.q = e.target.value; renderContent(); }
  });
  window.addEventListener('hashchange', () => { closeAllSheets(); parseHash(); render(); });
  matchMedia('(min-width: 900px)').addEventListener('change', () => { parseHash(); layoutKey = ''; render(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => st.applySettings());
  st.onChange(() => render());
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (V.route === 'caidat') render(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Đã cài Penny'); });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Không đăng ký được service worker', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) toast('Đã có bản Penny mới. Tải lại trang để dùng.', 6000);
  });
}

async function start() {
  const gotCfg = sy.readCfgFromHash();
  await st.load();
  parseHash();
  bind();
  render();
  registerSW();
  if (gotCfg) toast('Đã nhận thông tin kết nối. Đang đồng bộ…');
  if (sy.connected()) doSync(true);
  sy.startAuto();
}

start().catch((e) => {
  console.error(e);
  $('#content').innerHTML = `<div class="empty">Không mở được dữ liệu trên máy: ${esc(e.message)}</div>`;
});
