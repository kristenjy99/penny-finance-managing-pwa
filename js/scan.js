// Penny v0.6.0 – tab "Ảnh / Sao kê" trong hộp Thêm giao dịch:
// chọn file -> đọc trên thiết bị -> xem trước (sửa, chọn danh mục, bỏ dòng trùng) -> lưu nhiều giao dịch một lượt
import * as U from './util.js';
import { esc, num } from './util.js';
import * as st from './store.js';
import { S, L, NO_TYPES } from './store.js';
import { isPC, toast, openSheet } from './ui.js';
import { pickCategory } from './pick.js';
import { openWallet } from './manage.js';
import { parseStatement, NGUON } from './stmt.js';
import { readDoc, kindOf, KIND_LABEL, endOcr } from './docread.js';

export const NGUON_SK = 'sao kê';
const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.pdf,image/*,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NHAN_LOAI = { 'chi': 'Chi', 'thu': 'Thu', 'chuyển': 'Chuyển', 'cho vay': 'Cho vay', 'đi vay': 'Đi vay', 'thu nợ': 'Thu nợ', 'trả nợ': 'Trả nợ' };
const STOP = new Set(['thanh', 'toan', 'chuyen', 'tien', 'khoan', 'giao', 'dich', 'nhan', 'from', 'payment']);
const tu = (s) => U.boDau(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
const giong = (a, b) => { const x = tu(a); return tu(b).some((w) => x.includes(w)); };
const accOf = (ten) => S.acc.find((a) => a.ten_vi === ten);

/** Ví đề xuất theo ngân hàng nhận ra từ file (sao kê thẻ ưu tiên ví nhóm Thẻ tín dụng) */
export function suggestWallet(bank, card) {
  const ten = bank && NGUON[bank] ? NGUON[bank].ten : [];
  const gon = (s) => U.boDau(s).replace(/[^a-z0-9]+/g, '');
  const khop = (a) => ten.some((k) => gon(a.ten_vi).includes(gon(k)));
  let a = null;
  if (card) a = S.acc.find((x) => st.isCard(x) && khop(x));
  if (!a && bank) a = S.acc.find((x) => !st.isCard(x) && khop(x)) || S.acc.find(khop);
  if (!a && card) a = S.acc.find(st.isCard);
  return a ? a.ten_vi : '';
}

/** Đánh dấu dòng nghi trùng với giao dịch đã có: cùng ngày | loại | số tiền | ví (ghi chú so lỏng; lệch 1 ngày thì cần ghi chú giống) */
export function markDup(rows) {
  const key = (ngay, loai, so, vi, vd) => [ngay, loai, so, U.boDau(vi), loai === L.CHUYEN ? U.boDau(vd) : ''].join('|');
  const pool = new Map();
  st.live().forEach((t) => { const k = key(t.ngay, t.loai, t.so_tien, t.vi, t.vi_den); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(t); });
  const tim = (r, ngay, chat) => {
    const arr = pool.get(key(ngay, r.loai, r.so_tien, r.vi, r.vi_den));
    if (!arr || !arr.length) return false;
    let j = arr.findIndex((t) => U.boDau(t.ghi_chu) === U.boDau(r.ghi_chu));
    if (j < 0) j = chat ? arr.findIndex((t) => giong(t.ghi_chu, r.ghi_chu)) : 0;
    if (j < 0) return false;
    arr.splice(j, 1);
    return true;
  };
  // Lượt 1: trùng hẳn ghi chú; lượt 2: cùng ngày; lượt 3: lệch 1 ngày + ghi chú giống
  rows.forEach((r) => { r.dup = false; });
  rows.forEach((r) => { const arr = pool.get(key(r.ngay, r.loai, r.so_tien, r.vi, r.vi_den)); const j = arr ? arr.findIndex((t) => U.boDau(t.ghi_chu) === U.boDau(r.ghi_chu)) : -1; if (j >= 0) { arr.splice(j, 1); r.dup = true; } });
  rows.forEach((r) => { if (!r.dup) r.dup = tim(r, r.ngay, false) || tim(r, U.addDays(r.ngay, -1), true) || tim(r, U.addDays(r.ngay, 1), true); });
}

