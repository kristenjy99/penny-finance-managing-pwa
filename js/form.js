// Form thêm / sửa giao dịch nhập tay. Dùng chung cho: bottom sheet (mobile), hộp thoại (PC), panel phải (PC), màn sửa (mobile)
import { esc, parseMoney, num, today, okDate, dmy } from './util.js';
import * as st from './store.js';
import { S, L, NHAN, NO_TYPES } from './store.js';
import { confirmBox, toast, ICON } from './ui.js';
import { pickCategory } from './pick.js';
import { openWallet } from './manage.js';

const LOAI_THUONG = [L.CHI, L.THU, L.CHUYEN];
const NHAN_NUT = { 'chi': 'Chi', 'thu': 'Thu', 'chuyển': 'Chuyển', 'no': 'Công nợ', 'cho vay': 'Cho vay', 'đi vay': 'Đi vay', 'thu nợ': 'Thu nợ', 'trả nợ': 'Trả nợ' };
// Giải thích ngắn từng loại công nợ
const GIAI_THICH = {
  'cho vay': 'Bạn đưa tiền cho người khác mượn · tiền ra khỏi ví.',
  'đi vay': 'Bạn mượn tiền của người khác · tiền vào ví.',
  'thu nợ': 'Người đó trả lại tiền bạn đã cho vay · tiền vào ví.',
  'trả nợ': 'Bạn trả lại tiền đã vay · tiền ra khỏi ví.'
};
let seq = 0;

/**
 * Gắn form vào phần tử el.
 * opts.tx: giao dịch cần sửa (bỏ trống = thêm mới)
 * opts.variant: 'panel' (PC, cột phải) | 'sheet' (popup) | 'page' (màn sửa mobile)
 * opts.onDone(tx|null): gọi sau khi lưu / xóa / hủy
 * opts.init: giá trị chọn sẵn khi thêm mới {loai, nguoi, so_tien, vi, vi_den, ghi_chu}
 */
