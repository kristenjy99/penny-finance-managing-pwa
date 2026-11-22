// Thành phần giao diện dùng chung: icon, toast, bottom sheet / hộp thoại, chọn nhanh
import { esc, monthLabel, addMonths } from './util.js';

const sv = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON = {
  tx: sv('<path d="M4 7h16M4 12h16M4 17h11"/>'),
  cal: sv('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  stats: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12h8.5"/>'),
  wallet: sv('<rect x="3" y="5.5" width="18" height="13.5" rx="2"/><path d="M21 9.5h-5a2.5 2.5 0 0 0 0 5h5"/>'),
  budget: sv('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>'),
  debt: sv('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.8a3.3 3.3 0 0 1 2.6 3.2c0 1.6-1.1 2.9-2.6 3.2M18.5 14.5c1.8.8 3 2.7 3 5"/>'),
  set: sv('<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>')
};

// Heo đất (cùng hình với icon app): fg = màu heo, cut = màu khe/mắt (trùng nền ô)
export function piggySvg(fg = 'currentColor', cut = 'var(--tile)') {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(4.5 5.5) scale(.86)">
    <path d="M15 37c-4.5 0-7-2.6-6.2-5.6.5-2 2.6-2.4 3.4-1" fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <path d="M37.5 23.5 42 16.5 47.5 25.5z" fill="${fg}" stroke="${fg}" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="32" cy="36" rx="19.5" ry="15.5" fill="${fg}"/>
    <rect x="47" y="30" width="10" height="11" rx="4" fill="${fg}"/>
    <rect x="19.5" y="45" width="7.5" height="11" rx="2.5" fill="${fg}"/><rect x="37" y="45" width="7.5" height="11" rx="2.5" fill="${fg}"/>
    <rect x="25" y="23" width="13" height="3.4" rx="1.7" fill="${cut}"/><circle cx="42.5" cy="31" r="2.1" fill="${cut}"/><circle cx="51" cy="35.5" r="1.2" fill="${cut}"/>
  </g></svg>`;
}
export const piggyBtn = (act = '') => `<button class="piggy" ${act ? `data-act="${act}"` : 'tabindex="-1"'} aria-label="Penny">${piggySvg('var(--tile-fg)', 'var(--tile)')}</button>`;

export const isPC = () => matchMedia('(min-width: 900px)').matches;

// ---------- Toast ----------
let tt = null;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Bottom sheet (mobile) / hộp thoại giữa màn hình (PC) ----------
const stack = [];
export function openSheet({ title = '', body = '', cls = '', raw = false, onMount, onClose } = {}) {
  const layer = document.getElementById('layer');
  const shade = document.createElement('div');
  shade.className = 'shade';
  shade.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grip"></div>
    ${title ? `<div class="sheet-h"><h2>${esc(title)}</h2><button class="x" data-x aria-label="Đóng">✕</button></div>` : ''}
    <div class="${raw ? '' : 'sheet-b'}" data-body>${body}</div></div>`;
  layer.appendChild(shade);
  document.body.style.overflow = 'hidden';
  const el = shade.querySelector('.sheet');
  let closed = false;
  const close = (v) => {
    if (closed) return;
    closed = true;
    shade.remove();
    stack.splice(stack.indexOf(close), 1);
    if (!stack.length) document.body.style.overflow = '';
    if (onClose) onClose(v);
  };
  stack.push(close);
  shade.addEventListener('click', (e) => {
    if (e.target === shade || e.target.closest('[data-x]')) close();
  });
  if (onMount) onMount(el.querySelector('[data-body]'), close, el);
  const f = el.querySelector('[autofocus]');
  if (f) setTimeout(() => f.focus(), 50);
  return { el, close };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1](); });
export const closeAllSheets = () => [...stack].reverse().forEach((c) => c());

