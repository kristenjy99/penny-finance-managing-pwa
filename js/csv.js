// Penny v0.5.0 – xuất giao dịch ra CSV / Excel (.xlsx), nhập lại CSV (sao lưu / khôi phục)
import * as U from './util.js';
import { esc, num } from './util.js';
import * as st from './store.js';
import { S, L, NO_TYPES } from './store.js';
import { openSheet, toast, confirmBox } from './ui.js';
import { makeXlsx } from './xlsx.js';

export const COT = ['Ngày', 'Loại', 'Số tiền', 'Ghi chú', 'Danh mục', 'Ví', 'Ví nhận', 'Người', 'Nguồn'];
const KIEU = ['date', 'text', 'money', 'text', 'text', 'text', 'text', 'text', 'text'];
const RONG = [12, 10, 14, 32, 20, 18, 18, 16, 8];
export const NHAN_LOAI = { 'chi': 'Chi', 'thu': 'Thu', 'chuyển': 'Chuyển', 'cho vay': 'Cho vay', 'đi vay': 'Đi vay', 'thu nợ': 'Thu nợ', 'trả nợ': 'Trả nợ' };
const LOAI_TU = { 'chi': L.CHI, 'thu': L.THU, 'chuyen': L.CHUYEN, 'chuyen khoan': L.CHUYEN, 'cho vay': L.CHO_VAY, 'di vay': L.DI_VAY, 'thu no': L.THU_NO, 'tra no': L.TRA_NO };

// Danh sách giao dịch cần xuất, cũ trước mới sau
export function exportList(scope) {
  const list = scope === 'all' ? st.live() : st.inMonth(S.month);
  return list.map((t, i) => [t, i]).sort((a, b) => (a[0].ngay < b[0].ngay ? -1 : a[0].ngay > b[0].ngay ? 1 : a[1] - b[1])).map((x) => x[0]);
}
const hang = (t) => [t.ngay, NHAN_LOAI[t.loai] || t.loai, t.so_tien, t.ghi_chu, t.danh_muc, t.vi, t.vi_den, t.nguoi, t.nguon];

// Ô CSV: bọc ngoặc kép khi cần; chặn công thức Excel (=, +, -, @ ở đầu) bằng dấu '
function oCsv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",;\r\n\t]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** CSV UTF-8 có BOM, ngày dd/mm/yyyy, số tiền là số nguyên không dấu ngăn cách */
export function toCsv(list) {
  const lines = [COT.join(',')].concat(list.map((t) => { const h = hang(t); h[0] = t.ngay ? U.dmy(t.ngay) : ''; return h.map(oCsv).join(','); }));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
export function toXlsx(list) {
  return makeXlsx({ sheet: 'Giao dịch', header: COT, types: KIEU, widths: RONG, rows: list.map(hang) });
}

// ---------- Đọc CSV ----------
/** Tách CSV (RFC 4180, có ngoặc kép), tự nhận dấu phân cách , ; hoặc tab */
export function splitCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  let lines0 = text.split(/\r?\n/);
  if (/^sep=.$/i.test(lines0[0])) text = lines0.slice(1).join('\n');
  const dong1 = text.split(/\r?\n/)[0] || '';
  const dem = (c) => dong1.split(c).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => dem(b) - dem(a))[0];
  const rows = [];
  let row = [], cell = '', q = false, line = 1, startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\r') { /* bỏ */ }
    else if (ch === '\n') { row.push(cell); rows.push({ line: startLine, cells: row }); row = []; cell = ''; line++; startLine = line; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push({ line: startLine, cells: row }); }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

