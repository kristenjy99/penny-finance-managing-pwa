// Penny v0.6.0 – đọc file sao kê trên thiết bị: CSV/TSV, Excel .xlsx, PDF (lớp chữ, trang scan -> OCR), ảnh (OCR)
// Thư viện trong lib/ chỉ được nạp khi cần (import động). Không gửi file đi đâu.
import { splitCsv } from './csv.js';
import { readXlsx } from './xlsxread.js';

const LIB = new URL('../lib/', import.meta.url).href;
export const LIB_LOI = 'Chưa tải được thư viện đọc ảnh/PDF. Lần đầu cần có mạng để tải (khoảng 2 MB cho PDF, 8 MB cho ảnh), sau đó dùng được khi không có mạng.';

export function kindOf(f) {
  const n = (f.name || '').toLowerCase(), t = f.type || '';
  if (/\.(csv|tsv|txt)$/.test(n) || /csv|tab-separated|text\/plain/.test(t)) return 'csv';
  if (/\.xlsx$/.test(n) || /spreadsheetml/.test(t)) return 'xlsx';
  if (/\.xls$/.test(n) || t === 'application/vnd.ms-excel') return 'xls';
  if (/\.pdf$/.test(n) || t === 'application/pdf') return 'pdf';
  if (/\.(jpe?g|png|webp|heic|heif|bmp|gif)$/.test(n) || /^image\//.test(t)) return 'img';
  return '';
}
export const KIND_LABEL = { csv: 'CSV', xlsx: 'XLSX', xls: 'XLS', pdf: 'PDF', img: 'ẢNH' };

// Văn bản CSV: UTF-8 (có/không BOM), UTF-16, hoặc Windows-1258 (Excel tiếng Việt cũ)
function decodeText(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u);
  if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch (e) { return new TextDecoder('windows-1258').decode(u); }
}

// Gom các mẩu chữ có tọa độ thành dòng + ô (dùng cho PDF và OCR)
// items: [{t, x0, x1, y, h}] ; y tăng dần từ trên xuống
export function toRows(items) {
  items = items.filter((i) => i.t && i.t.trim()).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const hs = items.map((i) => i.h).sort((a, b) => a - b);
  const hm = hs[Math.floor(hs.length / 2)] || 10;
  const lines = [];
  items.forEach((i) => {
    const l = lines.find((x) => Math.abs(x.y - i.y) < Math.max(hm, i.h) * 0.5);
    if (l) { l.items.push(i); l.y = (l.y * (l.items.length - 1) + i.y) / l.items.length; } else lines.push({ y: i.y, items: [i] });
  });
  lines.sort((a, b) => a.y - b.y);
  return lines.map((l) => {
    const it = l.items.sort((a, b) => a.x0 - b.x0);
    const cells = [];
    it.forEach((i) => {
      const c = cells[cells.length - 1];
      const gap = c ? i.x0 - c.x1 : Infinity;
      if (c && gap < Math.max(hm, i.h) * 0.9) { c.t += (gap > hm * 0.15 ? ' ' : '') + i.t; c.x1 = Math.max(c.x1, i.x1); }
      else cells.push({ t: i.t, x0: i.x0, x1: i.x1 });
    });
    cells.forEach((c) => { c.t = c.t.replace(/\s+/g, ' ').trim(); });
    return cells;
  });
}

// ---------- OCR (Tesseract.js, chạy trong Web Worker riêng) ----------
let ocrW = null, ocrLog = null;
async function ocrWorker() {
  if (ocrW) return ocrW;
  let T;
  try { T = (await import(LIB + 'tesseract/tesseract.esm.min.js')).default; } catch (e) { throw new Error(LIB_LOI); }
  ocrW = T.createWorker(['vie', 'eng'], 1, {
    workerPath: LIB + 'tesseract/worker.min.js', corePath: LIB + 'tesseract/core/', langPath: LIB + 'tesseract/lang/',
    workerBlobURL: false, gzip: true, cacheMethod: 'none',
    logger: (m) => { if (ocrLog) ocrLog(m); },
    errorHandler: () => {}
  }).then(async (w) => { await w.setParameters({ preserve_interword_spaces: '1' }); return w; })
    .catch((e) => { ocrW = null; throw new Error(LIB_LOI + ' (' + (e && e.message || e) + ')'); });
  return ocrW;
}
export async function endOcr() { if (ocrW) { const w = await ocrW.catch(() => null); ocrW = null; if (w) await w.terminate(); } }

// Ảnh -> canvas (phóng to ảnh nhỏ để chữ đủ lớn cho OCR)
async function toCanvas(src) {
  let bmp;
  if (src instanceof HTMLCanvasElement) return src;
  try { bmp = await createImageBitmap(src); } catch (e) {
    bmp = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('Không mở được ảnh (định dạng chưa hỗ trợ). Hãy chụp lại dạng JPG hoặc PNG.')); im.src = URL.createObjectURL(src); });
  }
  const w = bmp.width, h = bmp.height;
  const k = w < 1000 ? Math.min(2.5, 1400 / w) : w > 2600 ? 2600 / w : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}
