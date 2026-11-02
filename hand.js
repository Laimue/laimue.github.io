/* LaiMue handwriting engine. "Box units": x-height line y=1, baseline y=2, y grows down. */
(function (root) {
  'use strict';
  const VERSION = 8; // shown in the ⋯ menu; bump with sw.js cache name on every release
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
  // What the eye sees: pen strokes are drawn 0.075 wide (layout lw), font letters are filled outlines.
  const HW = 0.0375, pen = v => (v.s ? HW : 0); // shortcut: assumes thick 1; a thicker pen only makes letters bolder
  function ink(v, fn, step = 0.02) { // every point along the ink, at most `step` apart
    for (const a of (v.s || v.p)) for (let i = 0; i < a.length; i += 2) {
      const m = i ? Math.ceil(Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]) / step) : 1;
      for (let t = 1; t <= m; t++) fn(i ? a[i - 2] + (a[i] - a[i - 2]) * t / m : a[i], i ? a[i - 1] + (a[i + 1] - a[i - 1]) * t / m : a[i + 1]);
    }
  }
  const TB = new WeakMap();
  function tbox(v) { // ink box without the outer 2% of ink on each side, so a stray hook or dot doesn't set the size
    let b = TB.get(v); if (b) return b;
    const xs = [], ys = [], q = (a, f) => a.sort((p, r) => p - r)[Math.min(a.length - 1, Math.floor(f * a.length))];
    const r = bbox(v); // step by the letter's own size, so the trim is the same at any size
    ink(v, (x, y) => { xs.push(x); ys.push(y); }, Math.max(Math.hypot(r.x1 - r.x0, r.y1 - r.y0), 0.05) / 300);
    b = { x0: q(xs, 0.02), x1: q(xs, 0.98), y0: q(ys, 0.02), y1: q(ys, 0.98) };
    TB.set(v, b); return b;
  }
  const vb = v => { const b = bbox(v), e = pen(v); return { x0: b.x0 - e, x1: b.x1 + e, y0: b.y0 - e, y1: b.y1 + e }; }; // full visible edge

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

  // Pencil shake: two light [1,2,1] passes per stroke, ends kept (points are >=0.012 apart, loops shrink ~2%).
  const smooth = s => s.map(a => {
    let p = a;
    for (let n = 0; n < 2; n++) {
      const q = p.slice();
      for (let i = 2; i < p.length - 2; i += 2) { q[i] = (p[i - 2] + 2 * p[i] + p[i + 2]) / 4; q[i + 1] = (p[i - 1] + 2 * p[i + 1] + p[i + 3]) / 4; }
      p = q;
    }
    return p;
  });
  const SM = new WeakMap(), SL = new WeakMap(), SLP = new WeakMap(); const SLANT_SURE = 1.35; // peak sharpness vs ±0.2 away; round letters score ~1.1, upright-stroke letters 1.5-2.9
  const sm = v => { let w = SM.get(v); if (!w) SM.set(v, w = { s: smooth(v.s) }); return w; };
  // Writing slant (sideways move per unit down, italic < 0): the shear that stacks the up-down pen moves
  // into the sharpest columns. Shearing a letter by c shifts this by exactly c, whoever wrote it. null = too few up-down moves.
  function slant(v) {
    if (SL.has(v)) return SL.get(v);
    const sg = [], b = bbox(v), my = (b.y0 + b.y1) / 2; let tot = 0;
    for (const a of v.s || v.p) for (let i = 2; i < a.length; i += 2) {
      const dy = Math.abs(a[i + 1] - a[i - 1]); if (dy < 1e-4) continue;
      sg.push((a[i] + a[i - 2]) / 2, (a[i + 1] + a[i - 1]) / 2 - my, dy); tot += dy;
    }
    let r = null;
    if (tot > 0.4 * (b.y1 - b.y0)) {
      const sc = [];
      for (let n = 0; n <= 60; n++) {
        const c = n * 0.02 - 0.6, h = new Map();
        for (let i = 0; i < sg.length; i += 3) { // spread each move over two 0.025-wide columns
          const x = (sg[i] - c * sg[i + 1]) / 0.025, k = Math.floor(x), f = x - k;
          h.set(k, (h.get(k) || 0) + sg[i + 2] * (1 - f)); h.set(k + 1, (h.get(k + 1) || 0) + sg[i + 2] * f);
        }
        let s = 0; for (const q of h.values()) s += q * q; sc.push(s);
      }
      const n = sc.indexOf(Math.max(...sc)), side = Math.max(...sc.filter((_, j) => Math.abs(j - n) >= 10)); // best rival lean ≥0.2 away
      SLP.set(v, sc[n] / side);
      if (sc[n] / side > SLANT_SURE) r = +(n * 0.02 - 0.6).toFixed(2); // round letters (อ ว) have no clear lean: leave them
    }
    SL.set(v, r); return r;
  }
  // This person's usual size (median reference height / drawn height) and usual lean compared with the
  // reference font, letter by letter (so letters that are slanted by design, like ง จ, keep their shape).
  function person(hand, fb) {
    const ks = [], ss = [], med = a => a.sort((x, y) => x - y)[a.length >> 1];
    if (hand && hand.g && fb) for (const ch of GROUPS[0][1]) for (const v of hand.g[ch] || []) {
      const r = v && v.s && v.s.length && fb(ch); if (!r) continue;
      const u = bbox(v), f = bbox(r); ks.push((f.y1 - f.y0) / Math.max(u.y1 - u.y0, 0.02));
      const s = slant(sm(v)), sr = slant(r); if (s !== null && sr !== null) ss.push(s - sr);
    }
    return { k: ks.length ? med(ks) : 0, sl: ss.length ? med(ss) : null };
  }
  // Height of a tailed letter without its tail (up: tail rises above the body, else hangs below).
  // Walking in from the tail end, the body starts at the first 0.04-tall row whose ink spans >= 60% of the letter's width.
  function body(v, up) {
    const b = bbox(v), h = b.y1 - b.y0, n = Math.ceil(h / 0.04), lo = new Array(n).fill(Infinity), hi = new Array(n).fill(-Infinity);
    const put = (x, y) => { const r = Math.min(n - 1, Math.floor((y - b.y0) / 0.04)); lo[r] = Math.min(lo[r], x); hi[r] = Math.max(hi[r], x); };
    ink(v, put);
    for (let k = 0; k < n; k++) {
      const r = up ? k : n - 1 - k;
      if (hi[r] - lo[r] >= 0.6 * (b.x1 - b.x0)) { const e = b.y0 + (up ? r : r + 1) * 0.04, d = up ? b.y1 - e : e - b.y0; return d > 0.3 * h ? d : null; }
    }
    return null;
  }
  // Drawn letters float, lean and vary in size: smooth the pen, lean each like this person's usual slant,
  // then move it onto the line where the reference font puts that letter, at the reference size.
  const NORM = new WeakMap();
  function normalize(v, ch, fb, P) {
    const ref = fb && fb(ch); if (!ref) return v;
    const key = P.k + '|' + P.sl, c = NORM.get(v); if (c && c.key === key) return c.v;
    let w = sm(v), tot = 0, s = null;
    const want = P.sl !== null && slant(ref) !== null ? slant(ref) + P.sl : null; // this letter's font lean + the person's usual extra lean
    if (want !== null) for (let n = 0; n < 4; n++) { // re-measure once or twice: the column grid is 0.02 coarse
      s = slant(w); if (s === null || Math.abs(want - s) < 0.015 || n === 3) break;
      const b = bbox(w), my = (b.y0 + b.y1) / 2, d = Math.min(Math.max(want - s, -0.3 - tot), 0.3 - tot);
      tot += d; w = { s: w.s.map(a => a.map((q, i) => i % 2 ? q : q + d * (a[i + 1] - my))) };
    }
    // Sizes are matched as seen: drawn size + pen width = the font letter's size (u: pen centre-lines, f: filled font).
    const u = tbox(w), f = tbox(ref), fr = bbox(ref), S = P.k || 1, E = 2 * HW, D = (a, b) => Math.max(a - b, 0.01);
    const mark = needsGhost(ch), plain = !mark && fr.y0 >= XH - 0.15 && fr.y1 <= BASE + 0.15; // no tail: exact same height
    const kh = D(f.y1 - f.y0, E) / Math.max(u.y1 - u.y0, 0.02), kw = D(f.x1 - f.x0, E) / Math.max(u.x1 - u.x0, 0.02);
    let k = kh, lo = 0, hi = Infinity;
    // the limits only guard against odd drawings (a flat mark, a giant tail); checkLetter flags a letter that hits them
    if (mark) { k = Math.hypot(D(f.x1 - f.x0, E), D(f.y1 - f.y0, E)) / Math.max(Math.hypot(u.x1 - u.x0, u.y1 - u.y0), 0.02); lo = 0.6 * S; hi = 1.6 * S; }
    else if (!plain) { // size by the letter's body only: its tail may be drawn any length
      const up = fr.y1 <= BASE + 0.15, bu = body(w, up), bf = body(ref, up);
      k = bu && bf ? D(bf, E) / bu : Math.sqrt(kh * kw); lo = 0.65 * S; hi = 1.35 * S;
    }
    const kk = Math.min(Math.max(k, lo), hi);
    const topAlign = LOWER.has(ch) || (!mark && fr.y1 > BASE + 0.15); // hang below-line letters from the top
    const ty = topAlign ? f.y0 + HW - u.y0 * kk : f.y1 - HW - u.y1 * kk, tx = mark ? f.x1 - HW - u.x1 * kk : GX + HW - u.x0 * kk;
    const out = { s: w.s.map(a => a.map((q, i) => +(i % 2 ? q * kk + ty : q * kk + tx).toFixed(4))) };
    // fit < 1: still too small after the guard, > 1: too big; lean: slant still missing
    NORM.set(v, { key, v: out, fit: kk / k, lean: want !== null && s !== null ? Math.abs(want - s) : 0 }); return out;
  }

  function variantsFor(hand, ch, fb, P) {
    const drawn = ((hand && hand.g && hand.g[ch]) || []).filter(v => v && v.s && v.s.length).map(v => normalize(v, ch, fb, P));
    if (drawn.length) return drawn;
    const f = synth(ch) || (fb && fb(ch)); return f ? [f] : [];
  }

  // Teach check: is this drawing still off from the typed letter after the fix? {ok, why: small|big|lean}
  function checkLetter(hand, ch, i, fb) {
    const v = hand && hand.g && (hand.g[ch] || [])[i], ref = fb && fb(ch);
    if (!v || !v.s || !v.s.length || !ref || !ref.p) return { ok: true };
    const P = person(hand, fb); normalize(v, ch, fb, P); const m = NORM.get(v);
    if (m.fit < 0.9) return { ok: false, why: 'small' };
    if (m.fit > 1.1) return { ok: false, why: 'big' };
    if (m.lean > 0.1) return { ok: false, why: 'lean' };
    // no shape check: pixel overlap can't tell a messy ก from ค vs ด (tried 2026-11-02, see laimue notes)
    return { ok: true };
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

  // Top of the ink between x0 and x1 (XH if none there), kept near the x-height.
  function inkTop(v, x0, x1) {
    let m = Infinity;
    for (const a of (v.s || v.p)) for (let i = 0; i < a.length; i += 2) if (a[i] >= x0 && a[i] <= x1 && a[i + 1] < m) m = a[i + 1];
    return m < Infinity ? Math.min(Math.max(m - pen(v), XH - 0.35), XH + 0.1) : XH;
  }

  // Place one cluster's parts in box units. Marks are drawn beside a grey ก, so they are
  // moved by (base right edge - ghost right edge). Upper vowels sit just above the ink under them;
  // tones sit just above the upper vowel / ring of ำ, or just above the letter when there is none.
  function buildCluster(cl, pick) {
    // all edges here are visible edges (pen width included), so gaps look the same as typed text
    const parts = [], b = cl.base ? pick(cl.base) : null;
    const bb = b ? vb(b) : { x0: GX, x1: GHOST.r, y0: XH, y1: BASE };
    if (b) parts.push({ v: b, dx: 0, dy: 0 });
    const tl = b && TALL.has(cl.base) ? tailLeft(b) - pen(b) : Infinity, mx0 = bb.x1 - GHOST.r;
    const mxOf = v => tl < Infinity ? Math.min(mx0, tl - 0.04 - vb(v).x1) : mx0; // keep marks left of a tall tail
    // ink top a little wider than the mark (so it clears rounded corners), never reaching a tall tail
    // (left of a tall tail: the whole body, so a mark over ป's open top still sits on the stem tops like typed text)
    const under = (v, dx) => !b ? XH : tl < Infinity ? inkTop(b, bb.x0, tl - 0.1) : inkTop(b, vb(v).x0 + dx - 0.25, vb(v).x1 + dx + 0.25);
    let top = Infinity, x1 = bb.x1;
    const add = (v, dx, dy) => { parts.push({ v, dx, dy }); const q = vb(v); return { y0: q.y0 + dy, x1: q.x1 + dx }; };
    for (const m of cl.marks) if (UPPER.has(m)) {
      const v = pick(m); if (!v) continue;
      const dx = mxOf(v); top = Math.min(top, add(v, dx, under(v, dx) - 0.1 - vb(v).y1).y0);
    }
    if (cl.am) { const v = pick(AM); if (v) { const q = add(v, mx0, 0); top = Math.min(top, q.y0); x1 = Math.max(x1, q.x1); } }
    for (const m of cl.marks) if (LOWER.has(m)) { const v = pick(m); if (v) add(v, bb.x1 - GHOST.r, bb.y1 > BASE + 0.15 ? bb.y1 - BASE - 0.05 : 0); }
    for (const m of cl.marks) if (TOP.has(m)) {
      const v = pick(m); if (!v) continue;
      const dx = mxOf(v), dy = (top < Infinity ? top - 0.06 : under(v, dx) - 0.1) - vb(v).y1;
      top = Math.min(top, add(v, dx, dy).y0);
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

  // Left/right ink edge per 0.2-tall band in item-local page units, widened one band up and down
  // so letters never tuck into a narrow notch of their neighbour.
  const NB = 16, BH = 0.2;
  function profile(it) {
    const L = new Array(NB).fill(Infinity), Rt = new Array(NB).fill(-Infinity);
    let e = 0; // half pen width: the gap is measured between visible edges
    const put = (x, y) => {
      const px = it.sc * ((x - it.x0) * it.sw - (y - BASE) * it.sh), j0 = Math.floor(y / BH);
      for (let j = Math.max(0, j0 - 1); j <= Math.min(NB - 1, j0 + 1); j++) { if (px - e < L[j]) L[j] = px - e; if (px + e > Rt[j]) Rt[j] = px + e; }
    };
    for (const p of it.parts) { e = pen(p.v) * it.sc; ink(p.v, (x, y) => put(x + p.dx, y + p.dy), 0.1); }
    return { L, R: Rt };
  }
  // How far the next cluster's start must sit from the previous one's so the visible gap is right: closest approach in any shared band.
  function kern(a, b) {
    let d = -Infinity;
    for (let j = 0; j < NB; j++) if (a.pr.R[j] > -Infinity && b.pr.L[j] < Infinity) d = Math.max(d, a.pr.R[j] - b.pr.L[j]);
    return d;
  }

  // o: {x, y, width, u (page units per box unit), gap (line height in box units), seed, fb, thick, neat (0 natural .. 1 neat, default 1)}
  function layout(text, hand, o) {
    const R = rng(o.seed || 1), last = {}, cache = {}, P = person(hand, o.fb);
    const pick = ch => {
      const vs = cache[ch] || (cache[ch] = variantsFor(hand, ch, o.fb, P)); if (!vs.length) return null;
      let i = (R() * vs.length) | 0;
      if (vs.length > 1 && i === last[ch]) i = (i + 1 + ((R() * (vs.length - 1)) | 0)) % vs.length;
      last[ch] = i; return vs[i];
    };
    const mess = 0.8 - 0.6 * (o.neat ?? 1); // neat = 0.2x the old wobble, natural = 0.8x
    const J = a => (R() - 0.5) * 2 * a * mess;
    const warp = () => ({ ax: J(0.03), ay: J(0.03), fx: 3 + R() * 4, fy: 3 + R() * 4, px: R() * 6.3, py: R() * 6.3 });
    const maxW = o.width / o.u, L = o.gap || 2.4, U = o.u;
    const strokes = [], fills = [];
    let cx = 0, line = 0, phase = R() * 6.3, wrapped = false;
    const newline = auto => { line++; cx = 0; phase = R() * 6.3; wrapped = auto; };
    const emit = it => {
      const by = FIRST + line * L + 0.06 * mess * Math.sin(cx * 0.35 + phase) + it.jy;
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
      let prev = null;
      const items = parse(seg).map(cl => {
        if (cl.sp) { prev = null; return { sp: true, w: 0.45 + J(0.06) }; }
        const b = buildCluster(cl, pick), sc = 1 + J(0.04), sw = 1 + J(0.05);
        const w = b.parts.length ? sc * sw * (b.x1 - b.x0) : 0.5;
        const it = { ...b, sc, sw, sh, w, gap: 0.13 + J(0.03), th: J(0.035), jy: J(0.02), warps: b.parts.map(warp), dk: 0 };
        if (b.parts.length) {
          it.pr = profile(it);
          const d = prev ? kern(prev, it) : -Infinity; // space by the visible gap, not the boxes
          if (d > -Infinity) it.dk = Math.min(Math.max(d - prev.w, -0.35), 0.3);
          prev = it;
        }
        return it;
      });
      const ww = items.reduce((t, it) => t + it.w + (it.gap || 0) + (it.dk || 0), 0);
      if (cx > 0 && cx + ww > maxW && !items[0].sp) newline(true);
      for (const it of items) {
        if (it.sp) { if (!(cx === 0 && wrapped)) cx += it.w; continue; }
        if (cx > 0 && cx + it.dk + it.w > maxW) newline(true); else cx += it.dk; // word longer than the box
        emit(it); cx += it.w + it.gap; wrapped = false;
      }
    }
    return { strokes, fills, lines: line + 1, height: (FIRST + line * L + 0.85) * U, lw: U * 0.075 * (o.thick || 1) };
  }

  // Test helper: a fake person drawn from the font outlines (as pen lines). messy: each letter at its own
  // size, height and slant with a shaky pen; marks drawn big, small, high or low over the grey ก.
  function fakeHand(fb, seed, messy, lean = -0.12) { // lean: this fake person's usual slant (italic < 0)
    const R = rng(seed), J = a => messy ? (R() - 0.5) * 2 * a : 0, g = {};
    for (const [, chars] of GROUPS.slice(0, 3)) for (const ch of chars) {
      const f = fb(ch); if (!f || !f.p) continue;
      const b = bbox(f), mk = needsGhost(ch);
      g[ch] = [0, 1, 2].slice(0, messy ? 3 : 1).map(() => {
        const k = messy ? (mk ? 0.65 + R() * 0.95 : 0.7 + R() * 0.6) : 1, dy = J(mk ? 0.4 : 0.3), sl = messy ? lean + J(0.15) : 0;
        return { s: f.p.map(a => {
          const o = [];
          for (let i = 0; i <= a.length; i += 2) {
            const ry = (a[(i + 1) % a.length] - b.y1) * k;
            o.push(b.x0 + (a[i % a.length] - b.x0) * k + sl * ry + J(0.012), b.y1 + ry + dy + J(0.012));
          }
          return o;
        }) };
      });
    }
    return { g };
  }

  // Engine checks using the fallback font. Returns [{name, ok, info}].
  function selfTest(fb) {
    const pick = ch => { const v = fb(ch); if (!v) throw new Error('no glyph ' + ch); return v; };
    const box = (p) => { const b = vb(p.v); /* visible edges */ return { x0: b.x0 + p.dx, x1: b.x1 + p.dx, y0: b.y0 + p.dy, y1: b.y1 + p.dy }; };
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
    const see = v => { const b = tbox(v), e = pen(v); return { x0: b.x0 - e, x1: b.x1 + e, y0: b.y0 - e, y1: b.y1 + e }; }; // as the eye sees it
    const nk = see(variantsFor(fake, 'ก', fb, { k: 0, sl: null })[0]), fk = see(fb('ก'));
    t('floating letter lands on the line, normal size', Math.abs(nk.y1 - fk.y1) < 0.01 && Math.abs((nk.y1 - nk.y0) - (fk.y1 - fk.y0)) < 0.01, nk.y0.toFixed(2) + '..' + nk.y1.toFixed(2));
    const nt = bbox(variantsFor(fake, '่', fb, person(fake, fb))[0]);
    t('low tone mark moves up above the letter', nt.y1 <= XH, nt.y1.toFixed(2) + ' <= 1');
    t('symbols are auto-made pen strokes', sy.strokes.length === 10, sy.strokes.length + ' strokes');

    // A messy fake person: own size/height/slant per letter, shaky pen, marks big/small/high/low.
    const mh = fakeHand(fb, 11, true), MP = person(mh, fb), pickH = h => ch => variantsFor(h, ch, fb, MP)[0] || fb(ch);
    const ht = q => q.y1 - q.y0;
    let mInfo = '';
    for (const m of 'ัี่้') for (const v of mh.g[m]) {
      const bx = buildCluster(parse('ก' + m)[0], pickH({ g: { ...mh.g, [m]: [v] } })).parts.map(box);
      const gap = bx[0].y0 - bx[1].y1, hr = ht(bx[1]) / ht(bbox(fb(m)));
      if (!(gap >= 0.04 && gap <= 0.16 && hr > 0.85 && hr < 1.15)) mInfo += m + ' gap ' + gap.toFixed(2) + ' size ' + hr.toFixed(2) + '; ';
    }
    t('marks drawn big/small/high/low land just above the letter', !mInfo, mInfo);
    const kv = buildCluster(parse('กี่')[0], pickH(mh)).parts.map(box), tg = kv[1].y0 - kv[2].y1;
    t('tone sits close above the vowel', tg >= 0 && tg <= 0.12, tg.toFixed(2));
    const spread = (h, neat) => { // spread of letter bottoms and heights in a row of ก
      const n = h.g['ก'][0].s.length, L = layout('กกกกกกกกกกกก', h, { x: 0, y: 0, width: 1e4, u: 1, seed: 4, fb, neat });
      const bot = [], hs = [], sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return [Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length), m]; };
      for (let i = 0; i < L.strokes.length; i += n) { const q = bbox({ s: L.strokes.slice(i, i + n) }); bot.push(q.y1); hs.push(q.y1 - q.y0); }
      const [hsd, hm] = sd(hs); return { b: sd(bot)[0], h: hsd / hm };
    };
    const sn = spread(mh, 1), sx = spread(mh, 0);
    t('neat: messy drawings come out even', sn.b < 0.03 && sn.h < 0.04, 'bottoms ±' + sn.b.toFixed(3) + ', heights ±' + (sn.h * 100).toFixed(1) + '%');
    t('natural is looser than neat', sx.b > sn.b && sx.h > sn.h, 'natural bottoms ±' + sx.b.toFixed(3));
    // Three different people (right-leaning, upright, left-leaning): each keeps their own slant, all come out even.
    let pInfo = '', pOk = true;
    for (const [seed, lean] of [[11, -0.12], [23, 0], [37, 0.15]]) {
      const h = seed === 11 ? mh : fakeHand(fb, seed, true, lean), Q = person(h, fb), e = spread(h, 1);
      let worst = 0;
      for (const ch of GROUPS[0][1]) h.g[ch].forEach((v, i) => { // only letters with a clear lean get straightened
        const s = slant(variantsFor(h, ch, fb, Q)[i]), sr = slant(fb(ch));
        if (slant(sm(v)) !== null && s !== null && sr !== null) worst = Math.max(worst, Math.abs(s - sr - Q.sl));
      });
      const ok = Q.sl !== null && Math.abs(Q.sl - lean) < 0.08 && worst < 0.07 && e.b < 0.03 && e.h < 0.04;
      pOk = pOk && ok; pInfo += `lean ${lean}: usual ${(Q.sl || 0).toFixed(2)}, worst ${worst.toFixed(3)}${ok ? '' : ' ✗'}; `;
    }
    t('3 different people: each keeps their own slant, odd letters match it', pOk, pInfo);
    const shaky = [[]]; for (let i = 0; i <= 60; i++) shaky[0].push(0.5 + (i % 2 ? 0.02 : -0.02), 1 + i / 60);
    const rough = s => { let q = 0; const a = s[0]; for (let i = 2; i < a.length - 2; i += 2) q += Math.abs(a[i - 2] - 2 * a[i] + a[i + 2]); return q; };
    t('shaky strokes get smoothed', rough(smooth(shaky)) < 0.3 * rough(shaky), rough(smooth(shaky)).toFixed(2) + ' vs ' + rough(shaky).toFixed(2));
    const g2 = layout('กอ', mh, { x: 0, y: 0, width: 1e4, u: 1, seed: 4, fb }), na = mh.g['ก'][0].s.length;
    const vg = bbox({ s: g2.strokes.slice(na) }).x0 - bbox({ s: g2.strokes.slice(0, na) }).x1 - 2 * HW; // between visible edges
    t('letters keep a small visible gap', vg > 0.05 && vg < 0.25, vg.toFixed(2));
    // tails drawn extra long or short: the body still gets ก's height
    let tInfo = '';
    for (const ch of 'ปฟญฎ') for (const st of [0.5, 2]) {
      const f = fb(ch), b = bbox(f), up = ch === 'ป' || ch === 'ฟ', edge = up ? XH : BASE; // stretch only the tail
      const v = { s: f.p.map(a => a.map((q, i) => i % 2 ? (up ? (q < edge ? edge - (edge - q) * st : q) : (q > edge ? edge + (q - edge) * st : q)) : q)) };
      const n = variantsFor({ g: { 'ก': [{ s: fb('ก').p }], [ch]: [v] } }, ch, fb, { k: 1, sl: null })[0], bn = body(n, up), bf = body(f, up);
      if (!bn || Math.abs((bn + 2 * HW) / bf - 1) > 0.06) tInfo += ch + ' tail×' + st + ' body ' + (bn ? ((bn + 2 * HW) / bf).toFixed(2) : '?') + '; ';
    }
    t('tailed letters sized by body, not tail', !tInfo, tInfo);

    // Visual match: each cluster vs the same text typed in the font, as seen (pen width included).
    const at = p => { const q = see(p.v); return { x0: q.x0 + p.dx, x1: q.x1 + p.dx, y0: q.y0 + p.dy, y1: q.y1 + p.dy }; };
    const dg = q => Math.hypot(q.x1 - q.x0, q.y1 - q.y0);
    let cInfo = '', nCl = 0;
    for (const [seed, lean] of [[11, -0.12], [23, 0], [37, 0.15]]) {
      const h = seed === 11 ? mh : fakeHand(fb, seed, true, lean), Q = person(h, fb);
      for (let n = 0; n < 3; n++) for (const cl of parse('สวัสดีครับ ปู่น้ำกั๊ก ญี่ปุ่น ฎีกา')) {
        if (cl.sp) continue;
        const ids = [cl.base, ...cl.marks.filter(m => UPPER.has(m)), ...(cl.am ? [AM] : []), ...cl.marks.filter(m => LOWER.has(m)), ...cl.marks.filter(m => TOP.has(m))].filter(Boolean);
        if (ids.some(ch => !checkLetter(h, ch, n, fb).ok)) continue; // the Teach page flags these instead
        const A = buildCluster(cl, ch => variantsFor(h, ch, fb, Q)[n]).parts, B = buildCluster(cl, pick).parts; nCl++;
        A.forEach((p, i) => {
          const a = at(p), b = at(B[i]), ch = ids[i], fr = bbox(B[i].v);
          if (i === 0 && cl.base) {
            const hang = fr.y1 > BASE + 0.15, plain = fr.y0 >= XH - 0.15 && !hang, e = hang ? a.y0 - b.y0 : a.y1 - b.y1;
            if (Math.abs(e) > 0.04) cInfo += ch + ' line ' + e.toFixed(2) + '; ';
            if (plain && Math.abs((a.y1 - a.y0) / (b.y1 - b.y0) - 1) > 0.08) cInfo += ch + ' height ' + ((a.y1 - a.y0) / (b.y1 - b.y0)).toFixed(2) + '; ';
          } else {
            const e = LOWER.has(ch) ? a.y0 - b.y0 : a.y1 - b.y1, k = dg(a) / dg(b); // the gap to the ink below is exact; height also carries a leaning letter's own top
            if (Math.abs(e) > 0.07) cInfo += (cl.base || '') + ch + ' place ' + e.toFixed(2) + '; ';
            if (Math.abs(k - 1) > 0.15) cInfo += ch + ' size ' + k.toFixed(2) + '; ';
          }
        });
      }
    }
    t('3 people: every letter, vowel and tone sits and sizes like typed text', !cInfo && nCl > 60, nCl + ' clusters; ' + cInfo.slice(0, 300));
    const kg = { s: fb('ก').p.map(a => a.concat(a.slice(0, 2))) }, hook = { s: kg.s.concat([[0.95, 0.9, 0.97, 0.82]]) }; // ก + a stray tick above
    const hv = see(variantsFor({ g: { 'ก': [hook] } }, 'ก', fb, { k: 0, sl: null })[0]), fv = see(fb('ก')), hr2 = (hv.y1 - hv.y0) / (fv.y1 - fv.y0);
    t('a stray tick does not shrink the letter; pen width counted', Math.abs(hr2 - 1) < 0.03, 'height ' + hr2.toFixed(3) + ' of typed');
    const nh = fakeHand(fb, 5, false), sc = (v, k, sh = 0) => ({ s: v.s.map(a => a.map((q, i) => i % 2 ? q * k : q * k + sh * (a[i + 1] - 1.5))) });
    const flag = (ch, v) => checkLetter({ g: { ...nh.g, [ch]: [v] } }, ch, 0, fb).why || 'ok';
    const neatBad = Object.keys(nh.g).filter(ch => !checkLetter(nh, ch, 0, fb).ok);
    const fl = [flag('ั', sc(nh.g['ั'][0], 0.3)), flag('่', sc(nh.g['่'][0], 3)), flag('ป', sc(nh.g['ป'][0], 1, -0.5))];
    t('Teach check: neat letters pass; tiny, giant and very slanted get flagged', !neatBad.length && fl.join() === 'small,big,lean', 'neat flagged: ' + neatBad.join('') + '; got ' + fl.join());
    return r;
  }

  const API = { VERSION, XH, BASE, BOX_W, BOX_H, GX, GHOST, GROUPS, REQUIRED_GROUPS, needsGhost, isMark, fontVariant, variantsFor, parse, buildCluster, layout, bbox, fakeHand, checkLetter, selfTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Hand = API;
})(this);
