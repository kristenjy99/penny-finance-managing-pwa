// Penny v0.8.0 (v0.10.0: lọc Tuần/Tháng/Quý/Năm) – màn chi tiết: danh mục / nhóm danh mục (#/dm/...) và chi tiết ví (#/vd/<tên ví>)
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { dayCards, flowOf } from './list.js';
import { lineSvg, walletStats } from './chart.js';
import * as TK from './tk.js';
import { pctRound, walletIcon, cardLine } from './screens.js';

// Trạng thái: DV = chi tiết danh mục (per: tuan|thang|quy|nam, anchor: một ngày trong khoảng), WV = chi tiết ví
export const DV = { loai: 'chi', kind: 'g', name: '', per: 'nam', anchor: '', sel: '' };
export const WV = { name: '', per: '30' };

const net = (n) => (n < 0 ? MINUS : '') + num(n);
const catOf = (t, lo) => t.danh_muc || st.fallbackCat(lo);
const p2 = (n) => String(n).padStart(2, '0');
const PERS_DM = [['tuan', 'Tuần'], ['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']];
const THU_NGAN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Khoảng thời gian {from, to, label, ten (dùng trong câu)} theo kiểu kỳ và một ngày bất kỳ trong kỳ */
export function rangeOf(per, a) {
  const [y, m] = a.split('-').map(Number);
  if (per === 'tuan') { const from = U.weekStartOf(a, st.weekStart()); const to = U.addDays(from, 6); return { from, to, label: U.dm(from) + ' – ' + U.dmy(to), ten: 'tuần ' + U.dm(from) + ' – ' + U.dm(to) }; }
  if (per === 'quy') { const q = Math.floor((m - 1) / 3), k1 = y + '-' + p2(q * 3 + 1), k3 = y + '-' + p2(q * 3 + 3); return { from: k1 + '-01', to: k3 + '-' + p2(U.daysIn(k3)), label: 'Quý ' + (q + 1) + '/' + y, ten: 'quý ' + (q + 1) + '/' + y }; }
  if (per === 'nam') return { from: y + '-01-01', to: y + '-12-31', label: String(y), ten: 'năm ' + y };
  const k = y + '-' + p2(m);
  return { from: k + '-01', to: k + '-' + p2(U.daysIn(k)), label: p2(m) + '/' + y, ten: 'tháng ' + m + '/' + y };
}
const shiftOf = (per, a, d) => (per === 'tuan' ? U.addDays(a, 7 * d) : per === 'thang' ? U.addMonths(U.ym(a), d) + '-01' : per === 'quy' ? U.addMonths(U.ym(a), 3 * d) + '-01' : (+a.slice(0, 4) + d) + '-01-01');

// ---------- Chi tiết danh mục / nhóm ----------
/** Đọc #/dm/<chi|thu>/<g|c>/<tên>; kỳ mặc định = kỳ đang xem ở Thống kê */
export function openDm(p, per, anchor) {
  const loai = p[1] === 'thu' ? 'thu' : 'chi', kind = p[2] === 'c' ? 'c' : 'g', name = decodeURIComponent(p[3] || '');
  if (DV.loai !== loai || DV.kind !== kind || DV.name !== name) { DV.sel = ''; DV.per = per; DV.anchor = anchor; }
  Object.assign(DV, { loai, kind, name });
  if (!DV.anchor) { DV.per = per; DV.anchor = anchor; }
  return !!name;
}
export const dmHash = (loai, kind, name) => `#/dm/${loai}/${kind}/${encodeURIComponent(name)}`;
export const dmShift = (d) => { DV.anchor = shiftOf(DV.per, DV.anchor, d); DV.sel = ''; };
export function dmPer(per) {
  const r = rangeOf(DV.per, DV.anchor), td = U.today();
  DV.anchor = td >= r.from && td <= r.to ? td : r.from;
  DV.per = per; DV.sel = '';
}

// Nút ‹ kỳ › trên thanh tiêu đề
export const yearNav = () => `<div class="yrnav"><button data-act="dm-y" data-d="-1" aria-label="Kỳ trước">‹</button><b class="num">${rangeOf(DV.per, DV.anchor).label}</b><button data-act="dm-y" data-d="1" aria-label="Kỳ sau">›</button></div>`;