const khoaTx = (t) => [t.ngay, t.loai, t.so_tien, U.boDau(t.ghi_chu), U.boDau(t.vi), t.loai === L.CHUYEN ? U.boDau(t.vi_den) : '', NO_TYPES.includes(t.loai) ? U.boDau(t.nguoi) : ''].join('|');
const boNhay = (s) => String(s || '').trim().replace(/^'(?=[=+\-@])/, '');

/**
 * Đọc nội dung CSV -> { moi: [tx...], trung, loi: [{line, msg}], tong, viMoi: [] }
 * Trùng = cùng ngày, loại, số tiền, ghi chú, ví (+ ví nhận, người) với giao dịch đang có (đếm theo số lần xuất hiện).
 */
export function readCsv(text) {
  const rows = splitCsv(text);
  if (!rows.length) return { err: 'File trống.' };
  const head = rows[0].cells.map((h) => U.boDau(h).replace(/\s+/g, ' '));
  const idx = {};
  const ten = { ngay: 'ngay', loai: 'loai', so_tien: 'so tien', ghi_chu: 'ghi chu', danh_muc: 'danh muc', vi: 'vi', vi_den: 'vi nhan', nguoi: 'nguoi', nguon: 'nguon' };
  Object.entries(ten).forEach(([k, h]) => { idx[k] = head.indexOf(h); });
  if (idx.ngay < 0 || idx.loai < 0 || idx.so_tien < 0) return { err: 'Không thấy các cột Ngày, Loại, Số tiền ở dòng đầu. Chỉ nhập được file CSV xuất từ Penny.' };
  const co = new Map();
  st.live().forEach((t) => { const k = khoaTx(t); co.set(k, (co.get(k) || 0) + 1); });
  const out = { moi: [], trung: 0, loi: [], tong: rows.length - 1, viMoi: [] };
  const vis = st.walletNames().map(U.boDau);
  const namNay = new Date().getFullYear();
  rows.slice(1).forEach(({ line, cells }) => {
    const g = (k) => (idx[k] >= 0 ? boNhay(cells[idx[k]]) : '');
    const ngay = U.parseDate(g('ngay'), namNay);
    const loai = LOAI_TU[U.boDau(g('loai'))];
    const so = U.parseMoney(g('so_tien'));
    const t = { ngay, loai, so_tien: so, ghi_chu: g('ghi_chu'), danh_muc: g('danh_muc'), vi: g('vi'), vi_den: g('vi_den'), nguoi: g('nguoi'), nguon: U.boDau(g('nguon')) === 'bot' ? 'bot' : 'web' };
    let msg = '';
    if (!ngay) msg = `Ngày "${g('ngay')}" chưa đúng (cần dd/mm/yyyy)`;
    else if (!loai) msg = `Loại "${g('loai')}" không hợp lệ`;
    else if (!so) msg = `Số tiền "${g('so_tien')}" chưa đúng`;
    else if (loai === L.CHUYEN && (!t.vi || !t.vi_den || U.boDau(t.vi) === U.boDau(t.vi_den))) msg = 'Chuyển khoản cần Ví và Ví nhận khác nhau';
    else if (NO_TYPES.includes(loai) && !t.nguoi) msg = 'Giao dịch công nợ cần cột Người';
    if (msg) { out.loi.push({ line, msg }); return; }
    if (!t.vi) t.vi = st.defaultAccount();
    if ((loai === L.CHI || loai === L.THU) && !t.danh_muc) t.danh_muc = st.classify(t.ghi_chu, loai) || st.fallbackCat(loai);
    if (loai !== L.CHI && loai !== L.THU && !t.danh_muc) t.danh_muc = '';
    const k = khoaTx({ ...t, so_tien: so });
    if (co.get(k)) { co.set(k, co.get(k) - 1); out.trung++; return; }
    [t.vi, t.vi_den].forEach((v) => { if (v && !vis.includes(U.boDau(v)) && !out.viMoi.some((x) => U.boDau(x) === U.boDau(v))) out.viMoi.push(v); });
    out.moi.push(t);
  });
  return out;
}

// ---------- Tải file ----------
function taiVe(blob, ten) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = ten; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const tenFile = (scope, ext) => `penny-giao-dich-${scope === 'all' ? 'toan-bo-' + U.today() : S.month}.${ext}`;

// ---------- Hộp thoại Nhập / Xuất ----------
export function openCsv() {
  let scope = 'month', ketQua = null;
  openSheet({
    title: 'Nhập / Xuất CSV', cls: 'mid',
    onMount: (b) => {
      const draw = () => {
        const nT = st.inMonth(S.month).length, nA = st.live().length;
        let xem = '';
        if (ketQua && ketQua.err) xem = `<div class="okmsg no">${esc(ketQua.err)}</div>`;
        else if (ketQua) {
          const r = ketQua;
          xem = `<div class="imp"><div class="okmsg ${r.moi.length ? 'ok' : ''}">Đọc ${r.tong} dòng: ${r.moi.length} giao dịch mới · ${r.trung} trùng (bỏ qua) · ${r.loi.length} dòng lỗi</div>
            ${r.loi.length ? `<div class="imp-err">${r.loi.slice(0, 20).map((e) => `<div>Dòng ${e.line}: ${esc(e.msg)}</div>`).join('')}${r.loi.length > 20 ? `<div>… và ${r.loi.length - 20} dòng lỗi khác</div>` : ''}</div>` : ''}
            ${r.viMoi.length ? `<div class="hint">Ví chưa có trong danh sách: ${r.viMoi.map(esc).join(', ')} (sẽ hiện ở nhóm "Khác" trong màn Ví).</div>` : ''}
            ${r.moi.length ? `<div class="imp-list">${r.moi.slice(0, 6).map((t) => `<div><span>${U.dmy(t.ngay)} · ${esc(NHAN_LOAI[t.loai])} · ${esc(t.ghi_chu || t.danh_muc || t.nguoi || '')}</span><span class="num">${num(t.so_tien)}</span></div>`).join('')}${r.moi.length > 6 ? `<div><span>… và ${r.moi.length - 6} giao dịch khác</span></div>` : ''}</div>
              <button class="btn pri wide" data-imp>Nhập ${r.moi.length} giao dịch</button>` : ''}</div>`;
        }
        b.innerHTML = `<div class="lbl" style="margin-top:6px">Xuất giao dịch</div>
          <div class="seg lg" role="radiogroup" style="margin-bottom:12px">${[['month', `Tháng ${U.monthLabel(S.month)} (${nT})`], ['all', `Toàn bộ (${nA})`]].map(([k, t]) => `<button type="button" role="radio" data-scope="${k}" class="${scope === k ? 'on' : ''}" aria-checked="${scope === k}">${t}</button>`).join('')}</div>
          <div class="btns"><button class="btn" data-exp="csv">Tải CSV</button><button class="btn" data-exp="xlsx">Tải Excel (.xlsx)</button></div>
          <div class="hint" style="margin:8px 0 18px">Cột: ${COT.join(', ')}. CSV mã UTF-8 có BOM, ngày dd/mm/yyyy. Mở bằng Excel nên dùng file .xlsx. Giao dịch đã xóa không được xuất.</div>
          <div class="lbl">Nhập từ CSV</div>
          <div class="hint" style="margin:0 0 10px">Chỉ nhận file đúng định dạng xuất ở trên (dùng để sao lưu / khôi phục). Giao dịch trùng ngày, loại, số tiền, ghi chú, ví với giao dịch đang có sẽ được bỏ qua.</div>
          <label class="btn wide filebtn">Chọn file CSV<input type="file" accept=".csv,text/csv,text/plain" data-file></label>
          ${xem}`;
      };
      draw();
      b.addEventListener('click', async (e) => {
        const s = e.target.closest('[data-scope]');
        if (s) { scope = s.dataset.scope; draw(); return; }
        const x = e.target.closest('[data-exp]');
        if (x) {
          const list = exportList(scope);
          if (!list.length) { toast('Không có giao dịch để xuất'); return; }
          if (x.dataset.exp === 'csv') taiVe(new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' }), tenFile(scope, 'csv'));
          else taiVe(toXlsx(list), tenFile(scope, 'xlsx'));
          toast(`Đã xuất ${list.length} giao dịch`);
          return;
        }
        if (e.target.closest('[data-imp]') && ketQua && ketQua.moi.length) {
          const n = ketQua.moi.length;
          if (n > 50 && !(await confirmBox(`Nhập ${n} giao dịch vào Penny và đẩy lên Google Sheet?`, 'Nhập'))) return;
          await st.importTx(ketQua.moi);
          toast(`Đã thêm ${n} giao dịch. Đang đẩy lên Google Sheet…`);
          ketQua = null; draw();
        }
      });
      b.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-file]')) return;
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.size > 20 * 1024 * 1024) { ketQua = { err: 'File quá lớn (trên 20 MB).' }; draw(); return; }
        try { ketQua = readCsv(await f.text()); } catch (er) { ketQua = { err: 'Không đọc được file: ' + er.message }; }
        draw();
      });
    }
  });
}
