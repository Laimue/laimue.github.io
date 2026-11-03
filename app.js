'use strict';
const H = window.Hand, $ = s => document.querySelector(s), NS = 'http://www.w3.org/2000/svg';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('lm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lm.' + k, JSON.stringify(v)); } catch { /* per-device convenience only */ } },
};
function doneToast(msg) { toast(msg, 2500); const t = $('#toast'), d = document.createElement('span'); d.className = 'lot tick'; t.prepend(d); M.icon(d, 'done'); }
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms); }
addEventListener('error', e => toast('Error: ' + e.message, 8000));
addEventListener('unhandledrejection', e => toast('Error: ' + (e.reason && e.reason.message || e.reason), 8000));

// ---------- storage: this person's handwriting lives only on this device (IndexedDB)
const db = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('laimue', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then(d => new Promise((res, rej) => {
    const t = d.transaction('kv', mode), q = fn(t.objectStore('kv'));
    t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error);
  }));
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)) };
})();

let hand = { v: 1, g: {} }, font = null, saveT;
const fbCache = {};
const fb = ch => (ch in fbCache ? fbCache[ch] : (fbCache[ch] = font ? H.fontVariant(font, ch) : null));
const saveHand = () => { clearTimeout(saveT); saveT = setTimeout(() => db.set('hand', hand).catch(() => toast('Could not save on this device — use ⋯ → Save my handwriting file.', 6000)), 300); };

// ---------- files in / out
function validHand(o) { // trust boundary: a handwriting file someone picked
  if (!o || typeof o !== 'object' || !o.g || typeof o.g !== 'object') return null;
  const g = {};
  for (const [ch, list] of Object.entries(o.g)) {
    if ([...ch].length !== 1 || !Array.isArray(list)) continue;
    g[ch] = list.slice(0, 5).map(v => (v && Array.isArray(v.s) && v.s.length && v.s.every(a => Array.isArray(a) && a.length >= 2 && a.length % 2 === 0 && a.length <= 20000 && a.every(Number.isFinite)) ? { s: v.s } : null));
  }
  return { v: 1, g };
}
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const mobile = navigator.maxTouchPoints > 1 && /iPad|iPhone|Macintosh|Android/.test(navigator.userAgent);
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') return offerShare(file); // tap expired while the PDF was being made
    }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function offerShare(file) {
  const t = $('#toast'), b = document.createElement('button'); clearTimeout(toast.h);
  b.textContent = 'Tap to share or save ' + file.name;
  b.onclick = () => { t.hidden = true; navigator.share({ files: [file] }).catch(() => {}); };
  t.textContent = ''; t.append(b); t.hidden = false;
}
const saveHandFile = () => saveFile(new Blob([JSON.stringify(hand)], { type: 'application/json' }), 'laimue-handwriting.json');
async function loadHandFile(file) {
  let h = null; try { h = validHand(JSON.parse(await file.text())); } catch { }
  if (!h) return toast('That is not a LaiMue handwriting file.');
  if (taught() && !confirm('Replace the handwriting on this device with this file?')) return;
  hand = h; saveHand(); renderTeach(); if (sheet) sheet.pages.forEach(renderInk); toast('Handwriting loaded');
}
function clearHand() {
  if (!taught()) return toast('There are no letters to clear yet.');
  if (!confirm('Erase ALL the letters you wrote on this device and start again? This cannot be undone. If you might want them back, tap Cancel and use "Save my handwriting file" first.')) return;
  hand = { v: 1, g: {} }; saveHand(); renderTeach(); if (sheet) sheet.pages.forEach(renderInk); toast('All letters cleared. Write them again on the Teach tab.');
}

// ---------- Teach screen: one big pad for the current letter + a strip of every letter; the chosen version (1-5)
const CHARS = H.GROUPS.flatMap(([group, s], gi) => [...s].map(ch => ({ ch, group, gi })));
const REQ = CHARS.filter(c => c.gi < H.REQUIRED_GROUPS), N = CHARS.length;
const clampI = i => Math.max(0, Math.min(i | 0, N - 1));
let cur = clampI(LS.get('cur', LS.get('page', 0) * 24)), ver = Math.max(0, Math.min(LS.get('ver', 0) | 0, 4)); // 'page' = the v15 pages of 24
let penSeen = LS.get('pen', false), drawing = null, fresh = false, dirty = false, advT = 0, sparkStop = null, lastDone = -1;
const chips = [];
const count = ch => (hand.g[ch] || []).filter(v => v && v.s.length).length;
const taught = () => REQ.filter(c => count(c.ch)).length;
const label = ch => (H.needsGhost(ch) ? '◌' : '') + ch;
const slots = ch => hand.g[ch] || (hand.g[ch] = [null, null, null, null, null]);
const vOf = (i, v = ver) => (hand.g[CHARS[i].ch] || [])[v] || null;
const padCv = () => $('#pad');

