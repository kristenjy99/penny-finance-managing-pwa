// Penny v0.6.1 – xóa dữ liệu cả trên máy lẫn Google Sheet (Cài đặt → Đồng bộ & dữ liệu)
// Cần mật khẩu xóa dữ liệu (kiểm tra ở Apps Script, chỉ lưu dạng băm) + 1 lần xác nhận. Apps Script sao lưu Sheet trước khi xóa.
import { esc } from './util.js';
import * as db from './db.js';
import { S, emit } from './store.js';
import * as sy from './sync.js';
import { openSheet, confirmBox, toast } from './ui.js';

export const PHAM_VI = {
  giao_dich: { ten: 'Xóa giao dịch và số dư ví', mo: 'Xóa hẳn MỌI giao dịch và đưa số dư đầu của mọi ví về 0, trên máy này và trên Google Sheet. Ví, danh mục, từ khóa, ngân sách, người và cài đặt được giữ.' },
  tat_ca: { ten: 'Xóa tất cả dữ liệu', mo: 'Xóa hẳn MỌI giao dịch, ví, danh mục (trừ "Chưa phân loại", "Thu nhập khác"), từ khóa, ngân sách, người, trên máy này và trên Google Sheet. Giữ kết nối: secret token, Telegram, URL API, cài đặt hiển thị.' }
};

function canMang() {
  if (!sy.connected()) { toast('Chưa kết nối Google Sheet (Cài đặt → Kết nối API)'); return false; }
  if (!navigator.onLine) { toast('Cần có mạng để xóa dữ liệu trên Google Sheet'); return false; }
  return true;
}

// Hộp thoại nhập mật khẩu; kiem(mk) -> Promise<lỗi|''>. Trả mật khẩu đúng hoặc null nếu hủy
function hoiMk({ title, mo, nut = 'Tiếp tục', nguyHiem = false, kiem }) {
  return new Promise((done) => {
    let kq = null;
    openSheet({
      title, cls: 'narrow',
      body: `<form data-f novalidate><p>${mo}</p>
        <div class="fld"><label for="wp-mk">Mật khẩu xóa dữ liệu</label><input class="inp" id="wp-mk" name="mk" type="password" autocomplete="off" autofocus></div>
        <div class="okmsg no" data-msg role="status"></div>
        <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri ${nguyHiem ? 'danger' : ''}">${nut}</button></div>
        <div class="tip">Quên mật khẩu: trên Google Sheet chọn menu 🐷 Penny → 🔑 Đặt lại mật khẩu xóa dữ liệu, rồi đặt mật khẩu mới ở đây.</div></form>`,
      onMount: (b, close) => {
        const f = b.querySelector('[data-f]'), msg = b.querySelector('[data-msg]'), nutOk = f.querySelector('.btn.pri');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const mk = f.mk.value;
          if (!mk) { msg.textContent = 'Nhập mật khẩu.'; return; }
          nutOk.disabled = true; msg.textContent = '';
          const loi = await kiem(mk);
          nutOk.disabled = false;
          if (loi) { msg.textContent = loi; f.mk.select(); return; }
          kq = mk; close();
        });
      },
      onClose: () => done(kq)
    });
  });
}

