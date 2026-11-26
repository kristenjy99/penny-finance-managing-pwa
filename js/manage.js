// Penny v0.5.0 – hộp thoại quản lý: ví, ngân sách, người, danh mục, từ khóa, các mục Cài đặt
import { isMoi, MOI } from './skin.js';
import * as U from './util.js';
import { esc, num } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { openSheet, confirmBox, toast, pickOne, ask } from './ui.js';
import { SV, budStatus, cardStatus, perSet, perShift, walletIcon, MAU_SAN, snoozeCard, setChartKieu } from './screens.js';
import { zipStore } from './xlsx.js';
import * as TKU from './tkui.js';
import { comboHtml, comboMount } from './combo.js';
import { openCsv } from './csv.js';

const same = (a, b) => U.boDau(a) === U.boDau(b);
const tagLoi = (b, msg) => { const m = b.querySelector('[data-msg]'); if (m) { m.className = 'okmsg no'; m.textContent = msg; } };

// ================= VÍ =================
export function openWallet(key = '', onSaved = null) {
  const w = key ? st.wallets(S.month).find((x) => x.ten_vi === key) : null;
  const laMacDinh = !!w && st.defaultAccount() === w.ten_vi;
  const nhoms = st.NHOM_VI.slice();
  if (w && w.nhom && !nhoms.includes(w.nhom) && w.nhom !== 'Khác') nhoms.push(w.nhom);
  let nhom = w && w.nhom !== 'Khác' ? w.nhom : st.NHOM_VI[0];
  const the = () => nhom === st.NHOM_THE;
  const tk = () => nhom === st.NHOM_TK;
  const info = w && st.isCard(w) ? st.cardInfo(w) : null;
  const tt = info ? cardStatus(info) : '';
  const viKhac = st.walletNames().filter((x) => x !== (w && w.ten_vi) && !st.isCard(st.S.acc.find((a) => a.ten_vi === x) || {}));
  const so = (v) => (v ? num(v) : '');
  let icon = w ? String(w.ky_hieu || '') : '';
  const ICONS = ['💵', '👛', '📱', '🏦', '💳', '💰', '🐷', '🪙', '🏧', '💼', '🏠', '🎓'];
  const tat = (ten) => U.boDau(ten).split(/[^0-9a-z]+/).filter(Boolean).map((x) => x[0]).join('');
  openSheet({
    title: w ? (st.isCard(w) ? 'Thẻ tín dụng' : st.isSaving(w) ? 'Sổ tiết kiệm' : 'Sửa ví') : 'Thêm ví', cls: 'mid',
    body: `<form novalidate>
      ${info ? `<div class="cardbox"><div class="cb1"><span>Dư nợ</span><b class="num exp">${num(info.no)}</b></div>
        ${info.lim ? `<div class="cb1"><span>Hạn mức còn lại</span><b class="num ${info.con < 0 ? 'exp' : ''}">${info.con < 0 ? U.MINUS : ''}${num(info.con)}</b></div>
        <div class="bar ${st.level(info.ratio)}" role="progressbar" aria-valuenow="${Math.round(info.ratio * 100)}" aria-label="Đã dùng hạn mức"><i style="width:${Math.min(100, Math.round(info.ratio * 100))}%"></i></div>
        <div class="cb2">Đã dùng ${Math.round(info.ratio * 100)}% hạn mức ${num(info.lim)}</div>` : ''}
        ${info.ngaySk ? `<div class="cb2">Kỳ sao kê ${U.dm(info.ngaySk)}: dư nợ ${num(info.noSk)}, đã trả ${num(info.daTra)} · chi kỳ này ${num(info.chiKy)} · sao kê tới ${U.dm(info.skSau)}</div>` : ''}
        ${tt ? `<div class="cb2 b ${tt.c}">${tt.t}</div>` : ''}
        ${info.no ? `<button type="button" class="btn pri wide" data-pay style="margin-top:10px">Thanh toán thẻ</button>` : ''}</div>` : ''}
      <div class="fld"><label for="w-ten">Tên ví</label><input class="inp" id="w-ten" name="ten" value="${esc(w ? w.ten_vi : '')}" autocomplete="off" ${w ? '' : 'autofocus'}></div>
      <div class="fld"><span class="lbl">Biểu tượng</span><div class="iconrow"><span class="av lg" data-iconprev aria-hidden="true">${walletIcon({ ten_vi: w ? w.ten_vi : '?', ky_hieu: icon })}</span>
        <div class="chips">${ICONS.map((x) => `<button type="button" class="chip ic" data-ic="${x}" aria-label="Biểu tượng ${x}">${x}</button>`).join('')}</div></div>
        <div class="grid2" style="margin-top:8px"><input class="inp" name="ictext" maxlength="4" placeholder="Gõ emoji / chữ" value="${esc(/^data:/.test(icon) ? '' : icon)}" autocomplete="off" aria-label="Biểu tượng tự gõ">
          <label class="btn filebtn">Tải ảnh logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-icfile></label></div>
        <div class="hint">Để trống thì dùng chữ cái đầu. Ảnh logo (ví dụ logo ngân hàng) được thu nhỏ còn 64×64.</div></div>
      <div class="fld"><span class="lbl">Nhóm</span><div class="seg" role="radiogroup">${nhoms.map((n) => `<button type="button" role="radio" data-nhom="${esc(n)}" class="${n === nhom ? 'on' : ''}" aria-checked="${n === nhom}">${esc(n)}</button>`).join('')}</div></div>
      <div class="fld" data-sdwrap ${!w && tk() ? 'hidden' : ''}><label for="w-sd">Số dư đầu</label><input class="inp" id="w-sd" name="sd" inputmode="text" value="${w ? (w.so_du_dau < 0 ? U.MINUS : '') + num(w.so_du_dau) : '0'}" autocomplete="off">
        <div class="hint" data-sdhint>${the() ? 'Dư nợ thẻ trước giao dịch đầu tiên, nhập số âm. Ví dụ đang nợ 1.200.000 thì nhập −1.200.000.' : 'Số tiền có sẵn trong ví trước giao dịch đầu tiên.'}</div></div>
      <div data-the ${the() ? '' : 'hidden'}>
        <div class="fld"><label for="w-hm">Hạn mức tín dụng</label><input class="inp" id="w-hm" name="hm" value="${esc(so(w && w.han_muc))}" placeholder="30.000.000" autocomplete="off"></div>
        <div class="grid2"><div class="fld"><label for="w-sk">Ngày sao kê</label><input class="inp" id="w-sk" name="sk" inputmode="numeric" value="${esc((w && w.ngay_sao_ke) || '')}" placeholder="20" autocomplete="off"></div>
          <div class="fld"><label for="w-dh">Ngày đến hạn trả</label><input class="inp" id="w-dh" name="dh" inputmode="numeric" value="${esc((w && w.ngay_den_han) || '')}" placeholder="5" autocomplete="off"></div></div>
        <div class="hint" style="margin:-4px 0 10px">Ngày trong tháng (1–31), xem trên sao kê của ngân hàng. Ngày đến hạn nhỏ hơn ngày sao kê nghĩa là tháng sau. Thường cách nhau 15–25 ngày.</div>
        <div class="grid2"><div class="fld"><label for="w-tt">% thanh toán tối thiểu</label><input class="inp" id="w-tt" name="tt" inputmode="decimal" value="${esc((w && w.tt_toi_thieu) || 5)}" autocomplete="off"></div>
          <div class="fld"><label for="w-vt">Ví thanh toán</label><select class="inp" id="w-vt" name="vt"><option value="">(chọn khi trả)</option>${viKhac.map((x) => `<option ${w && w.vi_thanh_toan === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
      </div>
      ${TKU.tkFields(w ? (st.isSaving(w) ? w : { ten_vi: w.ten_vi }) : null)}
      <div class="fld"><label for="w-tat">Tên tắt cho bot Telegram</label><input class="inp" id="w-tat" name="tat" value="${esc(w ? w.viet_tat || '' : '')}" placeholder="ví dụ: vcb, vcbm" autocomplete="off">
        <div class="hint" data-tathint>Bot tự hiểu tên đầy đủ (có / không dấu), vài chữ đầu và chữ cái đầu mỗi từ${w ? ` (“${esc(tat(w.ten_vi))}”)` : ''}. Thêm tên tắt riêng, cách nhau bằng dấu phẩy. Cú pháp: 20k/cafe/Cà phê/<tên tắt></div></div>
      <label class="set flat"><span>Ví mặc định khi thêm giao dịch</span><span class="switch"><input type="checkbox" name="md" ${laMacDinh ? 'checked' : ''} aria-label="Ví mặc định"><i></i></span></label>
      ${w ? `<div class="hint" style="margin:8px 0 0">${info ? '' : `Số dư tới hết tháng ${U.monthLabel(S.month)}: <b class="num">${w.bal < 0 ? U.MINUS : ''}${num(w.bal)} đ</b>. `}Đổi tên ví sẽ đổi luôn tên ví trong các giao dịch.</div>` : ''}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${w && !w.ngoai ? '<button type="button" class="btn danger del" data-del>Xóa ví</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      const tkDoc = TKU.tkMount(b, w ? (st.isSaving(w) ? w : { ten_vi: w.ten_vi }) : null);
      const tkHien = () => { b.querySelector('[data-tk]').hidden = !tk(); const sw = b.querySelector('[data-sdwrap]'); if (sw) sw.hidden = !w && tk(); };
      tkHien();
      const prev = () => { b.querySelector('[data-iconprev]').innerHTML = walletIcon({ ten_vi: b.querySelector('[name=ten]').value || '?', ky_hieu: icon }); };
      b.querySelector('[name=ictext]').addEventListener('input', (e) => { icon = e.target.value.trim(); prev(); });
      b.querySelector('[name=ten]').addEventListener('input', prev);
      b.querySelector('[data-icfile]').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try { icon = await imageToPng(f, 64); b.querySelector('[name=ictext]').value = ''; prev(); } catch (er) { tagLoi(b, er.message); }
      });
      b.addEventListener('click', async (e) => {
        const ic = e.target.closest('[data-ic]');
        if (ic) { icon = ic.dataset.ic; b.querySelector('[name=ictext]').value = icon; prev(); return; }
        const n = e.target.closest('[data-nhom]');
        if (n) {
          nhom = n.dataset.nhom;
          b.querySelectorAll('[data-nhom]').forEach((x) => { x.classList.toggle('on', x === n); x.setAttribute('aria-checked', x === n); });
          b.querySelector('[data-the]').hidden = !the();
          tkHien();
          b.querySelector('[data-sdhint]').textContent = the() ? 'Dư nợ thẻ trước giao dịch đầu tiên, nhập số âm. Ví dụ đang nợ 1.200.000 thì nhập −1.200.000.' : 'Số tiền có sẵn trong ví trước giao dịch đầu tiên.';
          return;
        }
        if (e.target.closest('[data-pay]')) { close(); payCard(w.ten_vi); return; }
        if (e.target.closest('[data-del]')) {
          const dung = st.live().filter((t) => t.vi === w.ten_vi || t.vi_den === w.ten_vi).length;
          if (dung) { tagLoi(b, `Không xóa được: ví đang có ${dung} giao dịch. Hãy đổi tên ví, hoặc chuyển các giao dịch đó sang ví khác trước.`); return; }
          if (!(await confirmBox(`Xóa ví "${w.ten_vi}"?`, 'Xóa', true))) return;
          await st.deleteAcc(w.ten_vi);
          if (st.setting('default_account') === w.ten_vi) { const khac = S.acc[0]; if (khac) await st.setSetting('default_account', khac.ten_vi); }
          toast('Đã xóa ví'); close();
        }
      });
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const g = (k) => b.querySelector(`[name=${k}]`).value;
        const ten = U.nfc(g('ten'));
        const sd = !w && tk() ? 0 : U.parseSignedMoney(g('sd'));
        if (!ten) { tagLoi(b, 'Nhập tên ví.'); return; }
        if (ten === '__new__' || st.walletNames().some((x) => x !== (w && w.ten_vi) && x.toLowerCase() === ten.toLowerCase())) { tagLoi(b, `Đã có ví "${ten}".`); return; }
        if (sd == null) { tagLoi(b, 'Số dư đầu chưa đúng. Ví dụ: 0, 1.500.000, −1.200.000'); return; }
        const row = { ten_vi: ten, nhom, so_du_dau: sd, ky_hieu: icon, viet_tat: U.nfc(g('tat')).replace(/\s*[,;]\s*/g, ', ') };
        if (the()) {
          const hm = g('hm').trim() ? U.parseMoney(g('hm')) : 0;
          if (g('hm').trim() && !hm) { tagLoi(b, 'Hạn mức chưa đúng. Ví dụ: 30tr, 30.000.000'); return; }
          const ngay = (k) => { const v = g(k).trim(); if (!v) return 0; const x = Number(v); return Number.isInteger(x) && x >= 1 && x <= 31 ? x : null; };
          const sk = ngay('sk'), dh = ngay('dh');
          if (sk == null || dh == null) { tagLoi(b, 'Ngày sao kê / đến hạn là số từ 1 đến 31.'); return; }
          if (dh && !sk) { tagLoi(b, 'Nhập ngày sao kê trước khi nhập ngày đến hạn.'); return; }
          const tt = Number(String(g('tt')).replace(',', '.').replace('%', '')) || 0;
          if (tt < 0 || tt > 100) { tagLoi(b, '% thanh toán tối thiểu từ 0 đến 100.'); return; }
          Object.assign(row, { han_muc: hm, ngay_sao_ke: sk, ngay_den_han: dh, tt_toi_thieu: tt, vi_thanh_toan: g('vt') });
        }
        let tkv = null;
        if (tk()) {
          tkv = tkDoc();
          if (!tkv) return;
          if (!tkv._nguon && !w) row.so_du_dau = tkv._goc; // tiền có sẵn → số dư đầu
          Object.assign(row, tkv);
        }
        await st.saveAcc(row, w && !w.ngoai ? w.ten_vi : (w ? w.ten_vi : undefined));
        if (tkv && !w) await TKU.tkAfterCreate(ten, tkv);
        const md = b.querySelector('[name=md]').checked;
        if (md && st.setting('default_account') !== ten) await st.setSetting('default_account', ten);
        toast(w ? 'Đã lưu ví' : 'Đã thêm ví ' + ten);
        close();
        if (onSaved) onSaved(ten);
      };
    }
  });
}

