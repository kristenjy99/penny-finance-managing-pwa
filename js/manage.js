// Penny v0.5.0 – hộp thoại quản lý: ví, ngân sách, người, danh mục, từ khóa, các mục Cài đặt
import * as U from './util.js';
import { esc, num } from './util.js';
import * as st from './store.js';
import { S, L } from './store.js';
import { openSheet, confirmBox, toast, pickOne, ask } from './ui.js';
import { SV, budStatus } from './screens.js';
import { openCsv } from './csv.js';

const same = (a, b) => U.boDau(a) === U.boDau(b);
const tagLoi = (b, msg) => { const m = b.querySelector('[data-msg]'); if (m) { m.className = 'okmsg no'; m.textContent = msg; } };

// ================= VÍ =================
export function openWallet(key = '') {
  const w = key ? st.wallets(S.month).find((x) => x.ten_vi === key) : null;
  const laMacDinh = !!w && st.defaultAccount() === w.ten_vi;
  const nhoms = st.NHOM_VI.slice();
  if (w && w.nhom && !nhoms.includes(w.nhom)) nhoms.push(w.nhom);
  let nhom = w ? (w.nhom && w.nhom !== 'Khác' ? w.nhom : st.NHOM_VI[0]) : st.NHOM_VI[0];
  openSheet({
    title: w ? 'Sửa ví' : 'Thêm ví', cls: 'mid',
    body: `<form novalidate>
      <div class="fld"><label for="w-ten">Tên ví</label><input class="inp" id="w-ten" name="ten" value="${esc(w ? w.ten_vi : '')}" autocomplete="off" ${w ? '' : 'autofocus'}></div>
      <div class="fld"><span class="lbl">Nhóm</span><div class="seg" role="radiogroup">${nhoms.map((n) => `<button type="button" role="radio" data-nhom="${esc(n)}" class="${n === nhom ? 'on' : ''}" aria-checked="${n === nhom}">${esc(n)}</button>`).join('')}</div></div>
      <div class="fld"><label for="w-sd">Số dư đầu</label><input class="inp" id="w-sd" name="sd" inputmode="text" value="${w ? (w.so_du_dau < 0 ? U.MINUS : '') + num(w.so_du_dau) : '0'}" autocomplete="off">
        <div class="hint">Số tiền có sẵn trong ví trước giao dịch đầu tiên. Thẻ tín dụng đang nợ thì nhập số âm, ví dụ −1.200.000.</div></div>
      <label class="set flat"><span>Ví mặc định khi thêm giao dịch</span><span class="switch"><input type="checkbox" name="md" ${laMacDinh ? 'checked' : ''} aria-label="Ví mặc định"><i></i></span></label>
      ${w ? `<div class="hint" style="margin:8px 0 0">Số dư tới hết tháng ${U.monthLabel(S.month)}: <b class="num">${w.bal < 0 ? U.MINUS : ''}${num(w.bal)} đ</b>. Đổi tên ví sẽ đổi luôn tên ví trong các giao dịch.</div>` : ''}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${w && !w.ngoai ? '<button type="button" class="btn danger del" data-del>Xóa ví</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      b.addEventListener('click', async (e) => {
        const n = e.target.closest('[data-nhom]');
        if (n) { nhom = n.dataset.nhom; b.querySelectorAll('[data-nhom]').forEach((x) => { x.classList.toggle('on', x === n); x.setAttribute('aria-checked', x === n); }); return; }
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
        const ten = U.nfc(b.querySelector('[name=ten]').value);
        const sd = U.parseSignedMoney(b.querySelector('[name=sd]').value);
        if (!ten) { tagLoi(b, 'Nhập tên ví.'); return; }
        if (st.walletNames().some((x) => x !== (w && w.ten_vi) && x.toLowerCase() === ten.toLowerCase())) { tagLoi(b, `Đã có ví "${ten}".`); return; }
        if (sd == null) { tagLoi(b, 'Số dư đầu chưa đúng. Ví dụ: 0, 1.500.000, −1.200.000'); return; }
        await st.saveAcc({ ten_vi: ten, nhom, so_du_dau: sd }, w ? w.ten_vi : undefined);
        const md = b.querySelector('[name=md]').checked;
        if (md && st.setting('default_account') !== ten) await st.setSetting('default_account', ten);
        toast(w ? 'Đã lưu ví' : 'Đã thêm ví ' + ten);
        close();
      };
    }
  });
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
  openSheet({
    title: 'Quản lý danh mục', cls: 'mid', raw: true,
    onMount: (b, close, el) => {
      const draw = () => {
        const list = st.catsFor(catTab);
        const groups = [];
        list.forEach((c) => { const g = c.nhom || 'Khác'; let x = groups.find((y) => y.g === g); if (!x) groups.push(x = { g, cs: [] }); x.cs.push(c); });
        const kwN = (c) => S.kw.filter((k) => k.danh_muc === c.danh_muc).length;
        b.innerHTML = `<div class="utabs" role="tablist">${[['chi', 'Chi'], ['thu', 'Thu']].map(([k, t]) => `<button role="tab" class="${catTab === k ? 'on' : ''}" aria-selected="${catTab === k}" data-tab="${k}">${t}</button>`).join('')}</div>
          <div class="sheet-b" style="padding-top:12px"><button class="btn wide" data-new>+ Thêm danh mục ${catTab === 'thu' ? 'thu' : 'chi'}</button></div>`
          + groups.map((x) => `<div class="opt-g"><span>${esc(x.g)}</span><button class="secbtn" data-rg="${esc(x.g)}">Đổi tên nhóm</button></div>`
            + x.cs.map((c) => `<button class="opt" data-c="${esc(c.danh_muc)}"><span class="optl"><span class="av sm" aria-hidden="true">${esc(c.ky_hieu || U.chuCai(c.danh_muc))}</span><span>${esc(c.danh_muc)}<span class="sub">${kwN(c) ? kwN(c) + ' từ khóa' : 'Chưa có từ khóa'}</span></span></span><span aria-hidden="true">›</span></button>`).join('')).join('')
          + (groups.length ? '' : '<div class="empty">Chưa có danh mục.</div>');
      };
      draw();
      const off = st.onChange(draw);
      const obs = new MutationObserver(() => { if (!el.isConnected) { off(); obs.disconnect(); } });
      obs.observe(document.getElementById('layer'), { childList: true });
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
      <div class="grid2"><div class="fld"><label for="c-nh">Nhóm</label><input class="inp" id="c-nh" name="nh" list="c-dl" value="${esc(c ? c.nhom : (groupsFor(lo)[0] || ''))}" autocomplete="off"><datalist id="c-dl">${groupsFor(lo).map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div>
        <div class="fld"><label for="c-kh">Ký tự đại diện</label><input class="inp" id="c-kh" name="kh" value="${esc(c ? c.ky_hieu : '')}" maxlength="4" placeholder="${esc(c ? U.chuCai(c.danh_muc) : 'A')}" autocomplete="off"></div></div>
      <div class="hint" style="margin:-4px 0 10px">Ký tự đại diện: 1 chữ cái hoặc emoji, hiện ở ô vuông đầu mỗi giao dịch. Để trống thì dùng chữ cái đầu tên.</div>
      ${c ? `<div class="hint" style="margin-bottom:10px">Từ khóa: ${kws.length ? kws.map(esc).join(', ') : 'chưa có'} (sửa ở Cài đặt → Từ khóa tự phân loại).</div>` : ''}
      <div class="okmsg" data-msg role="status"></div>
      <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div>
      ${c && !goc ? '<button type="button" class="btn danger del" data-del>Xóa danh mục</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      b.addEventListener('click', async (e) => {
        const l = e.target.closest('[data-lo]');
        if (l) {
          lo = l.dataset.lo;
          b.querySelectorAll('[data-lo]').forEach((x) => { x.classList.toggle('on', x === l); x.setAttribute('aria-checked', x === l); });
          b.querySelector('#c-dl').innerHTML = groupsFor(lo).map((g) => `<option value="${esc(g)}">`).join('');
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
      const catOpts = () => S.cat.map((c) => ({ v: c.danh_muc, label: (c.ky_hieu ? c.ky_hieu + '  ' : '') + c.danh_muc, group: (c.loai === 'thu' ? 'Thu · ' : 'Chi · ') + (c.nhom || 'Khác') }));
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
  switch (a) {
    case 'w-add': openWallet(); return true;
    case 'w-edit': openWallet(b.dataset.k); return true;
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
    case 'st-tab': SV.stTab = b.dataset.v; ctx.render(); return true;
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