// Hỏi xác nhận
export function confirmBox(text, ok = 'Đồng ý', danger = false) {
  return new Promise((resolve) => {
    let v = false;
    openSheet({
      title: 'Xác nhận', cls: 'narrow',
      body: `<p>${esc(text)}</p><div class="btns"><button class="btn" data-x>Hủy</button><button class="btn pri ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button></div>`,
      onMount: (b, close) => b.querySelector('[data-ok]').onclick = () => { v = true; close(); },
      onClose: () => resolve(v)
    });
  });
}

// Hỏi 1 giá trị
export function ask({ title, label = '', value = '', placeholder = '', type = 'text', hint = '' }) {
  return new Promise((resolve) => {
    let v = null;
    openSheet({
      title, cls: 'narrow',
      body: `<form><div class="fld">${label ? `<label>${esc(label)}</label>` : ''}
        <input class="inp" name="v" autofocus value="${esc(value)}" placeholder="${esc(placeholder)}" ${type === 'money' ? 'inputmode="numeric"' : ''} type="${type === 'money' ? 'text' : type}" autocomplete="off">
        ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>
        <div class="btns" style="margin-top:6px"><button type="button" class="btn" data-x>Hủy</button><button class="btn pri">Lưu</button></div></form>`,
      onMount: (b, close) => {
        b.querySelector('form').onsubmit = (e) => { e.preventDefault(); v = b.querySelector('[name=v]').value; close(); };
      },
      onClose: () => resolve(v)
    });
  });
}

// Chọn 1 trong danh sách; options: [{v, label, sub, group}]
export function pickOne({ title, options, value, extra = '' }) {
  return new Promise((resolve) => {
    let v;
    let lastG = null;
    const html = options.map((o, i) => {
      let g = '';
      if (o.group && o.group !== lastG) { g = `<div class="opt-g">${esc(o.group)}</div>`; lastG = o.group; }
      return g + `<button class="opt ${o.v === value ? 'on' : ''}" data-i="${i}"><span>${esc(o.label)}${o.sub ? `<span class="sub" style="display:block;font-weight:500">${esc(o.sub)}</span>` : ''}</span>${o.v === value ? '✓' : ''}</button>`;
    }).join('');
    openSheet({
      title, cls: 'narrow', raw: true, body: html + extra,
      onMount: (b, close) => b.addEventListener('click', (e) => {
        const t = e.target.closest('[data-i]');
        if (t) { v = options[+t.dataset.i].v; close(); }
      }),
      onClose: () => resolve(v)
    });
  });
}

// Chọn tháng
export function monthPick(k) {
  return new Promise((resolve) => {
    let v = null;
    let y = +k.slice(0, 4);
    const draw = (b) => {
      b.innerHTML = `<div class="monthnav" style="border:0;margin-bottom:6px"><button data-y="-1" aria-label="Năm trước">‹</button><b>${y}</b><button data-y="1" aria-label="Năm sau">›</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding-bottom:8px">${Array.from({ length: 12 }, (_, i) => {
        const key = y + '-' + String(i + 1).padStart(2, '0');
        return `<button class="btn ${key === k ? 'pri' : ''}" data-m="${key}">Th ${i + 1}</button>`;
      }).join('')}</div>`;
    };
    openSheet({
      title: 'Chọn tháng', cls: 'narrow',
      onMount: (b, close) => {
        draw(b);
        b.addEventListener('click', (e) => {
          const t = e.target.closest('button');
          if (!t) return;
          if (t.dataset.y) { y += +t.dataset.y; draw(b); }
          if (t.dataset.m) { v = t.dataset.m; close(); }
        });
      },
      onClose: () => resolve(v)
    });
  });
}

// Nút tháng trên header: PC có ‹ ›, mobile bấm để chọn
export const monthPill = (k) => isPC()
  ? `<span class="pill"><button class="arr" data-act="mprev" aria-label="Tháng trước">‹</button><button class="mlbl" data-act="mpick" aria-label="Chọn tháng">${monthLabel(k)}</button><button class="arr" data-act="mnext" aria-label="Tháng sau">›</button></span>`
  : `<button class="pill" data-act="mpick" aria-label="Chọn tháng">${monthLabel(k)}</button>`;
export { addMonths };
