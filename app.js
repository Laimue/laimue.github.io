'use strict';
const H = window.Hand, $ = s => document.querySelector(s), NS = 'http://www.w3.org/2000/svg';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('lm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lm.' + k, JSON.stringify(v)); } catch { /* per-device convenience only */ } },
};
function doneToast(msg) { toast(msg, 2500); const t = $('#toast'), d = document.createElement('span'); d.className = 'lot tick'; t.prepend(d); M.icon(d, 'done'); }
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms); }
// in-app confirm (replaces the browser's confirm()): resolves true / false. danger = the safe button (Cancel) has focus.
function ask(title, msg, { ok = 'OK', no = 'Cancel', danger = false } = {}) {
  const d = $('#ask'), y = $('#askOk'), n = $('#askNo'), back = document.activeElement, t = $('#askT');
  t.textContent = title; delete t.dataset.split; $('#askM').textContent = msg; y.textContent = ok; n.textContent = no; y.classList.toggle('danger', danger);
  d.hidden = false; M.pop(d.firstElementChild, t); (danger ? n : y).focus();
  return new Promise(res => {
    const done = v => { d.hidden = true; d.onkeydown = d.onclick = y.onclick = n.onclick = null; if (back && back.focus) back.focus({ preventScroll: true }); res(v); };
    y.onclick = () => done(true); n.onclick = () => done(false);
    d.onclick = e => { if (e.target === d) done(false); };
    d.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === y ? n : y).focus(); } };
  });
}
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