export function mountScan(el, { onDone = () => {} } = {}) {
  const V = { file: null, kind: '', busy: null, err: '', rows: null, bank: '', card: false, vi: '', viHint: '', info: null, lan: 0 };
  const pc = isPC();
  const nho = new Map(); // ghi chú -> danh mục cần nhớ từ khóa khi lưu

  // ---------- Dữ liệu dòng ----------
  function applyAll() {
    const card = accOf(V.vi);
    const traThe = card && st.isCard(card) && card.vi_thanh_toan && card.vi_thanh_toan !== V.vi ? card.vi_thanh_toan : '';
    V.rows.forEach((r) => {
      if (r.loaiFile) { r.loai = r.userLoai || r.loaiFile; r.vi = r.fileVi || V.vi; r.vi_den = r.loai === L.CHUYEN ? r.fileViDen : ''; }
      else {
        r.loai = r.userLoai || (r.sign > 0 ? L.THU : L.CHI);
        if (!r.userLoai && r.loai === L.THU && traThe) r.loai = L.CHUYEN;
        if (r.loai === L.CHUYEN) { r.vi = traThe || r.vi || ''; r.vi_den = V.vi; } else { r.vi = V.vi; r.vi_den = ''; }
      }
      phanLoai(r);
    });
    markDup(V.rows);
    V.rows.forEach((r) => { if (!r.touched) r.on = !r.dup && !(r.loai === L.CHUYEN && (!r.vi || r.vi === r.vi_den)); });
  }
  function phanLoai(r) {
    if (r.loai !== L.CHI && r.loai !== L.THU) { r.cat = r.loai === L.CHUYEN ? '' : r.fileCat || ''; r.tt = 'khac'; return; }
    if (r.tt === 'tay' && st.catsFor(r.loai).some((c) => c.danh_muc === r.cat)) return;
    if (r.fileCat && st.catsFor(r.loai).some((c) => c.danh_muc === r.fileCat)) { r.cat = r.fileCat; r.tt = 'file'; return; }
    const c = st.classify(r.ghi_chu, r.loai);
    if (c) { r.cat = c; r.tt = 'auto'; return; }
    const g = st.suggestCats('', r.ghi_chu, r.loai)[0];
    if (g && g.khop && g.diem >= 50) { r.cat = g.c.danh_muc; r.tt = 'goiy'; return; }
    r.cat = ''; r.tt = 'chon';
  }

  // ---------- Đọc file ----------
  async function load(f) {
    if (!f) return;
    const lan = ++V.lan;
    V.file = { name: f.name, kind: kindOf(f) };
    V.err = ''; V.rows = null; V.info = null; V.busy = { text: 'Đang mở file…', p: 0 };
    nho.clear();
    draw();
    try {
      const d = await readDoc(f, {
        onProg: (x) => { if (lan !== V.lan) return; V.busy = x; drawProg(); },
        askPass: (sai) => askPassword(sai)
      });
      if (lan !== V.lan) return;
      const p = parseStatement(d.rows, { grid: d.grid, fileName: f.name });
      V.info = { pages: d.pages, ocrPages: d.ocrPages || 0, ms: d.msPerPage, mode: p.mode };
      el.dataset.ms = d.msPerPage || '';
      V.bank = p.bank; V.card = p.card;
      V.rows = p.items.map((t, k) => ({ k, ngay: t.ngay, sign: t.sign, so_tien: t.so_tien, ghi_chu: t.ghi_chu, doan: t.doan,
        loaiFile: t.loaiFile || '', fileVi: t.vi || '', fileViDen: t.vi_den || '', nguoi: t.nguoi || '', fileCat: t.cat || '', cat: '', tt: '', on: true }));
      const goiY = suggestWallet(p.bank, p.card);
      V.vi = goiY || st.defaultAccount();
      V.viHint = !goiY && p.bank ? `Chưa có ví ${p.bank}${p.card ? ' (thẻ tín dụng)' : ''}: chọn ví khác hoặc ＋ Thêm ví mới…` : '';
      applyAll();
      if (!V.rows.length) V.err = d.kind === 'img' || d.ocrPages ? 'Không nhận ra giao dịch nào trong ảnh. Chụp rõ, thẳng, đủ sáng phần danh sách (có ngày và số tiền) rồi thử lại.' : 'Không nhận ra giao dịch nào. File cần có cột ngày và số tiền (hoặc ghi nợ / ghi có).';
    } catch (e) {
      if (lan !== V.lan) return;
      V.err = e.message || String(e);
    }
    V.busy = null;
    draw();
  }
  function askPassword(sai) {
    return new Promise((ok) => {
      let v = null;
      openSheet({
        title: 'PDF có mật khẩu', cls: 'narrow',
        body: `<p>${sai ? '<b class="exp">Mật khẩu chưa đúng.</b> ' : ''}Nhập mật khẩu mở file (thường là ngày sinh hoặc số điện thoại theo hướng dẫn của ngân hàng). Mật khẩu chỉ dùng để mở file trên máy này, không được lưu.</p>
          <form data-pw><input class="inp" type="password" name="pw" autocomplete="off" autofocus><div class="btns" style="margin-top:14px"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Mở file</button></div></form>`,
        onMount: (b, close) => b.querySelector('[data-pw]').addEventListener('submit', (e) => { e.preventDefault(); v = b.querySelector('[name=pw]').value; close(); }),
        onClose: () => ok(v)
      });
    });
  }

  // ---------- Vẽ ----------
  const fileInput = `<input type="file" accept="${ACCEPT}" data-file hidden>`;
  const soChon = () => (V.rows || []).filter((r) => r.on).length;
  const canChon = () => (V.rows || []).filter((r) => r.tt === 'chon').length;
  function tomTat() {
    if (!V.rows) return 'Đọc ngoại tuyến trên thiết bị';
    const dup = V.rows.filter((r) => r.dup).length;
    return `Đọc ngoại tuyến trên thiết bị · ${V.rows.length} khoản` + (canChon() ? ` · ${canChon()} cần chọn danh mục` : '') + (dup ? ` · ${dup} có thể trùng` : '');
  }
  function catText(r, ngan) {
    if (r.loai === L.CHUYEN) return r.vi ? `Chuyển từ ${esc(r.vi)}` : '<span class="exp">Chọn ví trả thẻ</span>';
    if (NO_TYPES.includes(r.loai)) return `${esc(NHAN_LOAI[r.loai])} · ${esc(r.nguoi)}`;
    if (r.tt === 'chon') return 'Chưa phân loại — chọn';
    const ten = esc(r.cat);
    if (ngan) return ten;
    return r.tt === 'auto' ? `${ten} <span class="auto">· tự động</span>` : r.tt === 'goiy' ? `${ten} <span class="auto">· gợi ý</span>` : ten;
  }
  const ttText = (r) => (r.dup ? 'Có thể trùng' : r.loai === L.CHUYEN ? 'Thanh toán thẻ' : r.tt === 'chon' ? 'Cần chọn' : r.tt === 'goiy' ? 'Gợi ý' : r.tt === 'tay' ? 'Đã chọn' : r.tt === 'file' ? 'Từ file' : NO_TYPES.includes(r.loai) ? 'Công nợ' : 'Tự động');
  const amt = (r) => { const s = r.loai === L.CHUYEN ? 1 : (st.DAU[r.loai] || r.sign); return `<span class="num ${s > 0 ? 'inc' : 'exp'}">${s > 0 ? '+' : U.MINUS}${num(r.so_tien)}</span>`; };
  const ck = (r) => `<button type="button" class="sc-ck ${r.on ? 'on' : ''}" role="checkbox" aria-checked="${r.on}" aria-label="Chọn ${esc(r.ghi_chu)}" data-ck="${r.k}">${r.on ? '✓' : ''}</button>`;
  const canPick = (r) => r.loai === L.CHI || r.loai === L.THU;
  const catBtn = (r, cls) => canPick(r) ? `<button type="button" class="${cls}" data-cat="${r.k}"><span>${catText(r, pc)}</span><i aria-hidden="true">▾</i></button>` : `<span class="${cls} ro">${catText(r, pc)}</span>`;
  const walletSel = (cls) => {
    const vis = st.walletNames();
    return `<select class="${cls}" data-vi aria-label="Lưu vào ví">${vis.map((v) => `<option ${v === V.vi ? 'selected' : ''}>${esc(v)}</option>`).join('')}${V.vi && !vis.includes(V.vi) ? `<option selected>${esc(V.vi)}</option>` : ''}<option value="__new__">＋ Thêm ví mới…</option></select>`;
  };
  function progHtml() {
    if (!V.busy) return '';
    const p = Math.round((V.busy.p || 0) * 100);
    return `<div class="sc-prog" data-prog><div class="sc-pt"><span>${esc(V.busy.text)}</span><span>${p}%</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`;
  }
  function drawProg() { const x = el.querySelector('[data-prog]'); if (x) x.outerHTML = progHtml(); }
  const errHtml = () => (V.err ? `<div class="okmsg no sc-err">${esc(V.err)}</div>` : '');
  const hintHtml = () => {
    const h = [];
    if (V.viHint) h.push(esc(V.viHint));
    const a = accOf(V.vi);
    if (V.card && !(a && st.isCard(a))) h.push('File có vẻ là sao kê thẻ tín dụng: nên chọn ví nhóm Thẻ tín dụng.');
    if (a && st.isCard(a) && !a.vi_thanh_toan && V.rows.some((r) => r.sign > 0 && !r.loaiFile)) h.push('Thẻ chưa đặt ví thanh toán nên tiền vào thẻ được ghi là Thu (dư nợ giảm).');
    if (V.rows.some((r) => r.doan && r.on)) h.push('Một số khoản không ghi rõ chi hay thu, đã đoán là chi: chạm vào dòng để sửa.');
    return h.length ? `<div class="sc-hint">${h.join('<br>')}</div>` : '';
  };

  function draw() {
    const nhan = KIND_LABEL[V.file && V.file.kind] || 'FILE';
    const n = soChon();
    if (pc) {
      const ten = V.file ? `: ${esc(V.file.name)}${V.rows ? ` (${V.rows.length} khoản)` : ''}` : '';
      const tbl = V.rows && V.rows.length ? `<div class="sc-tbl" role="table">
          <div class="sc-tr sc-th" role="row"><span>${V.rows.length ? `<button type="button" class="sc-ck ${n === V.rows.length ? 'on' : ''}" role="checkbox" aria-checked="${n === V.rows.length}" aria-label="Chọn tất cả" data-all>${n === V.rows.length ? '✓' : ''}</button>` : ''}</span><span>Ngày</span><span>Ghi chú</span><span class="r">Số tiền</span><span>Danh mục</span><span>Trạng thái</span></div>
          ${V.rows.map((r) => `<div class="sc-tr ${r.tt === 'chon' && r.on ? 'need' : ''} ${r.on ? '' : 'off'}" role="row" data-row="${r.k}">
            <span>${ck(r)}</span><button type="button" class="sc-c" data-ed="${r.k}">${U.dm(r.ngay)}</button>
            <button type="button" class="sc-c b" data-ed="${r.k}" title="${esc(r.ghi_chu)}">${esc(r.ghi_chu)}</button>
            <button type="button" class="sc-c r" data-ed="${r.k}">${amt(r)}</button>
            <span>${catBtn(r, 'sc-cat inp')}</span><span class="sc-st ${r.tt === 'chon' || r.dup ? 'exp' : ''}">${ttText(r)}</span></div>`).join('')}
        </div>` : '';
      el.innerHTML = `<div class="sc pc">
        <label class="sc-drop" data-drop><span class="sc-dt"><b>Kéo thả ảnh, PDF hoặc CSV sao kê vào đây</b><small>JPG, PNG, PDF, CSV, Excel · đọc ngoại tuyến trên thiết bị${ten}</small></span><span class="btn sm">${V.file ? 'Đổi file' : 'Chọn file'}</span>${fileInput}</label>
        ${progHtml()}${errHtml()}${V.rows && V.rows.length ? hintHtml() : ''}${tbl}
        <div class="sc-foot">${V.rows && V.rows.length ? `<span class="lbl">Lưu vào ví</span>${walletSel('inp sc-vi')}` : ''}<span class="sp"></span>
          <button type="button" class="btn" data-cancel>Hủy</button><button type="button" class="btn pri" data-save ${n && !V.busy ? '' : 'disabled'}>Lưu ${n}<br>giao dịch</button></div>
      </div>`;
      return;
    }
    const dau = V.file ? `<div class="sc-file"><span class="sc-ic">${nhan}</span><div class="sc-fn"><b>${esc(V.file.name)}</b><small>${tomTat()}</small></div>
        <label class="btn sm">Đổi file${fileInput}</label></div>`
      : `<label class="sc-drop" data-drop><span class="sc-dt"><b>Chọn ảnh, PDF, CSV hoặc Excel sao kê</b><small>Ảnh chụp màn hình app ngân hàng / ví, PDF hoặc file Excel tải từ ngân hàng · đọc ngoại tuyến trên thiết bị, không gửi file đi đâu</small></span><span class="btn sm">Chọn file</span>${fileInput}</label>`;
    const list = V.rows && V.rows.length ? `<div class="sc-vrow"><span class="lbl">Lưu vào ví</span>${walletSel('sc-sel')}</div>${hintHtml()}
      <div class="sc-list">${V.rows.map((r) => `<div class="sc-r ${r.on ? '' : 'off'}" data-row="${r.k}">${ck(r)}
        <div class="sc-m"><button type="button" class="sc-t" data-ed="${r.k}"><span class="sc-n">${esc(r.ghi_chu)}</span>${amt(r)}</button>
          <div class="sc-d">${U.dm(r.ngay)}${r.dup ? ' <span class="tag">Có thể trùng</span>' : ''}${r.loai === L.CHUYEN ? ' <span class="tag">Thanh toán thẻ</span>' : ''}</div>
          ${catBtn(r, 'sc-cat' + (r.tt === 'chon' ? ' need' : ''))}</div></div>`).join('')}</div>
      <p class="sc-note">Khoản khớp từ khóa được phân loại tự động. Bạn có thể đổi danh mục của bất kỳ khoản nào trước khi lưu.${V.rows.some((r) => r.dup) ? ' Khoản "Có thể trùng" đã có trong Penny nên được bỏ chọn sẵn.' : ''}</p>
      <div class="sc-foot btns"><button type="button" class="btn" data-all>${n === V.rows.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button><button type="button" class="btn pri" data-save ${n && !V.busy ? '' : 'disabled'}>Lưu ${n} giao dịch</button></div>` : '';
    el.innerHTML = `<div class="sc">${dau}${progHtml()}${errHtml()}${list}</div>`;
  }

  // ---------- Sửa một dòng ----------
  function editRow(r) {
    const a = accOf(V.vi);
    const loais = r.loaiFile && !['chi', 'thu'].includes(r.loaiFile) ? [r.loaiFile] : [L.CHI, L.THU].concat(a && st.isCard(a) && a.vi_thanh_toan ? [L.CHUYEN] : []);
    let loai = r.loai;
    openSheet({
      title: 'Sửa khoản', cls: 'narrow',
      body: `<form class="txf" data-er novalidate>
        <div class="seg lg" role="radiogroup">${loais.map((l) => `<button type="button" role="radio" data-l="${l}" class="${l === loai ? 'on' : ''}" aria-checked="${l === loai}">${l === L.CHUYEN ? 'Trả thẻ' : NHAN_LOAI[l]}</button>`).join('')}</div>
        <div class="fld"><label>Số tiền</label><input class="inp" name="amt" value="${num(r.so_tien)} đ" autocomplete="off"></div>
        <div class="fld"><label>Ghi chú</label><input class="inp" name="note" value="${esc(r.ghi_chu)}" autocomplete="off"></div>
        <div class="fld"><label>Ngày</label><input class="inp" type="date" name="ngay" value="${r.ngay}"></div>
        <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Xong</button></div></form>`,
      onMount: (b, close) => {
        b.addEventListener('click', (e) => {
          const x = e.target.closest('[data-l]');
          if (!x) return;
          loai = x.dataset.l;
          b.querySelectorAll('[data-l]').forEach((y) => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); });
        });
        b.querySelector('[data-er]').addEventListener('submit', (e) => {
          e.preventDefault();
          const so = U.parseMoney(b.querySelector('[name=amt]').value);
          const ngay = b.querySelector('[name=ngay]').value;
          if (!so || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) { toast(!so ? 'Số tiền chưa đúng' : 'Ngày chưa đúng'); return; }
          const note = U.nfc(b.querySelector('[name=note]').value);
          if (note !== r.ghi_chu && r.tt !== 'tay') r.tt = '';
          if (loai !== r.loai) { r.userLoai = loai; if (r.tt === 'tay') r.tt = ''; }
          r.so_tien = so; r.ngay = ngay; r.ghi_chu = note; r.doan = false;
          r.sign = loai === L.CHI ? -1 : 1;
          applyAll(); draw(); close();
        });
      }
    });
  }

  async function save() {
    const chon = V.rows.filter((r) => r.on);
    if (!chon.length) return;
    const loi = chon.find((r) => r.loai === L.CHUYEN && (!r.vi || r.vi === r.vi_den));
    if (loi) { toast('Khoản trả thẻ cần ví thanh toán khác thẻ'); return; }
    const list = chon.map((r) => ({
      ngay: r.ngay, loai: r.loai, so_tien: r.so_tien, ghi_chu: r.ghi_chu,
      danh_muc: r.loai === L.CHI || r.loai === L.THU ? r.cat || st.fallbackCat(r.loai) : r.loai === L.CHUYEN ? '' : r.cat || '',
      vi: r.vi, vi_den: r.loai === L.CHUYEN ? r.vi_den : '', nguoi: NO_TYPES.includes(r.loai) ? r.nguoi : '', nguon: NGUON_SK
    }));
    await st.importTx(list);
    for (const [note, dm] of nho) {
      if (!chon.some((r) => r.ghi_chu === note && r.cat === dm)) continue;
      if (!S.kw.some((k) => U.boDau(k.tu_khoa) === U.boDau(note))) await st.saveKw({ tu_khoa: note, danh_muc: dm });
    }
    toast(`Đã thêm ${list.length} giao dịch. Đang đẩy lên Google Sheet…`);
    onDone(list);
  }

  // ---------- Sự kiện ----------
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-file]')) { const f = e.target.files && e.target.files[0]; e.target.value = ''; load(f); return; }
    if (e.target.matches('[data-vi]')) {
      if (e.target.value === '__new__') { e.target.value = V.vi; openWallet('', (moi) => { V.vi = moi; V.viHint = ''; applyAll(); draw(); }); return; }
      V.vi = e.target.value; V.viHint = ''; applyAll(); draw();
    }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    const row = (k) => V.rows.find((r) => r.k === +k);
    if (b.dataset.ck != null) { const r = row(b.dataset.ck); r.on = !r.on; r.touched = true; draw(); return; }
    if (b.hasAttribute('data-all')) { const all = soChon() !== V.rows.length; V.rows.forEach((r) => { r.on = all; r.touched = true; }); draw(); return; }
    if (b.dataset.ed != null) { editRow(row(b.dataset.ed)); return; }
    if (b.dataset.cat != null) {
      const r = row(b.dataset.cat);
      const kq = await pickCategory({ loai: r.loai, note: r.ghi_chu, value: r.tt === 'chon' ? '' : r.cat });
      if (!kq) return;
      r.cat = kq.v; r.tt = 'tay'; r.on = true; r.touched = true;
      if (kq.nho) {
        nho.set(r.ghi_chu, kq.v);
        V.rows.forEach((x) => { if (x !== r && x.loai === r.loai && (x.tt === 'chon' || x.tt === 'goiy') && U.boDau(x.ghi_chu) === U.boDau(r.ghi_chu)) { x.cat = kq.v; x.tt = 'tay'; } });
      }
      draw(); return;
    }
    if (b.hasAttribute('data-cancel')) { onDone(null); return; }
    if (b.hasAttribute('data-save')) { b.disabled = true; await save(); }
  });
  // Kéo thả file (PC)
  el.addEventListener('dragover', (e) => { e.preventDefault(); const d = el.querySelector('[data-drop]'); if (d) d.classList.add('over'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) { const d = el.querySelector('[data-drop]'); if (d) d.classList.remove('over'); } });
  el.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) load(f); });

  draw();
  return { load, dispose: () => { V.lan++; endOcr(); } };
}
