// Penny v0.5.0 – các màn Thống kê, Ví, Ngân sách, Công nợ (mobile + PC)
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L, NHAN, NO_TYPES } from './store.js';
import { piggySvg } from './ui.js';

// Trạng thái riêng của các màn này
export const SV = { stTab: 'chi', person: '' };

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

/** Gom theo nhóm danh mục (chi) hoặc theo danh mục (thu); tối đa 6 phần, phần thừa gộp vào "Khác" */
export function statParts(loai, k = S.month) {
  const m = new Map();
  st.inMonth(k).filter((t) => t.loai === loai).forEach((t) => {
    const key = loai === L.CHI ? st.groupOf(t.danh_muc || st.DM_CHUA) : (t.danh_muc || st.DM_THU_KHAC);
    m.set(key, (m.get(key) || 0) + t.so_tien);
  });
  let arr = [...m.entries()].map(([k2, v]) => ({ k: k2, v })).sort((a, b) => b.v - a.v);
  if (arr.length > MAU) {
    const giu = arr.slice(0, MAU - 1).filter((x) => U.boDau(x.k) !== 'khac');
    const con = arr.filter((x) => !giu.includes(x));
    arr = giu.concat({ k: 'Khác', v: U.sum(con, (x) => x.v) });
  }
  const pct = pctRound(arr.map((x) => x.v));
  return arr.map((x, i) => ({ ...x, pct: pct[i], mau: 'var(--c' + (i + 1) + ')' }));
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

/** Biểu đồ cột theo ngày (SVG, chiều ngang co giãn theo khung) */
export function dayBarsSvg(loai, k = S.month) {
  const td = U.today();
  const nDays = U.ym(td) === k ? +td.slice(8) : k < U.ym(td) ? U.daysIn(k) : 0;
  const per = new Array(nDays).fill(0);
  st.inMonth(k).filter((t) => t.loai === loai).forEach((t) => { const d = +t.ngay.slice(8) - 1; if (d >= 0 && d < nDays) per[d] += t.so_tien; });
  if (!nDays) return '<div class="empty">Tháng này chưa bắt đầu.</div>';
  const max = Math.max(...per, 1);
  const H = 200, TOP = 26, n = nDays;
  const w = 100 / n;
  const nhieu = n > 12;
  const iMax = per.indexOf(Math.max(...per));
  const buoc = Math.ceil(n / 10);
  let h = '';
  per.forEach((v, i) => {
    const bh = v ? Math.max(2, Math.round(v / max * H)) : 0;
    const y = TOP + H - bh;
    const ngay = String(i + 1).padStart(2, '0') + '/' + k.slice(5);
    const nhan = v && (!nhieu || i === iMax) ? `<text x="50%" y="${y - 8}" text-anchor="middle" class="bv">${num(Math.round(v / 1000))}</text>` : '';
    const xl = !nhieu || i % buoc === 0 || i === n - 1 ? `<text x="50%" y="${TOP + H + 22}" text-anchor="middle" class="bx">${ngay}</text>` : '';
    h += `<svg x="${(i * w).toFixed(4)}%" width="${w.toFixed(4)}%" height="${TOP + H + 34}" overflow="visible">
      <title>${ngay}: ${num(v)} đ</title>
      ${bh ? `<rect x="${nhieu ? 20 : 30}%" width="${nhieu ? 60 : 40}%" y="${y}" height="${bh}" fill="var(--acc)"/>` : ''}${nhan}${xl}</svg>`;
  });
  return `<svg class="dbars" width="100%" height="${TOP + H + 34}" role="img" aria-label="${loai === L.CHI ? 'Chi' : 'Thu'} theo ngày">${h}
    <line x1="0" x2="100%" y1="${TOP + H + 33.5}" y2="${TOP + H + 33.5}" stroke="var(--bd)"/></svg>`;
}

// Cảnh báo ngân sách: nhóm từ 80% trở lên
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

export function statsHtml(pc) {
  const loai = SV.stTab === 'thu' ? L.THU : L.CHI;
  const parts = statParts(loai);
  const total = U.sum(parts, (x) => x.v);
  const nhan = loai === L.CHI ? 'Tổng chi' : 'Tổng thu';
  const legend = parts.length ? parts.map((p) => `<div class="leg"><i style="background:${p.mau}"></i><span class="k">${esc(p.k)}</span><span class="num">${num(p.v)} · ${p.pct}%</span></div>`).join('')
    : `<div class="empty">Chưa có khoản ${loai === L.CHI ? 'chi' : 'thu'} trong tháng này.</div>`;
  const left = `<div class="donut-wrap">${donutSvg(parts, nhan, total)}</div>${legend}${loai === L.CHI ? budgetAlert() : ''}`;
  if (!pc) return left;
  const tabs = `<div class="utabs st-tabs" role="tablist">${[['chi', 'Chi tiêu'], ['thu', 'Thu nhập']].map(([k, t]) => `<button role="tab" class="${SV.stTab === k ? 'on' : ''}" aria-selected="${SV.stTab === k}" data-act="st-tab" data-v="${k}">${t}</button>`).join('')}</div>`;
  return monthBand(st.inMonth(S.month)) + `<div class="st-grid"><div class="st-l">${tabs}${left}</div>
    <div class="st-r"><h2>${loai === L.CHI ? 'Chi' : 'Thu'} theo ngày <small>nghìn đ</small></h2>${dayBarsSvg(loai)}</div></div>`;
}
export const statsTabs = () => `<div class="utabs" role="tablist">${[['chi', 'Chi tiêu'], ['thu', 'Thu nhập']].map(([k, t]) => `<button role="tab" class="${SV.stTab === k ? 'on' : ''}" aria-selected="${SV.stTab === k}" data-act="st-tab" data-v="${k}">${t}</button>`).join('')}</div>`;

// ================= VÍ =================
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
        <span class="amt num ${balC(w.bal)}">${net(w.bal)}</span></button>`).join('')).join('');
    return bandOf([{ lb: 'Tổng thu', vl: plus(tt.thu), c: 'inc' }, { lb: 'Tổng chi', vl: minus(tt.chi), c: 'exp' }])
      + (list || '<div class="empty">Chưa có ví nào.</div>')
      + `<div class="btns pad"><button class="btn" data-act="transfer">Chuyển khoản</button><button class="btn pri" data-act="w-add">+ Thêm ví</button></div>` + netNote(nw);
  }
  const all = gs.flatMap((g) => g.ws);
  const rows = all.map((w) => `<button class="tr" data-act="w-edit" data-k="${esc(w.ten_vi)}">
      <span class="b">${esc(w.ten_vi)}${st.defaultAccount() === w.ten_vi ? ' <span class="tag">mặc định</span>' : ''}</span><span>${esc(w.nhom || 'Khác')}</span>
      <span class="r num">${num(w.thu)}</span><span class="r num">${num(w.chi)}</span><span class="r num b ${balC(w.bal)}">${net(w.bal)}</span></button>`).join('');
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