function strokeLine(x, a) { x.beginPath(); x.moveTo(a[0], a[1]); if (a.length === 2) x.lineTo(a[0] + 0.001, a[1]); for (let j = 2; j < a.length; j += 2) x.lineTo(a[j], a[j + 1]); x.stroke(); }
function fillPolys(x, polys) { x.beginPath(); for (const a of polys) { x.moveTo(a[0], a[1]); for (let j = 2; j < a.length; j += 2) x.lineTo(a[j], a[j + 1]); x.closePath(); } x.fill(); }
// sideways shift that centres a letter's typed hint (with its ก ghost for marks) in the box; the font puts every glyph at its own left bearing
const midC = {};
function midDx(ch) {
  if (ch in midC) return midC[ch];
  const g = fb(ch); if (!g) return 0; // font not loaded yet: don't cache
  const span = ps => { let a = Infinity, b = -Infinity; for (const q of ps) for (let j = 0; j < q.length; j += 2) { a = Math.min(a, q[j]); b = Math.max(b, q[j]); } return [a, b]; };
  let [a, b] = span([...g.p, ...(H.needsGhost(ch) && fb('ก') ? fb('ก').p : [])]);
  if (b - a > H.BOX_W * 0.94) [a, b] = span(g.p); // ก + ำ is wider than the box: centre the letter itself, the grey ก may run off the edge
  return (midC[ch] = H.BOX_W / 2 - (a + b) / 2);
}
// one letter box: guide lines, a grey ก under marks, the faint typed letter while empty, then the person's strokes
function paint(cv, i, o = {}) {
  const c = CHARS[i], w = cv && cv.clientWidth; if (!c || !w) return;
  const dpr = devicePixelRatio || 1, k = w / H.BOX_W, W = Math.round(w * dpr), Ht = Math.round(w * H.BOX_H / H.BOX_W * dpr);
  if (cv.width !== W || cv.height !== Ht) { cv.width = W; cv.height = Ht; }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Ht); x.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  if (o.guides) {
    x.lineWidth = 1 / k;
    const hl = (y, col, dash) => { x.strokeStyle = col; x.setLineDash(dash ? [4 / k, 4 / k] : []); x.beginPath(); x.moveTo(0, y); x.lineTo(H.BOX_W, y); x.stroke(); };
    hl(0.3, '#e7e5df', 1); hl(H.XH, '#d3d0c8'); hl(H.BASE, '#a29e94'); hl(2.5, '#e7e5df', 1); x.setLineDash([]);
  }
  x.save(); x.translate(midDx(c.ch), 0); // hints sit centred; normalize() re-places drawn letters, so this is display only
  if (H.needsGhost(c.ch)) { const g = fb('ก'); if (g) { x.fillStyle = '#dad8d2'; fillPolys(x, g.p); } }
  const v = vOf(i), ty = !v && fb(c.ch); // empty box: faint typed letter as a "write here" guide; the app fixes the rest
  if (ty && ty.p) { x.fillStyle = o.guides ? 'rgba(255,77,23,0.13)' : 'rgba(0,0,0,0.16)'; fillPolys(x, ty.p); }
  else if (!v && H.synth(c.ch)) { x.strokeStyle = o.guides ? 'rgba(255,77,23,0.3)' : 'rgba(0,0,0,0.3)'; x.lineWidth = 0.075; x.lineCap = x.lineJoin = 'round'; for (const a of H.synth(c.ch).s) strokeLine(x, a); } // symbol the font lacks (θ α β Σ ∈)
  x.restore();
  x.strokeStyle = '#141414'; x.lineWidth = o.guides ? 0.075 : 0.11; x.lineCap = x.lineJoin = 'round';
  for (const a of v ? v.s : []) strokeLine(x, a);
  if (o.live) strokeLine(x, o.live);
}
const drawPad = () => { paint(padCv(), cur, { guides: true, live: drawing && drawing.pts }); $('#padLbl').textContent = label(CHARS[cur].ch); };
const ghosts = () => [$('#ghostPrev canvas'), $('#ghostNext canvas')];
const drawGhosts = () => { paint(ghosts()[0], (cur - 1 + N) % N, { guides: true }); paint(ghosts()[1], (cur + 1) % N, { guides: true }); };
function drawChip(i) { const c = chips[i]; if (!c) return; paint(c.cv, i); c.b.classList.toggle('ok', !!vOf(i)); c.b.classList.toggle('on', i === cur); c.b.setAttribute('aria-current', i === cur); }

function buildTeach() {
  const st = $('#strip'); let g = null;
  CHARS.forEach((c, i) => {
    if (c.group !== g) { g = c.group; const l = document.createElement('span'); l.className = 'gl mono'; l.textContent = g; st.append(l); }
    const b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-label', 'Letter ' + c.ch);
    b.innerHTML = '<canvas></canvas>'; b.onclick = () => go(i); st.append(b); chips[i] = { b, cv: b.firstChild };
  });
  const vr = $('#verRow');
  for (let v = 0; v < 5; v++) {
    const b = document.createElement('button'); b.textContent = v + 1; b.dataset.v = v; b.setAttribute('aria-label', 'Version ' + (v + 1));
    b.onclick = () => { if (v === ver) return; cancelAdv(); ver = v; LS.set('ver', v); renderTeach(); }; vr.append(b);
  }
  attachPen(padCv());
  $('#undo').onclick = () => edit(s => (s.pop(), s));
  $('#clear').onclick = () => edit(() => []);
  $('#prev').onclick = $('#ghostPrev').onclick = () => go(cur - 1, -1);
  $('#next').onclick = $('#ghostNext').onclick = () => go(cur + 1, 1);
  $('#pvWrap').ontoggle = renderPreview;
}
const arrive = () => { fresh = !vOf(cur); dirty = false; }; // auto-advance only for a letter that was empty when you got to it
function edit(fn) { // variants are replaced, never mutated (the engine caches their sizes)
  cancelAdv();
  const l = slots(CHARS[cur].ch); if (!l[ver]) return;
  const s = fn(l[ver].s.slice()); l[ver] = s.length ? { s } : null;
  saveHand(); drawPad(); drawChip(cur); progress();
}
function attachPen(cv) {
  const pt = e => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width * H.BOX_W).toFixed(3), +((e.clientY - r.top) / r.height * H.BOX_H).toFixed(3)]; };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; LS.set('pen', true); document.body.classList.add('pen-seen'); }
    if ((e.pointerType === 'touch' && penSeen) || drawing) return; // palm rejection once a Pencil was used
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { } // synthetic test pointers can't be captured
    cancelAdv(); if (M.settle(cv)) { M.settle(ghosts()[0]); M.settle(ghosts()[1]); drawGhosts(); } // a letter swap still running ends now, so the stroke lands on this letter
    document.body.classList.add('inking');
    drawing = { id: e.pointerId, pts: pt(e) }; drawPad();
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = pt(ev), p = drawing.pts;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.012) p.push(x, y);
    }
    drawPad();
  });
  const end = e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const d = drawing, l = slots(CHARS[cur].ch); drawing = null; document.body.classList.remove('inking');
    l[ver] = { s: [...(l[ver] ? l[ver].s : []), d.pts] }; dirty = true;
    saveHand(); drawPad(); drawChip(cur); progress(); queueAdv();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