let hand = { v: 1, g: {} }, font = null, saveT, handGen = 0; // handGen: bumped whenever the letters change, so cached handwriting is redone
const fbCache = {};
const fb = ch => (ch in fbCache ? fbCache[ch] : (fbCache[ch] = font ? H.fontVariant(font, ch) : null));
const saveHand = () => { handGen++; clearTimeout(saveT); saveT = setTimeout(() => db.set('hand', hand).catch(() => toast('Could not save on this device — use ⋯ → Save my handwriting file.', 6000)), 300); };
// written sentences: their own key (hand is rewritten on every letter stroke), saved only on Next / delete; in the backup file as `sn`
let sents = [], cutG = {}, cutting = false;
const justSaved = new Set(); // sentences saved this session: their cut letters get the "learned" card (old ones re-cut at start don't)
const saveSents = () => { handGen++; return db.set('sents', sents).catch(() => toast('Could not save on this device — use ⋯ → Save my handwriting file.', 6000)); };
const use = () => ({ g: hand.g, c: cutG }); // what the engine writes with: taught letters + letters cut from sentences
function rebuildCut() { // newest first; a newer sentence's letters weigh a bit more, old ones still count
  cutG = {}; const n = sents.length;
  sents.forEach((r, k) => { if (r.cut) for (const p of r.cut.p) { p.w = 1 / (1 + (n - 1 - k) / 30); (cutG[p.ch] || (cutG[p.ch] = [])).unshift(p); } });
  for (const ch in cutG) cutG[ch] = cutG[ch].slice(0, 20); // shortcut: ≤20 cut versions per letter for speed; raise if output starts repeating
  handGen++;
}
async function cutAll() { // cut sentences into letters in the background, one row at a time so the page stays smooth
  if (cutting || !font) return; cutting = true;
  try {
    for (let r; (r = sents.find(q => !q.cut || q.cut.v !== H.CUTV));) {
      let p = [];
      try { for (let i = 0; i < r.lines.length; i++) { await new Promise(res => setTimeout(res, 30)); p.push(...H.cutRow(r, i, hand, fb)); } }
      catch (e) { console.warn('cut', e); p = []; } // a page it can't read teaches nothing
      if (sents.includes(r)) { r.cut = { v: H.CUTV, p }; rebuildCut(); saveSents(); }
      if (justSaved.delete(r) && p.length) { const chs = [...new Set(p.map(q => q.ch))]; if (!M.learned(chs, $('#sentRows li'))) toast(`Learned ${chs.length} letters: ${chs.join(' ')}`, 2500); }
    }
  } finally { cutting = false; }
}

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
const okStroke = a => Array.isArray(a) && a.length >= 2 && a.length % 2 === 0 && a.length <= 20000 && a.every(Number.isFinite);
function validSents(list) { // trust boundary too: the sentences part of a picked file
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && Array.isArray(r.lines) && r.lines.length >= 1 && r.lines.length <= 3 && r.lines.every(l => typeof l === 'string' && l.length <= 200)
    && Array.isArray(r.s) && r.s.length && r.s.length <= 3000 && r.s.every(okStroke) && Number.isFinite(r.w) && r.w > 0 && r.w < 100)
    .map(r => ({ id: String(r.id || Math.random().toString(36).slice(2)).slice(0, 40), t: Number.isFinite(r.t) ? r.t : 0, lines: r.lines, s: r.s, w: r.w, boxes: okBoxes(r.boxes, r.lines.length), tw: Number.isFinite(r.tw) && r.tw > 0 && r.tw < 100 ? r.tw : undefined, lang: r.lang === 'en' ? 'en' : 'th' }));
}
function okBoxes(b, rows) { // word boxes of a page (v25+); anything odd: none (the cutter then reads the whole row)
  return Array.isArray(b) && b.length <= 80 && b.every(q => q && Number.isInteger(q.r) && q.r >= 0 && q.r < rows && Number.isFinite(q.x0) && Number.isFinite(q.x1) && q.x0 < q.x1 && q.x1 < 100
    && typeof q.t === 'string' && q.t.length <= 80 && Number.isInteger(q.i) && q.i >= 0) ? b.map(({ r, x0, x1, t, i }) => ({ r, x0, x1, t, i })) : undefined;
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
const saveHandFile = () => saveFile(new Blob([JSON.stringify({ ...hand, sn: sents.map(({ cut, ...r }) => r) })], { type: 'application/json' }), 'laimue-handwriting.json');
async function loadHandFile(file) {
  let h = null, sn = []; try { const o = JSON.parse(await file.text()); h = validHand(o); sn = validSents(o.sn); } catch { }
  if (!h) return toast('That is not a LaiMue handwriting file.');
  if ((taught() || sents.length) && !(await ask('Replace your handwriting?', 'The letters and sentences on this device are replaced with this file.', { ok: 'Replace', danger: true }))) return;
  hand = h; sents = sn; rebuildCut(); saveHand(); saveSents(); cutAll(); renderTeach(); renderSentList(); if (sheet) sheet.pages.forEach(renderInk); toast('Handwriting loaded');
}
async function clearHand() {
  if (!taught() && !sents.length) return toast('There are no letters to clear yet.');
  if (!(await ask('Erase everything?', 'All the letters and sentences you wrote on this device are erased. This cannot be undone. If you might want them back, tap Cancel and use "Save my handwriting file" first.', { ok: 'Erase all', danger: true }))) return;
  hand = { v: 1, g: {} }; sents = []; rebuildCut(); saveHand(); saveSents(); renderTeach(); renderSentList(); if (sheet) sheet.pages.forEach(renderInk); toast('All letters cleared. Write them again on the Teach tab.');
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
  const cv = padCv();
  attachPen(cv, {
    pt: e => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width * H.BOX_W).toFixed(3), +((e.clientY - r.top) / r.height * H.BOX_H).toFixed(3)]; },
    down: () => { cancelAdv(); if (M.settle(cv)) { M.settle(ghosts()[0]); M.settle(ghosts()[1]); drawGhosts(); } }, // a letter swap still running ends now, so the stroke lands on this letter
    draw: drawPad,
    end: pts => { const l = slots(CHARS[cur].ch); l[ver] = { s: [...(l[ver] ? l[ver].s : []), pts] }; dirty = true; saveHand(); drawPad(); drawChip(cur); progress(); queueAdv(); },
  });
  $('#undo').onclick = () => edit(s => (s.pop(), s));
  $('#clear').onclick = () => { if (slots(CHARS[cur].ch)[ver]) M.strike(padCv()); edit(() => []); };
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
let inkT = 0, inkMs = 0; // pen-down time this session, shown as t = mm:ss in the header (updated on lift only)
const clock = () => { const s = Math.round(inkMs / 1000); $('#clock').textContent = 't = ' + String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
// a drawing surface; o.pt(e) -> [x, y] in box units, o.down() before a stroke, o.draw() while inking, o.end(points)
function attachPen(cv, o) {
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; LS.set('pen', true); document.body.classList.add('pen-seen'); }
    if ((e.pointerType === 'touch' && penSeen) || drawing) return; // palm rejection once a Pencil was used
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { } // synthetic test pointers can't be captured
    o.down(); inkT = performance.now();
    document.body.classList.add('inking');
    drawing = { id: e.pointerId, pts: o.pt(e) }; o.draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = o.pt(ev), p = drawing.pts;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.012) p.push(x, y);
    }
    o.draw();
  });
  const end = e => {
    if (!drawing || drawing.id !== e.pointerId) return;
    const d = drawing; drawing = null; document.body.classList.remove('inking'); inkMs += performance.now() - inkT; clock();
    o.end(d.pts);
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
  $('#hudPos').textContent = `Letter ${n} / ${N}`; $('#figL').textContent = 'fig.' + n; $('#hudGrp').textContent = c.group;
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
  const r = H.layout(text, use(), { x: 4, y: 0, width: w - 8, u: 16, gap: 2.4, seed: 1, fb });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${r.height}" width="100%" height="${r.height}">${penPaths(r, '#141414')}<path d="${pathD(r.fills, true)}" fill="#141414"/></svg>`;
}
function progress() {
  if ($('#pvWrap').open) renderPreview();
  const done = taught();
  $('#rulerHead').style.left = (100 * done / REQ.length) + '%';
  $('#progText').textContent = `${done}/${REQ.length} taught`;
  const first = lastDone >= 0 && lastDone < REQ.length && done === REQ.length; lastDone = done;
  if (first && !M.flash('ครบแล้ว · all letters taught', null, null, { at: $('#progText') })) doneToast('All letters taught'); // the ember already runs the track (CSS)
  if (done === REQ.length && !LS.get('doneNag', false)) {
    LS.set('doneNag', true);
    setTimeout(async () => { if (await ask('All letters taught.', 'Save your handwriting file now as a backup?', { ok: 'Save file', no: 'Later' })) saveHandFile(); }, 1600);
  }
}