// ================= ẢNH: thu nhỏ icon, tạo bộ icon cài đặt =================
// Đọc file ảnh (PNG/JPG/SVG/WebP) thành phần tử <img>
function loadImage(file) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type) && !/\.svg$/i.test(file.name)) { rej(new Error('Chỉ nhận file ảnh PNG, JPG, SVG hoặc WebP.')); return; }
    if (file.size > 5 * 1024 * 1024) { rej(new Error('Ảnh lớn quá 5 MB.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Không đọc được ảnh này.'));
    img.src = url;
  });
}
// Vẽ ảnh vào ô vuông size×size; pad = lề (0..0.5), nen = màu nền ('' = trong suốt)
function drawSquare(img, size, pad = 0, nen = '') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  if (nen) { x.fillStyle = nen; x.fillRect(0, 0, size, size); }
  const iw = img.naturalWidth || img.width || size, ih = img.naturalHeight || img.height || size;
  const vung = size * (1 - 2 * pad);
  const k = Math.min(vung / iw, vung / ih);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
  return cv;
}
// Ảnh -> PNG data URL (ô vuông), tự giảm cỡ cho vừa 1 ô Google Sheet
export async function imageToPng(file, size) {
  const img = await loadImage(file);
  for (let s0 = size; s0 >= 32; s0 = Math.round(s0 * 0.75)) {
    const u = drawSquare(img, s0).toDataURL('image/png');
    if (u.length <= 40000) return u;
  }
  throw new Error('Ảnh quá chi tiết, hãy chọn ảnh đơn giản hơn.');
}
const toBytes = (cv) => new Promise((res) => cv.toBlob((bl) => bl.arrayBuffer().then((b) => res(new Uint8Array(b))), 'image/png'));
const enc = (t) => new TextEncoder().encode(t);
// Bộ icon + manifest + index.html để upload lên GitHub (đổi icon và tên khi cài app lên máy)
async function iconPack(img, ten) {
  const c = st.themeColors();
  const nen = c.acc || '#C5B3D3';
  const files = [];
  const add = async (path, cv) => files.push({ name: 'piggy-money/' + path, data: await toBytes(cv) });
  await add('icons/icon-192.png', drawSquare(img, 192));
  await add('icons/icon-512.png', drawSquare(img, 512));
  await add('icons/icon-maskable-512.png', drawSquare(img, 512, 0.14, nen));
  await add('icons/apple-touch-icon.png', drawSquare(img, 180, 0.08, nen));
  const png512 = drawSquare(img, 512).toDataURL('image/png');
  files.push({ name: 'piggy-money/icons/icon.svg', data: enc(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><image width="512" height="512" href="${png512}" xlink:href="${png512}"/></svg>`) });
  let man = {};
  try { man = await (await fetch('manifest.webmanifest')).json(); } catch (e) { man = { start_url: './', scope: './', id: './', display: 'standalone', lang: 'vi', icons: [] }; }
  man.name = ten; man.short_name = ten.length > 12 ? ten.slice(0, 12) : ten;
  man.theme_color = nen; man.background_color = c.bg || '#FBEFEF';
  files.push({ name: 'piggy-money/manifest.webmanifest', data: enc(JSON.stringify(man, null, 2) + '\n') });
  try {
    let html = await (await fetch('index.html')).text();
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(ten)}</title>`)
      .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${esc(ten)}$2`)
      .replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${nen}$2`);
    files.push({ name: 'piggy-money/index.html', data: enc(html) });
  } catch (e) { /* bỏ qua */ }
  files.push({ name: 'HUONG-DAN.txt', data: enc(`Bộ icon + tên app "${ten}" cho Penny\r\n\r\n1) Giải nén file này.\r\n2) Mở repo piggy-money trên github.com → Add file → Upload files.\r\n3) Mở thư mục piggy-money vừa giải nén, kéo cả thư mục icons, file manifest.webmanifest và file index.html vào → Commit changes.\r\n4) Đợi 1–2 phút. Điện thoại / máy tính: gỡ app Penny đã cài rồi cài lại (icon và tên trên màn hình chính chỉ đổi khi cài lại).\r\n   iPhone: khi bấm "Thêm vào MH chính" có thể sửa tên ở bước cuối.\r\n`) });
  return new Blob([zipStore(files)], { type: 'application/zip' });
}
function taiVe(blob, ten) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = ten; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Icon app: chọn ảnh PNG/SVG → dùng trong app (đồng bộ qua Google Sheet) + tải bộ icon cài đặt cho GitHub
function openAppIcon() {
  let img = null, u = '';
  openSheet({
    title: 'Icon app', cls: 'mid',
    body: `<div class="iconapp"><span class="piggy xl" data-prev aria-hidden="true">${st.setting('app_icon') ? `<img src="${esc(st.setting('app_icon'))}" alt="">` : ''}</span>
        <div class="hint" style="margin:0">Ảnh vuông, nền rõ, càng đơn giản càng đẹp. Nhận PNG, SVG, JPG, WebP (dưới 5 MB).</div></div>
      <label class="btn wide filebtn" style="margin-top:12px">Chọn ảnh<input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp,.svg" data-file></label>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button class="btn" data-goc>Dùng heo mặc định</button><button class="btn pri" data-save disabled>Dùng icon này</button></div>
      <div class="lbl" style="margin-top:18px">Icon và tên khi cài app lên máy</div>
      <div class="hint" style="margin:0 0 10px">Icon trên màn hình chính lấy từ các file trong repo GitHub, nên cần tải bộ icon này, upload lên GitHub rồi cài lại app. Bên trong có hướng dẫn 3 bước.</div>
      <button class="btn wide" data-pack disabled>Tải bộ icon cài đặt (.zip)</button>`,
    onMount: (b, close) => {
      const msg = (t, okk) => { const m = b.querySelector('[data-msg]'); m.className = 'okmsg ' + (okk ? 'ok' : 'no'); m.textContent = t; };
      b.querySelector('[data-file]').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          img = await loadImage(f);
          u = await imageToPng(f, 128);
          b.querySelector('[data-prev]').innerHTML = `<img src="${u}" alt="">`;
          b.querySelector('[data-save]').disabled = false; b.querySelector('[data-pack]').disabled = false;
          msg('Đã đọc ảnh. Bấm "Dùng icon này" để áp dụng.', true);
        } catch (er) { msg(er.message); }
      });
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-save]') && u) { await st.setSetting('app_icon', u); toast('Đã đổi icon app'); close(); }
        if (e.target.closest('[data-goc]')) { await st.setSetting('app_icon', ''); toast('Đã dùng lại icon heo'); close(); }
        if (e.target.closest('[data-pack]') && img) {
          taiVe(await iconPack(img, st.appName()), 'icon-' + U.boDau(st.appName()).replace(/[^0-9a-z]+/g, '-') + '.zip');
          msg('Đã tải bộ icon. Làm theo HUONG-DAN.txt bên trong file zip.', true);
        }
      });
    }
  });
}

