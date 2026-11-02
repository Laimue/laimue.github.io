'use strict';
const H = window.Hand, $ = s => document.querySelector(s), NS = 'http://www.w3.org/2000/svg';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('lm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lm.' + k, JSON.stringify(v)); } catch { /* per-device convenience only */ } },
};
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
  b.textContent = '📤 Tap to share / save ' + file.name;
  b.onclick = () => { t.hidden = true; navigator.share({ files: [file] }).catch(() => {}); };
  t.textContent = ''; t.append(b); t.hidden = false;
}
const saveHandFile = () => saveFile(new Blob([JSON.stringify(hand)], { type: 'application/json' }), 'laimue-handwriting.json');
async function loadHandFile(file) {
  let h = null; try { h = validHand(JSON.parse(await file.text())); } catch { }
  if (!h) return toast('That is not a LaiMue handwriting file.');
  if (taught() && !confirm('Replace the handwriting on this device with this file?')) return;
  hand = h; saveHand(); renderTeach(); if (sheet) sheet.pages.forEach(renderInk); toast('Handwriting loaded ✓');
}
function clearHand() {
  if (!taught()) return toast('There are no letters to clear yet.');
  if (!confirm('Erase ALL the letters you wrote on this device and start again? This cannot be undone. If you might want them back, tap Cancel and use "Save my handwriting file" first.')) return;
  hand = { v: 1, g: {} }; saveHand(); renderTeach(); if (sheet) sheet.pages.forEach(renderInk); toast('All letters cleared. Write them again on the Teach tab.');
}

// ---------- Teach screen: pages of 12 letters, one box each, for the chosen version (1-5)
const PER = 24;
const CHARS = H.GROUPS.flatMap(([group, s], gi) => [...s].map(ch => ({ ch, group, gi })));
const REQ = CHARS.filter(c => c.gi < H.REQUIRED_GROUPS);
const PAGES = Math.ceil(CHARS.length / PER);
let page = Math.max(0, Math.min(LS.get('page', 0) | 0, PAGES - 1)), ver = Math.max(0, Math.min(LS.get('ver', 0) | 0, 4));
let penSeen = LS.get('pen', false), drawing = null;
const cells = [];
const count = ch => (hand.g[ch] || []).filter(v => v && v.s.length).length;
const taught = () => REQ.filter(c => count(c.ch)).length;
const label = ch => (H.needsGhost(ch) ? '◌' : '') + ch;
const cellChar = i => CHARS[page * PER + i];
const slots = ch => hand.g[ch] || (hand.g[ch] = [null, null, null, null, null]);

