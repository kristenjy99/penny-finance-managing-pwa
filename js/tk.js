// Penny v0.9.0 – sổ tiết kiệm: tính lãi theo số dư thực tế × số ngày / 365, sự kiện trả lãi / đến hạn, ghi nhận, tất toán
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';

export const TRA_LAI = { cuoi_ky: 'Cuối kỳ', hang_thang: 'Hàng tháng', dau_ky: 'Trả trước (đầu kỳ)' };
export const DAO_HAN = { goc_lai: 'Tái tục cả gốc và lãi', goc: 'Tái tục gốc, lãi về ví nhận', tat_toan: 'Tất toán về ví nhận' };
export const KY_HAN = [0, 1, 2, 3, 6, 9, 12, 13, 18, 24, 36];
export const kyLabel = (k) => (+k ? k + ' tháng' : 'Không kỳ hạn');
export const LAI_DM = 'Lãi tiết kiệm';
export const laiNote = (ten) => 'Lãi tiết kiệm · ' + ten;

// Cộng n tháng, giữ ngày (31/01 + 1 tháng → 28/02 hoặc 29/02)
export function addMonthsDay(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const cuoi = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return U.ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(dd, cuoi)));
}
// Số ngày từ a tới b (b − a)
export const days = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => +x - (i === 1 ? 1 : 0))) - Date.UTC(...a.split('-').map((x, i) => +x - (i === 1 ? 1 : 0)))) / 86400000);

/**
 * Lãi của sổ `ten` từ ngày a (tính) tới ngày b (không tính), lãi suất r %/năm:
 * cộng từng đoạn số dư không đổi: số dư × r × số ngày / 365 (giống cách ngân hàng tính, 1 năm = 365 ngày).
 * Tiền gửi thêm / rút ra trong khoảng được tính từ đúng ngày phát sinh.
 */
export function interest(ten, a, b, r) {
  if (!a || !b || b <= a || !(r > 0)) return 0;
  const moc = [...new Set(st.live().filter((t) => (t.vi === ten || t.vi_den === ten) && t.ngay > a && t.ngay < b).map((t) => t.ngay))].sort();
  let cur = a, bal = st.balanceAt(ten, a), tong = 0;
  for (const p of moc) { tong += Math.max(0, bal) * r / 100 * days(cur, p) / 365; bal = st.balanceAt(ten, p); cur = p; }
  tong += Math.max(0, bal) * r / 100 * days(cur, b) / 365;
  return Math.round(tong);
}

const vaoVi = (a) => (a.tk_vi_nhan && a.tk_vi_nhan !== a.ten_vi && st.S.acc.some((x) => x.ten_vi === a.tk_vi_nhan) ? a.tk_vi_nhan : st.defaultAccount());
// Tiền lãi đã ghi nhận trong kỳ hiện tại (từ ngày gửi của kỳ)
export const paidTerm = (a) => U.sum(st.live().filter((t) => t.loai === L.THU && t.ghi_chu.startsWith(laiNote(a.ten_vi)) && t.ngay >= a.tk_ngay_gui), (t) => t.so_tien);

/** Thông tin hiển thị của sổ tại ngày td */
export function info(a, td = U.today()) {
  const ten = a.ten_vi, r = +a.tk_lai_suat || 0, ky = +a.tk_ky_han || 0, gui = a.tk_ngay_gui || td;
  const den = ky ? addMonthsDay(gui, ky) : '';
  const bal = st.balanceAt(ten, td);
  const tra = a.tk_tra_lai || 'cuoi_ky';
  const moc = tra === 'hang_thang' && a.tk_da_tra > gui ? a.tk_da_tra : gui;
  const toi = den && td > den ? den : td;
  // Lãi tạm tính: phần lãi đã phát sinh nhưng chưa ghi nhận (không cộng vào số dư)
  const laiTam = tra === 'dau_ky' && ky ? 0 : interest(ten, moc, toi, r);
  // Lãi cả kỳ dự kiến: phần đã qua theo số dư thực tế + phần còn lại giữ số dư hiện tại
  const laiKy = ky ? interest(ten, gui, toi, r) + (td < den ? Math.round(Math.max(0, bal) * r / 100 * days(td, den) / 365) : 0) : 0;
  const rRut = ky ? +a.tk_lai_kkh || 0 : r;
  const laiRut = interest(ten, gui, td, rRut) - (ky ? paidTerm(a) : 0);
  const pct = ky ? Math.min(100, Math.max(0, Math.round(days(gui, td) / Math.max(1, days(gui, den)) * 100))) : 0;
  return { ten, r, ky, gui, den, bal, tra, laiTam, laiKy, laiRut, rRut, conNgay: den ? days(td, den) : null, pct, vi: vaoVi(a), daTat: st.isClosed(a) };
}