/** Đặt / đổi mật khẩu xóa dữ liệu. daCo = server đã có mật khẩu. Trả true nếu đặt xong */
export function openPass(daCo) {
  return new Promise((done) => {
    let xong = false;
    openSheet({
      title: daCo ? 'Đổi mật khẩu xóa dữ liệu' : 'Đặt mật khẩu xóa dữ liệu', cls: 'narrow',
      body: `<form data-f novalidate>
        <p>${daCo ? 'Nhập mật khẩu hiện tại và mật khẩu mới.' : 'Nút xóa dữ liệu trên Google Sheet cần mật khẩu riêng. Để đặt lần đầu, nhập secret token (Google Sheet: menu 🐷 Penny → 📱 Kết nối PWA).'} Mật khẩu chỉ được lưu dạng mã băm trong Apps Script, không lưu trên máy.</p>
        ${daCo ? '<div class="fld"><label for="wp-cu">Mật khẩu hiện tại</label><input class="inp" id="wp-cu" name="cu" type="password" autocomplete="off" autofocus></div>'
          : '<div class="fld"><label for="wp-tk">Secret token</label><input class="inp" id="wp-tk" name="tk" type="password" autocomplete="off" spellcheck="false" autofocus></div>'}
        <div class="fld"><label for="wp-m1">Mật khẩu mới (ít nhất 6 ký tự)</label><input class="inp" id="wp-m1" name="m1" type="password" autocomplete="new-password"></div>
        <div class="fld"><label for="wp-m2">Nhập lại mật khẩu mới</label><input class="inp" id="wp-m2" name="m2" type="password" autocomplete="new-password"></div>
        <div class="okmsg no" data-msg role="status"></div>
        <div class="btns"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu mật khẩu</button></div></form>`,
      onMount: (b, close) => {
        const f = b.querySelector('[data-f]'), msg = b.querySelector('[data-msg]');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const m1 = f.m1.value;
          if (m1.length < 6) { msg.textContent = 'Mật khẩu cần ít nhất 6 ký tự.'; return; }
          if (m1 !== f.m2.value) { msg.textContent = 'Hai lần nhập mật khẩu mới không giống nhau.'; return; }
          if (!canMang()) return;
          try {
            await sy.api('dat_mk_xoa', daCo ? { mk_cu: f.cu.value, mk_moi: m1 } : { token_nhap: f.tk.value.trim(), mk_moi: m1 });
          } catch (er) { msg.textContent = er.message; return; }
          xong = true; toast('Đã lưu mật khẩu xóa dữ liệu'); close();
        });
      },
      onClose: () => done(xong)
    });
  });
}

/** Nút đổi mật khẩu trong Cài đặt */
export async function passAct() {
  if (!canMang()) return;
  let p;
  try { p = await sy.api('ping'); } catch (e) { toast(e.message); return; }
  await openPass(!!p.mk_xoa);
}

/** Nút xóa: pv = 'giao_dich' | 'tat_ca' */
export async function wipeAct(pv) {
  const info = PHAM_VI[pv];
  if (!canMang()) return;
  let p;
  try { p = await sy.api('ping'); } catch (e) { toast(e.message); return; }
  if (!p.mk_xoa && !(await openPass(false))) return;
  // 1) mật khẩu (kiểm tra ở Apps Script)
  const mk = await hoiMk({
    title: info.ten, mo: esc(info.mo),
    kiem: async (x) => { try { await sy.api('kiem_mk_xoa', { mk: x }); return ''; } catch (e) { return e.message; } }
  });
  if (mk == null) return;
  // 2) hỏi xác nhận lại 1 lần
  const chac = await confirmBox(`${info.ten} trên máy này và Google Sheet? Không hoàn tác được trong app. Apps Script tạo bản sao lưu Google Sheet trong Drive của bạn trước khi xóa.${S.pending ? ` ${S.pending} thay đổi chưa đồng bộ trên máy này cũng bị bỏ.` : ''}`, 'Xóa hẳn', true);
  if (!chac) return;
  toast('Đang sao lưu và xóa trên Google Sheet…', 20000);
  let r;
  try { await sy.sync().catch(() => null); r = await sy.api('xoa_du_lieu', { mk, pham_vi: pv }); } catch (e) { toast('Chưa xóa: ' + e.message, 5000); return; }
  // 3) dọn trên máy: bỏ hàng đợi, kéo lại toàn bộ từ Sheet
  await db.clear('queue');
  S.pending = 0;
  try { localStorage.removeItem('penny_nhac_the'); } catch (e) { /* bỏ qua */ }
  await sy.sync({ full: true });
  emit();
  const d = r.dem || {};
  openSheet({
    title: 'Đã xóa', cls: 'narrow',
    body: `<p>${pv === 'tat_ca' ? `Đã xóa ${d.Transactions || 0} giao dịch, ${d.Accounts || 0} ví, ${d.Categories || 0} danh mục, ${d.Keywords || 0} từ khóa, ${d.Budgets || 0} dòng ngân sách, ${d.People || 0} người.`
      : `Đã xóa ${d.Transactions || 0} giao dịch, đưa số dư đầu của ${d.so_du_ve_0 || 0} ví về 0.`}</p>
      <p>Bản sao lưu: <b>${esc(r.sao_luu && r.sao_luu.ten)}</b> trong Google Drive.${r.sao_luu && r.sao_luu.url ? ` <a href="${esc(r.sao_luu.url)}" target="_blank" rel="noopener">Mở bản sao lưu</a>` : ''}</p>
      <p class="hint">Máy khác đang mở Penny sẽ tự kéo lại dữ liệu ở lần đồng bộ sau.</p>
      <div class="btns"><button class="btn pri" data-x>Xong</button></div>`
  });
}
