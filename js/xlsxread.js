// Penny v0.6.0 – đọc sheet đầu tiên của file Excel .xlsx -> mảng dòng (chuỗi)
import { openZip } from './unzip.js';

const unXml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
const chu = (xml) => { let s = ''; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (m, t) => { s += unXml(t); }); return s; };
const p2 = (n) => String(n).padStart(2, '0');
// Số serial Excel (1900) -> dd/mm/yyyy [HH:MM]
export function serialDate(v) {
  const ms = Math.round((v - 25569) * 86400000);
  const d = new Date(ms);
  if (isNaN(d)) return String(v);
  const s = p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  const frac = v - Math.floor(v);
  return frac > 1e-6 ? s + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) : s;
}
const colNo = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export async function readXlsx(buf) {
  const z = openZip(buf);
  if (!z.names.includes('xl/workbook.xml')) throw new Error('File .xlsx không có workbook');
  const wb = await z.text('xl/workbook.xml');
  const rels = await z.text('xl/_rels/workbook.xml.rels');
  const s1 = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || wb.match(/<sheet\b[^>]*\bid="([^"]+)"/);
  let path = 'xl/worksheets/sheet1.xml';
  if (s1) {
    const r = rels.match(new RegExp('<Relationship\\b[^>]*Id="' + s1[1] + '"[^>]*>')) ;
    const tg = r && r[0].match(/Target="([^"]+)"/);
    if (tg) path = tg[1].startsWith('/') ? tg[1].slice(1) : 'xl/' + tg[1].replace(/^\.\//, '');
  }
  const ss = [];
  (await z.text('xl/sharedStrings.xml')).replace(/<si>([\s\S]*?)<\/si>/g, (m, x) => { ss.push(chu(x)); });
  // Kiểu ô ngày theo styles.xml
  const st = await z.text('xl/styles.xml');
  const fmt = {};
  st.replace(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g, (m, id, c) => { fmt[id] = unXml(c); });
  const xfs = [];
  const cx = st.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/);
  if (cx) cx[0].replace(/<xf\b[^>]*?numFmtId="(\d+)"/g, (m, id) => { xfs.push(+id); });
  const laNgay = (s) => {
    const id = xfs[+s];
    if (id == null) return false;
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const c = (fmt[id] || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(c) || /m{1,2}[/.\-]/i.test(c);
  };
  const xml = await z.text(path);
  if (!xml) throw new Error('Không thấy sheet đầu tiên');
  const rows = [];
  xml.replace(/<row\b[^>]*\/>/g, '').replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, (m, body) => {
    const row = [];
    (body || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m2, at, inner) => {
      const ref = (at.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const t = (at.match(/\bt="(\w+)"/) || [])[1] || 'n';
      const s = (at.match(/\bs="(\d+)"/) || [])[1];
      inner = inner || '';
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = ss[+v] || '';
      else if (t === 'inlineStr') val = chu(inner);
      else if (t === 'str' || t === 'e') val = v == null ? '' : unXml(v);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) val = s != null && laNgay(s) && +v > 1000 && +v < 120000 ? serialDate(+v) : String(+v);
      const j = ref ? colNo(ref) : row.length;
      row[j] = val;
    });
    for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
    rows.push(row);
  });
  return rows;
}