// ---------- auto-advance: 1.4 s after the last lift the spark runs once round the pad, then the next empty letter slides in
const ADV = 1.4;
function cancelAdv() { clearTimeout(advT); advT = 0; if (sparkStop) sparkStop(); sparkStop = null; $('#padWrap').classList.remove('counting'); }
function queueAdv() {
  cancelAdv(); if (!fresh || !vOf(cur)) return;
  $('#padWrap').classList.add('counting'); sparkStop = M.spark.loop(padCv(), ADV);
  advT = setTimeout(() => { cancelAdv(); const n = nextEmpty(); if (n >= 0) go(n, 1); }, ADV * 1000);
}
function nextEmpty() { for (let d = 1; d < N; d++) { const j = (cur + d) % N; if (!vOf(j)) return j; } return -1; }
function go(n, dir) {
  n = (n + N) % N; if (n === cur) return;
  cancelAdv(); dir = dir || (n > cur ? 1 : -1);
  if (dirty) M.spark.fly(padCv(), chips[cur].b); // the letter just written flies into its slot
  const was = cur; cur = n; LS.set('cur', cur); arrive();
  drawChip(was); drawChip(cur); meta(); centreStrip();
  M.swap([padCv(), ...ghosts()], dir, () => { drawPad(); drawGhosts(); });
}
function centreStrip(smooth = true) {
  const st = $('#strip'), b = chips[cur].b;
  st.scrollTo({ left: b.offsetLeft - st.clientWidth / 2 + b.offsetWidth / 2, behavior: smooth && M.can() ? 'smooth' : 'auto' });
}
function meta() {
  const c = CHARS[cur], n = String(cur + 1).padStart(2, '0');
  $('#hudPos').textContent = `Letter ${n} / ${N}`; $('#hudGrp').textContent = c.group;
  document.querySelectorAll('#verRow button').forEach(b => b.classList.toggle('on', +b.dataset.v === ver));
  if ($('#pvWrap').open) renderPreview();
}
function renderTeach() {
  arrive(); meta(); drawPad(); drawGhosts(); chips.forEach((_, i) => drawChip(i)); progress(); centreStrip(false);
}
function renderPreview() { // this group's letters as they will appear in worksheets (straightened)
  const el = $('#preview'); if (!$('#pvWrap').open) return;
  const g = CHARS[cur].group, w = (el.clientWidth || 824) - 24;
  const text = CHARS.filter(c => c.group === g && count(c.ch)).map(c => (H.needsGhost(c.ch) ? 'ก' : '') + c.ch).join(' ');
  if (!text) { el.textContent = 'Nothing written in this group yet.'; return; }
  const r = H.layout(text, hand, { x: 4, y: 0, width: w - 8, u: 16, gap: 2.4, seed: 1, fb });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${r.height}" width="100%" height="${r.height}">${penPaths(r, '#141414')}<path d="${pathD(r.fills, true)}" fill="#141414"/></svg>`;
}
function progress() {
  if ($('#pvWrap').open) renderPreview();
  const done = taught();
  $('#rulerHead').style.left = (100 * done / REQ.length) + '%';
  $('#progText').textContent = `${done}/${REQ.length} taught`;
  const first = lastDone >= 0 && lastDone < REQ.length && done === REQ.length; lastDone = done;
  if (first && !M.flash('ครบแล้ว.')) doneToast('All letters taught');
  if (done === REQ.length && !LS.get('doneNag', false)) {
    LS.set('doneNag', true);
    setTimeout(() => { if (confirm('All letters taught. Save your handwriting file now as a backup?')) saveHandFile(); }, 1600);
  }
}

// ---------- Worksheet screen
let sheet = null, sel = null, down = null;
const ink = { color: LS.get('color', '#1a1a1a'), thick: LS.get('thick', 1) };
const lay = b => H.layout(b.text, hand, { x: b.x, y: b.y, width: b.w, u: b.u, gap: b.gap, seed: b.seed, fb, thick: ink.thick, neat: b.neat ?? 1, mods: b.mods });
const pathD = (arrs, close) => arrs.map(a => {
  let s = 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + (a.length === 2 ? 'l0.01 0' : '');
  for (let i = 2; i < a.length; i += 2) s += 'L' + a[i].toFixed(2) + ' ' + a[i + 1].toFixed(2);
  return close ? s + 'Z' : s;
}).join('');
// one path per stroke in writing order (r.strokes is letter by letter, the pens hold the same arrays), so the ink can write itself on screen
const stkPaths = (r, color) => { const w = new Map(r.pens.flatMap(([lw, s]) => s.map(a => [a, lw])));
  return r.strokes.map(a => `<path class="stk" d="${pathD([a])}" fill="none" stroke="${color}" stroke-width="${w.get(a).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"/>`).join(''); };
