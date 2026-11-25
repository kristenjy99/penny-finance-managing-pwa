// Penny v0.8.0 – danh sách giao dịch kiểu sổ thu chi: mỗi ngày một khối (số ngày lớn, thứ, tháng/năm, tổng ngày),
// dòng: biểu tượng, danh mục, ghi chú, số tiền (+ số dư sau giao dịch khi xem theo một ví)
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { L, DAU, NO_TYPES, NHAN } from './store.js';

const THU7 = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const signed = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + num(n);

/** Dòng tiền của giao dịch với một ví (+ vào ví, − ra khỏi ví) */
export function flowOf(t, w) {
  if (t.loai === L.CHUYEN) return (t.vi_den === w ? t.so_tien : 0) - (t.vi === w ? t.so_tien : 0);
  return t.vi === w ? (DAU[t.loai] || 0) * t.so_tien : 0;
}
// Sắp mới → cũ; cùng ngày giữ thứ tự gốc
export const sortDesc = (list) => list.map((t, i) => [t, i]).sort((a, b) => (a[0].ngay < b[0].ngay ? 1 : a[0].ngay > b[0].ngay ? -1 : a[1] - b[1])).map((x) => x[0]);

/** Một dòng giao dịch. o: {pc, on, w (tên ví đang xem), bal (số dư sau giao dịch)} */
export function rowHtml(t, o = {}) {
  let t1, t2, amt, c;
  const note = t.ghi_chu || '';
  if (t.loai === L.CHUYEN) {
    t1 = 'Chuyển khoản';
    t2 = `${t.vi || '?'} → ${t.vi_den || '?'}` + (note ? ' · ' + note : '');
    if (o.w) { const f = flowOf(t, o.w); amt = signed(f); c = f > 0 ? 'inc' : 'exp'; } else { amt = num(t.so_tien); c = 'neu'; }
  } else if (NO_TYPES.includes(t.loai)) {
    t1 = NHAN[t.loai] + (t.nguoi ? ' · ' + t.nguoi : '');
    t2 = note + (o.pc && t.vi && !o.w ? (note ? ' · ' : '') + t.vi : '');
    amt = (DAU[t.loai] > 0 ? '+' : MINUS) + num(t.so_tien); c = o.w ? (DAU[t.loai] > 0 ? 'inc' : 'exp') : 'neu';
  } else {
    t1 = t.danh_muc || st.fallbackCat(t.loai);
    t2 = note + (o.pc && t.vi && !o.w ? (note ? ' · ' : '') + t.vi : '');
    amt = (t.loai === L.THU ? '+' : MINUS) + num(t.so_tien); c = t.loai === L.THU ? 'inc' : 'exp';
  }
  return `<button class="row${o.on ? ' on' : ''}" data-act="edit" data-id="${esc(t.id)}">
    <span class="av" aria-hidden="true">${esc(st.symbolOf(t))}</span>
    <span class="mid"><span class="t1" style="display:block">${esc(t1)}</span>${t2 ? `<span class="t2 gc" style="display:block">${esc(t2)}</span>` : ''}</span>
    <span class="amtw"><span class="amt num ${c}">${amt}</span>${o.bal != null ? `<small class="bal num">(${(o.bal < 0 ? MINUS : '') + num(o.bal)})</small>` : ''}</span></button>`;
}

/** Danh sách theo khối ngày. o: {pc, onId, w (xem theo ví → hiện số dư sau giao dịch)} */
export function dayCards(list, o = {}) {
  if (!list.length) return '';
  // Số dư sau từng giao dịch của ví: đi từ số dư hiện tại ngược về quá khứ trên toàn bộ giao dịch của ví
  let balOf = null;
  if (o.w) {
    balOf = new Map();
    const w = st.wallets('').find((x) => x.ten_vi === o.w);
    let cur = w ? w.bal : 0;
    sortDesc(st.live().filter((t) => t.vi === o.w || t.vi_den === o.w)).forEach((t) => { balOf.set(t.id, cur); cur -= flowOf(t, o.w); });
  }
  const td = U.today(), hq = U.addDays(td, -1);
  const out = [];
  let cur = null, buf = [];
  const flush = () => {
    if (!cur) return;
    const tot = o.w ? U.sum(buf, (t) => flowOf(t, o.w)) : st.dayNet(buf);
    const [y, m, d] = cur.split('-');
    const nhan = cur === td ? 'Hôm nay' : cur === hq ? 'Hôm qua' : THU7[U.toDate(cur).getDay()];
    out.push(`<div class="dcard"><div class="dch"><b class="dn num">${d}</b><span class="dw"><b>${nhan}</b><small>${m}/${y}</small></span><span class="dt num ${tot > 0 ? 'inc' : tot < 0 ? 'exp' : ''}">${signed(tot)} đ</span></div>`
      + buf.map((t) => rowHtml(t, { pc: o.pc, on: o.onId === t.id, w: o.w, bal: balOf ? balOf.get(t.id) : null })).join('') + '</div>');
  };
  sortDesc(list).forEach((t) => { if (t.ngay !== cur) { flush(); cur = t.ngay; buf = []; } buf.push(t); });
  flush();
  return out.join('');
}