async function ocr(src, onProg, nhan) {
  const w = await ocrWorker();
  const c = await toCanvas(src);
  ocrLog = (m) => { if (m.status === 'recognizing text') onProg({ text: nhan, p: m.progress }); else if (m.status) onProg({ text: 'Chuẩn bị đọc ảnh…', p: m.progress || 0 }); };
  const t0 = performance.now();
  const r = await w.recognize(c, {}, { blocks: true, text: true });
  ocrLog = null;
  const items = [];
  (r.data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((wd) => {
    if (wd.confidence < 15 && !/\d/.test(wd.text)) return;
    const bb = wd.bbox;
    items.push({ t: wd.text, x0: bb.x0, x1: bb.x1, y: (bb.y0 + bb.y1) / 2, h: bb.y1 - bb.y0 });
  }))));
  return { rows: toRows(items), ms: performance.now() - t0, conf: r.data.confidence };
}

// ---------- PDF (pdf.js) ----------
let pdfjs = null;
async function loadPdf() {
  if (pdfjs) return pdfjs;
  try { pdfjs = await import(LIB + 'pdfjs/pdf.min.mjs'); } catch (e) { throw new Error(LIB_LOI); }
  pdfjs.GlobalWorkerOptions.workerSrc = LIB + 'pdfjs/pdf.worker.min.mjs';
  return pdfjs;
}

/**
 * Đọc file -> { kind, rows, grid, pages, ocrPages, msPerPage, conf }
 * onProg({text, p}); askPass(lanSai) -> Promise<string|null> cho PDF có mật khẩu
 */
export async function readDoc(file, { onProg = () => {}, askPass = null } = {}) {
  const kind = kindOf(file);
  if (!kind) throw new Error('Chưa hỗ trợ loại file này. Chọn ảnh JPG/PNG, PDF, CSV hoặc Excel .xlsx.');
  if (file.size > 30 * 1024 * 1024) throw new Error('File quá lớn (trên 30 MB).');
  if (kind === 'xls') throw new Error('File Excel .xls (bản cũ) chưa đọc được. Mở file bằng Excel hoặc Google Sheets rồi lưu lại thành .xlsx hoặc CSV, sau đó chọn lại.');
  if (kind === 'csv') { onProg({ text: 'Đang đọc CSV…', p: 0.5 }); return { kind, grid: true, rows: splitCsv(decodeText(await file.arrayBuffer())).map((r) => r.cells), pages: 1 }; }
  if (kind === 'xlsx') {
    onProg({ text: 'Đang đọc Excel…', p: 0.5 });
    const buf = await file.arrayBuffer();
    const u = new Uint8Array(buf, 0, 4);
    if (u[0] === 0xD0 && u[1] === 0xCF) throw new Error('File này thực chất là Excel .xls (bản cũ) hoặc có mật khẩu. Lưu lại thành .xlsx (không mật khẩu) hoặc CSV rồi chọn lại.');
    return { kind, grid: true, rows: await readXlsx(buf), pages: 1 };
  }
  if (kind === 'img') {
    onProg({ text: 'Đang nạp bộ đọc chữ (OCR)…', p: 0 });
    const r = await ocr(file, onProg, 'Đang đọc chữ trong ảnh');
    return { kind, grid: false, rows: r.rows, pages: 1, ocrPages: 1, msPerPage: Math.round(r.ms), conf: r.conf };
  }
  // PDF
  onProg({ text: 'Đang nạp bộ đọc PDF…', p: 0 });
  const lib = await loadPdf();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc = null, task = null, pass, lan = 0;
  for (;;) {
    try { task = lib.getDocument({ data: data.slice(), password: pass, isEvalSupported: false, verbosity: 0 }); doc = await task.promise; break; } catch (e) {
      if (e && e.name === 'PasswordException' && askPass) { pass = await askPass(lan++ > 0); if (pass == null) throw new Error('Đã hủy: PDF có mật khẩu.'); continue; }
      throw new Error(e && e.name === 'PasswordException' ? 'PDF có mật khẩu.' : 'Không mở được PDF: ' + (e && e.message || e));
    }
  }
  const rows = [], n = doc.numPages;
  let ocrPages = 0, msOcr = 0, conf = 0;
  const t0 = performance.now();
  for (let i = 1; i <= doc.numPages; i++) {
    onProg({ text: `Đang đọc trang ${i}/${doc.numPages}`, p: (i - 1) / doc.numPages });
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((x) => x.str).map((x) => {
      const h = Math.hypot(x.transform[2], x.transform[3]) || x.height || 8;
      return { t: x.str, x0: x.transform[4], x1: x.transform[4] + x.width, y: vp.height - x.transform[5] - h / 2, h };
    });
    const soChu = items.reduce((a, x) => a + x.t.replace(/\s/g, '').length, 0);
    if (soChu >= 30) { rows.push(...toRows(items)); continue; }
    // Trang scan (không có lớp chữ): vẽ ra ảnh rồi OCR
    const k = Math.min(3, 2200 / vp.width);
    const v2 = page.getViewport({ scale: k });
    const c = document.createElement('canvas');
    c.width = Math.round(v2.width); c.height = Math.round(v2.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: v2, canvas: c }).promise;
    const r = await ocr(c, (x) => onProg({ text: `Trang ${i}/${doc.numPages}: ${x.text}`, p: (i - 1 + (x.p || 0)) / doc.numPages }), 'đang đọc chữ (OCR)');
    rows.push(...r.rows);
    ocrPages++; msOcr += r.ms; conf += r.conf;
  }
  const ms = performance.now() - t0;
  await task.destroy();
  return { kind, grid: false, rows, pages: n, ocrPages, msPerPage: Math.round(ocrPages ? msOcr / ocrPages : ms / Math.max(1, doc.numPages)), conf: ocrPages ? conf / ocrPages : undefined };
}
