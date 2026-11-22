// Penny v0.5.1 – các màn Thống kê, Ví, Ngân sách, Công nợ (mobile + PC)
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L, NHAN, NO_TYPES } from './store.js';
import { piggySvg } from './ui.js';

// Trạng thái riêng của các màn này
export const SV = { stTab: 'chi', person: '', per: 'thang', anchor: '', open: '' };

// ---------- Định dạng ----------
const plus = (n) => (n ? '+' : '') + num(n);
const minus = (n) => (n ? MINUS : '') + num(n);
const net = (n) => (n < 0 ? MINUS : '') + num(n);
const netSigned = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + num(n);
const piggyTile = () => `<span class="piggy" aria-hidden="true">${piggySvg('var(--tile-fg)', 'var(--tile)')}</span>`;

// Dải số liệu: items = [{lb, vl, c}]
export const bandOf = (items, cls = '') => `<div class="band ${cls}">${items.map((x) => `<div><div class="lb">${x.lb}</div><div class="vl num ${x.c || ''}">${x.vl}</div></div>`).join('')}</div>`;
const monthBand = (list) => { const s = st.totals(list); return bandOf([{ lb: 'Thu', vl: plus(s.thu), c: 'inc' }, { lb: 'Chi', vl: minus(s.chi), c: 'exp' }, { lb: 'Tổng', vl: net(s.thu - s.chi) }]); };

/** Chia phần trăm làm tròn sao cho tổng đúng 100 (phần dư lớn nhất được cộng trước) */
export function pctRound(vals) {
  const tot = U.sum(vals);
  if (!tot) return vals.map(() => 0);
  const raw = vals.map((v) => v / tot * 100);
  const out = raw.map(Math.floor);
  let du = 100 - U.sum(out);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (du > 0) { out[i]++; du--; } });
  return out;
}

// ================= THỐNG KÊ =================
const MAU = 6; // số màu donut (--c1..--c6)
const PER = [['tuan', 'Tuần'], ['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']];
const p2 = (n) => String(n).padStart(2, '0');

/** Khoảng thời gian đang xem ở Thống kê: {from, to, label}. Tháng dùng chung tháng của app (S.month). */
export function perRange() {
  const per = SV.per;
  const a = per === 'thang' || !SV.anchor ? S.month + '-01' : SV.anchor;
  const [y, m] = a.split('-').map(Number);
  if (per === 'tuan') { const from = U.weekStartOf(a, st.weekStart()); const to = U.addDays(from, 6); return { from, to, label: U.dm(from) + ' – ' + U.dmy(to) }; }
  if (per === 'quy') {
    const q = Math.floor((m - 1) / 3), k1 = y + '-' + p2(q * 3 + 1), k3 = y + '-' + p2(q * 3 + 3);
    return { from: k1 + '-01', to: k3 + '-' + p2(U.daysIn(k3)), label: 'Quý ' + (q + 1) + '/' + y };
  }
  if (per === 'nam') return { from: y + '-01-01', to: y + '-12-31', label: 'Năm ' + y };
  const k = S.month;
  return { from: k + '-01', to: k + '-' + p2(U.daysIn(k)), label: 'Tháng ' + (+k.slice(5)) + '/' + k.slice(0, 4) };
}
// Đổi loại khoảng: giữ mốc đang xem (hôm nay nếu nằm trong khoảng hiện tại)
export function perSet(per) {
  const r = perRange(), td = U.today();
  SV.anchor = td >= r.from && td <= r.to ? td : r.from;
  SV.per = per;
  if (per === 'thang') S.month = U.ym(SV.anchor);
}
export function perShift(d) {
  const r = perRange();
  if (SV.per === 'thang') { S.month = U.addMonths(S.month, d); return; }
  if (SV.per === 'tuan') SV.anchor = U.addDays(r.from, 7 * d);
  else if (SV.per === 'quy') SV.anchor = U.addMonths(U.ym(r.from), 3 * d) + '-01';
  else SV.anchor = (+r.from.slice(0, 4) + d) + '-01-01';
}
const inRange = (r) => st.live().filter((t) => t.ngay >= r.from && t.ngay <= r.to);