// ---------- Sentences: copy one real sentence (Thai or English) on one ruled line (BOX_H high, in box units). Each written
// page is a record {id, t, lines, s: strokes over the whole pad, w: pad width, tw: typed width, lang} that teaches the engine.
let slang = LS.get('slang', 'th') === 'en' ? 'en' : 'th', sink = [], spadU = 0, tmode = LS.get('tmode', 'letters'), wEnds = [];
const banks = {}, pkey = () => (slang === 'en' ? 'spage.en' : 'spage'); // one waiting page per language ('spage' = the Thai one, as before)
let spage = LS.get(pkey(), null);
const ROW = H.BOX_H, spadCv = () => $('#spad');
const loadBank = lang => (banks[lang] ? Promise.resolve(banks[lang]) : fetch(lang === 'en' ? 'bank-en.json' : 'bank.json').then(r => r.json()).then(b => (banks[lang] = b)));
function have() { // samples of each letter so far: taught versions + letters cut from sentences (+ a little for each time written)
  const n = {}; for (const c of CHARS) n[c.ch] = count(c.ch);
  for (const ch in cutG) n[ch] = (n[ch] || 0) + cutG[ch].length;
  for (const r of sents) for (const c of r.lines.join('')) n[c] = (n[c] || 0) + 0.3;
  return n;
}
const typedX = t => { const cb = H.layout(t, null, { x: 0, y: 0, width: 1e4, u: 1, seed: 1, fb }).cb.filter(Boolean); return cb.length ? [Math.min(...cb.map(c => c[0])), Math.max(...cb.map(c => c[2]))] : [0, 8]; }; // typed ink from-to, box units
async function newPage(anim, dir = 1) { // one one-line sentence per page on one ruled line (no word boxes: the cutter reads the whole row); anim: the card swaps and the sentence writes on
  const lang = slang; let b; $('#sentText').classList.toggle('loading', !banks[lang]);
  try { b = await loadBank(lang); } catch { return toast('Could not load the sentences. Check the internet once, then try again.'); } finally { $('#sentText').classList.remove('loading'); }
  if (lang !== slang) return; // switched language while loading
  const one = b.filter(i => i.length === 1 && (lang === 'en' || i[0].replace(/[ัิ-ฺ็-๎ ]/g, '').length <= 14)); // Thai ≤14 letters: short enough for handwriting size on an iPad (the picker prefers long ones); the English bank is width-capped already
  const p = H.pickLines(one, have(), new Set(sents.flatMap(r => [...r.lines, r.lines.join('').replace(/ /g, '')])), Math.random, 1, 1);
  if (!p.lines.length) return toast('You have written every sentence!');
  const [a, z] = typedX(p.lines[0]), tw = z - a;
  const w = +Math.max(11, 1.3 * tw + 1).toFixed(2), go = () => { spage = { lines: [p.lines[0]], w, tw: +tw.toFixed(2), lang }; LS.set(pkey(), spage); sink = []; renderSent(); if (anim) M.type($('#sentText li')); }; // room for the hand: 1.3x the typed width
  if (anim) M.swap([$('#sentText'), spadCv()], dir, go); else go();
}
function words(s, lang) { // [text, isSpace] pieces: words (punctuation stays on the word before it) and the spaces between
  const seg = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(s)] : s.split(/(\s+)/).filter(Boolean).map(t => ({ segment: t, isWordLike: true }));
  const out = [];
  for (const g of seg) {
    const t = g.segment, sp = /^\s+$/.test(t), last = out[out.length - 1];
    if (sp) out.push([t, true]); else if (!g.isWordLike && last && !last[1]) last[0] += t; else out.push([t, false]);
  }
  return out;
}
function renderSent() {
  if (!spage || spage.boxes || spage.lines.length !== 1 || (spage.lang || 'th') !== slang) return newPage(); // a v25 page (boxes, rows) is swapped for a one-line one
  const ol = $('#sentText'), li = document.createElement('li'), line = spage.lines[0], [x0, x1] = typedX(line);
  if (!spage.tw) spage.tw = +(x1 - x0).toFixed(2); // a page from before v28
  ol.textContent = ''; ol.lang = slang; wEnds = []; let pre = '';
  for (const [t, sp] of words(line, slang)) { // karaoke word spans; each word's typed end (prefix layouts: same seed, same places)
    pre += t; if (sp) { li.append(t); continue; }
    const w = document.createElement('span'); w.className = 'w'; w.textContent = t; li.append(w); wEnds.push(typedX(pre)[1] - x0);
  }
  ol.append(li);
  $('#sentFig').textContent = `FIG.02 — Sentence ${String(sents.length + 1).padStart(3, '0')} · ${slang.toUpperCase()}`;
  sizeSpad(); kara();
}
function sizeSpad() {
  const st = $('.sstage'), cv = spadCv(), rows = spage.lines.length, mg = matchMedia('(max-width: 640px)').matches ? 0 : 34;
  st.classList.remove('fit'); st.style.height = ''; if (!st.clientWidth) return; // measure the free room, then hug the card so the sentence, pad and buttons sit together
  spadU = Math.min((st.clientWidth - 2 * mg) / spage.w, (st.clientHeight - 30) / (rows * ROW), 56); // ≤56px between the x-height and base lines (~11 mm on iPad): handwriting size; room for the margin labels and the ruler
  cv.style.width = spage.w * spadU + 'px'; cv.style.height = rows * ROW * spadU + 'px';
  $('#spadWrap').style.setProperty('--u', spadU + 'px'); st.style.height = rows * ROW * spadU + 46 + 'px'; st.classList.add('fit');
  const ru = $('#sRuler'), step = 2 * spadU < 40 ? 4 : 2; ru.querySelectorAll('b').forEach(b => b.remove());
  for (let u = 0, i = 0; u <= spage.w; u += step, i++) { const b = document.createElement('b'); b.textContent = u; b.style.left = u / spage.w * 100 + '%'; b.style.setProperty('--i', i); ru.append(b); }
  const ol = $('#sentText'); ol.style.fontSize = ''; const k = ol.clientWidth / ol.scrollWidth; // the sentence stays on one line
  if (k < 1) ol.style.fontSize = parseFloat(getComputedStyle(ol).fontSize) * k * 0.98 + 'px';
  drawSpad();
}
function drawSpad() {
  const cv = spadCv(), rows = spage.lines.length, k = spadU * (devicePixelRatio || 1), W = Math.round(spage.w * k), Ht = Math.round(rows * ROW * k);
  if (cv.width !== W || cv.height !== Ht) { cv.width = W; cv.height = Ht; }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, Ht); x.setTransform(k, 0, 0, k, 0, 0);
  x.lineWidth = 1 / spadU;
  const hl = (y, col, dash) => { x.strokeStyle = col; x.setLineDash(dash ? [4 / spadU, 4 / spadU] : []); x.beginPath(); x.moveTo(0, y); x.lineTo(spage.w, y); x.stroke(); };
  for (let r = 0; r < rows; r++) { // the Letters pad's lines; the letter body goes in the tinted band between x-height and base
    const y = r * ROW; x.fillStyle = 'rgba(255,77,23,0.07)'; x.fillRect(0, y + H.XH, spage.w, H.BASE - H.XH);
    hl(y + 0.3, '#e2dfd8', 1); hl(y + 2.5, '#e2dfd8', 1);
    x.lineWidth = 1.5 / spadU; hl(y + H.XH, '#b3afa5'); x.lineWidth = 2.5 / spadU; hl(y + H.BASE, '#5c5952'); x.lineWidth = 1 / spadU;
  }
  x.setLineDash([]); x.strokeStyle = '#141414'; x.lineWidth = 0.075; x.lineCap = x.lineJoin = 'round';
  for (const a of sink) strokeLine(x, a);
  if (drawing) strokeLine(x, drawing.pts);
}
function inkX(s) { let a = Infinity, b = -Infinity; for (const p of s) for (let i = 0; i < p.length; i += 2) { if (p[i] < a) a = p[i]; if (p[i] > b) b = p[i]; } return [a, b]; }
function ratio() { // how much wider this person writes than the typed line: median of their last 5 pages; 1.2 until known
  const r = sents.filter(q => q.tw).slice(-5).map(q => { const [a, b] = inkX(q.s); return (b - a) / q.tw; }).sort((a, b) => a - b);
  return r.length ? Math.min(1.6, Math.max(0.8, r[r.length >> 1])) : 1.2;
}
function kara() { // karaoke, on pen-up only: words copied so far go ink, the one being copied orange, the rest wait faint; the ember marks the last lift
  const on = sink.length > 0, [a, b] = inkX(sink), got = on ? (b - a) / ratio() + 0.1 : -1; let cur = false;
  document.querySelectorAll('#sentText .w').forEach((w, i) => { const d = on && wEnds[i] <= got, c = on && !d && !cur; if (c) cur = true; w.classList.toggle('done', d); w.classList.toggle('cur', c); });
  $('#sentText').classList.toggle('kara', on); // a fresh sentence reads in full
  const h = $('#sHead'); h.hidden = !on; if (on) h.style.left = b / spage.w * 100 + '%';
}
function renderSentList() { // the filmstrip: newest first, each card the written ink (one SVG path: light even with hundreds of pages)
  $('#sentN').textContent = sents.length;
  const ul = $('#sentRows'); ul.textContent = '';
  for (const r of [...sents].reverse()) {
    const li = document.createElement('li'), sv = document.createElementNS(NS, 'svg'), pa = document.createElementNS(NS, 'path'), tg = document.createElement('span'), del = document.createElement('button'), txt = r.lines.join(' / ');
    sv.setAttribute('viewBox', `0 0 ${r.w} ${ROW}`); sv.setAttribute('aria-hidden', 'true');
    pa.setAttribute('d', r.s.map(a => 'M' + a[0] + ' ' + a[1] + (a.length > 2 ? 'L' + a.slice(2).join(' ') : 'h.001')).join(''));
    for (const [k, v] of [['fill', 'none'], ['stroke', '#141414'], ['stroke-width', '0.075'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) pa.setAttribute(k, v); // on the path: the Next flight clones it outside the strip
    sv.append(pa); li.title = txt; li.setAttribute('aria-label', txt);
    tg.className = 'tag mono'; tg.textContent = r.lang === 'en' ? 'EN' : 'TH';
    del.className = 'icon'; del.setAttribute('aria-label', 'Delete this sentence'); del.innerHTML = '<svg class="i"><use href="#i-trash"/></svg>';
    del.onclick = async () => { if (!(await ask('Delete this sentence?', 'The app stops learning from it.', { ok: 'Delete', danger: true }))) return; sents = sents.filter(q => q !== r); rebuildCut(); saveSents(); setTimeout(renderSentList, M.strike(li) * 1000); };
    li.append(sv, tg, del); ul.append(li);
  }
}
const langBtns = () => document.querySelectorAll('#sentLang button').forEach(b => { b.classList.toggle('on', b.dataset.l === slang); b.setAttribute('aria-pressed', b.dataset.l === slang); });
const TITLES = { letters: 'Teach your <em>hand.</em>', sentences: 'Copy one <em>line.</em>' };
function setMode(m, anim) {
  tmode = m === 'sentences' ? m : 'letters'; LS.set('tmode', tmode);
  const tt = $('#teachTitle'); if (tt.dataset.m !== tmode) { tt.innerHTML = TITLES[tmode]; tt.dataset.m = tmode; delete tt.dataset.split; }
  $('#lettersPane').hidden = $('#lettersHud').hidden = tmode !== 'letters'; $('#sentPane').hidden = $('#sentLang').hidden = $('#sentFig').hidden = tmode === 'letters';
  document.querySelectorAll('#teachMode button').forEach(b => { b.classList.toggle('on', b.dataset.m === tmode); b.setAttribute('aria-selected', b.dataset.m === tmode); });
  if (tmode === 'letters') { renderTeach(); M.frame($('#padWrap')); } else { cancelAdv(); langBtns(); renderSentList(); renderSent(); M.frame($('#spadWrap')); }
  if (anim) { M.tab($(tmode === 'letters' ? '#lettersPane' : '#sentPane'), tmode === 'letters' ? -1 : 1); M.type(tt); if (tmode === 'sentences') M.type($('#sentText li'), 0.2); }
  M.focus($(tmode === 'letters' ? '#padWrap' : '#spadWrap'));
}
function buildSent() {
  const cv = spadCv();
  attachPen(cv, {
    pt: e => { const r = cv.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width * spage.w).toFixed(3), +((e.clientY - r.top) / r.height * spage.lines.length * ROW).toFixed(3)]; },
    down: () => { }, draw: drawSpad, end: pts => { sink.push(pts); drawSpad(); kara(); },
  });
  document.querySelectorAll('#teachMode button').forEach(b => (b.onclick = () => b.dataset.m !== tmode && setMode(b.dataset.m, true)));
  document.querySelectorAll('#sentLang button').forEach(b => (b.onclick = async () => {
    const l = b.dataset.l, dir = l === 'en' ? 1 : -1; if (l === slang) return;
    if (sink.length && !(await ask(l === 'en' ? 'Switch to English?' : 'Switch to Thai?', 'What you wrote here is thrown away.', { ok: 'Switch', no: 'Keep writing' }))) return;
    slang = l; LS.set('slang', l); langBtns(); sink = []; spage = LS.get(pkey(), null); // that language's waiting page, if any
    if (spage && !spage.boxes && (spage.lang || 'th') === l) M.swap([$('#sentText'), spadCv()], dir, () => { renderSent(); M.type($('#sentText li')); }); else newPage(true, dir);
  }));
  $('#sUndo').onclick = () => { sink.pop(); drawSpad(); kara(); };
  $('#sClear').onclick = () => { const n = sink.length; if (n) setTimeout(() => { sink = sink.slice(n); drawSpad(); kara(); }, M.strike(spadCv()) * 1000); }; // ink is wiped after the strike; a stroke begun meanwhile stays
  $('#sSkip').onclick = async () => { if (!sink.length || await ask('Another sentence?', 'What you wrote here is thrown away.', { ok: 'New sentence', no: 'Keep writing' })) newPage(true); };
  $('#sNext').onclick = () => {
    if (!sink.length) return toast('Copy the lines on the pad first.');
    const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), lines: spage.lines, s: sink, w: spage.w, tw: spage.tw, lang: slang };
    sents.push(r); justSaved.add(r); saveSents(); renderSentList(); M.into($('#sentRows li svg'), spadCv()); // the written line shrinks into its card
    toast(`Saved. ${sents.length} written so far.`, 2000); newPage(true); cutAll();
  };
}