/** Các mốc của biểu đồ theo kỳ: tuần/tháng → từng ngày, quý → từng tuần, năm → từng tháng; mốc chưa tới = null */
function mocs(per, r, list) {
  const td = U.today(), out = [];
  const tong = (a, b) => U.sum(list.filter((t) => t.ngay >= a && t.ngay <= b), (t) => t.so_tien);
  if (per === 'nam') {
    for (let m = 1; m <= 12; m++) { const k = r.from.slice(0, 4) + '-' + p2(m), a = k + '-01', b = k + '-31'; out.push({ lb: 'T' + m, v: a > td ? null : tong(a, b), t: 'Tháng ' + m + '/' + k.slice(0, 4) }); }
  } else if (per === 'quy') {
    for (let a = U.weekStartOf(r.from, st.weekStart()); a <= r.to; a = U.addDays(a, 7)) {
      const a0 = a < r.from ? r.from : a, b = U.addDays(a, 6) > r.to ? r.to : U.addDays(a, 6);
      out.push({ lb: U.dm(a0), v: a0 > td ? null : tong(a0, b), t: 'Tuần ' + U.dm(a0) + ' – ' + U.dm(b) });
    }
  } else {
    for (let d = r.from; d <= r.to; d = U.addDays(d, 1)) out.push({ lb: per === 'tuan' ? THU_NGAN[U.toDate(d).getDay()] : String(+d.slice(8)), v: d > td ? null : tong(d, d), t: U.dmy(d) });
  }
  return out;
}

export function dmHtml(pc) {
  const lo = DV.loai === 'thu' ? L.THU : L.CHI;
  const r = rangeOf(DV.per, DV.anchor);
  const scope = st.live().filter((t) => t.loai === lo && t.ngay >= r.from && t.ngay <= r.to
    && (DV.kind === 'g' ? st.groupOf(catOf(t, lo)) === DV.name : catOf(t, lo) === DV.name));
  // Chọn kỳ + ‹ kỳ › nằm trong nội dung (thanh tiêu đề mobile hẹp, để chỗ cho tên danh mục)
  const seg = `<div class="perbar dmper"><div class="seg" role="radiogroup" aria-label="Khoảng thời gian">${PERS_DM.map(([k, t]) => `<button role="radio" class="${DV.per === k ? 'on' : ''}" aria-checked="${DV.per === k}" data-act="dm-per" data-v="${k}">${t}</button>`).join('')}</div>
    <div class="pnav yrnav"><button data-act="dm-y" data-d="-1" aria-label="Kỳ trước">‹</button><b>${r.label}</b><button data-act="dm-y" data-d="1" aria-label="Kỳ sau">›</button></div></div>`;
  // Bảng chia theo danh mục con (chỉ khi xem một nhóm)
  let rows = '';
  if (DV.kind === 'g') {
    const m = new Map();
    scope.forEach((t) => { const k = catOf(t, lo); const x = m.get(k) || { k, v: 0, n: 0, sym: st.symbolOf(t) }; x.v += t.so_tien; x.n++; m.set(k, x); });
    const cats = [...m.values()].sort((a, b) => b.v - a.v);
    if (DV.sel && !m.has(DV.sel)) DV.sel = '';
    const pct = pctRound(cats.map((c) => c.v));
    const tot = U.sum(cats, (c) => c.v);
    rows = `<div class="card dmb"><button class="dmr${DV.sel ? '' : ' on'}" data-act="dm-sel" data-k=""><span class="k">Tất cả</span><span class="p num">${tot ? 100 : 0}%</span><span class="v num">${num(tot)}</span></button>`
      + cats.map((c, i) => `<button class="dmr${DV.sel === c.k ? ' on' : ''}" data-act="dm-sel" data-k="${esc(c.k)}"><span class="k"><span class="av xs" aria-hidden="true">${esc(c.sym)}</span>${esc(c.k)}</span><span class="p num">${pct[i]}%</span><span class="v num">${num(c.v)}</span></button>`).join('')
      + (cats.length ? '' : '<div class="empty">Chưa có giao dịch trong kỳ này.</div>') + '</div>';
  } else DV.sel = '';
  const list = DV.sel ? scope.filter((t) => catOf(t, lo) === DV.sel) : scope;
  const tong = U.sum(list, (t) => t.so_tien);
  // Trung bình theo đơn vị đã qua của kỳ (ngày với tuần/tháng, tháng với quý/năm)
  const td = U.today(), het = td > r.to ? r.to : td;
  const theoNgay = DV.per === 'tuan' || DV.per === 'thang';
  const soDv = het < r.from ? 0 : theoNgay ? Math.round((U.toDate(het) - U.toDate(r.from)) / 864e5) + 1
    : (+het.slice(0, 4) - +r.from.slice(0, 4)) * 12 + (+het.slice(5, 7) - +r.from.slice(5, 7)) + 1;
  const loaiTen = lo === L.CHI ? 'Chi tiêu' : 'Thu nhập';
  const hero = `<div class="dmh"><div class="lbl">${loaiTen} ${r.ten}${DV.sel ? ' · ' + esc(DV.sel) : ''}</div>
    <div class="big num ${lo === L.CHI ? 'exp' : 'inc'}">${num(tong)} đ</div>
    <div class="sub">${list.length} giao dịch${soDv ? ' · trung bình ' + num(Math.round(tong / soDv)) + ' đ/' + (theoNgay ? 'ngày' : 'tháng') : ''}</div></div>`;
  const tenMoc = DV.per === 'nam' ? 'tháng' : DV.per === 'quy' ? 'tuần' : 'ngày';
  const chart = `<div class="card dmc"><div class="vs-h"><span>${loaiTen} theo ${tenMoc}</span></div>${lineSvg(mocs(DV.per, r, list), { W: pc ? 560 : 360, H: pc ? 200 : 170, cls: lo === L.CHI ? 'exp' : 'inc', nhan: loaiTen + ' theo ' + tenMoc + ', ' + r.ten })}</div>`;
  const ds = dayCards(list, { pc }) || '<div class="empty">Không có giao dịch.</div>';
  if (!pc) return seg + hero + rows + chart + ds;
  return seg + `<div class="dmgrid"><div class="dml">${hero}${rows}${chart}</div><div class="dmr2" id="dmlist">${ds}</div></div>`;
}

