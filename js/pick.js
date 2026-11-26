// Penny v0.5.1 (v0.10.0: nhóm dạng xổ, tìm cả nhóm, ô nhóm cha có tìm kiếm) – hộp chọn danh mục: tìm kiếm, đề xuất, tạo danh mục mới ngay trong form, ghi nhớ từ khóa
import * as U from './util.js';
import { esc } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { openSheet, toast } from './ui.js';
import { comboHtml, comboMount } from './combo.js';

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
    const moNhom = new Set(); // v0.10.0: các nhóm đang xổ ra (mặc định thu gọn)

    const opt = (c, sub = '') => `<button class="opt ${c.danh_muc === value ? 'on' : ''}" data-v="${esc(c.danh_muc)}">
      <span class="optl"><span class="av sm" aria-hidden="true">${esc(c.ky_hieu || U.chuCai(c.danh_muc))}</span><span>${esc(c.danh_muc)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></span>${c.danh_muc === value ? '✓' : ''}</button>`;

    openSheet({
      title: 'Chọn danh mục', cls: 'mid', raw: true,
      onMount: (b, close) => {
        b.innerHTML = `<div class="sheet-b pick-top"><input class="inp" type="search" name="q" placeholder="Tìm hoặc gõ tên danh mục mới…" autocomplete="off" aria-label="Tìm danh mục" ${isFine() ? 'autofocus' : ''}>
          ${choNho ? `<label class="nho"><input type="checkbox" name="nho" ${nho ? 'checked' : ''}> Nhớ từ khóa “${esc(ghi)}” cho danh mục chọn</label>` : ''}</div><div data-list></div>`;
        const list = b.querySelector('[data-list]');
        const draw = () => {
          if (tao) { list.innerHTML = taoHtml(); comboMount(list); const n = list.querySelector('[name=ten]'); if (n && !n.value) n.focus(); return; }
          const qq = U.boDau(q);
          let h = '';
          if (!qq) {
            const goiY = st.suggestCats('', note, lo).filter((x) => x.khop || x.diem > 0).slice(0, 4);
            h += `<div class="opt-g"><span>Đề xuất</span></div>
              <button class="opt ${!value ? 'on' : ''}" data-v=""><span>Tự động theo từ khóa<span class="sub">Hiện tại: ${esc(tuDong)}</span></span>${!value ? '✓' : ''}</button>`
              + goiY.map((x) => opt(x.c, x.khop ? 'hợp với ghi chú' : 'hay dùng')).join('');
            // Nhóm thu gọn mặc định, bấm tên nhóm để xổ danh mục con
            h += `<div class="opt-g"><span>Theo nhóm</span></div>` + nhomList(st.catsSorted(lo), (g) => moNhom.has(g));
          } else {
            // Tìm cả tên nhóm (hiện mọi danh mục trong nhóm) và tên danh mục / từ khóa (hiện dưới nhóm của nó, xổ sẵn)
            const kq2 = st.suggestCats(q, note, lo).filter((x) => x.khop && x.diem >= 25).map((x) => x.c);
            const theoNhom = st.catsSorted(lo).filter((c) => U.boDau(c.nhom || 'Khác').includes(qq));
            const ds = st.catsSorted(lo).filter((c) => theoNhom.includes(c) || kq2.includes(c));
            const coDung = st.catsFor(lo).some((c) => U.boDau(c.danh_muc) === qq);
            h += (ds.length ? nhomList(ds, () => true) : `<div class="opt-g"><span>Không có danh mục khớp</span></div>`)
              + (!coDung ? `<button class="opt new" data-new><span>＋ Tạo danh mục ${lo === 'thu' ? 'thu' : 'chi'} “${esc(U.nfc(q))}”</span><span aria-hidden="true">›</span></button>` : '');
          }
          list.innerHTML = h;
        };
        const nhoms = () => [...new Set(st.catsFor(lo).map((c) => c.nhom || 'Khác'))];
        // Danh sách theo nhóm: tiêu đề nhóm là nút xổ / thu (aria-expanded), kèm số danh mục
        const nhomList = (ds, mo) => {
          const gs = [];
          ds.forEach((c) => { const g = c.nhom || 'Khác'; let x = gs.find((y) => y.g === g); if (!x) gs.push(x = { g, cs: [] }); x.cs.push(c); });
          return gs.map(({ g, cs }) => {
            const open = mo(g), coChon = cs.some((c) => c.danh_muc === value);
            return `<button type="button" class="acc-g${open ? ' open' : ''}" data-acc="${esc(g)}" aria-expanded="${open}"><span>${esc(g)}${coChon ? ' <span class="tag">đang chọn</span>' : ''}</span><span class="acc-n">${cs.length} <span aria-hidden="true">${open ? '▴' : '▾'}</span></span></button>`
              + (open ? `<div class="acc-b">${cs.map((c) => opt(c)).join('')}</div>` : '');
          }).join('');
        };
        const taoHtml = () => `<div class="sheet-b"><div class="lbl" style="margin-top:8px">Tạo danh mục ${lo === 'thu' ? 'thu' : 'chi'} mới</div>
          <div class="fld"><label for="pk-ten">Tên danh mục</label><input class="inp" id="pk-ten" name="ten" value="${esc(tao.ten)}" autocomplete="off"></div>
          ${comboHtml({ name: 'nhom', value: tao.nhom, options: nhoms(), label: 'Nhóm (danh mục cha)', placeholder: 'Gõ để tìm hoặc tạo nhóm mới', newLabel: 'Nhóm mới' })}
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
          const ac = e.target.closest('[data-acc]');
          if (ac) { const g = ac.dataset.acc; if (U.boDau(q)) return; if (moNhom.has(g)) moNhom.delete(g); else moNhom.add(g); draw(); list.querySelector(`[data-acc="${CSS.escape(g)}"]`)?.focus(); return; }
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
        b.addEventListener('input', (e) => { if (e.target.name === 'nhom' && tao) tao.nhom = e.target.value; });
      },
      onClose: () => resolve(kq)
    });
  });
}