function buildBoxes() {
  for (let i = 0; i < PER; i++) {
    const wrap = document.createElement('div'); wrap.className = 'box';
    wrap.innerHTML = '<canvas></canvas><span class="lbl"></span><span class="act"><button data-a="undo" aria-label="Undo">↶</button><button data-a="clear" aria-label="Clear">✕</button></span>';
    const cv = wrap.querySelector('canvas'); cells.push({ wrap, cv, lbl: wrap.querySelector('.lbl') }); $('#boxes').append(wrap);
    wrap.querySelector('[data-a=undo]').onclick = () => edit(i, s => (s.pop(), s));
    wrap.querySelector('[data-a=clear]').onclick = () => edit(i, () => []);
    attachPen(cv, i);
  }
  const vr = $('#verRow'); vr.append('Version ');
  for (let v = 0; v < 5; v++) {
    const b = document.createElement('button'); b.textContent = v + 1; b.dataset.v = v;
    b.onclick = () => { ver = v; LS.set('ver', v); renderTeach(); }; vr.append(b);
  }
}
function edit(i, fn) { // variants are replaced, never mutated (the engine caches their sizes)
  const c = cellChar(i); if (!c) return; const l = slots(c.ch); if (!l[ver]) return;
  const s = fn(l[ver].s.slice()); l[ver] = s.length ? { s } : null;
  saveHand(); drawBox(i); progress();
}
function strokeLine(x, a) { x.beginPath(); x.moveTo(a[0], a[1]); if (a.length === 2) x.lineTo(a[0] + 0.001, a[1]); for (let j = 2; j < a.length; j += 2) x.lineTo(a[j], a[j + 1]); x.stroke(); }
function fillPolys(x, polys) { x.beginPath(); for (const a of polys) { x.moveTo(a[0], a[1]); for (let j = 2; j < a.length; j += 2) x.lineTo(a[j], a[j + 1]); x.closePath(); } x.fill(); }
function drawBox(i) {
  const c = cellChar(i), cv = cells[i].cv, w = cv.clientWidth; if (!c || !w) return;
  const dpr = devicePixelRatio || 1, k = w / H.BOX_W, W = Math.round(w * dpr), Ht = Math.round(w * H.BOX_H / H.BOX_W * dpr);
  if (cv.width !== W || cv.height !== Ht) { cv.width = W; cv.height = Ht; }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Ht); x.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  x.lineWidth = 1 / k;
  const hl = (y, col, dash) => { x.strokeStyle = col; x.setLineDash(dash ? [4 / k, 4 / k] : []); x.beginPath(); x.moveTo(0, y); x.lineTo(H.BOX_W, y); x.stroke(); };
  hl(0.3, '#e5e7eb', 1); hl(H.XH, '#cbd5e1'); hl(H.BASE, '#94a3b8'); hl(2.5, '#e5e7eb', 1); x.setLineDash([]);
  if (H.needsGhost(c.ch)) { const g = fb('ก'); if (g) { x.fillStyle = '#d4d4d8'; fillPolys(x, g.p); } }
  const ty = fb(c.ch); if (ty && ty.p) { x.fillStyle = 'rgba(37,99,235,0.1)'; fillPolys(x, ty.p); } // faint typed letter to compare with
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 0.075; x.lineCap = x.lineJoin = 'round';
  const v = (hand.g[c.ch] || [])[ver];
  for (const a of v ? v.s : []) strokeLine(x, a);
  if (drawing && drawing.i === i) { strokeLine(x, drawing.pts); return; }
  const r = v ? H.checkLetter(hand, c.ch, ver, fb) : { ok: true }; // red only when the auto-fix can't make it match the typed letter
  cells[i].wrap.classList.toggle('bad', !r.ok);
  cells[i].lbl.textContent = label(c.ch) + (r.ok ? '' : ' · ' + { small: 'too small', big: 'too big', lean: 'too slanted' }[r.why]);
}
function attachPen(cv, i) {
  const pt = e => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width * H.BOX_W).toFixed(3), +((e.clientY - r.top) / r.height * H.BOX_H).toFixed(3)]; };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; LS.set('pen', true); }
    if ((e.pointerType === 'touch' && penSeen) || drawing || !cellChar(i)) return; // palm rejection once a Pencil was used
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    drawing = { i, id: e.pointerId, pts: pt(e) }; drawBox(i);
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = pt(ev), p = drawing.pts;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.012) p.push(x, y);
    }
    drawBox(i);
  });
  const end = e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const d = drawing, l = slots(cellChar(i).ch); drawing = null;
    l[ver] = { s: [...(l[ver] ? l[ver].s : []), d.pts] };
    saveHand(); drawBox(i); progress();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function renderTeach() {
  cells.forEach((c, i) => { const ch = cellChar(i); c.wrap.hidden = !ch; if (ch) c.lbl.textContent = label(ch.ch); });
  const groups = [...new Set(CHARS.slice(page * PER, page * PER + PER).map(c => c.group))].join(' · ');
  $('#pageInfo').textContent = `Page ${page + 1}/${PAGES} · ${groups}`;
  document.querySelectorAll('#verRow button').forEach(b => b.classList.toggle('on', +b.dataset.v === ver));
  LS.set('page', page); cells.forEach((_, i) => drawBox(i)); progress();
}
function renderPreview() { // this page's letters as they will appear in worksheets (straightened)
  const el = $('#preview'), w = el.clientWidth || 800;
  const text = CHARS.slice(page * PER, page * PER + PER).filter(c => count(c.ch)).map(c => (H.needsGhost(c.ch) ? 'ก' : '') + c.ch).join(' ');
  el.hidden = !text; if (!text) return;
  const r = H.layout(text, hand, { x: 4, y: 0, width: w - 8, u: 16, gap: 2.4, seed: 1, fb });
  el.innerHTML = `<div class="hint">Preview — how your letters will look on worksheets:</div><svg viewBox="0 0 ${w} ${r.height}" width="100%" height="${r.height}"><path d="${pathD(r.strokes)}" fill="none" stroke="#1a1a1a" stroke-width="${r.lw}" stroke-linecap="round" stroke-linejoin="round"/><path d="${pathD(r.fills, true)}" fill="#1a1a1a"/></svg>`;
}
function progress() {
  renderPreview();
  const done = taught();
  $('#progFill').style.width = (100 * done / REQ.length) + '%';
  $('#progText').textContent = `${done}/${REQ.length} letters taught` + (done === REQ.length ? ' ✓ Done! Extra pages and versions are optional.' : '');
  if (done === REQ.length && !LS.get('doneNag', false)) {
    LS.set('doneNag', true);
    setTimeout(() => { if (confirm('All letters taught! 🎉 Save your handwriting file now as a backup?')) saveHandFile(); }, 300);
  }
}
const step = d => { page = (page + d + PAGES) % PAGES; renderTeach(); scrollTo(0, 0); };