export function mountTxForm(el, { tx = null, variant = 'sheet', onDone = () => {}, init = null } = {}) {
  const id = 'f' + (++seq);
  const suaNo = !!(tx && NO_TYPES.includes(tx.loai));
  let vis = st.walletNames();
  const viMacDinh = st.defaultAccount();
  const f = tx
    ? { loai: tx.loai, amt: num(tx.so_tien) + ' đ', note: tx.ghi_chu, cat: tx.danh_muc, vi: tx.vi || viMacDinh, vi_den: tx.vi_den, nguoi: tx.nguoi, ngay: tx.ngay || today() }
    : { loai: L.CHI, amt: '', note: '', cat: '', vi: viMacDinh, vi_den: '', nguoi: '', ngay: today() };
  if (!tx && init) {
    if (init.loai) f.loai = init.loai;
    if (init.nguoi) f.nguoi = init.nguoi;
    if (init.so_tien) f.amt = num(init.so_tien) + ' đ';
    if (init.vi && vis.includes(init.vi)) f.vi = init.vi;
    if (init.vi_den && vis.includes(init.vi_den)) f.vi_den = init.vi_den;
    if (init.ghi_chu) f.note = init.ghi_chu;
  }
  let nhoKw = false; // ghi nhớ từ khóa "ghi chú -> danh mục" khi lưu
  let viTay = !!tx || !!(init && (init.vi || init.vi_den)); // v0.10.0: người dùng đã tự chọn ví → không tự đổi theo ghi chú
  let goiYCk = null; // gợi ý ví chuyển khoản đang áp dụng
  if (!f.vi_den) f.vi_den = vis.find((v) => v !== f.vi) || '';
  let err = '';
  let noCuoi = NO_TYPES.includes(f.loai) ? f.loai : L.CHO_VAY; // loại công nợ chọn gần nhất
  const isNoNow = () => NO_TYPES.includes(f.loai);

  // Sửa công nợ: chỉ đổi giữa 4 loại công nợ; sửa giao dịch thường: Chi/Thu/Chuyển; thêm mới: Chi/Thu/Chuyển/Công nợ
  const loais = suaNo ? NO_TYPES : tx ? LOAI_THUONG : LOAI_THUONG.concat('no');
  const tuDong = () => st.classify(f.note, f.loai) || st.fallbackCat(f.loai);
  const opts = (sel, list) => list.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')
    + (sel && !list.includes(sel) ? `<option selected>${esc(sel)}</option>` : '')
    + '<option value="__new__">＋ Thêm ví mới…</option>';

  function catBtn() {
    const v = f.cat ? `<span class="v">${esc(f.cat)}</span>` : `<span class="v">${esc(tuDong())} <span class="auto">· tự động</span></span>`;
    return `${v}<span aria-hidden="true">▾</span>`;
  }

  // Ví là thẻ tín dụng: nói rõ giao dịch làm dư nợ tăng hay giảm
  function cardHint() {
    const ten = f.loai === L.CHUYEN && st.isCard(st.S.acc.find((a) => a.ten_vi === f.vi_den) || {}) ? f.vi_den : f.vi;
    const a = st.S.acc.find((x) => x.ten_vi === ten);
    if (!a || !st.isCard(a)) return '';
    const i = st.cardInfo(a, today());
    const vao = (f.loai === L.CHUYEN && ten === f.vi_den) || (st.DAU[f.loai] || 0) > 0;
    return `💳 ${esc(ten)}: ${vao ? 'tiền vào thẻ → dư nợ giảm' : 'chi bằng thẻ → dư nợ tăng'}. Dư nợ hiện tại ${num(i.no)} đ${i.lim ? `, hạn mức còn ${num(i.con)} đ` : ''}.`;
  }
  function draw() {
    const pc = variant === 'panel';
    const isNo = isNoNow();
    const chon = (l) => l === f.loai || (l === 'no' && isNo);
    const typeSel = pc
      ? `<div class="ftabs" role="tablist">${loais.map((l) => `<button type="button" role="tab" class="${chon(l) ? 'on' : ''}" data-loai="${l}" aria-selected="${chon(l)}">${NHAN_NUT[l]}</button>`).join('')}</div>`
      : `<div class="seg lg" role="radiogroup">${loais.map((l) => `<button type="button" role="radio" class="${chon(l) ? 'on' : ''}" data-loai="${l}" aria-checked="${chon(l)}">${NHAN_NUT[l]}</button>`).join('')}</div>`;
    // Thêm mới công nợ: hàng chọn 4 loại công nợ
    const noSel = isNo && !suaNo ? `<div class="seg sub" role="radiogroup" aria-label="Loại công nợ">${NO_TYPES.map((l) => `<button type="button" role="radio" class="${l === f.loai ? 'on' : ''}" data-loai="${l}" aria-checked="${l === f.loai}">${NHAN_NUT[l]}</button>`).join('')}</div>` : '';
    const noHint = isNo ? `<div class="nohint">${GIAI_THICH[f.loai]}</div>` : '';
    const conTien = f.amt && parseMoney(f.amt);
    const hintTien = err === 'amt' ? '<div class="hint err">Số tiền chưa đúng. Ví dụ: 38000, 38k, 1tr, 1,5tr, 2tr5</div>'
      : conTien && num(conTien) !== f.amt.trim() && (num(conTien) + ' đ') !== f.amt.trim() ? `<div class="hint">= ${num(conTien)} đ</div>` : '';
    const fTien = `<div class="fld"><label for="${id}-amt">Số tiền</label>
      <input class="inp ${err === 'amt' ? 'bad' : ''}" id="${id}-amt" name="amt" value="${esc(f.amt)}" placeholder="38.000 đ" autocomplete="off" enterkeyhint="next" ${tx ? '' : 'autofocus'}>${hintTien}</div>`;
    const fGhiChu = `<div class="fld"><label for="${id}-note">Ghi chú</label>
      <input class="inp" id="${id}-note" name="note" value="${esc(f.note)}" placeholder="cafe" autocomplete="off" enterkeyhint="done"></div>`;
    const fDanhMuc = (f.loai === L.CHI || f.loai === L.THU) ? `<div class="fld"><label for="${id}-cat">Danh mục</label>
      <button type="button" class="inp" id="${id}-cat" data-pick="cat">${catBtn()}</button>
      ${pc ? '' : '<div class="hint">Để trống để tự phân loại theo từ khóa, hoặc chạm để chọn tay.</div>'}</div>` : '';
    const fNguoi = isNo ? `<div class="fld"><label for="${id}-ng">Người</label>
      <input class="inp ${err === 'nguoi' ? 'bad' : ''}" id="${id}-ng" name="nguoi" value="${esc(f.nguoi)}" list="${id}-ppl" autocomplete="off">
      <datalist id="${id}-ppl">${st.personNames().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      ${err === 'nguoi' ? '<div class="hint err">Nhập tên người.</div>' : ''}</div>` : '';
    const fVi = `<div class="fld"><label for="${id}-vi">${f.loai === L.CHUYEN ? 'Từ ví' : 'Ví'}</label>
      <select class="inp" id="${id}-vi" name="vi">${opts(f.vi, vis)}</select></div>`;
    const fViDen = f.loai === L.CHUYEN ? `<div class="fld"><label for="${id}-vd">Đến ví</label>
      <select class="inp ${err === 'vi_den' ? 'bad' : ''}" id="${id}-vd" name="vi_den">${opts(f.vi_den, vis)}</select>
      ${err === 'vi_den' ? '<div class="hint err">Chọn ví đích khác ví nguồn.</div>' : ''}</div>` : '';
    const fNgay = `<div class="fld"><label for="${id}-d">Ngày</label><div class="datef">
      <input type="date" id="${id}-d" name="ngay" value="${esc(f.ngay)}" required>
      <span class="inp dshow ${err === 'ngay' ? 'bad' : ''}" aria-hidden="true"><span>${f.ngay ? dmy(f.ngay) : 'Chọn ngày'}</span>${ICON.cal}</span></div></div>`;

    let vung;
    if (pc) vung = fTien + fGhiChu + fDanhMuc + fNguoi + (f.loai === L.CHUYEN ? `<div class="grid2">${fVi}${fViDen}</div>` : fVi) + fNgay;
    else if (f.loai === L.CHUYEN) vung = fTien + fGhiChu + `<div class="grid2">${fVi}${fViDen}</div>` + fNgay;
    else vung = fTien + fGhiChu + fDanhMuc + fNguoi + `<div class="grid2">${fVi}${fNgay}</div>`;
    vung += `<div class="hint cardhint" data-cardhint>${cardHint()}</div>`;
    if (f.loai === L.CHUYEN) vung += `<div class="hint ckhint" data-ckhint>${ckHint()}</div>`;

    const luu = `<button class="btn pri" type="submit">Lưu</button>`;
    const huy = `<button class="btn" type="button" data-cancel>Hủy</button>`;
    el.innerHTML = `<form class="txf" novalidate>
      ${pc ? `<h2>${tx ? 'Sửa giao dịch' : 'Thêm giao dịch'}</h2>` : ''}
      ${typeSel}${noSel}${noHint}${vung}
      <div class="btns">${pc ? luu + huy : huy + luu}</div>
      ${tx ? '<button class="btn danger del" type="button" data-del>Xóa giao dịch</button>' : ''}
      ${pc && !tx ? '<div class="tip">Mẹo: gõ 20k/cafe/Cà phê/tm trên Telegram (số tiền/ghi chú/danh mục/ví), giao dịch tự xuất hiện ở đây.</div>' : ''}
      ${tx && tx.nguon === 'bot' ? '<div class="tip">Giao dịch này được ghi từ bot Telegram.</div>' : ''}
    </form>`;
  }

  // v0.10.0: gợi ý Từ ví / Đến ví (và số tiền) theo ghi chú cho tab Chuyển khoản
  function ckHint() {
    if (!goiYCk) return viTay ? '' : 'Gõ ghi chú (ví dụ “nạp Momo”, “gửi tiết kiệm”): Penny tự chọn ví theo lần chuyển trước hoặc tên ví trong ghi chú.';
    return `Tự chọn ví theo ${goiYCk.vi_do === 'lich_su' ? 'lần chuyển trước có ghi chú giống' : 'tên ví trong ghi chú'}: <b>${esc(goiYCk.vi)} → ${esc(goiYCk.vi_den)}</b>. Đổi ô ví nếu chưa đúng.`;
  }
  function apGoiYCk() {
    if (f.loai !== L.CHUYEN || viTay) return;
    const g = st.suggestTransfer(f.note, f.vi);
    if (!g || !g.vi || !g.vi_den || g.vi === g.vi_den || !vis.includes(g.vi) || !vis.includes(g.vi_den)) {
      goiYCk = null; const h0 = el.querySelector('[data-ckhint]'); if (h0) h0.innerHTML = ckHint(); return;
    }
    goiYCk = g; f.vi = g.vi; f.vi_den = g.vi_den;
    const s1 = el.querySelector('[name=vi]'), s2 = el.querySelector('[name=vi_den]');
    if (s1) s1.value = g.vi;
    if (s2) s2.value = g.vi_den;
    const a = el.querySelector('[name=amt]');
    if (a && !a.value.trim() && g.so_tien) { f.amt = num(g.so_tien) + ' đ'; a.value = f.amt; }
    const h = el.querySelector('[data-ckhint]'); if (h) h.innerHTML = ckHint();
    const c = el.querySelector('[data-cardhint]'); if (c) c.innerHTML = cardHint();
  }

  // Đọc các ô đang hiện vào f trước khi vẽ lại
  function read() {
    const g = (n) => el.querySelector(`[name=${n}]`);
    ['amt', 'note', 'nguoi', 'vi', 'vi_den', 'ngay'].forEach((n) => { if (g(n)) f[n] = g(n).value; });
  }
  const refreshCat = () => { const b = el.querySelector('[data-pick=cat]'); if (b) b.innerHTML = catBtn(); };

  el.addEventListener('input', (e) => {
    const n = e.target.name;
    if (!n) return;
    f[n] = e.target.value;
    if (n === 'note' && !f.cat) refreshCat();
    if (n === 'note') apGoiYCk();
    if (n === 'ngay') { const s = e.target.parentNode.querySelector('.dshow span'); if (s) s.textContent = f.ngay ? dmy(f.ngay) : 'Chọn ngày'; }
    if (n === 'amt' && err === 'amt') { err = ''; }
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.name) return;
    // Chọn "＋ Thêm ví mới…" trong ô ví -> mở hộp thêm ví, xong chọn luôn ví mới
    if ((e.target.name === 'vi' || e.target.name === 'vi_den') && e.target.value === '__new__') {
      const ten = e.target.name;
      e.target.value = f[ten] || '';
      read();
      openWallet('', (moi) => { vis = st.walletNames(); f[ten] = moi; draw(); });
      return;
    }
    f[e.target.name] = e.target.value;
    if (e.target.name === 'vi' || e.target.name === 'vi_den') { viTay = true; goiYCk = null; const k = el.querySelector('[data-ckhint]'); if (k) k.innerHTML = ''; }
    if (e.target.name === 'vi' || e.target.name === 'vi_den') { const h = el.querySelector('[data-cardhint]'); if (h) h.innerHTML = cardHint(); }
    if (e.target.name === 'ngay') { const s = e.target.parentNode.querySelector('.dshow span'); if (s) s.textContent = f.ngay ? dmy(f.ngay) : 'Chọn ngày'; }
  });
  // Bấm ô ngày (máy tính): mở luôn bộ chọn ngày
  el.addEventListener('click', (e) => {
    if (e.target.type === 'date' && e.target.showPicker) { try { e.target.showPicker(); } catch (er) { /* trình duyệt cũ */ } }
  });
  // Định dạng lại số tiền khi rời ô: 38k -> 38.000 đ
  el.addEventListener('focusout', (e) => {
    if (e.target.name !== 'amt') return;
    const v = parseMoney(e.target.value);
    if (v) { f.amt = num(v) + ' đ'; e.target.value = f.amt; const h = e.target.parentNode.querySelector('.hint'); if (h) h.remove(); }
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.loai) {
      read();
      f.loai = b.dataset.loai;
      if (f.loai === 'no') f.loai = noCuoi;
      if (NO_TYPES.includes(f.loai)) noCuoi = f.loai;
      if (f.cat && !st.catsFor(f.loai).some((c) => c.danh_muc === f.cat)) f.cat = '';
      if (f.loai === L.CHUYEN && (!f.vi_den || f.vi_den === f.vi)) f.vi_den = vis.find((v) => v !== f.vi) || '';
      err = '';
      draw();
      apGoiYCk();
      return;
    }
    if (b.dataset.pick === 'cat') {
      read();
      const r = await pickCategory({ loai: f.loai, note: f.note, value: f.cat });
      if (r) { f.cat = r.v; nhoKw = r.nho; refreshCat(); }
      return;
    }
    if (b.hasAttribute('data-cancel')) { onDone(null); return; }
    if (b.hasAttribute('data-del')) {
      const ok = await confirmBox('Xóa giao dịch này? Giao dịch cũng bị xóa khỏi Google Sheet khi đồng bộ.', 'Xóa', true);
      if (!ok) return;
      await st.deleteTx(tx.id);
      toast('Đã xóa giao dịch');
      onDone(null);
    }
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    read();
    const isNo = isNoNow();
    const so = parseMoney(f.amt);
    err = !so ? 'amt'
      : isNo && !String(f.nguoi).trim() ? 'nguoi'
      : f.loai === L.CHUYEN && (!f.vi_den || f.vi_den === f.vi) ? 'vi_den'
      : !/^\d{4}-\d{2}-\d{2}$/.test(f.ngay) || !okDate(...f.ngay.split('-').map(Number)) ? 'ngay' : '';
    if (err) {
      draw();
      const bad = el.querySelector('.bad');
      if (bad) bad.focus();
      toast(err === 'ngay' ? 'Ngày chưa đúng' : 'Kiểm tra lại ô màu đỏ');
      return;
    }
    const thuChi = f.loai === L.CHI || f.loai === L.THU;
    const saved = await st.saveTx({
      ...(tx || {}),
      id: tx ? tx.id : '',
      ngay: f.ngay, loai: f.loai, so_tien: so, ghi_chu: f.note.trim(),
      danh_muc: thuChi ? (f.cat || tuDong()) : (tx && !thuChi ? tx.danh_muc : ''),
      vi: f.vi, vi_den: f.loai === L.CHUYEN ? f.vi_den : '',
      nguoi: isNo ? String(f.nguoi).trim() : '',
      nguon: tx ? tx.nguon : 'web'
    });
    if (nhoKw && thuChi && f.cat && f.note.trim()) {
      await st.saveKw({ tu_khoa: f.note.trim(), danh_muc: f.cat });
      nhoKw = false;
    }
    toast(tx ? 'Đã lưu thay đổi' : `Đã thêm ${NHAN[saved.loai].toLowerCase()} ${num(saved.so_tien)} đ`);
    if (!tx && variant === 'panel') {
      // Panel PC: giữ loại, ví, ngày để nhập tiếp
      f.amt = ''; f.note = ''; f.cat = ''; f.nguoi = ''; err = '';
      draw();
      const a = el.querySelector('[name=amt]');
      if (a) a.focus();
    }
    onDone(saved);
  });

  draw();
  const af = el.querySelector('[autofocus]');
  if (af && variant === 'panel' && matchMedia('(pointer: fine)').matches) setTimeout(() => af.focus(), 60);
}
