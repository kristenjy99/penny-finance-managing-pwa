// Penny v0.9.0 – hộp thoại: sổ tiết kiệm (phần trong form ví, ghi nhận sự kiện, tất toán) và điều chỉnh số dư ví
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { openSheet, toast, confirmBox } from './ui.js';
import * as TK from './tk.js';

const loi = (b, m) => { const x = b.querySelector('[data-msg]'); if (x) { x.textContent = m; x.className = 'okmsg no'; } };
const viThuong = (bo = '') => st.walletNames().filter((x) => x !== bo && !st.isSaving(S.acc.find((a) => a.ten_vi === x)));
const optVi = (ds, chon) => ds.map((x) => `<option ${x === chon ? 'selected' : ''}>${esc(x)}</option>`).join('');

// ================= Phần sổ tiết kiệm trong form Thêm / Sửa ví =================
/** HTML các ô của sổ. w = ví đang sửa (hoặc null khi thêm mới) */
export function tkFields(w) {
  const a = w || {};
  const moi = !w;
  const vis = viThuong(a.ten_vi);
  const nhan = a.tk_vi_nhan || st.defaultAccount();
  return `<div data-tk hidden>
    ${moi ? `<div class="grid2"><div class="fld"><label for="tk-goc">Số tiền gửi</label><input class="inp" id="tk-goc" name="tk_goc" placeholder="50.000.000" autocomplete="off"></div>
      <div class="fld"><label for="tk-nguon">Trích từ ví</label><select class="inp" id="tk-nguon" name="tk_nguon">${optVi(vis, st.defaultAccount())}<option value="">Tiền đã có sẵn (không trừ ví nào)</option></select></div></div>` : ''}
    <div class="grid2"><div class="fld"><label for="tk-ngay">Ngày gửi${moi ? '' : ' (của kỳ hiện tại)'}</label><input class="inp" type="date" id="tk-ngay" name="tk_ngay" value="${esc(a.tk_ngay_gui || U.today())}"></div>
      <div class="fld"><label for="tk-ky">Kỳ hạn</label><select class="inp" id="tk-ky" name="tk_ky">${TK.KY_HAN.map((k) => `<option value="${k}" ${+(a.tk_ky_han != null ? a.tk_ky_han : 6) === k ? 'selected' : ''}>${TK.kyLabel(k)}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="fld"><label for="tk-ls">Lãi suất (%/năm)</label><input class="inp" id="tk-ls" name="tk_ls" inputmode="decimal" value="${esc(a.tk_lai_suat != null && a.tk_lai_suat !== '' ? TK.fmtR(a.tk_lai_suat) : '')}" placeholder="5,5" autocomplete="off"></div>
      <div class="fld"><label for="tk-kkh">Lãi khi rút trước hạn (%/năm)</label><input class="inp" id="tk-kkh" name="tk_kkh" inputmode="decimal" value="${esc(TK.fmtR(a.tk_lai_kkh != null && a.tk_lai_kkh !== '' ? a.tk_lai_kkh : 0.1))}" autocomplete="off"></div></div>
    <div class="fld"><span class="lbl">Trả lãi</span><div class="seg" role="radiogroup" data-seg="tra">${Object.entries(TK.TRA_LAI).map(([k, t]) => `<button type="button" role="radio" data-tra="${k}" class="${(a.tk_tra_lai || 'cuoi_ky') === k ? 'on' : ''}" aria-checked="${(a.tk_tra_lai || 'cuoi_ky') === k}">${t}</button>`).join('')}</div></div>
    <div class="grid2"><div class="fld"><label for="tk-dh">Khi đến hạn</label><select class="inp" id="tk-dh" name="tk_dh">${Object.entries(TK.DAO_HAN).map(([k, t]) => `<option value="${k}" ${(a.tk_dao_han || 'goc_lai') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="tk-vn">Ví nhận lãi / tiền tất toán</label><select class="inp" id="tk-vn" name="tk_vn">${optVi(vis, nhan)}</select></div></div>
    <div class="hint" data-tkprev></div>
    <label class="set flat"><span>Không tính vào tổng tài sản</span><span class="switch"><input type="checkbox" name="tk_an" ${a.tk_an === '1' ? 'checked' : ''} aria-label="Không tính sổ này vào tổng tài sản"><i></i></span></label>
  </div>`;
}
/** Gắn sự kiện cho phần sổ; trả hàm đọc giá trị (null + báo lỗi nếu sai) */
export function tkMount(b, w) {
  let tra = (w && w.tk_tra_lai) || 'cuoi_ky';
  const g = (k) => { const x = b.querySelector(`[name=${k}]`); return x ? (x.type === 'checkbox' ? x.checked : x.value) : ''; };
  const prev = () => {
    const ky = +g('tk_ky'), r = TK.parseR(g('tk_ls')), ngay = g('tk_ngay');
    const goc = w ? st.balanceAt(w.ten_vi, U.today()) : U.parseMoney(g('tk_goc')) || 0;
    const el = b.querySelector('[data-tkprev]');
    if (!el) return;
    if (!ky || !ngay || r == null) { el.textContent = ky ? '' : 'Sổ không kỳ hạn: lãi chỉ hiện tạm tính, ghi nhận khi tất toán.'; return; }
    const den = TK.addMonthsDay(ngay, ky);
    const lai = Math.round(goc * r / 100 * TK.days(ngay, den) / 365);
    el.innerHTML = `Đến hạn <b>${U.dmy(den)}</b> (${TK.days(ngay, den)} ngày) · lãi dự kiến cả kỳ <b class="num">${num(lai)} đ</b> = ${num(goc)} × ${TK.fmtR(r)}% × ${TK.days(ngay, den)} / 365.`;
  };
  b.querySelectorAll('[data-tk] input, [data-tk] select').forEach((x) => x.addEventListener('input', prev));
  b.querySelector('[data-tk]').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tra]');
    if (!t) return;
    tra = t.dataset.tra;
    b.querySelectorAll('[data-tra]').forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-checked', x === t); });
  });
  prev();
  return () => {
    const r = TK.parseR(g('tk_ls')), kkh = TK.parseR(g('tk_kkh'));
    if (r == null) { loi(b, 'Lãi suất chưa đúng. Ví dụ: 5,5'); return null; }
    if (kkh == null) { loi(b, 'Lãi khi rút trước hạn chưa đúng. Ví dụ: 0,1'); return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g('tk_ngay'))) { loi(b, 'Chọn ngày gửi.'); return null; }
    const out = { tk_ngay_gui: g('tk_ngay'), tk_ky_han: +g('tk_ky'), tk_lai_suat: r, tk_lai_kkh: kkh, tk_tra_lai: tra, tk_dao_han: g('tk_dh'), tk_vi_nhan: g('tk_vn'), tk_an: g('tk_an') ? '1' : '' };
    if (w) Object.assign(out, { tk_trang_thai: w.tk_trang_thai || '', tk_da_tra: w.tk_da_tra || '' });
    if (!w) {
      const goc = U.parseMoney(g('tk_goc'));
      if (!goc) { loi(b, 'Nhập số tiền gửi. Ví dụ: 50tr, 50.000.000'); return null; }
      out._goc = goc; out._nguon = g('tk_nguon');
    }
    return out;
  };
}
/** Sau khi lưu sổ mới: chuyển tiền từ ví nguồn (hoặc ghi thành số dư đầu nếu tiền có sẵn) */
export async function tkAfterCreate(ten, v) {
  if (v._nguon) await st.saveTx({ ngay: v.tk_ngay_gui, loai: L.CHUYEN, so_tien: v._goc, vi: v._nguon, vi_den: ten, ghi_chu: 'Gửi tiết kiệm' });
}