// ---------- Worksheet screen
let sheet = null, sel = null, down = null;
const ink = { color: LS.get('color', '#1a1a1a'), thick: LS.get('thick', 1) };
// v19: handwriting cached per box; only new text, size, look or letters lay it out again (slow on long text), a move just shifts the ink
const layKey = b => [b.text, b.w, b.u, b.gap, b.seed, b.neat ?? 1, ink.thick, JSON.stringify(b.mods || null), handGen].join('\u0001');
const lay = b => {
  const key = layKey(b);
  let c = b.lc;
  if (!c || c.key !== key) {
    const r = H.layout(b.text, use(), { x: b.x, y: b.y, width: b.w, u: b.u, gap: b.gap, seed: b.seed, fb, thick: ink.thick, neat: b.neat ?? 1, mods: b.mods });
    const e = r.ink = [Infinity, Infinity, -Infinity, -Infinity]; // what was written (a wide formula can pass the box edge)
    for (const a of [...r.strokes, ...r.fills]) for (let i = 0; i < a.length; i += 2) { e[0] = Math.min(e[0], a[i]); e[2] = Math.max(e[2], a[i]); e[1] = Math.min(e[1], a[i + 1]); e[3] = Math.max(e[3], a[i + 1]); }
    c = b.lc = { key, x: b.x, y: b.y, r };
  } else if (c.x !== b.x || c.y !== b.y) { // pens hold the same arrays as strokes, so each point moves once
    const dx = b.x - c.x, dy = b.y - c.y;
    for (const a of [...c.r.strokes, ...c.r.fills]) for (let i = 0; i < a.length; i += 2) { a[i] += dx; a[i + 1] += dy; }
    for (const q of [...c.r.cb, c.r.ink]) if (q) { q[0] += dx; q[1] += dy; q[2] += dx; q[3] += dy; }
    c.x = b.x; c.y = b.y;
  }
  return c.r;
};
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
    // the box frames what was written: it grows past its width/top when a formula reaches out (empty ink = Infinity, so min/max keep the box)
    const s = b.el.style, open = ed && ed.box === b, p = b.u * 0.25, e = r.ink;
    const x0 = open ? b.x : Math.min(b.x, e[0] - p), y0 = open ? b.y : Math.min(b.y, e[1] - p), x1 = open ? b.x + b.w : Math.max(b.x + b.w, e[2] + p), y1 = Math.max(b.y + b.h, e[3] + p);
    s.left = 100 * x0 / pg.w + '%'; s.top = 100 * y0 / pg.h + '%'; s.width = 100 * (x1 - x0) / pg.w + '%'; s.height = open ? 'auto' : 100 * (y1 - y0) / pg.h + '%';
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
  box.el.classList.remove('edit');
  const has = !!box.text.trim(), done = () => { box.el.classList.remove('busy'); renderInk(pg); if (has && box.g) M.writeOn(box.g, 1.5); };
  if (has) M.handover(box.el, t);
  // long text takes a moment to write: show "writing…" first (two frames so it paints) instead of a frozen screen
  if (box.text.length > 120 && !(box.lc && box.lc.key === layKey(box))) { box.el.classList.add('busy'); requestAnimationFrame(() => requestAnimationFrame(done)); } else done();
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
async function buildPdf(onPage) { // onPage(i): progress, with a short pause so the screen can show it
  const P = PDFLib; let pdf;
  if (sheet.kind === 'pdf') pdf = await P.PDFDocument.load(sheet.bytes, { ignoreEncryption: true });
  else {
    pdf = await P.PDFDocument.create(); const img = await pdf.embedJpg(sheet.jpg), pg = sheet.pages[0];
    pdf.addPage([pg.w, pg.h]).drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
  }
  const [r, g, b] = hex(ink.color);
  for (let i = 0; i < sheet.pages.length; i++) {
    const pg = sheet.pages[i];
    if (onPage) { onPage(i); await new Promise(res => setTimeout(res, 40)); }
    if (!pg.boxes.length) continue;
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
  }
  return pdf.save();
}
async function exportPdf() {
  if (!sheet) return; select(null);
  const btn = $('#exportBtn'), lb = btn.querySelector('span'), n = sheet.pages.length; btn.disabled = true;
  const fm = M.film(sheet.pages);
  try {
    const bytes = await buildPdf(i => { lb.textContent = `Saving ${i + 1}/${n}`; fm.step(i); }); fm.end(btn);
    await saveFile(new Blob([bytes], { type: 'application/pdf' }), sheet.name.replace(/\.[^.]+$/, '') + '-laimue.pdf');
    lb.textContent = 'Saved'; setTimeout(() => { if (lb.textContent === 'Saved') lb.textContent = 'Save PDF'; }, 1800);
    if (!M.flash('', null, null, { at: btn })) doneToast('PDF saved'); if (!LS.get('support', false)) { LS.set('support', true); setTimeout(openSupport, 1800); } }
  catch (e) { console.error(e); fm.end(); lb.textContent = 'Save PDF'; toast('Could not make the PDF: ' + e.message, 6000); }
  btn.disabled = false;
}