// ---------- Worksheet screen
let sheet = null, sel = null, down = null;
const ink = { color: LS.get('color', '#1a1a1a'), thick: LS.get('thick', 1) };
const lay = b => H.layout(b.text, hand, { x: b.x, y: b.y, width: b.w, u: b.u, gap: b.gap, seed: b.seed, fb, thick: ink.thick, neat: b.neat ?? 1 });
const pathD = (arrs, close) => arrs.map(a => {
  let s = 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + (a.length === 2 ? 'l0.01 0' : '');
  for (let i = 2; i < a.length; i += 2) s += 'L' + a[i].toFixed(2) + ' ' + a[i + 1].toFixed(2);
  return close ? s + 'Z' : s;
}).join('');
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
  select(null); sheet = s; $('#pages').innerHTML = ''; $('#exportBtn').disabled = false;
  $('#sheetHint').textContent = 'Tap where an answer goes to add a text box. Drag a box to move it; drag its blue handle to change the width.';
  for (const pg of s.pages) {
    const el = document.createElement('div'); el.className = 'page'; el.style.aspectRatio = pg.w + ' / ' + pg.h; el.style.maxWidth = '1000px';
    const bg = document.createElement('canvas'), svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${pg.w} ${pg.h}`); svg.setAttribute('preserveAspectRatio', 'none');
    el.append(bg, svg); Object.assign(pg, { el, bg, svg }); $('#pages').append(el);
    pageEvents(pg);
  }
  (async () => { for (const pg of s.pages) await renderBg(pg); })().catch(e => toast('Page drawing failed: ' + e.message));
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
  pg.el.addEventListener('pointerdown', e => { down = e.target.closest('.tbox') ? null : { x: e.clientX, y: e.clientY, t: Date.now() }; });
  pg.el.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || e.target.closest('.tbox') || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 700) return;
    if (sel) return select(null); // first tap outside just closes the open box
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
    e.stopPropagation(); e.preventDefault(); el.setPointerCapture(e.pointerId);
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
    if (!sel || sel.box !== box) select({ pg, box }, !d.moved); else if (!d.moved) $('#txt').focus({ preventScroll: true });
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function renderInk(pg) {
  let html = '';
  for (const b of pg.boxes) {
    const r = lay(b); b.h = Math.max(r.height, b.u * 2.6);
    if (r.strokes.length) html += `<path d="${pathD(r.strokes)}" fill="none" stroke="${ink.color}" stroke-width="${r.lw.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (r.fills.length) html += `<path d="${pathD(r.fills, true)}" fill="${ink.color}"/>`;
    const s = b.el.style; s.left = 100 * b.x / pg.w + '%'; s.top = 100 * b.y / pg.h + '%'; s.width = 100 * b.w / pg.w + '%'; s.height = 100 * b.h / pg.h + '%';
  }
  pg.svg.innerHTML = html;
}
function removeBox(s) { s.pg.boxes = s.pg.boxes.filter(b => b !== s.box); s.box.el.remove(); renderInk(s.pg); }
function select(s, focus) {
  if (sel) { sel.box.el.classList.remove('on'); if ((!s || s.box !== sel.box) && !sel.box.text.trim()) removeBox(sel); }
  sel = s; $('#panel').hidden = !s;
  if (!s) { $('#txt').blur(); return; }
  s.box.el.classList.add('on'); $('#txt').value = s.box.text; $('#sz').value = s.box.u; $('#lg').value = s.box.gap; $('#nt').value = s.box.neat ?? 1;
  if (focus) $('#txt').focus({ preventScroll: true });
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
      const res = lay(bx); ops.push(P.setLineWidth(res.lw));
      if (res.strokes.length) { res.strokes.forEach(a => path(a)); ops.push(P.stroke()); }
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
  try { await saveFile(new Blob([await buildPdf()], { type: 'application/pdf' }), sheet.name.replace(/\.[^.]+$/, '') + '-laimue.pdf'); }
  catch (e) { console.error(e); toast('Could not make the PDF: ' + e.message, 6000); }
  btn.disabled = false;
}