// ================= Ghi nhận / sửa sự kiện đến hạn =================
export async function quickApply(ten) {
  const e = TK.dueEvents().find((x) => x.a.ten_vi === ten);
  if (!e) return;
  await TK.applyEvent(e);
  toast(e.kind === 'dao_han' ? (e.hd === 'tat_toan' ? 'Đã tất toán sổ ' + ten : 'Đã ghi lãi và tái tục sổ ' + ten) : 'Đã ghi tiền lãi');
}
export function openEvent(ten) {
  const e = TK.dueEvents().find((x) => x.a.ten_vi === ten);
  if (!e) return;
  const taiTuc = e.kind === 'dao_han' && e.hd !== 'tat_toan';
  const chonVi = !(e.kind === 'dao_han' && e.hd === 'goc_lai');
  openSheet({
    title: e.kind === 'dao_han' ? 'Sổ đến hạn' : 'Ghi tiền lãi', cls: 'mid',
    body: `<form novalidate><div class="hint" style="margin:0 0 12px">${esc(TK.eventText(e))}. Tiền lãi app tính theo công thức số dư × lãi suất × số ngày / 365; số ngân hàng trả có thể lệch vài đồng, sửa lại cho đúng.</div>
      <div class="grid2"><div class="fld"><label for="ev-lai">Tiền lãi</label><input class="inp" id="ev-lai" name="lai" value="${num(e.lai)}" autocomplete="off"></div>
        ${chonVi ? `<div class="fld"><label for="ev-vi">Vào ví</label><select class="inp" id="ev-vi" name="vi">${optVi(viThuong(ten), e.kind === 'dao_han' ? e.viNhan : e.vao)}</select></div>` : `<div class="fld"><span class="lbl">Vào</span><div class="inp ro">Cộng vào sổ ${esc(ten)}</div></div>`}</div>
      ${taiTuc ? `<div class="fld"><label for="ev-r">Lãi suất kỳ mới (%/năm)</label><input class="inp" id="ev-r" name="r" inputmode="decimal" value="${TK.fmtR(e.a.tk_lai_suat)}" autocomplete="off">
        <div class="hint">Ngân hàng áp lãi suất đang niêm yết vào ngày tái tục, xem trong app ngân hàng.</div></div>` : ''}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Để sau</button><button class="btn pri">Ghi nhận</button></div></form>`,
    onMount: (b, close) => {
      b.querySelector('form').onsubmit = async (ev) => {
        ev.preventDefault();
        const lai = U.parseMoney(b.querySelector('[name=lai]').value);
        if (lai == null || lai < 0 || (b.querySelector('[name=lai]').value.trim() && !lai && b.querySelector('[name=lai]').value.trim() !== '0')) { loi(b, 'Tiền lãi chưa đúng.'); return; }
        const o = { lai: lai || 0 };
        if (chonVi) o.vi = b.querySelector('[name=vi]').value;
        if (taiTuc) { const r = TK.parseR(b.querySelector('[name=r]').value); if (r == null) { loi(b, 'Lãi suất chưa đúng. Ví dụ: 5,5'); return; } o.rMoi = r; }
        await TK.applyEvent(e, o);
        toast('Đã ghi nhận');
        close();
      };
    }
  });
}