/**
 * Gom theo nhóm danh mục; mỗi nhóm có chi tiết từng danh mục. Nếu chỉ có 1 nhóm (thường gặp với thu nhập)
 * thì chia theo danh mục. Tối đa 6 phần, phần thừa gộp vào "Khác".
 */
export function statParts(loai, list) {
  const lo = loai === L.THU ? L.THU : L.CHI;
  const gm = new Map();
  list.filter((t) => t.loai === lo).forEach((t) => {
    const dm = t.danh_muc || st.fallbackCat(lo);
    const g = st.groupOf(dm);
    const x = gm.get(g) || { k: g, v: 0, n: 0, cats: new Map() };
    x.v += t.so_tien; x.n++;
    const c = x.cats.get(dm) || { k: dm, v: 0, n: 0, sym: st.symbolOf(t) };
    c.v += t.so_tien; c.n++; x.cats.set(dm, c);
    gm.set(g, x);
  });
  let arr = [...gm.values()].map((x) => ({ ...x, cats: [...x.cats.values()].sort((a, b) => b.v - a.v) }));
  let byCat = false;
  if (arr.length === 1 && arr[0].cats.length > 1) { byCat = true; arr = arr[0].cats.map((c) => ({ k: c.k, v: c.v, n: c.n, cats: [] })); }
  arr.sort((a, b) => b.v - a.v);
  if (arr.length > MAU) {
    const giu = arr.slice(0, MAU - 1).filter((x) => U.boDau(x.k) !== 'khac');
    const con = arr.filter((x) => !giu.includes(x));
    arr = giu.concat({ k: 'Khác', v: U.sum(con, (x) => x.v), n: U.sum(con, (x) => x.n), cats: con.flatMap((x) => (x.cats.length ? x.cats : [{ k: x.k, v: x.v, n: x.n }])).sort((a, b) => b.v - a.v) });
  }
  const pct = pctRound(arr.map((x) => x.v));
  const out = arr.map((x, i) => ({ ...x, pct: pct[i], mau: 'var(--c' + (i + 1) + ')' }));
  out.byCat = byCat;
  return out;
}

// Một cung của vòng tròn (từ góc a đến b, tính bằng phần của vòng, 0 = 12 giờ, theo chiều kim đồng hồ)
function arc(a, b, R, r, c = 100) {
  const P = (t, rad) => { const g = (t * 2 * Math.PI) - Math.PI / 2; return [(c + rad * Math.cos(g)).toFixed(3), (c + rad * Math.sin(g)).toFixed(3)]; };
  const lon = b - a > 0.5 ? 1 : 0;
  const [x1, y1] = P(a, R), [x2, y2] = P(b, R), [x3, y3] = P(b, r), [x4, y4] = P(a, r);
  return `M${x1} ${y1}A${R} ${R} 0 ${lon} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${lon} 0 ${x4} ${y4}Z`;
}

/** Biểu đồ vòng SVG; tâm ghi nhãn + tổng */
export function donutSvg(parts, label, total) {
  const R = 99.5, r = 61.5;
  let a = 0, h = '';
  const tot = U.sum(parts, (x) => x.v);
  parts.forEach((p) => {
    const f = tot ? p.v / tot : 0;
    if (f <= 0) return;
    if (f >= 0.9999) { h += `<path d="${arc(0, 0.5, R, r)}" fill="${p.mau}"/><path d="${arc(0.5, 1, R, r)}" fill="${p.mau}"/>`; }
    else h += `<path d="${arc(a, a + f, R, r)}" fill="${p.mau}"><title>${esc(p.k)}: ${num(p.v)} đ (${p.pct}%)</title></path>`;
    a += f;
  });
  const t = num(total) + ' đ';
  const fs = t.length >= 14 ? 'sm2' : t.length >= 12 ? 'sm' : '';
  return `<div class="donut" role="img" aria-label="${esc(label)} ${t}">
    <svg viewBox="0 0 200 200" aria-hidden="true">${h}<circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--bd)"/><circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--bd)"/></svg>
    <div class="dc"><span>${esc(label)}</span><b class="num ${fs}">${t}</b></div></div>`;
}

