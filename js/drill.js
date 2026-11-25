// Penny v0.8.0 – màn chi tiết: danh mục / nhóm danh mục theo năm (#/dm/...) và chi tiết ví (#/vd/<tên ví>)
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { dayCards, flowOf } from './list.js';
import { lineSvg, walletStats } from './chart.js';
import { pctRound, walletIcon, cardLine } from './screens.js';

// Trạng thái: DV = chi tiết danh mục, WV = chi tiết ví
export const DV = { loai: 'chi', kind: 'g', name: '', year: '', sel: '' };
export const WV = { name: '', per: '30' };

const net = (n) => (n < 0 ? MINUS : '') + num(n);
const catOf = (t, lo) => t.danh_muc || st.fallbackCat(lo);

// ---------- Chi tiết danh mục / nhóm ----------
/** Đọc #/dm/<chi|thu>/<g|c>/<tên>; năm mặc định = năm của khoảng đang xem ở Thống kê */
export function openDm(p, yearDefault) {
  const loai = p[1] === 'thu' ? 'thu' : 'chi', kind = p[2] === 'c' ? 'c' : 'g', name = decodeURIComponent(p[3] || '');
  if (DV.loai !== loai || DV.kind !== kind || DV.name !== name) { DV.sel = ''; DV.year = yearDefault; }
  Object.assign(DV, { loai, kind, name });
  if (!DV.year) DV.year = yearDefault;
  return !!name;
}
export const dmHash = (loai, kind, name) => `#/dm/${loai}/${kind}/${encodeURIComponent(name)}`;

// Nút ‹ năm › trên thanh tiêu đề
export const yearNav = () => `<div class="yrnav"><button data-act="dm-y" data-d="-1" aria-label="Năm trước">‹</button><b class="num">${DV.year}</b><button data-act="dm-y" data-d="1" aria-label="Năm sau">›</button></div>`;

export function dmHtml(pc) {
  const lo = DV.loai === 'thu' ? L.THU : L.CHI;
  const y = DV.year;
  const scope = st.live().filter((t) => t.loai === lo && t.ngay.slice(0, 4) === y
    && (DV.kind === 'g' ? st.groupOf(catOf(t, lo)) === DV.name : catOf(t, lo) === DV.name));
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
      + (cats.length ? '' : '<div class="empty">Chưa có giao dịch trong năm này.</div>') + '</div>';
  } else DV.sel = '';
  const list = DV.sel ? scope.filter((t) => catOf(t, lo) === DV.sel) : scope;
  const tong = U.sum(list, (t) => t.so_tien);
  // Số tháng đã qua của năm đang xem → trung bình mỗi tháng
  const td = U.today(), yN = +y, yT = +td.slice(0, 4);
  const soThang = yN < yT ? 12 : yN > yT ? 0 : +td.slice(5, 7);
  const loaiTen = lo === L.CHI ? 'Chi tiêu' : 'Thu nhập';
  const hero = `<div class="dmh"><div class="lbl">${loaiTen} năm ${y}${DV.sel ? ' · ' + esc(DV.sel) : ''}</div>
    <div class="big num ${lo === L.CHI ? 'exp' : 'inc'}">${num(tong)} đ</div>
    <div class="sub">${list.length} giao dịch${soThang ? ' · trung bình ' + num(Math.round(tong / soThang)) + ' đ/tháng' : ''}</div></div>`;
  // Biểu đồ 12 tháng (tháng chưa tới không vẽ)
  const pts = [];
  for (let m = 1; m <= 12; m++) {
    const k = y + '-' + String(m).padStart(2, '0');
    pts.push({ lb: 'T' + m, v: yN > yT || (yN === yT && m > soThang) ? null : U.sum(list.filter((t) => t.ngay.slice(0, 7) === k), (t) => t.so_tien), t: 'Tháng ' + m + '/' + y });
  }
  const chart = `<div class="card dmc"><div class="vs-h"><span>${loaiTen} theo tháng</span></div>${lineSvg(pts, { W: pc ? 560 : 360, H: pc ? 200 : 170, cls: lo === L.CHI ? 'exp' : 'inc', nhan: loaiTen + ' theo tháng năm ' + y })}</div>`;
  const ds = dayCards(list, { pc }) || '<div class="empty">Không có giao dịch.</div>';
  if (!pc) return hero + rows + chart + ds;
  return `<div class="dmgrid"><div class="dml">${hero}${rows}${chart}</div><div class="dmr2" id="dmlist">${ds}</div></div>`;
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
    <div class="vdh2"><span>Số dư hiện tại</span><b class="num ${w.bal < 0 ? 'exp' : ''}">${net(w.bal)} đ</b></div>${w.nhom === st.NHOM_THE ? cardLine(w, false) : ''}</div>`;
  const ds = dayCards(list, { pc, w: w.ten_vi }) || '<div class="empty">Không có giao dịch trong khoảng này.</div>';
  const stats = walletStats(w.ten_vi, pc);
  if (!pc) return head + seg + band + ds + stats;
  return `<div class="dmgrid"><div class="dml">${head}${stats}</div><div class="dmr2">${seg}${band}<div id="vdlist">${ds}</div></div></div>`;
}