// ---------- tabs, wiring, start
function showTab(t) {
  LS.set('tab', t);
  for (const s of ['teach', 'sheet']) $('#' + s).hidden = s !== t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'teach') requestAnimationFrame(renderTeach); else if (sheet) sheet.pages.forEach(renderInk);
}
function wire() {
  document.querySelectorAll('.tab').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
  $('#menuBtn').onclick = e => { e.stopPropagation(); $('#menuList').hidden = !$('#menuList').hidden; };
  document.addEventListener('click', () => ($('#menuList').hidden = true));
  $('#saveHand').onclick = saveHandFile;
  $('#clearHand').onclick = clearHand;
  $('#loadHand').onclick = () => $('#loadHandFile').click();
  $('#loadHandFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadHandFile(f); };
  $('#prev').onclick = () => step(-1); $('#next').onclick = () => step(1);
  document.addEventListener('keydown', e => {
    if ($('#teach').hidden || e.target.matches('textarea, input')) return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  });
  addEventListener('resize', () => { if (!$('#teach').hidden) cells.forEach((_, i) => drawBox(i)); });
  $('#openBtn').onclick = () => $('#openFile').click();
  $('#openFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
  $('#exportBtn').onclick = exportPdf;
  const inkBtns = document.querySelectorAll('.ink');
  const markInk = () => inkBtns.forEach(b => b.classList.toggle('on', b.dataset.c === ink.color));
  inkBtns.forEach(b => (b.onclick = () => { ink.color = b.dataset.c; LS.set('color', ink.color); markInk(); if (sheet) sheet.pages.forEach(renderInk); }));
  markInk();
  $('#thick').value = ink.thick;
  $('#thick').oninput = () => { ink.thick = +$('#thick').value; LS.set('thick', ink.thick); if (sheet) sheet.pages.forEach(renderInk); };
  $('#txt').oninput = () => { if (sel) { sel.box.text = $('#txt').value; renderInk(sel.pg); } };
  $('#sz').oninput = () => { if (sel) { sel.box.u = +$('#sz').value; LS.set('u', sel.box.u); renderInk(sel.pg); } };
  $('#lg').oninput = () => { if (sel) { sel.box.gap = +$('#lg').value; LS.set('gap', sel.box.gap); renderInk(sel.pg); } };
  $('#nt').oninput = () => { if (sel) { sel.box.neat = +$('#nt').value; LS.set('neat', sel.box.neat); renderInk(sel.pg); } };
  $('#ver').textContent = 'LaiMue version ' + H.VERSION;
  $('#shuf').onclick = () => { if (sel) { sel.box.seed = (Math.random() * 1e9) | 0; renderInk(sel.pg); } };
  $('#del').onclick = () => { if (!sel) return; const s = sel; sel = null; $('#panel').hidden = true; removeBox(s); };
  $('#done').onclick = () => select(null);
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
  buildBoxes(); wire();
  try { const h = await db.get('hand'); if (h && h.g) hand = h; } catch { toast('This browser blocks saving — use ⋯ → Save my handwriting file.', 6000); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { }
  try { font = opentype.parse(await (await fetch('lib/Sriracha-Regular.ttf')).arrayBuffer()); } catch (e) { console.warn('fallback font', e); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (/[?&]test\b/.test(location.search)) return runTests();
  showTab(LS.get('tab', 'teach'));
})();