// Các cột của biểu đồ theo khoảng: tuần/tháng -> từng ngày, quý -> từng tuần, năm -> từng tháng (không vẽ tương lai)
export function buckets(loai, r) {
  const td = U.today();
  const end = r.to < td ? r.to : td;
  if (end < r.from) return [];
  const list = st.live().filter((t) => t.loai === loai && t.ngay >= r.from && t.ngay <= end);
  const tong = (a, b) => U.sum(list.filter((t) => t.ngay >= a && t.ngay <= b), (t) => t.so_tien);
  const out = [];
  if (SV.per === 'tuan' || SV.per === 'thang') {
    for (let d = r.from; d <= end; d = U.addDays(d, 1)) out.push({ lb: U.dm(d), v: tong(d, d), t: U.dmy(d) });
  } else if (SV.per === 'quy') {
    for (let d = U.weekStartOf(r.from, st.weekStart()); d <= end; d = U.addDays(d, 7)) {
      const a = d < r.from ? r.from : d, b0 = U.addDays(d, 6), b = b0 > r.to ? r.to : b0;
      out.push({ lb: U.dm(a), v: tong(a, b), t: U.dm(a) + ' – ' + U.dm(b) });
    }
  } else {
    const y = r.from.slice(0, 4);
    for (let m = 1; m <= 12; m++) {
      const k = y + '-' + p2(m);
      if (k + '-01' > end) break;
      out.push({ lb: 'T' + m, v: tong(k + '-01', k + '-' + p2(U.daysIn(k))), t: 'Tháng ' + m + '/' + y });
    }
  }
  return out;
}

/** Biểu đồ cột SVG (chiều ngang co giãn theo khung) */
export function barsSvg(bk, nhan) {
  if (!bk.length) return '<div class="empty">Khoảng thời gian này chưa tới.</div>';
  const max = Math.max(...bk.map((x) => x.v), 1);
  const H = 200, TOP = 26, n = bk.length;
  const w = 100 / n;
  const nhieu = n > 12;
  const iMax = bk.map((x) => x.v).indexOf(Math.max(...bk.map((x) => x.v)));
  const buoc = Math.ceil(n / 10);
  const h = bk.map((x, i) => {
    const v = x.v;
    const bh = v ? Math.max(2, Math.round(v / max * H)) : 0;
    const y = TOP + H - bh;
    const lbv = v && (!nhieu || i === iMax) ? `<text x="50%" y="${y - 8}" text-anchor="middle" class="bv">${num(Math.round(v / 1000))}</text>` : '';
    const xl = !nhieu || i % buoc === 0 || i === n - 1 ? `<text x="50%" y="${TOP + H + 22}" text-anchor="middle" class="bx">${x.lb}</text>` : '';
    return `<svg x="${(i * w).toFixed(4)}%" width="${w.toFixed(4)}%" height="${TOP + H + 34}" overflow="visible">
      <title>${x.t}: ${num(v)} đ</title>
      ${bh ? `<rect x="${nhieu ? 20 : 30}%" width="${nhieu ? 60 : 40}%" y="${y}" height="${bh}" fill="var(--acc)"/>` : ''}${lbv}${xl}</svg>`;
  }).join('');
  return `<svg class="dbars" width="100%" height="${TOP + H + 34}" role="img" aria-label="${esc(nhan)}">${h}
    <line x1="0" x2="100%" y1="${TOP + H + 33.5}" y2="${TOP + H + 33.5}" stroke="var(--bd)"/></svg>`;
}