// Màu giao diện: bộ màu có sẵn hoặc tự chọn từng màu (áp dụng cho chế độ sáng)
function openColors() {
  const cur = st.themeColors();
  let o = { ...MAU_SAN[0], inc: '#54448C', exp: '#A5364A', ...Object.fromEntries(Object.entries(cur).filter(([, v]) => v)) };
  const truoc = st.setting('theme_colors', '');
  const O = [['acc', 'Header, mục đang chọn'], ['bg', 'Nền'], ['bg2', 'Dải số liệu, nền phụ'], ['line', 'Tiêu đề nhóm, đường kẻ'], ['bd', 'Viền'], ['inc', 'Số thu'], ['exp', 'Số chi / vượt']];
  openSheet({
    title: 'Màu giao diện', cls: 'mid',
    body: `<div class="lbl" style="margin-top:4px">Bộ màu có sẵn</div>
      <div class="palettes">${MAU_SAN.map((p) => `<button type="button" class="pal" data-p="${p.id}"><span class="sw">${(isMoi() ? ['pri', 'hdr', 'tile', 'bg'].map((k) => MOI[p.id][k]) : ['acc', 'bg2', 'line', 'bg'].map((k) => p[k])).map((v) => `<i style="background:${v}"></i>`).join('')}</span>${esc(p.ten)}</button>`).join('')}</div>
      <div class="lbl" style="margin-top:16px">Tự chọn từng màu</div>
      <div class="cpick">${O.map(([k, t]) => `<label><input type="color" data-k="${k}" value="${o[k]}"><span>${t}</span></label>`).join('')}</div>
      <div class="hint">${isMoi() ? 'Mẫu thiết kế mới: bộ màu có sẵn dùng đúng màu của mẫu (header, nút, nền); khi tự chọn, màu nút được suy ra từ màu header. ' : ''}Áp dụng cho giao diện sáng; giao diện tối giữ bộ màu tối. Chữ luôn giữ màu tím đậm để dễ đọc. Lưu vào Google Sheet nên các máy khác cũng đổi theo.</div>
      <div class="btns" style="margin-top:12px"><button class="btn" data-x>Hủy</button><button class="btn pri" data-save>Lưu</button></div>`,
    onMount: (b, close) => {
      const xem = () => { S.set.theme_colors = JSON.stringify(o); st.applySettings(); };
      b.addEventListener('click', async (e) => {
        const p = e.target.closest('[data-p]');
        if (p) {
          const m = MAU_SAN.find((x) => x.id === p.dataset.p);
          o = { ...o, ...m, preset: m.id };
          if (m.id === 'penny') o = { ...o, inc: '#54448C', exp: '#A5364A' };
          b.querySelectorAll('[data-k]').forEach((i) => { i.value = o[i.dataset.k]; });
          xem(); return;
        }
        if (e.target.closest('[data-save]')) {
          const v = o.preset === 'penny' && o.inc === '#54448C' && o.exp === '#A5364A' ? '' : JSON.stringify({ preset: o.preset || '', acc: o.acc, bg: o.bg, bg2: o.bg2, line: o.line, bd: o.bd, inc: o.inc, exp: o.exp });
          S.set.theme_colors = truoc;
          await st.setSetting('theme_colors', v);
          toast('Đã lưu màu giao diện'); close('saved');
        }
      });
      b.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) { o[k] = e.target.value; o.preset = ''; xem(); } });
    },
    // Hủy / đóng không lưu: trả lại màu cũ
    onClose: (v) => { if (v !== 'saved') S.set.theme_colors = truoc; st.applySettings(); }
  });
}

