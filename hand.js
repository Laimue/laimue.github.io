/* LaiMue handwriting engine. "Box units": x-height line y=1, baseline y=2, y grows down. */
(function (root) {
  'use strict';
  const XH = 1, BASE = 2, BOX_W = 1.6, BOX_H = 2.6, GX = 0.25, FIRST = 1.75;
  const K = 1 / 563; // Sriracha: height of ก in font units = 1 box unit
  const GHOST = { r: GX + 553 * K, adv: GX + 589 * K }; // grey ก in mark boxes: right edge, advance
  const UPPER = new Set('ัิีึื็ํ');
  const TOP = new Set('่้๊๋์๎');
  const LOWER = new Set('ฺุู');
  const AM = 'ำ', TALL = new Set('ปฝฟฬ');
  const isMark = c => UPPER.has(c) || TOP.has(c) || LOWER.has(c);
  const needsGhost = c => isMark(c) || c === AM;
  const GROUPS = [
    ['พยัญชนะ Consonants', 'กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'],
    ['สระ Vowels', 'ะาำิีึืุูเแโใไั็ฤ'],
    ['วรรณยุกต์ Tone marks', '่้๊๋์ๆฯ'],
    ['ตัวเลข Numbers', '0123456789'],
    ['Optional: เลขไทย', '๐๑๒๓๔๕๖๗๘๙'],
    ['Optional: symbols (auto-made if skipped)', '.,?!()-:/"\'+=%'],
    ['Optional: rare letters', 'ฃฅฦๅํ'],
    ['Optional: English', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
  ];
  const REQUIRED_GROUPS = 4;

  // Simple symbols made from pen lines, so nobody has to draw them (box units).
  const arc = (cx, cy, rx, ry, a0, a1, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push(+(cx + rx * Math.cos(a)).toFixed(3), +(cy + ry * Math.sin(a)).toFixed(3)); } return o; };
  const DOT = y => [0.38, y, 0.4, y + 0.02], PI = Math.PI;
  const SYNTH = {
    '.': [DOT(1.93)], ',': [[0.4, 1.9, 0.41, 2.0, 0.35, 2.12]], '-': [[0.25, 1.5, 0.78, 1.48]],
    ':': [DOT(1.35), DOT(1.93)], '/': [[0.75, 0.8, 0.25, 2.1]], "'": [[0.35, 0.75, 0.33, 1.05]],
    '"': [[0.32, 0.75, 0.3, 1.05], [0.5, 0.75, 0.48, 1.05]], '+': [[0.25, 1.5, 0.78, 1.5], [0.51, 1.22, 0.51, 1.78]],
    '=': [[0.25, 1.38, 0.78, 1.38], [0.25, 1.62, 0.78, 1.62]], '!': [[0.4, 0.8, 0.38, 1.65], DOT(1.93)],
    '(': [arc(0.75, 1.5, 0.4, 0.78, -2.2, -4.08)], ')': [arc(0.25, 1.5, 0.4, 0.78, -0.94, 0.94)],
    '?': [arc(0.5, 1.05, 0.25, 0.25, PI, 2.5 * PI).concat([0.5, 1.55, 0.5, 1.68]), [0.5, 1.93, 0.52, 1.95]],
    '%': [[0.78, 0.9, 0.25, 2.05], arc(0.33, 1.15, 0.1, 0.12, 0, 2 * PI), arc(0.7, 1.85, 0.1, 0.12, 0, 2 * PI)],
  };
  const SYNTH_V = {};
  const synth = ch => SYNTH[ch] ? (SYNTH_V[ch] || (SYNTH_V[ch] = { s: SYNTH[ch] })) : null;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const BB = new WeakMap();
  function bbox(v) {
    let b = BB.get(v); if (b) return b;
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const a of (v.s || v.p)) for (let i = 0; i < a.length; i += 2) {
      if (a[i] < b.x0) b.x0 = a[i]; if (a[i] > b.x1) b.x1 = a[i];
      if (a[i + 1] < b.y0) b.y0 = a[i + 1]; if (a[i + 1] > b.y1) b.y1 = a[i + 1];
    }
    BB.set(v, b); return b;
  }
  function tailLeft(v) { // left edge of the part that rises above the x-height (tail of ป ฝ ฟ ฬ)
    let m = Infinity;
    for (const a of (v.s || v.p)) for (let i = 0; i < a.length; i += 2) if (a[i + 1] < XH - 0.12 && a[i] < m) m = a[i];
    return m;
  }

  // Font glyph -> filled polygons in box units (fallback for letters not drawn yet).
  function fontVariant(font, ch) {
    const g = font.charToGlyph(ch); if (!g || !g.index) return null;
    const ox = needsGhost(ch) ? GHOST.adv : GX;
    const polys = []; let cur = null, px = 0, py = 0;
    const P = (x, y) => { cur.push(+(ox + x * K).toFixed(4), +(BASE + y * K).toFixed(4)); px = x; py = y; };
    for (const c of g.getPath(0, 0, font.unitsPerEm).commands) {
      if (c.type === 'M') { cur = []; polys.push(cur); P(c.x, c.y); }
      else if (c.type === 'L') P(c.x, c.y);
      else if (c.type === 'Q') { const x0 = px, y0 = py; for (let t = 1; t <= 6; t++) { const s = t / 6, a = 1 - s; P(a * a * x0 + 2 * a * s * c.x1 + s * s * c.x, a * a * y0 + 2 * a * s * c.y1 + s * s * c.y); } }
      else if (c.type === 'C') { const x0 = px, y0 = py; for (let t = 1; t <= 8; t++) { const s = t / 8, a = 1 - s; P(a * a * a * x0 + 3 * a * a * s * c.x1 + 3 * a * s * s * c.x2 + s * s * s * c.x, a * a * a * y0 + 3 * a * a * s * c.y1 + 3 * a * s * s * c.y2 + s * s * s * c.y); } }
    }
    const p = polys.filter(q => q.length >= 6);
    return p.length ? { p } : null;
  }

  // This person's usual size: median of (reference height / drawn height) over their consonants.
  function personScale(hand, fb) {
    const ks = [];
    if (hand && hand.g && fb) for (const ch of GROUPS[0][1]) for (const v of hand.g[ch] || []) {
      const r = v && v.s && v.s.length && fb(ch); if (!r) continue;
      const u = bbox(v), f = bbox(r); ks.push((f.y1 - f.y0) / Math.max(u.y1 - u.y0, 0.02));
    }
    ks.sort((a, b) => a - b); return ks.length ? ks[ks.length >> 1] : 0;
  }
  // Drawn letters float and vary in size: move each onto the line where the reference font puts
  // that letter, at the reference height (kept within ±25% of this person's usual size).
  const NORM = new WeakMap();
  function normalize(v, ch, fb, S) {
    const ref = fb && fb(ch); if (!ref) return v;
    const c = NORM.get(v); if (c && c.S === S) return c.v;
    const u = bbox(v), f = bbox(ref);
    let k = (f.y1 - f.y0) / Math.max(u.y1 - u.y0, 0.02);
    const mark = needsGhost(ch), plain = !mark && f.y0 >= XH - 0.15 && f.y1 <= BASE + 0.15; // no tail: exact same height
    if (S && !plain) k = Math.min(Math.max(k, 0.75 * S), 1.25 * S);
    const topAlign = LOWER.has(ch) || (!mark && f.y1 > BASE + 0.15); // hang below-line letters from the top
    const ty = topAlign ? f.y0 - u.y0 * k : f.y1 - u.y1 * k, tx = mark ? f.x1 - u.x1 * k : GX - u.x0 * k;
    const out = { s: v.s.map(a => a.map((q, i) => +(i % 2 ? q * k + ty : q * k + tx).toFixed(4))) };
    NORM.set(v, { S, v: out }); return out;
  }

  function variantsFor(hand, ch, fb, S) {
    const drawn = ((hand && hand.g && hand.g[ch]) || []).filter(v => v && v.s && v.s.length).map(v => normalize(v, ch, fb, S));
    if (drawn.length) return drawn;
    const f = synth(ch) || (fb && fb(ch)); return f ? [f] : [];
  }

  // Text -> clusters {base, marks[], am} | {sp}. ำ joins the cluster before it.
  function parse(text) {
    const out = []; let cur = null;
    for (const c of text) {
      if (c === '\r') continue;
      if (c === ' ' || c === '\t' || c === ' ') { out.push({ sp: true }); cur = null; continue; }
      if (isMark(c)) { if (!cur) { cur = { base: null, marks: [], am: false }; out.push(cur); } cur.marks.push(c); continue; }
      if (c === AM) { if (!cur) out.push(cur = { base: null, marks: [], am: false }); cur.am = true; cur = null; continue; }
      cur = { base: c, marks: [], am: false }; out.push(cur);
    }
    return out;
  }

  // Place one cluster's parts in box units. Marks are drawn beside a grey ก, so they are
  // moved by (base right edge - ghost right edge). Tones climb above upper vowels / the ring of ำ.
  function buildCluster(cl, pick) {
    const parts = [], b = cl.base ? pick(cl.base) : null;
    const bb = b ? bbox(b) : { x0: GX, x1: GHOST.r, y0: XH, y1: BASE };
    if (b) parts.push({ v: b, dx: 0, dy: 0 });
    const tl = b && TALL.has(cl.base) ? tailLeft(b) : Infinity, mx0 = bb.x1 - GHOST.r;
    const mxOf = v => tl < Infinity ? Math.min(mx0, tl - 0.04 - bbox(v).x1) : mx0; // keep marks left of a tall tail
    let top = Infinity, x1 = bb.x1;
    const add = (v, dx, dy) => { parts.push({ v, dx, dy }); return bbox(v); };
    for (const m of cl.marks) if (UPPER.has(m)) { const v = pick(m); if (v) top = Math.min(top, add(v, mxOf(v), 0).y0); }
    if (cl.am) { const v = pick(AM); if (v) { const q = add(v, mx0, 0); top = Math.min(top, q.y0); x1 = Math.max(x1, q.x1 + mx0); } }
    for (const m of cl.marks) if (LOWER.has(m)) { const v = pick(m); if (v) add(v, bb.x1 - GHOST.r, bb.y1 > BASE + 0.15 ? bb.y1 - BASE - 0.05 : 0); }
    for (const m of cl.marks) if (TOP.has(m)) {
      const v = pick(m); if (!v) continue;
      const q = bbox(v), dy = top < Infinity ? Math.min(0, top - 0.06 - q.y1) : 0;
      add(v, mxOf(v), dy); top = Math.min(top, q.y0 + dy);
    }
    return { parts, x0: bb.x0, x1 };
  }

  function words(text) {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
    const out = [];
    text.replace(/\r/g, '').split('\n').forEach((line, i) => {
      if (i) out.push('\n');
      if (seg) for (const s of seg.segment(line)) out.push(s.segment);
      else out.push(...line.split(/(\s+)/)); // shortcut: no Thai word breaks on very old browsers; long runs still wrap per letter
    });
    return out.filter(s => s !== '');
  }

  // o: {x, y, width, u (page units per box unit), gap (line height in box units), seed, fb, thick}
  function layout(text, hand, o) {
    const R = rng(o.seed || 1), last = {}, cache = {}, S = personScale(hand, o.fb);
    const pick = ch => {
      const vs = cache[ch] || (cache[ch] = variantsFor(hand, ch, o.fb, S)); if (!vs.length) return null;
      let i = (R() * vs.length) | 0;
      if (vs.length > 1 && i === last[ch]) i = (i + 1 + ((R() * (vs.length - 1)) | 0)) % vs.length;
      last[ch] = i; return vs[i];
    };
    const J = a => (R() - 0.5) * 2 * a;
    const warp = () => ({ ax: J(0.03), ay: J(0.03), fx: 3 + R() * 4, fy: 3 + R() * 4, px: R() * 6.3, py: R() * 6.3 });
    const maxW = o.width / o.u, L = o.gap || 2.4, U = o.u;
    const strokes = [], fills = [];
    let cx = 0, line = 0, phase = R() * 6.3, wrapped = false;
    const newline = auto => { line++; cx = 0; phase = R() * 6.3; wrapped = auto; };
    const emit = it => {
      const by = FIRST + line * L + 0.06 * Math.sin(cx * 0.35 + phase) + it.jy;
      const c = Math.cos(it.th), s = Math.sin(it.th);
      it.parts.forEach((p, k) => {
        const w = it.warps[k], list = p.v.s ? strokes : fills;
        for (const a of (p.v.s || p.v.p)) {
          const pen = !!p.v.s, out = new Array(a.length);
          const sx = pen ? J(0.012) : 0, sy = pen ? J(0.012) : 0; // pen lands a bit elsewhere each time
          const wa = pen ? J(0.016) : 0, wb = pen ? J(0.016) : 0, wl = 0.35 + R() * 0.4, wp = R() * 6.3, wq = R() * 6.3; // wobble along the stroke
          let arcLen = 0;
          for (let i = 0; i < a.length; i += 2) {
            const gx = a[i], gy = a[i + 1];
            if (i) arcLen += Math.hypot(gx - a[i - 2], gy - a[i - 1]);
            const t = arcLen / wl * 6.283;
            const ly = gy + w.ay * Math.sin(w.fx * gx + w.py) + wb * Math.sin(t + wq) + p.dy + sy - BASE;
            const lx = (gx + w.ax * Math.sin(w.fy * gy + w.px) + wa * Math.sin(t + wp) + p.dx + sx - it.x0) * it.sw - ly * it.sh;
            out[i] = o.x + U * (cx + it.sc * (lx * c - ly * s));
            out[i + 1] = o.y + U * (by + it.sc * (lx * s + ly * c));
          }
          list.push(out);
        }
      });
    };
    for (const seg of words(text)) {
      if (seg === '\n') { newline(false); continue; }
      const sh = J(0.06); // each word leans its own way a little
      const items = parse(seg).map(cl => {
        if (cl.sp) return { sp: true, w: 0.45 + J(0.06) };
        const b = buildCluster(cl, pick), sc = 1 + J(0.04), sw = 1 + J(0.05);
        const w = b.parts.length ? sc * sw * (b.x1 - b.x0) : 0.5;
        return { ...b, sc, sw, sh, w, gap: 0.13 + J(0.03), th: J(0.035), jy: J(0.02), warps: b.parts.map(warp) };
      });
      const ww = items.reduce((t, it) => t + it.w + (it.gap || 0), 0);
      if (cx > 0 && cx + ww > maxW && !items[0].sp) newline(true);
      for (const it of items) {
        if (it.sp) { if (!(cx === 0 && wrapped)) cx += it.w; continue; }
        if (cx > 0 && cx + it.w > maxW) newline(true); // word longer than the box
        emit(it); cx += it.w + it.gap; wrapped = false;
      }
    }
    return { strokes, fills, lines: line + 1, height: (FIRST + line * L + 0.85) * U, lw: U * 0.075 * (o.thick || 1) };
  }

  // Engine checks using the fallback font. Returns [{name, ok, info}].
  function selfTest(fb) {
    const pick = ch => { const v = fb(ch); if (!v) throw new Error('no glyph ' + ch); return v; };
    const box = (p) => { const b = bbox(p.v); return { x0: b.x0 + p.dx, x1: b.x1 + p.dx, y0: b.y0 + p.dy, y1: b.y1 + p.dy }; };
    const C = s => buildCluster(parse(s)[0], pick).parts.map(box);
    const r = [], t = (name, ok, info) => r.push({ name, ok: !!ok, info: info || '' });
    const kii = C('กี่'); t('กี่ tone above vowel', kii[2].y1 <= kii[1].y0, kii[2].y1.toFixed(2) + ' <= ' + kii[1].y0.toFixed(2));
    const kak = C('กั๊'); t('กั๊ tone above mai han-akat', kak[2].y1 <= kak[1].y0);
    const pa = buildCluster(parse('ป้')[0], pick), tl = tailLeft(pa.parts[0].v), pt = box(pa.parts[1]);
    t('ป้ tone left of tail', pt.x1 <= tl + 0.02, pt.x1.toFixed(2) + ' <= ' + tl.toFixed(2));
    const pu = C('ปุ่'); t('ปุ่ lower vowel below baseline', pu[1].y0 >= BASE - 0.1); t('ปุ่ tone left of tail', pu[2].x1 <= tailLeft(pick('ป')) + 0.02);
    const du = C('ฎุ'); t('ฎุ vowel below tail', du[1].y0 >= du[0].y1 - 0.1, du[1].y0.toFixed(2) + ' vs ' + du[0].y1.toFixed(2));
    const nam = buildCluster(parse('น้ำ')[0], pick).parts.map(box); t('น้ำ tone above ring', nam[2].y1 <= nam[1].y0, nam[2].y1.toFixed(2) + ' <= ' + nam[1].y0.toFixed(2));
    t('น้ำ is one cluster', parse('น้ำ').length === 1);
    t('เกียรติ = 5 clusters', parse('เกียรติ').length === 5);
    t('ญี่ปุ่น = 3 clusters', parse('ญี่ปุ่น').length === 3);
    t('ฎีกา = 3 clusters', parse('ฎีกา').length === 3);
    const lay = layout('สวัสดีครับ ปู่น้ำกั๊ก', null, { x: 0, y: 0, width: 1e4, u: 10, gap: 2.4, seed: 3, fb });
    t('layout draws ink', lay.fills.length > 10, lay.fills.length + ' shapes');
    const w2 = layout('สวัสดีครับ สวัสดีครับ สวัสดีครับ', null, { x: 0, y: 0, width: 60, u: 10, gap: 2.4, seed: 3, fb });
    t('wraps to several lines', w2.lines >= 3, w2.lines + ' lines');
    const a1 = JSON.stringify(layout('กกกก', null, { x: 0, y: 0, width: 999, u: 10, seed: 5, fb }).fills);
    const a2 = JSON.stringify(layout('กกกก', null, { x: 0, y: 0, width: 999, u: 10, seed: 5, fb }).fills);
    const a3 = JSON.stringify(layout('กกกก', null, { x: 0, y: 0, width: 999, u: 10, seed: 6, fb }).fills);
    t('same seed = same ink, new seed = new ink', a1 === a2 && a1 !== a3);
    const sy = layout('(?!) 5% a/b', null, { x: 0, y: 0, width: 999, u: 10, seed: 2, fb });
    // a small ก floating high and a ่ drawn too low get put back on their lines
    const fake = { g: { 'ก': [{ s: [[0.5, 0.6, 0.9, 0.5, 1.0, 1.0]] }], '่': [{ s: [[1.0, 1.3, 1.0, 1.6]] }] } };
    const nk = bbox(variantsFor(fake, 'ก', fb, 0)[0]), fk = bbox(fb('ก'));
    t('floating letter lands on the line, normal size', Math.abs(nk.y1 - fk.y1) < 0.01 && Math.abs((nk.y1 - nk.y0) - (fk.y1 - fk.y0)) < 0.01, nk.y0.toFixed(2) + '..' + nk.y1.toFixed(2));
    const nt = bbox(variantsFor(fake, '่', fb, personScale(fake, fb))[0]);
    t('low tone mark moves up above the letter', nt.y1 <= XH, nt.y1.toFixed(2) + ' <= 1');
    t('symbols are auto-made pen strokes', sy.strokes.length === 10, sy.strokes.length + ' strokes');
    return r;
  }

  const API = { XH, BASE, BOX_W, BOX_H, GX, GHOST, GROUPS, REQUIRED_GROUPS, needsGhost, isMark, fontVariant, variantsFor, parse, buildCluster, layout, bbox, selfTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Hand = API;
})(this);