// Cảnh báo ngân sách (chỉ khi xem theo tháng): nhóm từ 80% trở lên
function budgetAlert() {
  const b = st.budgets(S.month).filter((x) => x.ratio >= 0.8).sort((a, c) => c.ratio - a.ratio);
  if (!b.length) return '';
  const vuot = b.filter((x) => x.ratio > 1);
  const pct = (x) => Math.round(x.ratio * 100);
  let msg;
  if (vuot.length === 1) msg = `Nhóm ${esc(vuot[0].nhom)} đã vượt ${pct(vuot[0])}% ngân sách rồi nè!`;
  else if (vuot.length > 1) msg = `${vuot.length} nhóm đã vượt ngân sách rồi nè: ${vuot.map((x) => esc(x.nhom) + ' ' + pct(x) + '%').join(', ')}.`;
  else msg = `Nhóm ${esc(b[0].nhom)} đã dùng ${pct(b[0])}% ngân sách, sắp chạm hạn mức rồi nè!`;
  return `<div class="alert">${piggyTile()}<span>${msg}</span></div>` + b.map((x) => `<div class="bud"><div class="h">${esc(x.nhom)} · ${pct(x)}%</div>
    <div class="bar ${st.level(x.ratio)}" role="progressbar" aria-valuenow="${pct(x)}" aria-label="${esc(x.nhom)}"><i style="width:${Math.min(100, pct(x))}%"></i></div></div>`).join('');
}

// Hàng chọn khoảng: Tuần | Tháng | Quý | Năm  và  ‹ nhãn ›
export const perBar = () => `<div class="perbar"><div class="seg" role="radiogroup" aria-label="Khoảng thời gian">${PER.map(([k, t]) => `<button role="radio" class="${SV.per === k ? 'on' : ''}" aria-checked="${SV.per === k}" data-act="st-per" data-v="${k}">${t}</button>`).join('')}</div>
  <div class="pnav"><button data-act="st-prev" aria-label="Khoảng trước">‹</button><b>${perRange().label}</b><button data-act="st-next" aria-label="Khoảng sau">›</button></div></div>`;

export function statsHtml(pc) {
  const loai = SV.stTab === 'thu' ? L.THU : L.CHI;
  const r = perRange();
  const list = inRange(r);
  const parts = statParts(loai, list);
  const total = U.sum(parts, (x) => x.v);
  const nhan = loai === L.CHI ? 'Tổng chi' : 'Tổng thu';
  const nGd = U.sum(parts, (x) => x.n);
  const legend = parts.length ? parts.map((p) => {
    const mo = !parts.byCat && p.cats.length && SV.open === p.k;
    const sub = mo ? p.cats.map((c) => `<div class="leg-sub"><span class="k">${esc(c.k)}</span><span class="num">${num(c.v)} · ${total ? Math.round(c.v / total * 100) : 0}%<small>${c.n} GD · ${p.v ? Math.round(c.v / p.v * 100) : 0}% nhóm</small></span></div>`).join('') : '';
    const canMo = !parts.byCat && p.cats.length;
    return `<${canMo ? 'button' : 'div'} class="leg" ${canMo ? `data-act="st-grp" data-k="${esc(p.k)}" aria-expanded="${!!mo}"` : ''}><i style="background:${p.mau}"></i><span class="k">${esc(p.k)}</span><span class="num">${num(p.v)} · ${p.pct}%</span>${canMo ? `<span class="chev" aria-hidden="true">${mo ? '▾' : '▸'}</span>` : ''}</${canMo ? 'button' : 'div'}>${sub}`;
  }).join('') : `<div class="empty">Chưa có khoản ${loai === L.CHI ? 'chi' : 'thu'} trong khoảng này.</div>`;
  const head = parts.length ? `<div class="sec"><span>${loai === L.CHI ? 'Chi' : 'Thu'} theo ${parts.byCat ? 'danh mục' : 'nhóm'}</span><span class="r num">${num(total)} đ · ${nGd} GD</span></div>` : '';
  const alert = loai === L.CHI && SV.per === 'thang' ? budgetAlert() : '';
  const tenBars = (loai === L.CHI ? 'Chi' : 'Thu') + ' theo ' + (SV.per === 'quy' ? 'tuần' : SV.per === 'nam' ? 'tháng' : 'ngày');
  const bars = barsSvg(buckets(loai, r), tenBars);
  const left = `<div class="donut-wrap">${donutSvg(parts, nhan, total)}</div>${head}${legend}${alert}`;
  const s0 = st.totals(list);
  const band = bandOf([{ lb: 'Thu', vl: plus(s0.thu), c: 'inc' }, { lb: 'Chi', vl: minus(s0.chi), c: 'exp' }, { lb: 'Tổng', vl: net(s0.thu - s0.chi) }]);
  if (!pc) return perBar() + band + left + `<div class="sec"><span>${tenBars} <small class="unit">nghìn đ</small></span></div><div class="mbars">${bars}</div>`;
  const tabs = `<div class="utabs st-tabs" role="tablist">${[['chi', 'Chi tiêu'], ['thu', 'Thu nhập']].map(([k, t]) => `<button role="tab" class="${SV.stTab === k ? 'on' : ''}" aria-selected="${SV.stTab === k}" data-act="st-tab" data-v="${k}">${t}</button>`).join('')}</div>`;
  return band + perBar() + `<div class="st-grid"><div class="st-l">${tabs}${left}</div>
    <div class="st-r"><h2>${tenBars} <small>nghìn đ</small></h2>${bars}</div></div>`;
}
export const statsTabs = () => `<div class="utabs" role="tablist">${[['chi', 'Chi tiêu'], ['thu', 'Thu nhập']].map(([k, t]) => `<button role="tab" class="${SV.stTab === k ? 'on' : ''}" aria-selected="${SV.stTab === k}" data-act="st-tab" data-v="${k}">${t}</button>`).join('')}</div>`;