// Thanh toán thẻ: mở form chuyển khoản từ ví thanh toán sang thẻ, điền sẵn số cần trả (hoặc toàn bộ dư nợ)
let openAddRef = null;
export function payCard(ten) {
  const a = st.wallets(S.month).find((x) => x.ten_vi === ten);
  if (!a || !openAddRef) return;
  const info = st.cardInfo(a);
  const tu = a.vi_thanh_toan || st.walletNames().find((x) => x !== ten && !st.isCard(S.acc.find((y) => y.ten_vi === x) || {})) || '';
  openAddRef({ loai: L.CHUYEN, vi: tu, vi_den: ten, so_tien: info.canTra || info.no, ghi_chu: 'Thanh toán thẻ ' + ten });
}

// ================= NGÂN SÁCH =================
const budRow = (nhom) => st.budgets(S.month).find((x) => same(x.nhom, nhom));
const thang = () => U.monthLabel(S.month);

// Sửa / bỏ ngân sách một nhóm (và đổi tên nhóm)
export function openBudget(nhom) {
  const x = budRow(nhom);
  if (!x) return;
  openSheet({
    title: 'Ngân sách · ' + nhom, cls: 'narrow',
    body: `<form novalidate>
      <div class="fld"><label for="b-ten">Tên nhóm</label><input class="inp" id="b-ten" name="ten" value="${esc(x.nhom)}" autocomplete="off">
        <div class="hint">Đổi tên nhóm sẽ đổi luôn nhóm của các danh mục và ngân sách ở mọi tháng.</div></div>
      <div class="fld"><label for="b-hm">Hạn mức tháng ${thang()}</label><input class="inp" id="b-hm" name="hm" value="${num(x.lim)} đ" autocomplete="off" autofocus>
        <div class="hint">${x.inherited ? `Đang dùng hạn mức theo tháng ${U.monthLabel(x.inherited)}. Lưu sẽ đặt hạn mức riêng từ tháng ${thang()} trở đi.` : `Các tháng sau chưa đặt sẽ dùng hạn mức này.`}</div></div>
      <div class="hint" style="margin-bottom:10px">Đã chi ${num(x.chi)} · ${budStatus(x)}</div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      <button type="button" class="btn danger del" data-del>Bỏ ngân sách nhóm này từ ${thang()}</button>
    </form>`,
    onMount: (b, close) => {
      b.querySelector('[data-del]').onclick = async () => {
        if (!(await confirmBox(`Bỏ ngân sách nhóm "${x.nhom}" từ tháng ${thang()}? Các tháng trước giữ nguyên.`, 'Bỏ', true))) return;
        await st.removeBudget(x.nhom, S.month);
        toast('Đã bỏ ngân sách nhóm ' + x.nhom); close();
      };
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const ten = U.nfc(b.querySelector('[name=ten]').value);
        const hm = U.parseMoney(b.querySelector('[name=hm]').value);
        if (!ten) { tagLoi(b, 'Nhập tên nhóm.'); return; }
        if (!hm) { tagLoi(b, 'Hạn mức chưa đúng. Ví dụ: 2tr, 2.000.000'); return; }
        if (ten !== x.nhom) await st.renameGroup(x.nhom, ten);
        if (hm !== x.lim || x.inherited) await st.saveBudget(ten, S.month, hm);
        toast('Đã lưu ngân sách'); close();
      };
    }
  });
}