// ---------- tabs, wiring, start
function showTab(t) {
  const dir = t === 'sheet' ? 1 : -1; LS.set('tab', t);
  for (const s of ['teach', 'sheet']) $('#' + s).hidden = s !== t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t !== 'teach') cancelAdv();
  M.tab($('#' + t), dir);
  if (t === 'teach') requestAnimationFrame(() => { setMode(tmode); M.words($('#teachTitle')); });
  else if (sheet) sheet.pages.forEach(pg => { renderInk(pg); M.writeOn(pg.svg); });
  else { M.frame($('.term')); M.focus($('.term')); M.prompt($('#promptTxt'), 'เปิดใบงาน แล้วเขียนคำตอบ…'); }
  if (t === 'sheet') M.type($('#sheetName'));
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
  $('#themeBtn').onclick = e => { // the new theme opens as a circle from the ⋯ button where the browser can (CSS ::view-transition)
    e.stopPropagation(); const t = themes[(themes.indexOf(LS.get('theme', 'auto')) + 1) % 3];
    LS.set('theme', t); // now, so a quick second tap moves on from this one
    if (document.startViewTransition && M.can()) document.startViewTransition(() => setTheme(t)).ready.catch(() => { }); else setTheme(t); // a tap mid-transition skips it (its ready rejects); the theme still applies
  };
  const sfxName = () => ($('#sfxName').textContent = S.on() ? 'On' : 'Off'); sfxName();
  $('#sfxBtn').onclick = e => { e.stopPropagation(); S.set(!S.on()); sfxName(); };
  clock();
  $('#loadHand').onclick = () => $('#loadHandFile').click();
  $('#loadHandFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadHandFile(f); };
  document.addEventListener('keydown', e => {
    if ($('#teach').hidden || !$('#ask').hidden || e.target.matches('textarea, input')) return;
    if (e.key === 'ArrowRight') go(cur + 1, 1); else if (e.key === 'ArrowLeft') go(cur - 1, -1);
  });
  addEventListener('resize', () => { if (!$('#teach').hidden) { cancelAdv(); renderTeach(); if (tmode === 'sentences' && spage) sizeSpad(); } });
  $('#openBtn').onclick = $('#openBtn2').onclick = () => $('#openFile').click();
  document.querySelectorAll('[data-tool]').forEach(b => (b.onclick = () => setTool(b.dataset.tool))); setTool(tool);
  document.querySelectorAll('#lassoMenu button').forEach(b => (b.onclick = e => { e.stopPropagation(); lassoAct(b.dataset.l); }));
  if (penSeen) document.body.classList.add('pen-seen');
  // iPad: no pinch zoom of the whole app; a Pencil on a drawing surface never scrolls the page
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if ([...e.touches].some(t => t.touchType === 'stylus') && e.target.closest('#pad, #spad, .page.lasso')) e.preventDefault(); }, { passive: false });
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
  $('#supOpen').onclick = e => { e.stopPropagation(); $('#menuList').hidden = true; openSupport(); };
  $('#supClose').onclick = () => ($('#support').hidden = true);
  $('#support').onclick = e => { if (e.target.id === 'support') $('#support').hidden = true; };
}