// ---------- Chi tiết sổ tiết kiệm (v0.9.0) ----------
function tkBox(w) {
  const i = TK.info(w);
  const dong = (k, v, c = '') => `<div class="tkr"><span>${k}</span><b class="${c}">${v}</b></div>`;
  const nut = i.daTat ? '' : `<div class="btns tkbtn"><button class="btn" data-act="tk-add" data-k="${esc(w.ten_vi)}">Gửi thêm</button><button class="btn" data-act="w-adjust" data-k="${esc(w.ten_vi)}">Điều chỉnh</button><button class="btn pri" data-act="tk-settle" data-k="${esc(w.ten_vi)}">Tất toán</button></div>`;
  return TK.banner(w.ten_vi) + `<div class="card tkbox"><div class="vs-h"><span>Thông tin sổ</span>${i.daTat ? '<span class="tag">Đã tất toán</span>' : ''}</div>
    ${dong('Ngày gửi (kỳ hiện tại)', U.dmy(i.gui))}
    ${dong('Kỳ hạn', TK.kyLabel(i.ky) + (i.ky ? ` · đến hạn ${U.dmy(i.den)}` + (i.daTat ? '' : i.conNgay > 0 ? ` (còn ${i.conNgay} ngày)` : ' (đã đến hạn)') : ''))}
    ${dong('Lãi suất', TK.fmtR(i.r) + '%/năm' + (i.ky ? ` · rút trước hạn ${TK.fmtR(w.tk_lai_kkh)}%/năm` : ''))}
    ${i.ky ? dong('Trả lãi', TK.TRA_LAI[i.tra]) + dong('Khi đến hạn', TK.DAO_HAN[w.tk_dao_han || 'goc_lai']) : ''}
    ${dong('Ví nhận lãi / tiền tất toán', esc(i.vi))}
    ${i.daTat ? '' : dong('Lãi tạm tính đến hôm nay', '+' + num(i.laiTam) + ' đ', 'num inc')
      + (i.ky ? dong('Lãi dự kiến cả kỳ', '+' + num(i.laiKy) + ' đ', 'num inc') : '')
      + dong('Nếu tất toán hôm nay nhận', num(Math.max(0, i.bal) + i.laiRut) + ' đ', 'num')}
    <div class="hint" style="margin:8px 0 4px">Lãi = số dư × lãi suất × số ngày thực gửi / 365. Lãi tạm tính chỉ để xem, chưa cộng vào số dư cho tới khi ghi nhận.${st.isHidden(w) && !i.daTat ? ' Sổ này không tính vào tổng tài sản.' : ''}</div>${nut}</div>`;
}