// Thêm nhóm ngân sách cho tháng đang xem
export function openBudgetAdd() {
  const co = st.budgets(S.month).map((x) => U.boDau(x.nhom));
  const goiY = st.chiGroups().filter((g) => !co.includes(U.boDau(g)));
  openSheet({
    title: 'Thêm nhóm ngân sách', cls: 'narrow',
    body: `<form novalidate>
      <div class="fld"><label for="ba-n">Nhóm</label><input class="inp" id="ba-n" name="n" list="ba-dl" value="${esc(goiY[0] || '')}" autocomplete="off">
        <datalist id="ba-dl">${goiY.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
        ${goiY.length ? `<div class="chips">${goiY.map((g) => `<button type="button" class="chip" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
        <div class="hint">Nhóm lấy theo cột Nhóm của danh mục chi (Cài đặt → Quản lý danh mục).</div></div>
      <div class="fld"><label for="ba-h">Hạn mức tháng ${thang()}</label><input class="inp" id="ba-h" name="h" placeholder="2.000.000 đ" autocomplete="off" autofocus></div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
    </form>`,
    onMount: (b, close) => {
      b.addEventListener('click', (e) => { const c = e.target.closest('[data-g]'); if (c) { b.querySelector('[name=n]').value = c.dataset.g; b.querySelector('[name=h]').focus(); } });
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const n = U.nfc(b.querySelector('[name=n]').value);
        const h = U.parseMoney(b.querySelector('[name=h]').value);
        if (!n) { tagLoi(b, 'Nhập tên nhóm.'); return; }
        if (co.includes(U.boDau(n))) { tagLoi(b, `Nhóm "${n}" đã có ngân sách tháng này. Bấm vào nhóm để sửa.`); return; }
        if (!h) { tagLoi(b, 'Hạn mức chưa đúng. Ví dụ: 2tr, 2.000.000'); return; }
        const g = st.chiGroups().find((x) => same(x, n)) || n;
        await st.saveBudget(g, S.month, h);
        toast('Đã thêm ngân sách nhóm ' + g); close();
      };
    }
  });
}

// Sửa hạn mức nhiều nhóm một lần (nút "Sửa" ở dòng "Theo nhóm")
export function openBudgetBulk() {
  const b0 = st.budgets(S.month);
  openSheet({
    title: 'Sửa ngân sách tháng ' + thang(), cls: 'mid',
    body: `<form novalidate>${b0.map((x, i) => `<div class="fld"><label for="bb-${i}">${esc(x.nhom)}</label>
        <input class="inp" id="bb-${i}" data-i="${i}" value="${num(x.lim)} đ" autocomplete="off">
        <div class="hint">Đã chi ${num(x.chi)}${x.inherited ? ` · đang theo tháng ${U.monthLabel(x.inherited)}` : ''}. Để trống để bỏ ngân sách nhóm này.</div></div>`).join('')}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div></form>`,
    onMount: (b, close) => {
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const vals = [...b.querySelectorAll('[data-i]')].map((inp) => ({ x: b0[+inp.dataset.i], raw: inp.value.trim(), v: U.parseMoney(inp.value) }));
        const sai = vals.find((o) => o.raw && !o.v);
        if (sai) { tagLoi(b, `Hạn mức nhóm ${sai.x.nhom} chưa đúng.`); return; }
        let n = 0;
        for (const o of vals) {
          if (!o.raw) { await st.removeBudget(o.x.nhom, S.month); n++; } else if (o.v !== o.x.lim) { await st.saveBudget(o.x.nhom, S.month, o.v); n++; }
        }
        toast(n ? `Đã lưu ${n} nhóm` : 'Không có thay đổi'); close();
      };
    }
  });
}