// ================= VÍ =================
// Tình trạng kỳ sao kê thẻ -> {c, t} (lớp màu, câu mô tả)
export function cardStatus(info) {
  if (!info.ngaySk) return '';
  if (info.quaHan) return { c: 'exp', t: `Quá hạn ${U.dm(info.hanTra)}: còn phải trả ${num(info.canTra)}` };
  if (info.canTra > 0) return { c: info.conNgay != null && info.conNgay <= 3 ? 'exp' : '', t: `Cần trả ${num(info.canTra)}${info.hanTra ? ` trước ${U.dm(info.hanTra)} (còn ${info.conNgay} ngày)` : ''}${info.toiThieu ? ` · tối thiểu ${num(info.toiThieu)}` : ''}` };
  return { c: 'inc', t: info.noSk ? `Đã trả đủ kỳ sao kê ${U.dm(info.ngaySk)}` : `Kỳ sao kê ${U.dm(info.ngaySk)} không có dư nợ` };
}
// Dòng phụ dưới mỗi thẻ: hạn mức, thanh đã dùng, kỳ sao kê, nút Thanh toán
function cardLine(w, pc) {
  const i = st.cardInfo(w);
  const tt = cardStatus(i);
  if (!i.lim && !tt && !i.no) return '';
  const pct = Math.round(i.ratio * 100);
  const l1 = i.lim ? `Dư nợ <b class="num">${num(i.no)}</b> · còn <b class="num ${i.con < 0 ? 'exp' : ''}">${i.con < 0 ? MINUS : ''}${num(i.con)}</b> / ${num(i.lim)} (${pct}%)` : `Dư nợ <b class="num">${num(i.no)}</b>`;
  const bar = i.lim ? `<div class="bar ${st.level(i.ratio)}" role="progressbar" aria-valuenow="${pct}" aria-label="Đã dùng hạn mức ${esc(w.ten_vi)}"><i style="width:${Math.min(100, pct)}%"></i></div>` : '';
  const pay = i.no ? `<button class="btn sm" data-act="card-pay" data-k="${esc(w.ten_vi)}">Thanh toán</button>` : '';
  const body = `<div class="cl"><div class="cl1">${l1}</div>${bar}<div class="cl3"><div class="cl2 ${tt ? tt.c : ''}">${tt ? tt.t : ''}</div>${pay}</div></div>`;
  return pc ? `<div class="tr sub">${body}</div>` : `<div class="cardline">${body}</div>`;
}