/** Sự kiện kế tiếp của sổ: lãi đầu kỳ / lãi hàng tháng / đến hạn. null nếu không kỳ hạn hoặc đã tất toán */
export function nextEvent(a) {
  if (!st.isSaving(a) || st.isClosed(a)) return null;
  const ky = +a.tk_ky_han || 0, gui = a.tk_ngay_gui, r = +a.tk_lai_suat || 0;
  if (!ky || !gui) return null;
  const den = addMonthsDay(gui, ky), tra = a.tk_tra_lai || 'cuoi_ky', vi = vaoVi(a), ten = a.ten_vi;
  if (tra === 'dau_ky' && a.tk_da_tra !== gui) {
    return { a, kind: 'lai_dau', ngay: gui, lai: Math.round(Math.max(0, st.balanceAt(ten, gui)) * r / 100 * days(gui, den) / 365), vao: vi, den };
  }
  let tu = gui;
  if (tra === 'hang_thang') {
    tu = a.tk_da_tra > gui ? a.tk_da_tra : gui;
    let k = 1, nx = addMonthsDay(gui, 1);
    while (nx <= tu) nx = addMonthsDay(gui, ++k);
    if (nx < den) return { a, kind: 'lai_thang', ngay: nx, lai: interest(ten, tu, nx, r), vao: vi, den, tu };
  }
  const lai = tra === 'dau_ky' ? 0 : interest(ten, tu, den, r);
  const hd = a.tk_dao_han || 'goc_lai';
  return { a, kind: 'dao_han', ngay: den, lai, vao: hd === 'goc_lai' ? ten : vi, viNhan: vi, hd, den, tu };
}
/** Các sự kiện đã tới ngày (≤ hôm nay), sớm nhất trước */
export function dueEvents(td = U.today()) {
  return S.acc.map(nextEvent).filter((e) => e && e.ngay <= td).sort((x, y) => (x.ngay < y.ngay ? -1 : 1));
}
// "Sổ X" (tên đã có chữ Sổ thì không thêm)
export const soTen = (ten) => (/^sổ(\s|$)/i.test(ten.normalize('NFC')) ? ten : 'Sổ ' + ten);
export function eventText(e) {
  const t0 = soTen(e.a.ten_vi);
  if (e.kind === 'lai_dau') return `${t0}: lãi trả trước ${num(e.lai)} đ vào ${e.vao} (${U.dmy(e.ngay)})`;
  if (e.kind === 'lai_thang') return `${t0}: lãi tháng ${num(e.lai)} đ vào ${e.vao} (${U.dmy(e.ngay)})`;
  return `${t0} đến hạn ${U.dmy(e.ngay)}: lãi ${num(e.lai)} đ · ${DAO_HAN[e.hd].toLowerCase()}`;
}

// Bảo đảm có danh mục (thu/chi) trước khi ghi
export async function ensureCat(ten, loai, nhom, ky) {
  if (st.S.cat.some((c) => c.danh_muc === ten)) return;
  await st.saveCat({ danh_muc: ten, nhom, ky_hieu: ky, loai });
}
const nhomThu = () => { const c = st.S.cat.find((x) => x.loai === 'thu'); return c ? c.nhom || 'Thu nhập' : 'Thu nhập'; };