// ================= NGƯỜI (CÔNG NỢ) =================
export function openPerson(key = '') {
  const p = key ? S.ppl.find((x) => x.ten === key) || { ten: key, ghi_chu: '' } : null;
  openSheet({
    title: p ? 'Sửa người' : 'Thêm người', cls: 'narrow',
    body: `<form novalidate>
      <div class="fld"><label for="p-ten">Tên</label><input class="inp" id="p-ten" name="ten" value="${esc(p ? p.ten : '')}" autocomplete="off" autofocus>
        ${p ? '<div class="hint">Đổi tên sẽ đổi luôn tên người trong các giao dịch công nợ.</div>' : ''}</div>
      <div class="fld"><label for="p-gc">Ghi chú</label><input class="inp" id="p-gc" name="gc" value="${esc(p ? p.ghi_chu : '')}" autocomplete="off"></div>
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${p ? '<button type="button" class="btn danger del" data-del>Xóa người</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        const n = st.live().filter((t) => st.NO_TYPES.includes(t.loai) && same(t.nguoi, p.ten)).length;
        if (n) { tagLoi(b, `Không xóa được: còn ${n} giao dịch công nợ với ${p.ten}. Xóa hoặc đổi người ở các giao dịch đó trước.`); return; }
        if (!(await confirmBox(`Xóa "${p.ten}" khỏi danh sách công nợ?`, 'Xóa', true))) return;
        await st.deletePerson(p.ten);
        SV.person = '';
        toast('Đã xóa'); close();
      };
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const ten = U.nfc(b.querySelector('[name=ten]').value);
        if (!ten) { tagLoi(b, 'Nhập tên.'); return; }
        if (st.personNames().some((x) => x !== (p && p.ten) && same(x, ten))) { tagLoi(b, `Đã có "${ten}" trong danh sách.`); return; }
        await st.savePerson({ ten, ghi_chu: b.querySelector('[name=gc]').value }, p && S.ppl.some((x) => x.ten === p.ten) ? p.ten : undefined);
        // Người chỉ có trong giao dịch (chưa có dòng People) mà đổi tên -> đổi trong giao dịch
        if (p && !S.ppl.some((x) => x.ten === p.ten) && p.ten !== ten) {
          for (const t of st.live().filter((x) => x.nguoi === p.ten)) await st.saveTx({ ...t, nguoi: ten });
        }
        SV.person = ten;
        toast(p ? 'Đã lưu' : 'Đã thêm ' + ten); close();
      };
    }
  });
}

// ================= DANH MỤC =================
let catTab = 'chi';
export function openCategories() {
  let q = '';
  openSheet({
    title: 'Quản lý danh mục', cls: 'mid', raw: true,
    onMount: (b, close, el) => {
      const draw = () => {
        const qq = U.boDau(q);
        const list = st.catsSorted(catTab).filter((c) => !qq || U.boDau(c.danh_muc + ' ' + c.nhom + ' ' + S.kw.filter((k) => k.danh_muc === c.danh_muc).map((k) => k.tu_khoa).join(' ')).includes(qq));
        const groups = [];
        list.forEach((c) => { const g = c.nhom || 'Khác'; let x = groups.find((y) => y.g === g); if (!x) groups.push(x = { g, cs: [] }); x.cs.push(c); });
        const kwN = (c) => S.kw.filter((k) => k.danh_muc === c.danh_muc).length;
        b.innerHTML = `<div class="utabs" role="tablist">${[['chi', 'Chi'], ['thu', 'Thu']].map(([k, t]) => `<button role="tab" class="${catTab === k ? 'on' : ''}" aria-selected="${catTab === k}" data-tab="${k}">${t}</button>`).join('')}</div>
          <div class="sheet-b" style="padding-top:12px"><input class="inp" type="search" data-q value="${esc(q)}" placeholder="Tìm danh mục, nhóm hoặc từ khóa…" autocomplete="off" aria-label="Tìm danh mục" style="margin-bottom:10px"><button class="btn wide" data-new>+ Thêm danh mục ${catTab === 'thu' ? 'thu' : 'chi'}</button></div>`
          + groups.map((x) => `<div class="opt-g"><span>${esc(x.g)}</span><button class="secbtn" data-rg="${esc(x.g)}">Đổi tên nhóm</button></div>`
            + x.cs.map((c) => `<button class="opt" data-c="${esc(c.danh_muc)}"><span class="optl"><span class="av sm" aria-hidden="true">${esc(c.ky_hieu || U.chuCai(c.danh_muc))}</span><span>${esc(c.danh_muc)}<span class="sub">${kwN(c) ? kwN(c) + ' từ khóa' : 'Chưa có từ khóa'}</span></span></span><span aria-hidden="true">›</span></button>`).join('')).join('')
          + (groups.length ? '' : `<div class="empty">${q ? 'Không có danh mục khớp.' : 'Chưa có danh mục.'}</div>`);
      };
      draw();
      const off = st.onChange(draw);
      const obs = new MutationObserver(() => { if (!el.isConnected) { off(); obs.disconnect(); } });
      obs.observe(document.getElementById('layer'), { childList: true });
      b.addEventListener('input', (e) => {
        if (!e.target.matches('[data-q]')) return;
        q = e.target.value; const pos = e.target.selectionStart;
        draw();
        const n = b.querySelector('[data-q]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ }
      });
      b.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { catTab = t.dataset.tab; draw(); return; }
        if (e.target.closest('[data-new]')) { openCategory('', catTab); return; }
        const c = e.target.closest('[data-c]');
        if (c) { openCategory(c.dataset.c, catTab); return; }
        const rg = e.target.closest('[data-rg]');
        if (rg) {
          const v = await ask({ title: 'Đổi tên nhóm', label: 'Tên mới', value: rg.dataset.rg, hint: 'Đổi luôn nhóm của các danh mục và ngân sách ở mọi tháng.' });
          if (v && U.nfc(v) && U.nfc(v) !== rg.dataset.rg) { await st.renameGroup(rg.dataset.rg, v); toast('Đã đổi tên nhóm'); }
        }
      });
    }
  });
}

export function openCategory(key, loai = 'chi') {
  const c = key ? S.cat.find((x) => x.danh_muc === key) : null;
  let lo = c ? c.loai : loai;
  const goc = c && (c.danh_muc === st.DM_CHUA || c.danh_muc === st.DM_THU_KHAC);
  const groupsFor = (l) => [...new Set(st.catsFor(l).map((x) => x.nhom || 'Khác'))];
  const kws = c ? S.kw.filter((k) => k.danh_muc === c.danh_muc).map((k) => k.tu_khoa) : [];
  openSheet({
    title: c ? 'Sửa danh mục' : 'Thêm danh mục', cls: 'narrow',
    body: `<form novalidate>
      <div class="fld"><label for="c-ten">Tên danh mục</label><input class="inp" id="c-ten" name="ten" value="${esc(c ? c.danh_muc : '')}" autocomplete="off" ${c ? '' : 'autofocus'} ${goc ? 'readonly' : ''}>
        ${goc ? '<div class="hint">Danh mục mặc định của bot, không đổi tên hay xóa được.</div>' : c ? '<div class="hint">Đổi tên sẽ đổi luôn danh mục trong các giao dịch và từ khóa.</div>' : ''}</div>
      <div class="fld"><span class="lbl">Loại</span><div class="seg" role="radiogroup">${[['chi', 'Chi'], ['thu', 'Thu']].map(([k, t]) => `<button type="button" role="radio" data-lo="${k}" class="${lo === k ? 'on' : ''}" aria-checked="${lo === k}">${t}</button>`).join('')}</div></div>
      <div class="grid2"><div data-cbw>${comboHtml({ name: 'nh', value: c ? c.nhom : (groupsFor(lo)[0] || ''), options: groupsFor(lo), label: 'Nhóm (danh mục cha)', newLabel: 'Nhóm mới' })}</div>
        <div class="fld"><label for="c-kh">Ký tự đại diện</label><input class="inp" id="c-kh" name="kh" value="${esc(c ? c.ky_hieu : '')}" maxlength="4" placeholder="${esc(c ? U.chuCai(c.danh_muc) : 'A')}" autocomplete="off"></div></div>
      <div class="hint" style="margin:-4px 0 10px">Ký tự đại diện: 1 chữ cái hoặc emoji, hiện ở ô vuông đầu mỗi giao dịch. Để trống thì dùng chữ cái đầu tên.</div>
      ${c ? `<div class="hint" style="margin-bottom:10px">Từ khóa: ${kws.length ? kws.map(esc).join(', ') : 'chưa có'} (sửa ở Cài đặt → Từ khóa tự phân loại).</div>` : ''}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${c && !goc ? '<button type="button" class="btn danger del" data-del>Xóa danh mục</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      comboMount(b);
      b.addEventListener('click', async (e) => {
        const l = e.target.closest('[data-lo]');
        if (l) {
          lo = l.dataset.lo;
          b.querySelectorAll('[data-lo]').forEach((x) => { x.classList.toggle('on', x === l); x.setAttribute('aria-checked', x === l); });
          // đổi loại → đổi danh sách nhóm của ô chọn
          const cur = b.querySelector('[name=nh]').value;
          b.querySelector('[data-cbw]').innerHTML = comboHtml({ name: 'nh', value: groupsFor(lo).includes(cur) ? cur : (groupsFor(lo)[0] || ''), options: groupsFor(lo), label: 'Nhóm (danh mục cha)', newLabel: 'Nhóm mới' });
          comboMount(b);
          return;
        }
        if (e.target.closest('[data-del]')) {
          const n = st.live().filter((t) => t.danh_muc === c.danh_muc).length;
          const msg = `Xóa danh mục "${c.danh_muc}"?` + (kws.length ? ` ${kws.length} từ khóa của danh mục này cũng bị xóa.` : '') + (n ? ` ${n} giao dịch đang dùng danh mục này vẫn giữ tên cũ.` : '');
          if (!(await confirmBox(msg, 'Xóa', true))) return;
          await st.deleteCat(c.danh_muc);
          toast('Đã xóa danh mục'); close();
        }
      });
      b.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const ten = U.nfc(b.querySelector('[name=ten]').value);
        if (!ten) { tagLoi(b, 'Nhập tên danh mục.'); return; }
        if (S.cat.some((x) => x !== c && x.danh_muc.toLowerCase() === ten.toLowerCase())) { tagLoi(b, `Đã có danh mục "${ten}".`); return; }
        await st.saveCat({ danh_muc: ten, nhom: b.querySelector('[name=nh]').value || 'Khác', ky_hieu: b.querySelector('[name=kh]').value, loai: lo }, c ? c.danh_muc : undefined);
        toast(c ? 'Đã lưu danh mục' : 'Đã thêm danh mục ' + ten); close();
      };
    }
  });
}

