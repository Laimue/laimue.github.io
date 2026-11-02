// Offline: open Thai fonts -> centre lines of every app letter -> ../refs.json (with crowd.py's averages if present).
// Run: node tools/fonts.js   (downloads into tools/cache, which is not committed)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(__dirname, 'cache');
const opentype = require(path.join(ROOT, 'lib/opentype.min.js')), H = require(path.join(ROOT, 'hand.js'));
fs.mkdirSync(CACHE, { recursive: true });

// Google Fonts (OFL) folder -> kind. hand: handwriting; looped / loopless: typed Thai with or without head loops.
const GOOGLE = {
  mali: 'hand', itim: 'hand', charm: 'hand', charmonman: 'hand', srisakdi: 'hand', playpensansthai: 'hand',
  sarabun: 'looped', niramit: 'looped', kodchasan: 'looped', koho: 'looped', krub: 'looped', k2d: 'looped', fahkwang: 'looped',
  thasadith: 'looped', taviraj: 'looped', trirong: 'looped', pridi: 'looped', maitree: 'looped', chonburi: 'looped', pattaya: 'looped',
  notosansthailooped: 'looped', notoserifthai: 'looped', ibmplexsansthailooped: 'looped', notoloopedthai: 'looped',
  prompt: 'loopless', kanit: 'loopless', mitr: 'loopless', athiti: 'loopless', anuphan: 'loopless', baijamjuree: 'loopless',
  chakrapetch: 'loopless', notosansthai: 'loopless', ibmplexsansthai: 'loopless',
};
const TLWG = { Purisa: 'hand', Garuda: 'looped', Kinnari: 'looped', Loma: 'looped', Norasi: 'looped', Sawasdee: 'looped', Umpush: 'looped',
  Waree: 'looped', Laksaman: 'looped', TlwgTypist: 'looped', TlwgTypo: 'looped' };
const TLWG_ZIP = 'https://github.com/tlwg/fonts-tlwg/releases/download/v0.7.4/ttf-tlwg-0.7.4.zip';

const get = async (url, file) => {
  if (fs.existsSync(file)) return file;
  const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file;
};
async function googleFont(dir) { // the Regular file, else the variable font (its default instance is regular)
  const r = spawnSync('gh', ['api', 'repos/google/fonts/contents/ofl/' + dir], { encoding: 'utf8' });
  if (r.status) return null;
  const ls = JSON.parse(r.stdout).filter(f => /\.ttf$/.test(f.name) && !/Italic/.test(f.name));
  const f = ls.find(f => /-Regular\.ttf$/.test(f.name)) || ls.find(f => /\[/.test(f.name)) || ls[0];
  return f && get(f.download_url, path.join(CACHE, f.name));
}
async function tlwgFonts() {
  const zip = await get(TLWG_ZIP, path.join(CACHE, 'ttf-tlwg.zip')), dir = path.join(CACHE, 'tlwg');
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir); spawnSync(process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/tar.exe') : 'bsdtar', ['-xf', zip, '-C', dir]); } // bsdtar reads zip, GNU tar doesn't
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name)); };
  walk(dir);
  return Object.entries(TLWG).map(([n, kind]) => [n, kind, all.find(f => path.basename(f) === n + '.ttf')]).filter(x => x[2]);
}

const CHARS = H.GROUPS.filter((_, i) => i !== 5 && i !== 7).map(g => g[1]).join(''); // Thai, digits, rare letters (no symbols/English)
function resample(a, step) { // points every `step` along the stroke, ends kept
  const o = [a[0], a[1]]; let left = step;
  for (let i = 2; i < a.length; i += 2) {
    let x = a[i - 2], y = a[i - 1]; let d = Math.hypot(a[i] - x, a[i + 1] - y);
    while (d >= left) { const t = left / d; x += (a[i] - x) * t; y += (a[i + 1] - y) * t; o.push(x, y); d -= left; left = step; }
    left -= d;
  }
  o.push(a[a.length - 2], a[a.length - 1]); return o;
}
const delta = a => { const q = a.map(v => Math.round(v * 100)); return q.map((v, i) => (i > 1 ? v - q[i - 2] : v)); }; // 0.01 steps from the previous point
function lines(font, ch, k) { // centre line strokes of one letter, box units
  const v = H.fontVariant(font, ch, k); if (!v) return null;
  const st = H._trace(H._look(v, 0)).filter(a => a.length >= 6).map(a => delta(resample(a, 0.05)));
  return st.length ? st : null;
}

(async () => {
  const fonts = [];
  for (const [dir, kind] of Object.entries(GOOGLE)) {
    try { const f = await googleFont(dir); if (f) fonts.push([dir, kind, f]); else console.log('skip', dir); } catch (e) { console.log('skip', dir, e.message); }
  }
  try { fonts.push(...await tlwgFonts()); } catch (e) { console.log('skip TLWG', e.message); }
  const refs = [], g = {};
  for (const [name, kind, file] of fonts) {
    let font; try { font = opentype.parse(fs.readFileSync(file).buffer); } catch (e) { console.log('bad font', name, e.message); continue; }
    const kg = font.charToGlyph('ก'); if (!kg || !kg.index) { console.log('no Thai', name); continue; }
    const bb = kg.getBoundingBox(), k = 1 / (bb.y2 - bb.y1); // same rule as Sriracha's K: ก is 1 box unit tall
    const idx = refs.length; let n = 0;
    for (const ch of CHARS) { const st = lines(font, ch, k); if (st) { (g[ch] = g[ch] || []).push([idx, st]); n++; } }
    refs.push({ name, kind, w: { crowd: 3, hand: 3, looped: 2, loopless: 1 }[kind] });
    console.log(name, kind, n + ' letters');
  }
  const crowd = path.join(__dirname, 'crowd.json'); // written by crowd.py: {refs:[...], g:{ch:[[i, centre-line cells {x0,y0,nx,ny,sk}]]}}, i local to its refs
  if (fs.existsSync(crowd)) {
    const c = JSON.parse(fs.readFileSync(crowd, 'utf8')), base = refs.length;
    refs.push(...c.refs);
    for (const ch in c.g) for (const [i, q] of c.g[ch]) {
      if (!CHARS.includes(ch)) continue;
      const sk = new Uint8Array(q.nx * q.ny); for (const k of q.sk) sk[k] = 1;
      const st = H._trace({ g: q, sk }).filter(a => a.length >= 6).map(a => delta(resample(a, 0.05)));
      if (st.length) (g[ch] = g[ch] || []).push([base + i, st]);
    }
    console.log('crowd', c.refs.length, 'groups');
  }
  const out = JSON.stringify({ v: 1, refs, g });
  fs.writeFileSync(path.join(ROOT, 'refs.json'), out);
  console.log(refs.length + ' refs, ' + (out.length / 1e6).toFixed(2) + ' MB; fewest refs per letter: ' + Math.min(...[...CHARS].map(ch => (g[ch] || []).length)));
})();