// ================= Tất toán trước hạn =================
export function openSettle(ten) {
  const a = S.acc.find((x) => x.ten_vi === ten);
  if (!a) return;
  const vis = viThuong(ten);
  const calc = (d) => { const i = TK.info(a, d); return { lai: i.laiRut, goc: st.balanceAt(ten, d), r: i.rRut, ky: i.ky }; };
  let c = calc(U.today());
  openSheet({
    title: 'Tất toán sổ ' + ten, cls: 'mid',
    body: `<form novalidate>
      <div class="hint" style="margin:0 0 12px" data-cm></div>
      <div class="grid2"><div class="fld"><label for="st-ngay">Ngày tất toán</label><input class="inp" type="date" id="st-ngay" name="ngay" value="${U.today()}" max="${U.today()}" min="${esc(a.tk_ngay_gui || '')}"></div>
        <div class="fld"><label for="st-vi">Nhận về ví</label><select class="inp" id="st-vi" name="vi">${optVi(vis, a.tk_vi_nhan || st.defaultAccount())}</select></div></div>
      <div class="fld"><label for="st-lai">Tiền lãi nhận (âm nếu ngân hàng trừ lại lãi đã trả trước)</label><input class="inp" id="st-lai" name="lai" value="${(c.lai < 0 ? MINUS : '') + num(c.lai)}" autocomplete="off"></div>
      <div class="cardbox"><div class="cb1"><span>Tiền gốc</span><b class="num" data-goc>${num(c.goc)}</b></div><div class="cb1"><span>Tổng nhận về</span><b class="num inc" data-tong>${num(c.goc + c.lai)}</b></div></div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Tất toán</button></div></form>`,
    onMount: (b, close) => {
      const ve = () => {
        b.querySelector('[data-cm]').textContent = c.ky
          ? `Rút trước hạn được tính lãi không kỳ hạn ${TK.fmtR(c.r)}%/năm theo số ngày đã gửi${TK.paidTerm(a) ? `, trừ ${num(TK.paidTerm(a))} đ lãi đã nhận trong kỳ` : ''}. Sửa nếu số ngân hàng trả khác.`
          : `Sổ không kỳ hạn: lãi ${TK.fmtR(c.r)}%/năm theo số ngày đã gửi.`;
        b.querySelector('[data-goc]').textContent = num(c.goc);
        const lai = U.parseSignedMoney(b.querySelector('[name=lai]').value) || 0;
        b.querySelector('[data-tong]').textContent = num(c.goc + lai);
      };
      b.querySelector('[name=ngay]').addEventListener('change', (e) => { if (!e.target.value) return; c = calc(e.target.value); b.querySelector('[name=lai]').value = (c.lai < 0 ? MINUS : '') + num(c.lai); ve(); });
      b.querySelector('[name=lai]').addEventListener('input', ve);
      ve();
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const lai = U.parseSignedMoney(b.querySelector('[name=lai]').value);
        const ngay = b.querySelector('[name=ngay]').value, vi = b.querySelector('[name=vi]').value;
        if (lai == null) { loi(b, 'Tiền lãi chưa đúng.'); return; }
        if (!ngay) { loi(b, 'Chọn ngày tất toán.'); return; }
        if (!vi) { loi(b, 'Chọn ví nhận tiền.'); return; }
        if (!(await confirmBox(`Tất toán sổ ${ten}: nhận ${num(st.balanceAt(ten, ngay) + lai)} đ về ${vi}?`, 'Tất toán'))) return;
        await TK.settle(a, { ngay, lai, vi });
        toast('Đã tất toán sổ ' + ten);
        close();
      };
    }
  });
}

