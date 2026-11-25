// Penny v0.8.0 – biểu đồ đường + cột đôi (SVG tự co theo khung) và thẻ thống kê Ví 6 tháng
import * as U from './util.js';
import { esc, num, MINUS } from './util.js';
import * as st from './store.js';

// Số rút gọn cho trục và hàng giá trị: 950k, 1,2tr, 3,5 tỷ
export function compact(v) {
  const a = Math.abs(v), s = v < 0 ? MINUS : '';
  const f = (x) => String(+x.toFixed(x >= 100 ? 0 : 1)).replace('.', ',');
  if (a >= 1e9) return s + f(a / 1e9) + ' tỷ';
  if (a >= 1e6) return s + f(a / 1e6) + 'tr';
  if (a >= 1e3) return s + Math.round(a / 1e3) + 'k';
  return s + num(a);
}
// Bước chia trục "đẹp" (1, 2, 5 × 10^n)
function nice(x) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
function scale(vals, H, T, B) {
  let mx = Math.max(0, ...vals), mn = Math.min(0, ...vals);
  if (mx === mn) mx = mn + 1000;
  const step = nice((mx - mn) / 3);
  mx = Math.ceil(mx / step) * step; mn = Math.floor(mn / step) * step;
  const y = (v) => T + (mx - v) / (mx - mn) * (H - T - B);
  const ticks = []; for (let v = mn; v <= mx + step / 2; v += step) ticks.push(v);
  return { y, ticks };
}
const axis = (s, W, L, R) => s.ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${s.y(v).toFixed(1)}" y2="${s.y(v).toFixed(1)}" class="${v === 0 ? 'z' : 'g'}"/><text x="${L - 6}" y="${(s.y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${compact(v)}</text>`).join('');

/** Biểu đồ đường. pts: [{lb, v (null = chưa tới), t (chú thích)}]; o: {W, H, cls (inc|exp|acc), nhan} */
export function lineSvg(pts, o = {}) {
  const ex = (o.rows || []).length * 16, W = o.W || 360, H = (o.H || 170) + ex, L = 42, R = 8, T = 10, B = 24 + ex;
  const vs = pts.filter((p) => p.v != null).map((p) => p.v);
  const s = scale(vs.length ? vs : [0], H, T, B);
  const cw = (W - L - R) / pts.length, x = (i) => L + cw * (i + 0.5);
  const xy = pts.map((p, i) => (p.v == null ? null : [x(i).toFixed(1), s.y(p.v).toFixed(1)]));
  const line = xy.filter(Boolean).map((a) => a.join(',')).join(' ');
  const buoc = pts.length > 8 && W < 500 ? 2 : 1;
  return `<svg class="lchart ${o.cls || 'acc'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.nhan || '')}">${axis(s, W, L, R)}
    ${line ? `<polyline points="${line}" class="ln"/>` : ''}
    ${xy.map((a, i) => (a ? `<circle cx="${a[0]}" cy="${a[1]}" r="3.6" class="dt"><title>${esc(pts[i].t || pts[i].lb)}: ${(pts[i].v < 0 ? MINUS : '') + num(pts[i].v)} đ</title></circle>` : '')).join('')}
    ${pts.map((p, i) => (i % buoc === 0 ? `<text x="${x(i).toFixed(1)}" y="${H - ex - 6}" text-anchor="middle" class="ax">${esc(p.lb)}</text>` : '')).join('')}${valRows(o.rows, x, H - ex)}</svg>`;
}

/** Cột đôi thu (trái) – chi (phải) theo từng mốc. pts: [{lb, a (thu), b (chi), t}] */
export function pairBars(pts, o = {}) {
  const ex = (o.rows || []).length * 16, W = o.W || 360, H = (o.H || 170) + ex, L = 42, R = 8, T = 10, B = 24 + ex;
  const s = scale(pts.flatMap((p) => [p.a, p.b]), H, T, B);
  const cw = (W - L - R) / pts.length, bw = Math.min(16, cw * 0.28);
  const bar = (cx, v, c, t) => { const y0 = s.y(0), y1 = s.y(v); return v ? `<rect x="${cx.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - y1)).toFixed(1)}" class="${c}"><title>${esc(t)}: ${num(v)} đ</title></rect>` : ''; };
  return `<svg class="pbars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.nhan || 'Thu và chi theo tháng')}">${axis(s, W, L, R)}
    ${pts.map((p, i) => { const c = L + cw * (i + 0.5); return bar(c - bw - 1.5, p.a, 'bi', (p.t || p.lb) + ' · thu') + bar(c + 1.5, p.b, 'be', (p.t || p.lb) + ' · chi'); }).join('')}
    ${pts.map((p, i) => `<text x="${(L + cw * (i + 0.5)).toFixed(1)}" y="${H - ex - 6}" text-anchor="middle" class="ax">${esc(p.lb)}</text>`).join('')}${valRows(o.rows, (i) => L + cw * (i + 0.5), H - ex)}</svg>`;
}

// Hàng giá trị dưới nhãn mốc (vẽ trong SVG nên luôn thẳng cột): rows = [[lớp màu, giá trị[]], ...]
const valRows = (rows, x, y0) => (rows || []).map(([c, vs], r) => vs.map((v, i) => `<text x="${x(i).toFixed(1)}" y="${y0 + 12 + r * 16}" text-anchor="middle" class="vv ${c}">${esc(v)}</text>`).join('')).join('');

/** Thẻ thống kê 6 tháng (kết thúc ở tháng đang xem). ten = '' → mọi ví (tổng số dư), có tên → riêng ví đó */
export function walletStats(ten = '', pc = false) {
  const ks = []; for (let i = 5; i >= 0; i--) ks.push(U.addMonths(S().month, -i));
  const cur = U.ym(U.today());
  const lb = (k) => 'T' + +k.slice(5);
  const data = ks.map((k) => {
    if (k > cur) return { k, bal: null, thu: 0, chi: 0 };
    if (!ten) { const s = st.totals(st.inMonth(k)); return { k, bal: st.netWorth(k).total, thu: s.thu, chi: s.chi }; }
    const w = st.wallets(k).find((x) => x.ten_vi === ten) || { bal: 0, thu: 0, chi: 0 };
    return { k, bal: w.bal, thu: w.thu, chi: w.chi };
  });
  const W = 360; // thẻ thống kê luôn nằm trong cột hẹp (mobile, hoặc cột phải ở PC)
  const bal = data[data.length - 1].bal;
  const balLast = data.filter((d) => d.bal != null).pop();
  return `<div class="vstat"><div class="vs-h"><span>${ten ? 'Số dư ví' : 'Tổng số dư'} 6 tháng</span><b class="num ${balLast && balLast.bal < 0 ? 'exp' : ''}">${balLast ? (balLast.bal < 0 ? MINUS : '') + num(balLast.bal) + ' đ' : ''}</b></div>
    ${lineSvg(data.map((d) => ({ lb: lb(d.k), v: d.bal, t: 'Cuối tháng ' + U.monthLabel(d.k) })), { W, H: 150, cls: bal != null && bal < 0 ? 'exp' : 'acc', nhan: 'Số dư cuối mỗi tháng', rows: [['', data.map((d) => (d.bal == null ? '' : compact(d.bal)))]] })}
    <div class="vs-h vs-h2"><span>Thu – Chi theo tháng</span><span class="lgd"><i class="bi"></i>Thu<i class="be"></i>Chi</span></div>
    ${pairBars(data.map((d) => ({ lb: lb(d.k), a: d.thu, b: d.chi, t: 'Tháng ' + U.monthLabel(d.k) })), { W, H: 150, rows: [['inc', data.map((d) => (d.thu ? compact(d.thu) : '0'))], ['exp', data.map((d) => (d.chi ? compact(d.chi) : '0'))]] })}</div>`;
}
const S = () => st.S;