// ================= TỪ KHÓA =================
export function openKeywords() {
  let q = '', dmMoi = '';
  openSheet({
    title: 'Từ khóa tự phân loại', cls: 'mid', raw: true,
    onMount: (b, close, el) => {
      b.innerHTML = `<div class="sheet-b">
        <div class="hint" style="margin:0 0 10px">Ghi chú có chứa từ khóa sẽ được xếp vào danh mục tương ứng (bot Telegram và form thêm giao dịch). Từ khóa dài hơn được ưu tiên.</div>
        <form class="kwadd" novalidate><input class="inp" name="kw" placeholder="Từ khóa mới, ví dụ: bún" autocomplete="off" aria-label="Từ khóa mới">
          <button type="button" class="inp" data-pick><span class="v">Chọn danh mục</span><span aria-hidden="true">▾</span></button>
          <button class="btn pri">Thêm</button></form>
        <div class="okmsg" data-msg role="status"></div>
        <input class="inp" name="q" type="search" placeholder="Tìm từ khóa hoặc danh mục…" autocomplete="off" aria-label="Tìm từ khóa"></div><div data-list></div>`;
      const listEl = b.querySelector('[data-list]');
      const pickBtn = b.querySelector('[data-pick]');
      const draw = () => {
        const qq = U.boDau(q);
        const ks = S.kw.filter((k) => !qq || U.boDau(k.tu_khoa + ' ' + k.danh_muc).includes(qq)).slice().sort((a, c) => a.tu_khoa.localeCompare(c.tu_khoa, 'vi'));
        listEl.innerHTML = `<div class="opt-g"><span>${ks.length} từ khóa</span></div>` + ks.map((k) => `<div class="kwrow">
          <button class="opt" data-kw="${esc(k.tu_khoa)}"><span>${esc(k.tu_khoa)}<span class="sub">→ ${esc(k.danh_muc)}${st.catOf(k.danh_muc) ? '' : ' (danh mục không còn)'}</span></span><span aria-hidden="true">›</span></button>
          <button class="kwdel" data-del="${esc(k.tu_khoa)}" aria-label="Xóa từ khóa ${esc(k.tu_khoa)}">✕</button></div>`).join('');
        pickBtn.querySelector('.v').textContent = dmMoi || 'Chọn danh mục';
      };
      draw();
      const off = st.onChange(draw);
      const obs = new MutationObserver(() => { if (!el.isConnected) { off(); obs.disconnect(); } });
      obs.observe(document.getElementById('layer'), { childList: true });
      const catOpts = () => st.catsSorted('chi').concat(st.catsSorted('thu')).map((c) => ({ v: c.danh_muc, label: (c.ky_hieu ? c.ky_hieu + '  ' : '') + c.danh_muc, group: (c.loai === 'thu' ? 'Thu · ' : 'Chi · ') + (c.nhom || 'Khác') }));
      b.querySelector('[name=q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-pick]')) {
          const v = await pickOne({ title: 'Gán vào danh mục', options: catOpts(), value: dmMoi });
          if (v !== undefined) { dmMoi = v; draw(); }
          return;
        }
        const d = e.target.closest('[data-del]');
        if (d) {
          if (!(await confirmBox(`Xóa từ khóa "${d.dataset.del}"?`, 'Xóa', true))) return;
          await st.deleteKw(d.dataset.del); toast('Đã xóa từ khóa'); return;
        }
        const k = e.target.closest('[data-kw]');
        if (k) {
          const cu = S.kw.find((x) => x.tu_khoa === k.dataset.kw);
          const v = await pickOne({ title: `Gán "${cu.tu_khoa}" vào danh mục`, options: catOpts(), value: cu.danh_muc });
          if (v && v !== cu.danh_muc) { await st.saveKw({ tu_khoa: cu.tu_khoa, danh_muc: v }, cu.tu_khoa); toast('Đã gán vào ' + v); }
        }
      });
      b.querySelector('.kwadd').onsubmit = async (e) => {
        e.preventDefault();
        const inp = b.querySelector('[name=kw]');
        const kw = U.nfc(inp.value).toLowerCase();
        if (!kw) { tagLoi(b, 'Nhập từ khóa.'); inp.focus(); return; }
        if (!dmMoi) { tagLoi(b, 'Chọn danh mục cho từ khóa.'); return; }
        const cu = S.kw.find((x) => x.tu_khoa.toLowerCase() === kw);
        await st.saveKw({ tu_khoa: kw, danh_muc: dmMoi });
        const m = b.querySelector('[data-msg]'); m.className = 'okmsg ok'; m.textContent = cu ? `Đã gán lại "${kw}" → ${dmMoi}` : `Đã thêm "${kw}" → ${dmMoi}`;
        inp.value = ''; inp.focus();
      };
    }
  });
}