// ================= Điều chỉnh số dư ví =================
async function ensureDcCats() {
  await TK.ensureCat(st.DM_DC_TANG, 'thu', st.NHOM_DC, '⚖');
  await TK.ensureCat(st.DM_DC_GIAM, 'chi', st.NHOM_DC, '⚖');
}
/** Hộp "Điều chỉnh số dư": nhập số dư thực tế, chọn có tính vào thống kê hay không. tx = giao dịch điều chỉnh đang sửa */
export function openAdjust(ten, tx = null) {
  const laDc = (t) => t && (st.DC_TYPES.includes(t.loai) || [st.DM_DC_TANG, st.DM_DC_GIAM].includes(t.danh_muc));
  if (tx && !laDc(tx)) return;
  ten = tx ? tx.vi : ten;
  const ngay0 = tx ? tx.ngay : U.today();
  // Số dư trước điều chỉnh (khi sửa: bỏ chính giao dịch này ra)
  const truoc = (d) => st.balanceAt(ten, d) - (tx && tx.ngay <= d ? (st.DAU[tx.loai] || 0) * tx.so_tien : 0);
  const tinhVao = tx ? !st.DC_TYPES.includes(tx.loai) : false;
  const the = st.isCard(S.acc.find((a) => a.ten_vi === ten) || {});
  const thuc0 = tx ? truoc(ngay0) + (st.DAU[tx.loai] || 0) * tx.so_tien : truoc(ngay0);
  openSheet({
    title: tx ? 'Sửa điều chỉnh số dư' : 'Điều chỉnh số dư', cls: 'mid',
    body: `<form novalidate>
      <div class="hint" style="margin:0 0 12px">Ví <b>${esc(ten)}</b>. Nhập số dư thực tế (xem trong app ngân hàng / ví), Penny ghi phần chênh lệch.${the ? ' Thẻ tín dụng: nhập số âm, ví dụ đang nợ 1.200.000 thì nhập −1.200.000.' : ''}</div>
      <div class="grid2"><div class="fld"><label for="dc-ngay">Tính tới hết ngày</label><input class="inp" type="date" id="dc-ngay" name="ngay" value="${ngay0}"></div>
        <div class="fld"><span class="lbl">Số dư trên Penny</span><div class="inp ro num" data-truoc></div></div></div>
      <div class="fld"><label for="dc-thuc">Số dư thực tế</label><input class="inp" id="dc-thuc" name="thuc" value="${(thuc0 < 0 ? MINUS : '') + num(thuc0)}" autocomplete="off" ${tx ? '' : 'autofocus'}></div>
      <div class="fld"><label for="dc-note">Ghi chú</label><input class="inp" id="dc-note" name="note" value="${esc(tx ? tx.ghi_chu : '')}" placeholder="ví dụ: đối chiếu cuối tháng" autocomplete="off"></div>
      <label class="set flat"><span>Tính vào thống kê thu / chi<small style="display:block;color:var(--ink2);font-weight:500">Bật: ghi thành khoản Thu / Chi danh mục “${st.DM_DC_TANG}” / “${st.DM_DC_GIAM}”. Tắt: chỉ sửa số dư, không vào Thống kê, Ngân sách.</small></span><span class="switch"><input type="checkbox" name="tk" ${tinhVao ? 'checked' : ''} aria-label="Tính vào thống kê"><i></i></span></label>
      <div class="cardbox"><div class="cb1"><span>Chênh lệch</span><b class="num" data-cl></b></div></div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${tx ? '<button type="button" class="btn danger del" data-del>Xóa điều chỉnh</button>' : ''}</form>`,
    onMount: (b, close) => {
      const ve = () => {
        const d = b.querySelector('[name=ngay]').value || U.today();
        const t0 = truoc(d), thuc = U.parseSignedMoney(b.querySelector('[name=thuc]').value);
        b.querySelector('[data-truoc]').textContent = (t0 < 0 ? MINUS : '') + num(t0);
        const cl = thuc == null ? null : thuc - t0;
        const el = b.querySelector('[data-cl]');
        el.textContent = cl == null ? '—' : (cl > 0 ? '+' : cl < 0 ? MINUS : '') + num(cl);
        el.className = 'num ' + (cl > 0 ? 'inc' : cl < 0 ? 'exp' : '');
      };
      b.querySelectorAll('[name=ngay], [name=thuc]').forEach((x) => x.addEventListener('input', ve));
      ve();
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (!(await confirmBox('Xóa điều chỉnh số dư này?', 'Xóa', true))) return; await st.deleteTx(tx.id); toast('Đã xóa'); close(); };
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const ngay = b.querySelector('[name=ngay]').value;
        const thuc = U.parseSignedMoney(b.querySelector('[name=thuc]').value);
        if (!ngay) { loi(b, 'Chọn ngày.'); return; }
        if (thuc == null) { loi(b, 'Số dư chưa đúng. Ví dụ: 1.250.000, −300.000'); return; }
        const cl = thuc - truoc(ngay);
        if (!cl) {
          if (tx) await st.deleteTx(tx.id);
          toast('Số dư đã khớp, không cần điều chỉnh'); close(); return;
        }
        const tinh = b.querySelector('[name=tk]').checked;
        if (tinh) await ensureDcCats();
        const loai = tinh ? (cl > 0 ? L.THU : L.CHI) : (cl > 0 ? L.DC_TANG : L.DC_GIAM);
        await st.saveTx({ ...(tx || {}), id: tx ? tx.id : '', ngay, loai, so_tien: Math.abs(cl), vi: ten, vi_den: '', nguoi: '',
          ghi_chu: U.nfc(b.querySelector('[name=note]').value) || 'Điều chỉnh số dư', danh_muc: tinh ? (cl > 0 ? st.DM_DC_TANG : st.DM_DC_GIAM) : '' });
        toast('Đã điều chỉnh số dư ' + ten);
        close();
      };
    }
  });
}
/** Có phải giao dịch điều chỉnh số dư (để mở đúng hộp sửa) */
export const isAdjust = (t) => !!t && (st.DC_TYPES.includes(t.loai) || [st.DM_DC_TANG, st.DM_DC_GIAM].includes(t.danh_muc));
