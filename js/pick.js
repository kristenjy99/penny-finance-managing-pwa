// Penny v0.5.1 – hộp chọn danh mục: tìm kiếm, đề xuất, tạo danh mục mới ngay trong form, ghi nhớ từ khóa
import * as U from './util.js';
import { esc } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { openSheet, toast } from './ui.js';

const isFine = () => matchMedia('(pointer: fine)').matches;

/**
 * Chọn danh mục cho giao dịch thu/chi.
 * opts: { loai, note, value }  ->  Promise<{ v, nho } | undefined>
 *   v: tên danh mục ('' = tự động theo từ khóa); nho: true nếu người dùng muốn nhớ từ khóa "ghi chú → v"
 */
export function pickCategory({ loai = L.CHI, note = '', value = '' } = {}) {
  return new Promise((resolve) => {
    let kq;
    const lo = loai === L.THU ? 'thu' : 'chi';
    const tuDong = st.classify(note, lo) || st.fallbackCat(lo);
    const ghi = U.nfc(note).toLowerCase();
    const coTuKhoa = S.kw.some((k) => k.tu_khoa.toLowerCase() === ghi);
    const choNho = ghi && ghi.split(/\s+/).length <= 4 && !coTuKhoa;
    let nho = choNho && tuDong === st.fallbackCat(lo);
    let q = '', tao = null; // tao: đang ở bước tạo danh mục mới {ten, nhom, kh}

    const opt = (c, sub = '') => `<button class="opt ${c.danh_muc === value ? 'on' : ''}" data-v="${esc(c.danh_muc)}">
      <span class="optl"><span class="av sm" aria-hidden="true">${esc(c.ky_hieu || U.chuCai(c.danh_muc))}</span><span>${esc(c.danh_muc)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></span>${c.danh_muc === value ? '✓' : ''}</button>`;

    openSheet({
      title: 'Chọn danh mục', cls: 'mid', raw: true,
      onMount: (b, close) => {
        b.innerHTML = `<div class="sheet-b pick-top"><input class="inp" type="search" name="q" placeholder="Tìm hoặc gõ tên danh mục mới…" autocomplete="off" aria-label="Tìm danh mục" ${isFine() ? 'autofocus' : ''}>
          ${choNho ? `<label class="nho"><input type="checkbox" name="nho" ${nho ? 'checked' : ''}> Nhớ từ khóa “${esc(ghi)}” cho danh mục chọn</label>` : ''}</div><div data-list></div>`;
        const list = b.querySelector('[data-list]');
        const draw = () => {
          if (tao) { list.innerHTML = taoHtml(); const n = list.querySelector('[name=ten]'); if (n && !n.value) n.focus(); return; }
          const qq = U.boDau(q);
          let h = '';
          if (!qq) {
            const goiY = st.suggestCats('', note, lo).filter((x) => x.khop || x.diem > 0).slice(0, 4);
            h += `<div class="opt-g"><span>Đề xuất</span></div>
              <button class="opt ${!value ? 'on' : ''}" data-v=""><span>Tự động theo từ khóa<span class="sub">Hiện tại: ${esc(tuDong)}</span></span>${!value ? '✓' : ''}</button>`
              + goiY.map((x) => opt(x.c, x.khop ? 'hợp với ghi chú' : 'hay dùng')).join('');
            let g0 = null;
            st.catsSorted(lo).forEach((c) => {
              const g = c.nhom || 'Khác';
              if (g !== g0) { h += `<div class="opt-g"><span>${esc(g)}</span></div>`; g0 = g; }
              h += opt(c);
            });
          } else {
            const kq2 = st.suggestCats(q, note, lo).filter((x) => x.khop && x.diem >= 25);
            const coDung = st.catsFor(lo).some((c) => U.boDau(c.danh_muc) === qq);
            h += `<div class="opt-g"><span>${kq2.length ? 'Kết quả' : 'Không có danh mục khớp'}</span></div>`
              + kq2.slice(0, 12).map((x) => opt(x.c, x.c.nhom)).join('')
              + (!coDung ? `<button class="opt new" data-new><span>＋ Tạo danh mục ${lo === 'thu' ? 'thu' : 'chi'} “${esc(U.nfc(q))}”</span><span aria-hidden="true">›</span></button>` : '');
          }
          list.innerHTML = h;
        };
        const nhoms = () => [...new Set(st.catsFor(lo).map((c) => c.nhom || 'Khác'))];
        const taoHtml = () => `<div class="sheet-b"><div class="lbl" style="margin-top:8px">Tạo danh mục ${lo === 'thu' ? 'thu' : 'chi'} mới</div>
          <div class="fld"><label for="pk-ten">Tên danh mục</label><input class="inp" id="pk-ten" name="ten" value="${esc(tao.ten)}" autocomplete="off"></div>
          <div class="fld"><span class="lbl">Nhóm</span><div class="chips">${nhoms().map((g) => `<button type="button" class="chip ${g === tao.nhom ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
            <input class="inp" name="nhom" value="${esc(tao.nhom)}" placeholder="hoặc gõ nhóm mới" autocomplete="off" style="margin-top:8px" aria-label="Nhóm"></div>
          <div class="fld"><label for="pk-kh">Ký tự đại diện (tùy chọn)</label><input class="inp" id="pk-kh" name="kh" maxlength="4" placeholder="${esc(U.chuCai(tao.ten || 'A'))}" autocomplete="off"></div>
          <div class="okmsg" data-msg role="status"></div>
          <div class="btns"><button type="button" class="btn" data-back>Quay lại</button><button type="button" class="btn pri" data-create>Tạo và chọn</button></div></div>`;
        draw();
        const qInp = b.querySelector('[name=q]');
        qInp.addEventListener('input', () => { q = qInp.value; draw(); });
        qInp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const first = list.querySelector('[data-v], [data-new]');
          if (first) first.click();
        });
        const cb = b.querySelector('[name=nho]');
        if (cb) cb.addEventListener('change', () => { nho = cb.checked; });
        b.addEventListener('click', async (e) => {
          const o = e.target.closest('[data-v]');
          if (o) { kq = { v: o.dataset.v, nho: nho && !!o.dataset.v }; close(); return; }
          if (e.target.closest('[data-new]')) {
            const ten = U.nfc(q);
            const goiY = st.suggestCats(ten, note, lo).find((x) => x.khop);
            tao = { ten, nhom: goiY ? goiY.c.nhom : (nhoms()[0] || (lo === 'thu' ? 'Thu nhập' : 'Khác')) };
            draw(); return;
          }
          const g = e.target.closest('[data-g]');
          if (g) { tao.ten = list.querySelector('[name=ten]').value; tao.nhom = g.dataset.g; draw(); return; }
          if (e.target.closest('[data-back]')) { tao = null; draw(); qInp.focus(); return; }
          if (e.target.closest('[data-create]')) {
            const ten = U.nfc(list.querySelector('[name=ten]').value);
            const nhom = U.nfc(list.querySelector('[name=nhom]').value) || tao.nhom;
            const msg = list.querySelector('[data-msg]');
            if (!ten) { msg.className = 'okmsg no'; msg.textContent = 'Nhập tên danh mục.'; return; }
            const trung = S.cat.find((c) => c.danh_muc.toLowerCase() === ten.toLowerCase());
            if (trung) { kq = { v: trung.danh_muc, nho }; close(); return; }
            await st.saveCat({ danh_muc: ten, nhom, ky_hieu: list.querySelector('[name=kh]').value || U.chuCai(ten), loai: lo });
            toast('Đã tạo danh mục ' + ten);
            kq = { v: ten, nho }; close();
          }
        });
        b.addEventListener('input', (e) => { if (e.target.name === 'nhom' && tao) { tao.nhom = e.target.value; b.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x.dataset.g === tao.nhom)); } });
      },
      onClose: () => resolve(kq)
    });
  });
}