export function walletGroups() {
  const ws = st.wallets(S.month);
  const order = st.NHOM_VI.slice();
  ws.forEach((w) => { if (!order.includes(w.nhom || 'Khác')) order.push(w.nhom || 'Khác'); });
  return order.map((g) => ({ nhom: g, ws: ws.filter((w) => (w.nhom || 'Khác') === g) })).filter((g) => g.ws.length);
}
// Phần mở rộng header Ví (mobile)
export function walletHero() {
  const nw = st.netWorth(S.month);
  return `<div class="hero"><div class="lbl">Tổng số dư tất cả ví</div>
    <div class="big num ${nw.total < 0 ? 'exp' : ''}">${net(nw.total)} đ</div>
    <div class="sub">Tài sản ${num(nw.assets)} · Nợ ${num(nw.liab)}</div>
    <div class="sub2">Vốn ròng ${net(nw.net)} · tính cả công nợ</div></div>`;
}
const netNote = (nw) => `<div class="note">Vốn ròng <b class="num">${net(nw.net)} đ</b> = tài sản ${num(nw.assets)} + phải thu ${num(nw.recv)} − nợ ${num(nw.liab)} − phải trả ${num(nw.pay)}. Số dư tính tới hết tháng ${U.monthLabel(S.month)}; Thu / Chi của từng ví gồm cả chuyển khoản và công nợ.</div>`;

export function walletsHtml(pc) {
  const nw = st.netWorth(S.month);
  const tt = st.totals(st.inMonth(S.month));
  const gs = walletGroups();
  const balC = (v) => (v < 0 ? 'exp' : '');
  if (!pc) {
    const list = gs.map((g) => `<div class="sec"><span>${esc(g.nhom)}</span><span class="r num">${net(U.sum(g.ws, (w) => w.bal))}</span></div>`
      + g.ws.map((w) => `<button class="row" data-act="w-edit" data-k="${esc(w.ten_vi)}">
        <span class="av" aria-hidden="true">${esc(U.chuCai(w.ten_vi))}</span>
        <span class="mid"><span class="t1" style="display:block">${esc(w.ten_vi)}${st.defaultAccount() === w.ten_vi ? ' <span class="tag">mặc định</span>' : ''}</span><span class="t2" style="display:block">Thu ${num(w.thu)} · Chi ${num(w.chi)}</span></span>
        <span class="amt num ${balC(w.bal)}">${net(w.bal)}</span></button>` + (w.nhom === st.NHOM_THE ? cardLine(w, false) : '')).join('')).join('');
    return bandOf([{ lb: 'Tổng thu', vl: plus(tt.thu), c: 'inc' }, { lb: 'Tổng chi', vl: minus(tt.chi), c: 'exp' }])
      + (list || '<div class="empty">Chưa có ví nào.</div>')
      + `<div class="btns pad"><button class="btn" data-act="transfer">Chuyển khoản</button><button class="btn pri" data-act="w-add">+ Thêm ví</button></div>` + netNote(nw);
  }
  const all = gs.flatMap((g) => g.ws);
  const rows = all.map((w) => `<button class="tr" data-act="w-edit" data-k="${esc(w.ten_vi)}">
      <span class="b">${esc(w.ten_vi)}${st.defaultAccount() === w.ten_vi ? ' <span class="tag">mặc định</span>' : ''}</span><span>${esc(w.nhom || 'Khác')}</span>
      <span class="r num">${num(w.thu)}</span><span class="r num">${num(w.chi)}</span><span class="r num b ${balC(w.bal)}">${net(w.bal)}</span></button>` + (w.nhom === st.NHOM_THE ? cardLine(w, true) : '')).join('');
  return bandOf([{ lb: 'Tổng số dư', vl: net(nw.total) + ' đ', c: nw.total < 0 ? 'exp' : '' }, { lb: 'Tài sản', vl: num(nw.assets) }, { lb: 'Nợ', vl: minus(nw.liab), c: 'exp' },
    { lb: 'Tổng thu', vl: plus(tt.thu), c: 'inc' }, { lb: 'Tổng chi', vl: minus(tt.chi), c: 'exp' }])
    + `<div class="tbl wtbl"><div class="th"><span>Ví</span><span>Nhóm</span><span class="r">Thu</span><span class="r">Chi</span><span class="r">Số dư</span></div>${rows}
      <div class="tr tot"><span>Tổng cộng</span><span></span><span class="r num">${num(U.sum(all, (w) => w.thu))}</span><span class="r num">${num(U.sum(all, (w) => w.chi))}</span><span class="r num ${balC(nw.total)}">${net(nw.total)}</span></div></div>`
    + netNote(nw);
}