/** Ghi nhận một sự kiện. o: {lai (sửa tay), rMoi (lãi suất kỳ mới khi tái tục), vi (ví nhận)} */
export async function applyEvent(e, o = {}) {
  const a = st.S.acc.find((x) => x.ten_vi === e.a.ten_vi) || e.a;
  const ten = a.ten_vi, lai = Math.max(0, Math.round(o.lai != null ? o.lai : e.lai));
  const viNhan = o.vi || e.viNhan || e.vao;
  const vao = e.kind === 'dao_han' && e.hd === 'goc_lai' ? ten : (o.vi || e.vao);
  if (lai > 0) {
    await ensureCat(LAI_DM, 'thu', nhomThu(), '🏦');
    const nhan = e.kind === 'lai_dau' ? ' · trả trước' : e.kind === 'lai_thang' ? ' · tháng' : ' · đến hạn';
    await st.saveTx({ ngay: e.ngay, loai: L.THU, so_tien: lai, ghi_chu: laiNote(ten) + nhan, danh_muc: LAI_DM, vi: vao });
  }
  const moi = { ...a };
  if (e.kind === 'lai_dau') moi.tk_da_tra = a.tk_ngay_gui;
  else if (e.kind === 'lai_thang') moi.tk_da_tra = e.ngay;
  else if (e.hd === 'tat_toan') {
    const goc = st.balanceAt(ten, e.ngay);
    if (goc > 0) await st.saveTx({ ngay: e.ngay, loai: L.CHUYEN, so_tien: goc, vi: ten, vi_den: viNhan, ghi_chu: 'Tất toán sổ ' + ten });
    moi.tk_trang_thai = 'tat_toan';
  } else {
    // Tái tục: kỳ mới bắt đầu từ ngày đến hạn, lãi suất mới (mặc định giữ mức cũ)
    moi.tk_ngay_gui = e.ngay; moi.tk_da_tra = '';
    if (o.rMoi != null && o.rMoi >= 0) moi.tk_lai_suat = o.rMoi;
  }
  await st.saveAcc(moi, ten);
}

/** Tất toán trước hạn tại ngày d: lãi (có thể âm nếu đã nhận lãi trước nhiều hơn lãi không kỳ hạn), chuyển gốc về ví nhận */
export async function settle(a, { ngay, lai, vi }) {
  const ten = a.ten_vi;
  lai = Math.round(lai || 0);
  if (lai > 0) {
    await ensureCat(LAI_DM, 'thu', nhomThu(), '🏦');
    await st.saveTx({ ngay, loai: L.THU, so_tien: lai, ghi_chu: laiNote(ten) + ' · tất toán trước hạn', danh_muc: LAI_DM, vi });
  } else if (lai < 0) {
    // ngân hàng trừ lại phần lãi đã trả trước vào tiền gốc
    await st.saveTx({ ngay, loai: L.CHI, so_tien: -lai, ghi_chu: 'Thu hồi lãi đã nhận trước · ' + ten, danh_muc: LAI_DM, vi: ten });
  }
  const goc = st.balanceAt(ten, ngay);
  if (goc > 0) await st.saveTx({ ngay, loai: L.CHUYEN, so_tien: goc, vi: ten, vi_den: vi, ghi_chu: 'Tất toán sổ ' + ten });
  await st.saveAcc({ ...a, tk_trang_thai: 'tat_toan' }, ten);
}

// ---------- Giao diện nhỏ dùng chung ----------
/** Dòng phụ trên thẻ sổ ở tab Ví */
export function cardLine(a) {
  const i = info(a);
  if (i.daTat) return `<span class="tkl">Đã tất toán</span>`;
  const dh = i.ky ? (i.conNgay > 0 ? `đến hạn ${U.dm(i.den)} · còn ${i.conNgay} ngày` : `đã đến hạn ${U.dm(i.den)}`) : 'không kỳ hạn';
  return `<span class="tkl">${String(i.r).replace('.', ',')}%/năm · ${dh}</span>
    ${i.ky ? `<span class="bar tkbar" role="progressbar" aria-valuenow="${i.pct}" aria-label="Đã qua ${i.pct}% kỳ hạn"><i style="width:${i.pct}%"></i></span>` : ''}
    <span class="tkl">Lãi tạm tính <b class="num inc">+${num(i.laiTam)}</b></span>`;
}
/** Banner sự kiện đã tới ngày (Giao dịch, Ví, chi tiết sổ). chi = tên sổ để chỉ hiện của sổ đó */
export function banner(chi = '') {
  const es = dueEvents().filter((e) => !chi || e.a.ten_vi === chi);
  if (!es.length) return '';
  const e = es[0];
  return `<div class="duebar tkdue" role="status"><span class="av" aria-hidden="true">🏦</span><div class="dt">${esc(eventText(e))}${es.length > 1 ? ` <small>(+${es.length - 1} việc khác)</small>` : ''}</div>
    <div class="db"><button class="btn sm pri" data-act="tk-ok" data-k="${esc(e.a.ten_vi)}">Ghi nhận</button><button class="btn sm" data-act="tk-sua" data-k="${esc(e.a.ten_vi)}">Sửa</button></div></div>`;
}
export const fmtR = (r) => String(+r || 0).replace('.', ',');
export const parseR = (v) => { const n = Number(String(v || '').replace('%', '').replace(',', '.').trim()); return isFinite(n) && n >= 0 && n < 100 ? n : null; };
export const signedNum = (n) => (n < 0 ? MINUS : '') + num(n);