// pen strokes, one path per pen pressure (line width)
const penPaths = (r, color) => r.pens.map(([w, s]) => `<path d="${pathD(s)}" fill="none" stroke="${color}" stroke-width="${w.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
const toPage = (pg, e) => { const r = pg.el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * pg.w, (e.clientY - r.top) / r.height * pg.h]; };

async function openFile(file) {
  try {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) await openPdf(file.name, await file.arrayBuffer());
    else await openImage(file);
  } catch (e) { console.error(e); toast('Could not open that file: ' + e.message, 6000); }
}
async function openPdf(name, buf) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; // pdf.js takes ownership of its copy
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const p = await pdf.getPage(n), vp = p.getViewport({ scale: 1 });
    pages.push({ w: vp.width, h: vp.height, vp, pdfPage: p, boxes: [] });
  }
  setSheet({ name, kind: 'pdf', bytes: buf, pages });
}
async function openImage(file) {
  const bmp = await createImageBitmap(file), s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const jpg = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
  setSheet({ name: file.name, kind: 'img', jpg, img: cv, pages: [{ w: 595, h: 595 * cv.height / cv.width, boxes: [] }] });
}
function setSheet(s) {
  select(null); clearSel(); sheet = s; $('#pages').innerHTML = ''; $('#exportBtn').disabled = false;
  $('#empty').hidden = true; $('#sheetName').textContent = s.name.replace(/\.[^.]+$/, '');
  for (const pg of s.pages) {
    const el = document.createElement('div'); el.className = 'page'; el.style.aspectRatio = pg.w + ' / ' + pg.h; el.style.maxWidth = '1000px';
    const bg = document.createElement('canvas'), svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${pg.w} ${pg.h}`); svg.setAttribute('preserveAspectRatio', 'none');
    const ov = document.createElementNS(NS, 'svg'); ov.setAttribute('class', 'lz'); ov.setAttribute('viewBox', `0 0 ${pg.w} ${pg.h}`); ov.setAttribute('preserveAspectRatio', 'none');
    el.classList.toggle('lasso', tool === 'lasso'); el.append(bg, svg, ov); Object.assign(pg, { el, bg, svg, ov }); $('#pages').append(el);
    pageEvents(pg);
  }
  let chain = Promise.resolve(); // pages are drawn one after another; each page's scan starts when its own drawing is done
  const ready = s.pages.map(pg => (chain = chain.then(() => renderBg(pg))));
  chain.catch(e => toast('Page drawing failed: ' + e.message));
  M.pageIn(s.pages, ready);
}
async function renderBg(pg) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let sc = Math.max(1, (pg.el.clientWidth || 800) * dpr / pg.w);
  if (pg.w * pg.h * sc * sc > 6e6) sc = Math.sqrt(6e6 / (pg.w * pg.h)); // keep iPad memory sane
  const x = pg.bg.getContext('2d');
  if (sheet.kind === 'pdf') {
    const vp = pg.pdfPage.getViewport({ scale: sc }); pg.bg.width = Math.floor(vp.width); pg.bg.height = Math.floor(vp.height);
    await pg.pdfPage.render({ canvasContext: x, viewport: vp }).promise;
  } else { pg.bg.width = sheet.img.width; pg.bg.height = sheet.img.height; x.drawImage(sheet.img, 0, 0); }
}
function pageEvents(pg) {
  lassoEvents(pg);
  pg.el.addEventListener('click', () => { if (ed && ed.pg === pg && document.activeElement !== $('#txt')) $('#txt').focus({ preventScroll: true }); }); // iPad: a second chance to open the keyboard inside the tap
  pg.el.addEventListener('pointerdown', e => { down = tool !== 'text' || e.target.closest('.tbox') ? null : { x: e.clientX, y: e.clientY, t: Date.now() }; });
  pg.el.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || e.target.closest('.tbox') || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 700) return;
    if (sel) return select(null); // first tap outside just writes and closes the open box
    const [x, y] = toPage(pg, e), u = LS.get('u', 0) || +(pg.w * 0.016).toFixed(2), gap = LS.get('gap', 2.4);
    const box = { x: Math.max(0, x - 2), y: y - 1.75 * u, w: Math.max(60, Math.min(pg.w * 0.45, pg.w - x - 4)), u, gap, neat: LS.get('neat', 1), seed: (Math.random() * 1e9) | 0, text: '' };
    pg.boxes.push(box); addBoxEl(pg, box); renderInk(pg); select({ pg, box }, true);
  });
}
function addBoxEl(pg, box) {
  const el = document.createElement('div'); el.className = 'tbox'; el.innerHTML = '<div class="grip"></div>';
  box.el = el; pg.el.append(el);
  let drag = null;
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); if (e.target.id === 'txt') return; // taps inside the open text move the caret
    e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { } // synthetic test pointers can't be captured
    const [x, y] = toPage(pg, e);
    drag = { id: e.pointerId, x, y, bx: box.x, by: box.y, bw: box.w, grip: e.target.classList.contains('grip'), moved: false, cx: e.clientX, cy: e.clientY };
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 6) return;
    drag.moved = true; const [x, y] = toPage(pg, e);
    if (drag.grip) box.w = Math.max(30, drag.bw + x - drag.x); else { box.x = drag.bx + x - drag.x; box.y = drag.by + y - drag.y; }
    renderInk(pg);
  });
  const up = e => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    if (!sel || sel.box !== box) select({ pg, box }, !d.moved); else if (!d.moved) openEd(); else placeBar();
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function renderInk(pg) {
  let html = '';
  for (const b of pg.boxes) {
    const r = b.r = lay(b); b.h = Math.max(r.height, b.u * 2.6);
    html += '<g>' + stkPaths(r, ink.color);
    html += (r.fills.length ? `<path class="fil" d="${pathD(r.fills, true)}" fill="${ink.color}"/>` : '') + '</g>';
    const s = b.el.style; s.left = 100 * b.x / pg.w + '%'; s.top = 100 * b.y / pg.h + '%'; s.width = 100 * b.w / pg.w + '%'; s.height = ed && ed.box === b ? 'auto' : 100 * b.h / pg.h + '%';
  }
  pg.svg.innerHTML = html;
  pg.boxes.forEach((b, i) => { b.g = pg.svg.children[i]; if (ed && ed.box === b) b.g.style.visibility = 'hidden'; }); // its handwriting hides while the text is open
  if (lsel && lsel.pg === pg) showSel();
  if (sel && sel.pg === pg) placeBar();
}
function removeBox(s) { s.pg.boxes = s.pg.boxes.filter(b => b !== s.box); s.box.el.remove(); renderInk(s.pg); }
function select(s, focus) {
  if (sel) { closeEd(); sel.box.el.classList.remove('on'); if ((!s || s.box !== sel.box) && !sel.box.text.trim()) removeBox(sel); }
  sel = s;
  if (!s) { const p = $('#panel'); p.hidden = true; document.body.append(p); return; } // parked outside the pages so a new file can't delete it
  s.box.el.classList.add('on'); $('#sz').value = s.box.u; $('#lg').value = s.box.gap; $('#nt').value = s.box.neat ?? 1;
  if (focus) openEd(); else placeBar();
}
// ---------- typing right in the box: #txt sits inside the selected box in plain type; Enter, a tap outside or closing the keyboard turns it into handwriting
let ed = null, barT = 0; // ed = the {pg, box} whose text is open; barT = last touch on the box bar (that must not close the text)
function openEd() {
  if (!sel) return;
  const t = $('#txt'), { box } = sel;
  if (ed !== sel) { closeEd(); ed = sel; box.el.classList.add('edit'); box.el.append(t); t.hidden = false; t.value = box.text; renderInk(sel.pg); }
  fitEd(); t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); keepVisible();
}
function closeEd() {
  if (!ed) return;
  const { pg, box } = ed, t = $('#txt'); ed = null;
  box.el.classList.remove('edit'); renderInk(pg);
  if (box.text.trim()) { M.handover(box.el, t); M.writeOn(box.g, 1.5); }
  t.hidden = true; document.body.append(t); t.blur();
}
function fitEd() { // typed text at the box's handwriting size, on screen pixels
  if (!ed) return;
  const { pg, box } = ed, t = $('#txt'), k = pg.el.clientWidth / pg.w;
  t.style.fontSize = 1.75 * box.u * k + 'px'; t.style.lineHeight = box.gap * box.u * k + 'px'; t.style.minHeight = 2.6 * box.u * k + 'px';
  t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px';
  placeBar();
}
function placeBar() { // above the box like the lasso menu; under it when there is no room above
  if (!sel) return;
  const p = $('#panel'), el = sel.box.el, W = sel.pg.el.clientWidth;
  if (p.parentNode !== sel.pg.el) sel.pg.el.append(p); // moving it would replay its fade-in on every redraw
  p.hidden = false;
  const top = el.offsetTop - p.offsetHeight - 12, x = el.offsetLeft + el.offsetWidth / 2 - p.offsetWidth / 2;
  p.style.left = Math.max(0, Math.min(x, W - p.offsetWidth)) + 'px';
  p.style.top = (top < 0 ? el.offsetTop + el.offsetHeight + 12 : top) + 'px';
}
function keepVisible() { // the iPad keyboard covers the bottom: scroll the open box (and its bar) into what is left
  if (!ed) return;
  const vv = window.visualViewport, vt = vv ? vv.offsetTop : 0, vb = vt + (vv ? vv.height : innerHeight);
  const top = Math.max(vt, $('#sheet > .title-row').getBoundingClientRect().bottom) + 8;
  const a = ed.box.el.getBoundingClientRect(), b = $('#panel').getBoundingClientRect(), y0 = Math.min(a.top, b.top), y1 = Math.max(a.bottom, b.bottom);
  let d = y1 > vb - 12 ? y1 - vb + 12 : 0; if (y0 - d < top) d = y0 - top;
  if (Math.abs(d) > 2) scrollBy({ top: d, behavior: M.can() ? 'smooth' : 'auto' });
}
// ---------- Lasso tool: circle letters, then drag to move, drag a corner to resize, or rewrite them in a fresh variation
let tool = 'text', lsel = null; // every visit starts on Text, so a tap always adds a box
function setTool(t) {
  tool = t; select(null); clearSel();
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (sheet) sheet.pages.forEach(pg => pg.el.classList.toggle('lasso', t === 'lasso'));
}
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const cbOf = it => it.b.r && it.b.r.cb[it.ci];
const mid = c => [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2];
const modOf = it => { const m = it.b.mods || (it.b.mods = {}); return m[it.ci] || (m[it.ci] = {}); };
function selBox() {
  const B = [Infinity, Infinity, -Infinity, -Infinity];
  for (const it of lsel.items) { const c = cbOf(it); if (!c) continue; B[0] = Math.min(B[0], c[0]); B[1] = Math.min(B[1], c[1]); B[2] = Math.max(B[2], c[2]); B[3] = Math.max(B[3], c[3]); }
  return B;
}
function showSel() {
  const { pg } = lsel, [x0, y0, x1, y1] = selBox(), pad = 3, menu = $('#lassoMenu');
  if (!lsel.el) { lsel.el = document.createElement('div'); lsel.el.className = 'lsel'; lsel.el.innerHTML = ['nw', 'ne', 'sw', 'se'].map(h => `<span class="h ${h}" data-h="${h}"></span>`).join(''); pg.el.append(lsel.el); }
  const s = lsel.el.style; s.left = 100 * (x0 - pad) / pg.w + '%'; s.top = 100 * (y0 - pad) / pg.h + '%'; s.width = 100 * (x1 - x0 + 2 * pad) / pg.w + '%'; s.height = 100 * (y1 - y0 + 2 * pad) / pg.h + '%';
  if (lsel.busy) return;
  pg.el.append(menu); menu.hidden = false;
  const below = y0 - pad < 0.08 * pg.h; // no room above: show the menu under the selection
  menu.style.left = 100 * (x0 + x1) / 2 / pg.w + '%'; menu.style.top = 100 * (below ? y1 + pad : y0 - pad) / pg.h + '%';
  menu.style.transform = below ? 'translate(-50%, 14px)' : '';
}
function clearSel() {
  if (lsel) { if (lsel.el) lsel.el.remove(); lsel.pg.ov.innerHTML = ''; }
  lsel = null; const m = $('#lassoMenu'); m.hidden = true; document.body.append(m); // parked outside the pages so a new file can't delete it
}
function selectIn(pg, pts) {
  const items = [];
  for (const b of pg.boxes) (b.r || (b.r = lay(b))).cb.forEach((c, ci) => { if (c) { const [x, y] = mid(c); if (inPoly(x, y, pts)) items.push({ b, ci }); } });
  if (!items.length) return toast('No letters inside the loop. Circle the letters you want to change.');
  lsel = { pg, items }; showSel();
}
function lassoAct(a) {
  if (!lsel) return;
  if (a === 'done') return clearSel();
  for (const it of lsel.items) {
    if (a === 'shuffle') modOf(it).seed = 1 + ((Math.random() * 1e9) | 0);
    else if (it.b.mods) delete it.b.mods[it.ci];
  }
  renderInk(lsel.pg);
}
function lassoEvents(pg) {
  let g = null;
  const ok = e => e.pointerType !== 'touch' || !penSeen; // once a Pencil is used, fingers scroll and only the Pencil lassos
  const draw = () => { if (!g.raf) g.raf = requestAnimationFrame(() => { g.raf = 0; renderInk(pg); }); };
  pg.el.addEventListener('pointerdown', e => {
    if (tool !== 'lasso' || g || !ok(e) || e.target.closest('#lassoMenu')) return;
    e.preventDefault(); try { pg.el.setPointerCapture(e.pointerId); } catch { } // synthetic test pointers can't be captured
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; LS.set('pen', true); document.body.classList.add('pen-seen'); }
    const p = toPage(pg, e), h = e.target.closest('.h');
    if (lsel && lsel.pg === pg && e.target.closest('.lsel')) {
      const B = selBox(), anchor = h ? [h.dataset.h[1] === 'w' ? B[2] : B[0], h.dataset.h[0] === 'n' ? B[3] : B[1]] : null;
      g = { id: e.pointerId, kind: h ? 'size' : 'move', p, anchor, d0: anchor && Math.hypot(p[0] - anchor[0], p[1] - anchor[1]),
        st: lsel.items.map(it => { const m = modOf(it); return { dx: m.dx || 0, dy: m.dy || 0, s: m.s || 1, c: mid(cbOf(it)) }; }) };
      lsel.busy = true; $('#lassoMenu').hidden = true;
    } else { clearSel(); g = { id: e.pointerId, kind: 'loop', pts: [p] }; }
  });
  pg.el.addEventListener('pointermove', e => {
    if (!g || g.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [], last = evs.length ? evs[evs.length - 1] : e, p = toPage(pg, last);
    if (g.kind === 'loop') {
      for (const ev of evs.length ? evs : [e]) { const q = toPage(pg, ev), l = g.pts[g.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 1) g.pts.push(q); }
      pg.ov.innerHTML = `<path d="M${g.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}Z"/>`;
    } else if (g.kind === 'move') {
      lsel.items.forEach((it, i) => { const m = modOf(it); m.dx = g.st[i].dx + p[0] - g.p[0]; m.dy = g.st[i].dy + p[1] - g.p[1]; }); draw();
    } else {
      const k = Math.min(Math.max(Math.hypot(p[0] - g.anchor[0], p[1] - g.anchor[1]) / (g.d0 || 1), 0.25), 4), A = g.anchor;
      lsel.items.forEach((it, i) => { const m = modOf(it), s = g.st[i]; m.s = s.s * k; m.dx = s.dx + (A[0] + (s.c[0] - A[0]) * k - s.c[0]); m.dy = s.dy + (A[1] + (s.c[1] - A[1]) * k - s.c[1]); }); draw();
    }
  });
  const up = e => {
    if (!g || g.id !== e.pointerId) return;
    const d = g; g = null; if (d.raf) cancelAnimationFrame(d.raf);
    if (d.kind === 'loop') {
      pg.ov.innerHTML = '';
      const xs = d.pts.map(q => q[0]), ys = d.pts.map(q => q[1]);
      if (d.pts.length > 3 && Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > 6) selectIn(pg, d.pts);
    } else { lsel.busy = false; renderInk(pg); }
  };
  pg.el.addEventListener('pointerup', up); pg.el.addEventListener('pointercancel', up);
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
async function buildPdf() {
  const P = PDFLib; let pdf;
  if (sheet.kind === 'pdf') pdf = await P.PDFDocument.load(sheet.bytes, { ignoreEncryption: true });
  else {
    pdf = await P.PDFDocument.create(); const img = await pdf.embedJpg(sheet.jpg), pg = sheet.pages[0];
    pdf.addPage([pg.w, pg.h]).drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
  }
  const [r, g, b] = hex(ink.color);
  sheet.pages.forEach((pg, i) => {
    if (!pg.boxes.length) return;
    const map = pg.vp ? (x, y) => pg.vp.convertToPdfPoint(x, y) : (x, y) => [x, pg.h - y]; // handles rotated / offset PDF pages
    const ops = [P.pushGraphicsState(), P.setStrokingRgbColor(r, g, b), P.setFillingRgbColor(r, g, b), P.setLineCap(P.LineCapStyle.Round), P.setLineJoin(P.LineJoinStyle.Round)];
    const path = (a, close) => {
      let [x, y] = map(a[0], a[1]); ops.push(P.moveTo(x, y)); if (a.length === 2) ops.push(P.lineTo(x + 0.01, y));
      for (let j = 2; j < a.length; j += 2) { [x, y] = map(a[j], a[j + 1]); ops.push(P.lineTo(x, y)); }
      if (close) ops.push(P.closePath());
    };
    for (const bx of pg.boxes) {
      const res = lay(bx);
      for (const [w, s] of res.pens) { ops.push(P.setLineWidth(w)); s.forEach(a => path(a)); ops.push(P.stroke()); }
      if (res.fills.length) { res.fills.forEach(a => path(a, true)); ops.push(P.fill()); }
    }
    ops.push(P.popGraphicsState());
    const page = pdf.getPage(i);
    for (let j = 0; j < ops.length; j += 4000) page.pushOperators(...ops.slice(j, j + 4000));
  });
  return pdf.save();
}
async function exportPdf() {
  if (!sheet) return; select(null);
  const btn = $('#exportBtn'); btn.disabled = true;
  try { await saveFile(new Blob([await buildPdf()], { type: 'application/pdf' }), sheet.name.replace(/\.[^.]+$/, '') + '-laimue.pdf'); if (!M.flash('SAVED.')) doneToast('PDF saved'); }
  catch (e) { console.error(e); toast('Could not make the PDF: ' + e.message, 6000); }
  btn.disabled = false;
}

// ---------- tabs, wiring, start
function showTab(t) {
  LS.set('tab', t);
  for (const s of ['teach', 'sheet']) $('#' + s).hidden = s !== t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t !== 'teach') cancelAdv();
  M.tab($('#' + t));
  if (t === 'teach') requestAnimationFrame(() => { renderTeach(); M.words($('#teachTitle')); M.frame($('#padWrap')); });
  else if (sheet) sheet.pages.forEach(pg => { renderInk(pg); M.writeOn(pg.svg); });
  else { M.frame($('.term')); M.prompt($('#promptTxt'), 'เปิดใบงาน แล้วเขียนคำตอบ…'); }
}
function wire() {
  document.querySelectorAll('.tab').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
  $('#menuBtn').onclick = e => { e.stopPropagation(); $('#menuList').hidden = !$('#menuList').hidden; };
  document.addEventListener('click', () => ($('#menuList').hidden = true));
  $('#saveHand').onclick = saveHandFile;
  $('#clearHand').onclick = clearHand;
  $('#playIntro').onclick = showIntro;
  const themes = ['auto', 'light', 'dark'], setTheme = t => { if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; $('#themeName').textContent = t[0].toUpperCase() + t.slice(1); LS.set('theme', t); };
  setTheme(themes.includes(LS.get('theme')) ? LS.get('theme') : 'auto');
  $('#themeBtn').onclick = e => { e.stopPropagation(); setTheme(themes[(themes.indexOf(LS.get('theme', 'auto')) + 1) % 3]); };
  $('#loadHand').onclick = () => $('#loadHandFile').click();
  $('#loadHandFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadHandFile(f); };
  document.addEventListener('keydown', e => {
    if ($('#teach').hidden || e.target.matches('textarea, input')) return;
    if (e.key === 'ArrowRight') go(cur + 1, 1); else if (e.key === 'ArrowLeft') go(cur - 1, -1);
  });
  addEventListener('resize', () => { if (!$('#teach').hidden) { cancelAdv(); renderTeach(); } });
  $('#openBtn').onclick = $('#openBtn2').onclick = () => $('#openFile').click();
  document.querySelectorAll('[data-tool]').forEach(b => (b.onclick = () => setTool(b.dataset.tool))); setTool(tool);
  document.querySelectorAll('#lassoMenu button').forEach(b => (b.onclick = e => { e.stopPropagation(); lassoAct(b.dataset.l); }));
  if (penSeen) document.body.classList.add('pen-seen');
  // iPad: no pinch zoom of the whole app; a Pencil on a drawing surface never scrolls the page
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if ([...e.touches].some(t => t.touchType === 'stylus') && e.target.closest('#pad, .page.lasso')) e.preventDefault(); }, { passive: false });
  $('#openFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
  $('#exportBtn').onclick = exportPdf;
  const inkBtns = document.querySelectorAll('.ink');
  const markInk = () => inkBtns.forEach(b => b.classList.toggle('on', b.dataset.c === ink.color));
  inkBtns.forEach(b => (b.onclick = () => { ink.color = b.dataset.c; LS.set('color', ink.color); markInk(); if (sheet) sheet.pages.forEach(renderInk); }));
  markInk();
  $('#thick').value = ink.thick;
  $('#thick').oninput = () => { ink.thick = +$('#thick').value; LS.set('thick', ink.thick); if (sheet) sheet.pages.forEach(renderInk); };
  const t = $('#txt');
  t.oninput = () => { // Enter and pasted line breaks start new lines
    if (!ed) return;
    ed.box.text = t.value; ed.box.mods = null; fitEd(); // shortcut: lasso edits are keyed by letter index, so typing drops them
  };
  t.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); select(null); } }; // finish = Esc, tap outside or hide the keyboard
  t.onblur = () => { if (ed && Date.now() - barT > 400) closeEd(); }; // keyboard closed: write it, keep the box selected
  const bar = $('#panel'), stop = e => { e.stopPropagation(); barT = Date.now(); };
  bar.addEventListener('pointerdown', stop); bar.addEventListener('pointerup', e => { stop(e); if (ed && document.activeElement !== t) t.focus({ preventScroll: true }); });
  const knob = (id, key, f) => ($(id).oninput = () => { if (sel) { sel.box[key] = +$(id).value; LS.set(f, sel.box[key]); renderInk(sel.pg); fitEd(); } });
  knob('#sz', 'u', 'u'); knob('#lg', 'gap', 'gap'); knob('#nt', 'neat', 'neat');
  addEventListener('resize', () => (ed ? fitEd() : placeBar()));
  if (window.visualViewport) visualViewport.addEventListener('resize', keepVisible);
  $('#ver').textContent = 'LaiMue version ' + H.VERSION;
  $('#shuf').onclick = () => { if (!sel) return; closeEd(); sel.box.seed = (Math.random() * 1e9) | 0; renderInk(sel.pg); M.writeOn(sel.box.g, 1.5); };
  $('#del').onclick = () => { if (sel) { sel.box.text = ''; select(null); } }; // an empty box is removed on close
  const ios = navigator.maxTouchPoints > 1 && /iPad|iPhone|Macintosh/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !LS.get('hint', false)) $('#installHint').hidden = false;
  $('#hideHint').onclick = () => { $('#installHint').hidden = true; LS.set('hint', true); };
}