// ================= NGÂN SÁCH =================
export const budStatus = (x) => (x.chi > x.lim ? 'Vượt ' + num(x.chi - x.lim) : x.chi === x.lim ? 'Đạt hạn mức' : 'Còn ' + num(x.lim - x.chi));
const theoThang = (x) => (x.inherited ? ` · theo tháng ${U.monthLabel(x.inherited)}` : '');

export function budgetsHtml(pc) {
  const b = st.budgets(S.month);
  const lim = U.sum(b, (x) => x.lim), chi = U.sum(b, (x) => x.chi), con = lim - chi;
  const pct = (x) => Math.round(x.ratio * 100);
  const items = [{ lb: 'Ngân sách', vl: num(lim) }, { lb: 'Đã chi', vl: num(chi), c: chi ? 'exp' : '' }, { lb: 'Còn lại', vl: net(con), c: con < 0 ? 'exp' : '' }];
  if (pc) items.push({ lb: 'Đã dùng', vl: (lim ? Math.round(chi / lim * 100) : 0) + '%', c: chi > lim ? 'exp' : '' });
  const bar = (x) => `<div class="bar ${st.level(x.ratio)}" role="progressbar" aria-valuenow="${pct(x)}" aria-label="${esc(x.nhom)}"><i style="width:${Math.min(100, pct(x))}%"></i></div>`;
  const empty = `<div class="empty">Chưa đặt ngân sách cho tháng ${U.monthLabel(S.month)}.<br>Bấm "+ Thêm nhóm" để đặt hạn mức theo nhóm danh mục.</div>`;
  if (!pc) {
    return bandOf(items) + `<div class="sec"><span>Theo nhóm</span>${b.length ? '<button class="secbtn" data-act="b-bulk">Sửa</button>' : ''}</div>`
      + (b.length ? b.map((x) => `<button class="brow" data-act="b-edit" data-k="${esc(x.nhom)}">
        <span class="l1"><span>${esc(x.nhom)}</span><span class="${x.ratio > 1 ? 'exp' : ''}">${pct(x)}%</span></span>
        <span class="l2">${num(x.chi)} / ${num(x.lim)} · ${budStatus(x)}${theoThang(x)}</span>${bar(x)}</button>`).join('') : empty)
      + `<div class="pad"><button class="btn wide" data-act="b-add">+ Thêm nhóm ngân sách</button></div>`;
  }
  return bandOf(items) + `<div class="tbl btbl"><div class="th"><span>Nhóm</span><span>Tiến độ</span><span class="r">Đã chi / Ngân sách</span><span>Trạng thái</span></div>`
    + b.map((x) => `<button class="tr" data-act="b-edit" data-k="${esc(x.nhom)}"><span>${esc(x.nhom)}${x.inherited ? `<small>theo ${U.monthLabel(x.inherited)}</small>` : ''}</span>${bar(x)}
      <span class="r num">${num(x.chi)} / ${num(x.lim)}</span><span class="num"><b class="${x.ratio > 1 ? 'exp' : ''}">${pct(x)}%</b> · ${budStatus(x)}</span></button>`).join('')
    + '</div>' + (b.length ? '' : empty);
}