// ---------- Chi tiết ví ----------
const PERS = [['30', '30 ngày'], ['thang', 'Tháng'], ['nam', 'Năm'], ['all', 'Tất cả']];
function wRange() {
  const td = U.today();
  if (WV.per === '30') return { from: U.addDays(td, -29), to: td, lb: '30 ngày gần nhất' };
  if (WV.per === 'thang') return { from: S.month + '-01', to: S.month + '-31', lb: 'Tháng ' + U.monthLabel(S.month) };
  if (WV.per === 'nam') { const y = S.month.slice(0, 4); return { from: y + '-01-01', to: y + '-12-31', lb: 'Năm ' + y }; }
  return { from: '0000', to: '9999', lb: 'Từ trước tới nay' };
}
export const findWallet = (ten) => st.wallets('').find((w) => w.ten_vi === ten);

export function vdHtml(pc) {
  const w = findWallet(WV.name);
  if (!w) return '<div class="empty">Không tìm thấy ví này.</div>';
  const r = wRange();
  const list = st.live().filter((t) => (t.vi === w.ten_vi || t.vi_den === w.ten_vi) && t.ngay >= r.from && t.ngay <= r.to);
  let thu = 0, chi = 0;
  list.forEach((t) => { const f = flowOf(t, w.ten_vi); if (f > 0) thu += f; else chi -= f; });
  const seg = `<div class="perbar vper"><div class="seg" role="radiogroup" aria-label="Khoảng thời gian">${PERS.map(([k, t]) => `<button role="radio" class="${WV.per === k ? 'on' : ''}" aria-checked="${WV.per === k}" data-act="vd-per" data-v="${k}">${t}</button>`).join('')}</div><div class="pnav"><b>${r.lb}</b></div></div>`;
  const band = `<div class="band"><div><div class="lb">Tổng thu</div><div class="vl num inc">${thu ? '+' : ''}${num(thu)}</div></div><div><div class="lb">Tổng chi</div><div class="vl num exp">${chi ? MINUS : ''}${num(chi)}</div></div></div>`;
  const head = `<div class="card vdh"><div class="vdh1"><span class="av lg" aria-hidden="true">${walletIcon(w)}</span><span class="mid"><b>${esc(w.ten_vi)}</b><small>${esc(w.nhom || 'Khác')}${st.defaultAccount() === w.ten_vi ? ' · mặc định' : ''}</small></span></div>
    <div class="vdh2"><span>Số dư hiện tại</span><b class="num ${w.bal < 0 ? 'exp' : ''}">${net(w.bal)} đ</b></div>${w.nhom === st.NHOM_THE ? cardLine(w, false) : ''}
    ${st.isSaving(w) ? '' : `<div class="vdh3"><button class="btn sm" data-act="w-adjust" data-k="${esc(w.ten_vi)}">Điều chỉnh số dư</button></div>`}</div>`
    + (st.isSaving(w) ? tkBox(w) : '');
  const ds = dayCards(list, { pc, w: w.ten_vi }) || '<div class="empty">Không có giao dịch trong khoảng này.</div>';
  const stats = walletStats(w.ten_vi, pc);
  if (!pc) return head + seg + band + ds + stats;
  return `<div class="dmgrid"><div class="dml">${head}${stats}</div><div class="dmr2">${seg}${band}<div id="vdlist">${ds}</div></div></div>`;
}