async function runTests() { // open with ?test
  showTab('sheet');
  const res = H.selfTest(fb), out = document.createElement('div'); out.id = 'testOut'; document.body.append(out);
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 420]);
  await openPdf('test.pdf', (await doc.save()).slice().buffer);
  const pg = sheet.pages[0], box = { x: 30, y: 30, w: 530, u: 12, gap: 2.4, seed: 7, text: 'สวัสดีครับ ปู่น้ำกั๊ก ญี่ปุ่น ฎุ เกียรติ ป้า ปี่ ศักดิ์ ฤดู ทำน้ำ\nLaiMue 123 ๑๒๓ (ทดสอบ) ภาษาไทยเป็นภาษาที่สวยงามมาก' };
  hand = H.fakeHand(fb, 11, true); // messy fake person, only in memory (never saved)
  for (const [y, neat] of [[150, 1], [250, 0]]) { const b = { x: 30, y, w: 530, u: 16, gap: 2.4, seed: 7, neat, text: (neat ? 'Neat: ' : 'Natural: ') + 'สวัสดี ทดสอบ ปู่น้ำกั๊ก' }; pg.boxes.push(b); addBoxEl(pg, b); }
  pg.boxes.push(box); addBoxEl(pg, box); renderInk(pg);
  let ok = false;
  try {
    const bytes = await buildPdf(), n = bytes.length, p2 = await pdfjsLib.getDocument({ data: bytes }).promise, page = await p2.getPage(1);
    const vp = page.getViewport({ scale: 1.5 }), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    out.append('Exported PDF, opened again:', cv); ok = n > 1000;
  } catch (e) { out.append('PDF ERROR ' + e.message); }
  res.push({ name: 'PDF export re-opens', ok, info: '' });
  const fails = res.filter(r => !r.ok);
  out.insertAdjacentHTML('afterbegin', `<h3>${fails.length ? 'TEST FAIL' : 'TEST PASS'} (${res.length - fails.length}/${res.length})</h3>` + res.map(r => `<div>${r.ok ? '✅' : '❌'} ${r.name} ${r.info}</div>`).join(''));
  document.title = fails.length ? 'TEST FAIL' : 'TEST PASS';
}

