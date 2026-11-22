// Penny v0.6.0 – đọc file ZIP (dùng cho .xlsx): giải nén deflate bằng DecompressionStream có sẵn
// trong trình duyệt; trình duyệt cũ không có 'deflate-raw' thì dùng lib/fflate.js
let fflate = null;
async function inflate(u8) {
  try {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  } catch (e) {
    if (!fflate) fflate = await import(new URL('../lib/fflate.js', import.meta.url).href);
    return fflate.inflateSync(u8);
  }
}
/** buf: ArrayBuffer -> { names: [], read(name) -> Promise<Uint8Array>, text(name) -> Promise<string> } */
export function openZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Không phải file ZIP/.xlsx hợp lệ');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const ent = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    ent.set(dec.decode(u8.subarray(p + 46, p + 46 + ln)), { method, csize, off });
    p += 46 + ln + lx + lc;
  }
  const read = async (name) => {
    const x = ent.get(name);
    if (!x) return null;
    const s = x.off + 30 + dv.getUint16(x.off + 26, true) + dv.getUint16(x.off + 28, true);
    const data = u8.subarray(s, s + x.csize);
    if (x.method === 0) return data;
    if (x.method === 8) return inflate(data);
    throw new Error('Kiểu nén chưa hỗ trợ: ' + x.method);
  };
  return { names: [...ent.keys()], read, text: async (name) => { const d = await read(name); return d ? dec.decode(d) : ''; } };
}