async function runTests() { // open with ?test
  showTab('sheet');
  const res = H.selfTest(fb), out = document.createElement('div'); out.id = 'testOut'; document.body.append(out);
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 420]);
  await openPdf('test.pdf', (await doc.save()).slice().buffer);
  const pg = sheet.pages[0], box = { x: 30, y: 30, w: 530, u: 12, gap: 2.4, seed: 7, text: 'สวัสดีครับ ปู่น้ำกั๊ก ญี่ปุ่น ฎุ เกียรติ ป้า ปี่ ศักดิ์ ฤดู ทำน้ำ\nLaiMue 123 ๑๒๓ (ทดสอบ) ภาษาไทยเป็นภาษาที่สวยงามมาก' };
  hand = H.fakeHand(fb, 11, true); handGen++; // messy fake person, only in memory (never saved)
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

const SUPPORT_URL = ''; // paste a Ko-fi / PromptPay link here; empty = popup has no support button
function openSupport() { $('#supLink').hidden = !SUPPORT_URL; if (SUPPORT_URL) $('#supLink').href = SUPPORT_URL; $('#support').hidden = false; M.pop($('.sup-card')); }

function unboot() { const b = $('#boot'); if (!b) return; b.classList.add('out'); setTimeout(() => b.remove(), 450); } // the ember splash fades once the app can be used
setTimeout(unboot, 8000); // never stuck behind it
(async function init() {
  buildTeach(); buildSent(); wire();
  try { const h = await db.get('hand'); if (h && h.g) hand = h; const s = await db.get('sents'); if (Array.isArray(s)) sents = s; } catch { toast('This browser blocks saving — use ⋯ → Save my handwriting file.', 6000); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { }
  const refs = fetch('refs.json').then(r => r.json()).then(H.setRefs).catch(e => console.warn('reference hands', e)); // without them letters still vary, just less
  try { font = opentype.parse(await (await fetch('lib/Sriracha-Regular.ttf')).arrayBuffer()); } catch (e) { console.warn('fallback font', e); }
  await refs; lastDone = taught(); rebuildCut(); cutAll();
  unboot();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (/[?&]test\b/.test(location.search)) return runTests();
  showTab(LS.get('tab', 'teach'));
  if (!LS.get('intro', false)) showIntro();
})();
function showIntro() { // the app name written in the person's own hand (typed font for letters not taught yet)
  const r = H.layout('ลายมือ', use(), { x: 0, y: 0, width: 1000, u: 60, gap: 2.4, seed: 7, fb, thick: 1, neat: 1 });
  const all = [...r.pens.flatMap(([, s]) => s), ...r.fills]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const a of all) for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
  const m = 12, svg = all.length ? `<svg viewBox="${x0 - m} ${y0 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}">${stkPaths(r, 'currentColor')}${r.fills.length ? `<path class="fil" d="${pathD(r.fills, true)}" fill="currentColor"/>` : ''}</svg>` : 'ลายมือ';
  M.intro(svg, () => LS.set('intro', true));
}