// ================= CÀI ĐẶT =================
const NUM_FMT = ['1.234.567', '1,234,567', '1 234 567'];

/** Xử lý data-act của các màn mới + Cài đặt. Trả true nếu đã xử lý. */
export async function manageAct(a, b, ctx) {
  openAddRef = ctx.openAdd;
  switch (a) {
    case 'w-add': openWallet(); return true;
    case 'w-edit': openWallet(b.dataset.k); return true;
    // v0.9.0: sổ tiết kiệm + điều chỉnh số dư
    case 'tk-ok': TKU.quickApply(b.dataset.k); return true;
    case 'tk-sua': TKU.openEvent(b.dataset.k); return true;
    case 'tk-settle': TKU.openSettle(b.dataset.k); return true;
    case 'w-adjust': TKU.openAdjust(b.dataset.k); return true;
    case 'tk-add': ctx.openAdd({ loai: L.CHUYEN, vi_den: b.dataset.k }); return true;
    case 'card-pay': openAddRef = ctx.openAdd; payCard(b.dataset.k); return true;
    case 'due-paid': payCard(b.dataset.k); return true;
    case 'due-later': snoozeCard(b.dataset.k); toast('Ok, mai nhắc lại'); ctx.render(); return true;
    case 'set-appname': {
      const v = await ask({ title: 'Tên app', label: 'Tên hiển thị trên thanh bên và tiêu đề cửa sổ', value: st.appName(), hint: 'Tên trên màn hình chính của điện thoại chỉ đổi khi cài lại app (Icon app → Tải bộ icon cài đặt).' });
      if (v != null) { await st.setSetting('app_name', U.nfc(v) === 'Penny' ? '' : U.nfc(v)); toast('Đã đổi tên app'); }
      return true;
    }
    case 'set-appicon': openAppIcon(); return true;
    case 'set-colors': openColors(); return true;
    case 'transfer': ctx.openAdd({ loai: L.CHUYEN }); return true;
    case 'b-edit': openBudget(b.dataset.k); return true;
    case 'b-add': openBudgetAdd(); return true;
    case 'b-bulk': openBudgetBulk(); return true;
    case 'p-add': openPerson(); return true;
    case 'p-edit': openPerson(b.dataset.k); return true;
    case 'p-sel': SV.person = b.dataset.k; ctx.render(); return true;
    case 'debt-add': {
      const ds = st.debts().sort((x, y) => x.ten.localeCompare(y.ten, 'vi'));
      const p = ds.find((d) => d.ten === SV.person) || ds[0];
      const loai = b.dataset.loai;
      const init = { loai, nguoi: p ? p.ten : '' };
      if (p && (loai === L.THU_NO || loai === L.TRA_NO)) init.so_tien = Math.abs(p.du);
      ctx.openAdd(init);
      return true;
    }
    case 'st-tab': SV.stTab = b.dataset.v; SV.open = ''; ctx.render(); return true;
    case 'st-chart': setChartKieu(b.dataset.v); ctx.render(); return true; // v0.10.0: đổi kiểu biểu đồ (lưu theo máy)
    case 'st-per': perSet(b.dataset.v); SV.open = ''; ctx.render(); return true;
    case 'st-prev': perShift(-1); ctx.render(); return true;
    case 'st-next': perShift(1); ctx.render(); return true;
    case 'st-grp': SV.open = SV.open === b.dataset.k ? '' : b.dataset.k; ctx.render(); return true;
    case 'set-name': {
      const v = await ask({ title: 'Tên hiển thị', label: 'Tên', value: st.setting('display_name'), hint: 'Lưu vào Settings trên Google Sheet.' });
      if (v != null) { await st.setSetting('display_name', U.nfc(v)); toast('Đã lưu tên hiển thị'); }
      return true;
    }
    case 'set-numfmt': {
      const cur = st.setting('number_format', NUM_FMT[0]);
      const v = await pickOne({ title: 'Định dạng số', value: NUM_FMT.includes(cur) ? cur : NUM_FMT[0], options: NUM_FMT.map((f) => ({ v: f, label: f + ' đ', sub: f === NUM_FMT[0] ? 'Dấu chấm ngăn hàng nghìn (mặc định)' : f === NUM_FMT[1] ? 'Dấu phẩy ngăn hàng nghìn' : 'Khoảng trắng ngăn hàng nghìn' })) });
      if (v) await st.setSetting('number_format', v);
      return true;
    }
    case 'set-week': {
      const v = await pickOne({ title: 'Tuần bắt đầu', value: st.weekStart() === 0 ? 'chủ nhật' : 'thứ 2', options: [{ v: 'thứ 2', label: 'Thứ Hai' }, { v: 'chủ nhật', label: 'Chủ Nhật' }] });
      if (v) { await st.setSetting('week_start', v); toast('Lịch và Tuần bắt đầu từ ' + (v === 'thứ 2' ? 'Thứ Hai' : 'Chủ Nhật')); }
      return true;
    }
    case 'set-defacc': {
      const v = await pickOne({ title: 'Ví mặc định', value: st.defaultAccount(), options: st.walletNames().map((w) => ({ v: w, label: w })) });
      if (v) await st.setSetting('default_account', v);
      return true;
    }
    case 'cat-mgr': openCategories(); return true;
    case 'kw-mgr': openKeywords(); return true;
    case 'csv': openCsv(); return true;
    default: return false;
  }
}