// ================= CÔNG NỢ =================
export function personSummary(p) {
  const a = [];
  if (p.choVay) a.push('Cho vay ' + num(p.choVay));
  if (p.thuNo) a.push('đã trả ' + num(p.thuNo));
  if (p.diVay) a.push((a.length ? 'đi vay ' : 'Đi vay ') + num(p.diVay));
  if (p.traNo) a.push('đã trả lại ' + num(p.traNo));
  return a.join(' · ') || 'Chưa có giao dịch';
}
// Nhãn một dòng lịch sử công nợ
export const histLabel = (t, ten) => (t.loai === L.THU_NO ? ten + ' trả' : t.loai === L.TRA_NO ? 'Trả ' + ten : NHAN[t.loai]);

export function selPerson(ds) {
  if (!ds.length) return null;
  return ds.find((d) => d.ten === SV.person) || ds[0];
}

export function debtsHtml(pc) {
  const ds = st.debts().sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  const recv = U.sum(ds.filter((d) => d.du > 0), (d) => d.du), pay = U.sum(ds.filter((d) => d.du < 0), (d) => -d.du);
  const p = selPerson(ds);
  const band = bandOf([{ lb: 'Phải thu', vl: num(recv), c: 'inc' }, { lb: 'Phải trả', vl: num(pay), c: 'exp' }, { lb: 'Ròng', vl: netSigned(recv - pay) }]);
  const people = `<div class="sec"><span>Từng người</span></div>` + (ds.length ? ds.map((d) => `<button class="row" data-act="p-sel" data-k="${esc(d.ten)}" aria-pressed="${!!(p && d.ten === p.ten)}">
      <span class="av" aria-hidden="true">${esc(U.chuCai(d.ten))}</span>
      <span class="mid"><span class="t1" style="display:block">${esc(d.ten)}</span><span class="t2" style="display:block">${personSummary(d)}</span></span>
      <span class="amt num ${d.du > 0 ? 'inc' : d.du < 0 ? 'exp' : ''}">${netSigned(d.du)}</span></button>`).join('')
    : '<div class="empty">Chưa có ai trong danh sách công nợ.</div>');
  let hist = '';
  if (p) {
    const rows = p.hist.map((t) => {
      const v = st.debtSign(t.loai) * t.so_tien;
      return `<button class="hrow" data-act="edit" data-id="${esc(t.id)}"><span>${U.dm(t.ngay)} · ${esc(histLabel(t, p.ten))}${t.ghi_chu && !U.boDau(t.ghi_chu).includes(U.boDau(p.ten)) ? `<small>${esc(t.ghi_chu)}</small>` : ''}</span><span class="num ${v > 0 ? 'inc' : 'exp'}">${netSigned(v)}</span></button>`;
    }).join('');
    const tra = p.du > 0 ? `<button class="btn" data-act="debt-add" data-loai="thu nợ">${esc(p.ten)} trả</button>`
      : p.du < 0 ? `<button class="btn" data-act="debt-add" data-loai="trả nợ">Trả ${esc(p.ten)}</button>` : '';
    hist = `<div class="sec"><span>Lịch sử · ${esc(p.ten)}</span><button class="secbtn" data-act="p-edit" data-k="${esc(p.ten)}">Sửa</button></div>`
      + (rows || '<div class="empty">Chưa có giao dịch với người này.</div>')
      + `<div class="remain"><span>Còn lại</span><span class="num">${net(p.du)}</span></div>`
      + `<div class="btns pad dbtns"><button class="btn" data-act="debt-add" data-loai="cho vay">+ Cho vay</button>${tra}<button class="btn" data-act="debt-add" data-loai="đi vay">+ Đi vay</button></div>`;
  } else {
    hist = `<div class="btns pad dbtns"><button class="btn" data-act="debt-add" data-loai="cho vay">+ Cho vay</button><button class="btn" data-act="debt-add" data-loai="đi vay">+ Đi vay</button></div>`;
  }
  if (!pc) return band + people + hist + `<div class="pad" style="padding-top:0"><button class="btn wide" data-act="p-add">+ Thêm người</button></div>`;
  return band + `<div class="dgrid"><div class="dl">${people}</div><div class="dr">${hist}</div></div>`;
}

export { NO_TYPES };
