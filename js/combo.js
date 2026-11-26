// Penny v0.10.0 – ô chọn có tìm kiếm (combobox): gõ để lọc danh sách, chọn bằng chuột / phím, gõ tên mới nếu chưa có
import * as U from './util.js';
import { esc } from './util.js';

let dem = 0;
/** HTML ô chọn. o: {name, value, options[], label, placeholder, newLabel (vd 'Nhóm mới')} */
export function comboHtml(o) {
  const id = 'cb' + (++dem);
  return `<div class="fld combo" data-combo data-new="${esc(o.newLabel || 'Thêm mới')}">
    ${o.label ? `<label for="${id}">${esc(o.label)}</label>` : ''}
    <input class="inp" id="${id}" name="${esc(o.name)}" value="${esc(o.value || '')}" placeholder="${esc(o.placeholder || 'Gõ để tìm…')}" autocomplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-l">
    <span class="cb-ar" aria-hidden="true">▾</span>
    <div class="cb-list" id="${id}-l" role="listbox" hidden>${(o.options || []).map((x) => `<div class="cb-o" role="option" data-o="${esc(x)}">${esc(x)}</div>`).join('')}</div></div>`;
}

/** Gắn hành vi cho mọi ô chọn trong root. onPick(name, value) gọi khi chọn xong (tùy chọn) */
export function comboMount(root, onPick) {
  root.querySelectorAll('[data-combo]').forEach((w) => {
    if (w.dataset.mounted) return;
    w.dataset.mounted = '1';
    const inp = w.querySelector('input'), list = w.querySelector('.cb-list');
    const opts = [...list.querySelectorAll('[data-o]')].map((x) => x.dataset.o);
    let act = -1;
    const shown = () => [...list.querySelectorAll('.cb-o')];
    const draw = () => {
      const q = U.boDau(inp.value.trim());
      const loc = q ? opts.filter((x) => U.boDau(x).includes(q)) : opts;
      // khớp từ đầu xếp trước
      loc.sort((a, b) => (U.boDau(a).startsWith(q) ? 0 : 1) - (U.boDau(b).startsWith(q) ? 0 : 1));
      const moi = inp.value.trim() && !opts.some((x) => U.boDau(x) === q);
      list.innerHTML = loc.map((x) => `<div class="cb-o" role="option" data-o="${esc(x)}" aria-selected="${x === inp.value}">${esc(x)}</div>`).join('')
        + (moi ? `<div class="cb-o cb-new" role="option" data-o="${esc(U.nfc(inp.value.trim()))}">＋ ${esc(w.dataset.new)} “${esc(U.nfc(inp.value.trim()))}”</div>` : '')
        + (!loc.length && !moi ? '<div class="cb-none">Không có mục khớp</div>' : '');
      act = -1;
    };
    const open = () => { draw(); list.hidden = false; inp.setAttribute('aria-expanded', 'true'); };
    const shut = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; };
    const pick = (v) => { inp.value = v; shut(); inp.dispatchEvent(new Event('input', { bubbles: true })); list.hidden = true; if (onPick) onPick(inp.name, v); };
    const mark = () => shown().forEach((x, i) => { x.classList.toggle('act', i === act); if (i === act) x.scrollIntoView({ block: 'nearest' }); });
    inp.addEventListener('focus', open);
    inp.addEventListener('click', open);
    inp.addEventListener('input', (e) => { if (e.isTrusted && document.activeElement === inp) open(); });
    w.querySelector('.cb-ar').addEventListener('click', () => { if (list.hidden) { inp.focus(); open(); } else shut(); });
    inp.addEventListener('keydown', (e) => {
      const xs = shown();
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); act = Math.min(xs.length - 1, act + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(); }
      else if (e.key === 'Enter' && !list.hidden && xs.length) { e.preventDefault(); pick((xs[act >= 0 ? act : 0]).dataset.o); }
      else if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); shut(); }
      else if (e.key === 'Tab') shut();
    });
    // mousedown để chọn trước khi ô nhập mất tiêu điểm
    list.addEventListener('mousedown', (e) => { const o = e.target.closest('[data-o]'); if (o) { e.preventDefault(); pick(o.dataset.o); } });
    list.addEventListener('click', (e) => { const o = e.target.closest('[data-o]'); if (o) pick(o.dataset.o); });
    inp.addEventListener('blur', () => setTimeout(shut, 150));
  });
}