(async function init() {
  buildTeach(); wire();
  try { const h = await db.get('hand'); if (h && h.g) hand = h; } catch { toast('This browser blocks saving — use ⋯ → Save my handwriting file.', 6000); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { }
  const refs = fetch('refs.json').then(r => r.json()).then(H.setRefs).catch(e => console.warn('reference hands', e)); // without them letters still vary, just less
  try { font = opentype.parse(await (await fetch('lib/Sriracha-Regular.ttf')).arrayBuffer()); } catch (e) { console.warn('fallback font', e); }
  await refs; lastDone = taught();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (/[?&]test\b/.test(location.search)) return runTests();
  showTab(LS.get('tab', 'teach'));
  if (!LS.get('intro', false)) showIntro();
})();
function showIntro() { // the app name written in the person's own hand (typed font for letters not taught yet)
  const r = H.layout('ลายมือ', hand, { x: 0, y: 0, width: 1000, u: 60, gap: 2.4, seed: 7, fb, thick: 1, neat: 1 });
  const all = [...r.pens.flatMap(([, s]) => s), ...r.fills]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const a of all) for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
  const m = 12, svg = all.length ? `<svg viewBox="${x0 - m} ${y0 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}">${stkPaths(r, 'currentColor')}${r.fills.length ? `<path class="fil" d="${pathD(r.fills, true)}" fill="currentColor"/>` : ''}</svg>` : 'ลายมือ';
  M.intro(svg, () => LS.set('intro', true));
}
