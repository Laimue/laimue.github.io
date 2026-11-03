/* LaiMue handwriting engine. "Box units": x-height line y=1, baseline y=2, y grows down. */
(function (root) {
  'use strict';
  const VERSION = 22; // shown in the ⋯ menu; bump with sw.js cache name on every release
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
    ['Optional: symbols (auto-made if skipped)', '.,?!()-:/"\'+=%;*_#&<>[]{}|~^@•'],
    ['Optional: rare letters', 'ฃฅฦๅํ'],
    ['Optional: English', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
    ['Optional: math (auto-made if skipped)', '×÷±≤≥≠≈√π∞°θαβΔΣ→∈·'],
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
    // v18: math and markdown symbols
    '*': [[0.5, 0.8, 0.5, 1.3], [0.28, 0.92, 0.72, 1.18], [0.72, 0.92, 0.28, 1.18]], '_': [[0.15, 2.12, 0.85, 2.1]],
    '^': [[0.28, 1.2, 0.5, 0.8, 0.72, 1.2]], '<': [[0.75, 1.15, 0.28, 1.5, 0.75, 1.85]], '>': [[0.28, 1.15, 0.75, 1.5, 0.28, 1.85]],
    '[': [[0.68, 0.75, 0.42, 0.75, 0.42, 2.25, 0.68, 2.25]], ']': [[0.32, 0.75, 0.58, 0.75, 0.58, 2.25, 0.32, 2.25]],
    '{': [[0.7, 0.75, 0.55, 0.8, 0.52, 1.35, 0.32, 1.5, 0.52, 1.65, 0.55, 2.2, 0.7, 2.25]],
    '}': [[0.3, 0.75, 0.45, 0.8, 0.48, 1.35, 0.68, 1.5, 0.48, 1.65, 0.45, 2.2, 0.3, 2.25]],
    '|': [[0.5, 0.75, 0.5, 2.25]], '~': [[0.22, 1.55, 0.35, 1.42, 0.5, 1.5, 0.65, 1.58, 0.78, 1.45]],
    ';': [DOT(1.35), [0.4, 1.9, 0.41, 2.0, 0.35, 2.12]], '•': [arc(0.5, 1.5, 0.11, 0.11, 0, 2 * PI, 10), arc(0.5, 1.5, 0.06, 0.06, 0, 2 * PI, 8), [0.49, 1.5, 0.51, 1.5]],
    '·': [DOT(1.48)], '…': [[0.15, 1.93, 0.17, 1.95], [0.5, 1.93, 0.52, 1.95], [0.85, 1.93, 0.87, 1.95]],
    '#': [[0.42, 0.9, 0.35, 2.1], [0.68, 0.9, 0.61, 2.1], [0.22, 1.25, 0.82, 1.25], [0.18, 1.75, 0.78, 1.75]],
    '×': [[0.3, 1.25, 0.72, 1.75], [0.72, 1.25, 0.3, 1.75]], '÷': [[0.25, 1.5, 0.78, 1.5], DOT(1.22).map((q, i) => i % 2 ? q : q + 0.12), DOT(1.76).map((q, i) => i % 2 ? q : q + 0.12)],
    '±': [[0.25, 1.4, 0.78, 1.4], [0.51, 1.15, 0.51, 1.65], [0.25, 1.88, 0.78, 1.88]], '∓': [[0.25, 1.12, 0.78, 1.12], [0.51, 1.35, 0.51, 1.85], [0.25, 1.6, 0.78, 1.6]],
    '≤': [[0.75, 1.05, 0.28, 1.35, 0.75, 1.65], [0.28, 1.88, 0.75, 1.88]], '≥': [[0.28, 1.05, 0.75, 1.35, 0.28, 1.65], [0.28, 1.88, 0.75, 1.88]],
    '≠': [[0.25, 1.38, 0.78, 1.38], [0.25, 1.62, 0.78, 1.62], [0.66, 1.15, 0.38, 1.85]],
    '≈': [[0.22, 1.42, 0.35, 1.3, 0.5, 1.38, 0.65, 1.46, 0.78, 1.33], [0.22, 1.7, 0.35, 1.58, 0.5, 1.66, 0.65, 1.74, 0.78, 1.61]],
    '√': [[0.12, 1.55, 0.25, 1.48, 0.42, 2.0, 0.7, 0.75, 0.95, 0.75]], '°': [arc(0.45, 0.95, 0.12, 0.12, -PI / 2, 1.5 * PI)],
    '∞': [[0.5, 1.5, 0.62, 1.32, 0.78, 1.32, 0.86, 1.5, 0.78, 1.68, 0.62, 1.68, 0.5, 1.5, 0.38, 1.32, 0.22, 1.32, 0.14, 1.5, 0.22, 1.68, 0.38, 1.68, 0.5, 1.5]],
    'π': [[0.18, 1.12, 0.3, 1.02, 0.85, 1.02], [0.38, 1.04, 0.36, 1.6, 0.3, 2.0], [0.66, 1.04, 0.66, 1.85, 0.75, 2.0, 0.84, 1.95]],
    'θ': [arc(0.5, 1.37, 0.26, 0.63, -PI / 2, 1.5 * PI, 14), [0.26, 1.4, 0.74, 1.38]],
    'α': [[0.82, 1.15, 0.7, 1.55, 0.6, 1.85, 0.48, 1.98, 0.32, 1.98, 0.22, 1.8, 0.22, 1.45, 0.32, 1.15, 0.48, 1.05, 0.6, 1.15, 0.7, 1.55, 0.78, 1.95, 0.88, 1.98]],
    'β': [[0.3, 2.35, 0.3, 1.0, 0.4, 0.8, 0.58, 0.78, 0.68, 0.92, 0.66, 1.15, 0.5, 1.3, 0.72, 1.45, 0.78, 1.7, 0.66, 1.95, 0.48, 1.98, 0.3, 1.85]],
    'γ': [[0.18, 1.08, 0.3, 1.0, 0.42, 1.2, 0.5, 1.75, 0.45, 2.25, 0.5, 2.35, 0.56, 2.22, 0.52, 1.75, 0.65, 1.3, 0.82, 1.02]],
    'δ': [[0.72, 0.85, 0.55, 0.76, 0.4, 0.85, 0.45, 1.05, 0.68, 1.3, 0.78, 1.62, 0.68, 1.92, 0.48, 1.98, 0.28, 1.85, 0.25, 1.55, 0.38, 1.32, 0.58, 1.24]],
    'Δ': [[0.5, 0.75, 0.15, 2.0, 0.85, 2.0, 0.5, 0.75]],
    'λ': [[0.25, 0.78, 0.38, 0.8, 0.5, 1.1, 0.8, 2.0], [0.53, 1.25, 0.2, 2.0]],
    'μ': [[0.3, 1.02, 0.3, 2.35], [0.3, 1.75, 0.38, 1.95, 0.52, 1.98, 0.66, 1.85, 0.7, 1.55, 0.7, 1.02], [0.7, 1.55, 0.72, 1.9, 0.82, 1.98]],
    'σ': [[0.88, 1.03, 0.5, 1.03, 0.3, 1.15, 0.22, 1.5, 0.3, 1.85, 0.5, 1.98, 0.68, 1.88, 0.75, 1.55, 0.68, 1.15, 0.5, 1.03]],
    'Σ': [[0.8, 0.85, 0.8, 0.75, 0.2, 0.75, 0.55, 1.5, 0.2, 2.25, 0.8, 2.25, 0.8, 2.15]],
    '→': [[0.12, 1.5, 0.88, 1.5], [0.68, 1.32, 0.88, 1.5, 0.68, 1.68]], '⇒': [[0.12, 1.4, 0.8, 1.4], [0.12, 1.6, 0.8, 1.6], [0.66, 1.22, 0.9, 1.5, 0.66, 1.78]],
    '∈': [[0.78, 1.08, 0.48, 1.08, 0.3, 1.2, 0.24, 1.5, 0.3, 1.8, 0.48, 1.92, 0.78, 1.92], [0.26, 1.5, 0.7, 1.5]],
    // v19: the rest of what pasted LaTeX can produce that Sriracha has no glyph for
    '∮': [[0.7, 0.7, 0.6, 0.62, 0.5, 0.75, 0.45, 1.5, 0.4, 2.25, 0.3, 2.38, 0.2, 2.3], arc(0.45, 1.5, 0.15, 0.15, 0, 2 * PI)],
    '∇': [[0.15, 1.0, 0.85, 1.0, 0.5, 2.0, 0.15, 1.0]], 'Π': [[0.2, 0.78, 0.8, 0.78], [0.3, 0.78, 0.3, 2.0], [0.7, 0.78, 0.7, 2.0]],
    'ε': [[0.78, 1.12, 0.6, 1.02, 0.38, 1.05, 0.3, 1.25, 0.45, 1.45, 0.3, 1.55, 0.25, 1.78, 0.42, 1.97, 0.62, 1.97, 0.8, 1.85]],
    'ω': [[0.3, 1.05, 0.2, 1.45, 0.28, 1.9, 0.4, 1.95, 0.5, 1.7, 0.5, 1.45, 0.5, 1.7, 0.6, 1.95, 0.72, 1.9, 0.8, 1.45, 0.7, 1.05]],
    'φ': [[0.5, 0.8, 0.5, 2.35], arc(0.5, 1.5, 0.28, 0.45, 0, 2 * PI, 14)], 'Φ': [[0.5, 0.75, 0.5, 2.25], arc(0.5, 1.5, 0.32, 0.4, 0, 2 * PI, 14)],
    'ρ': [[0.3, 2.35, 0.3, 1.5, 0.38, 1.15, 0.52, 1.03, 0.68, 1.12, 0.76, 1.45, 0.7, 1.82, 0.52, 1.97, 0.35, 1.85]],
    'τ': [[0.15, 1.12, 0.28, 1.03, 0.85, 1.03], [0.5, 1.04, 0.48, 1.85, 0.58, 1.98, 0.7, 1.92]],
    'η': [[0.22, 1.1, 0.3, 1.03, 0.35, 1.2, 0.35, 2.0], [0.35, 1.35, 0.48, 1.08, 0.62, 1.03, 0.72, 1.2, 0.72, 2.35]],
    'ζ': [[0.35, 0.78, 0.7, 0.78, 0.38, 1.15, 0.25, 1.55, 0.3, 1.85, 0.5, 1.97, 0.65, 2.05, 0.6, 2.3, 0.5, 2.35]],
    'ξ': [[0.35, 0.78, 0.7, 0.78], [0.62, 0.8, 0.4, 0.9, 0.4, 1.15, 0.6, 1.25], [0.6, 1.25, 0.35, 1.35, 0.3, 1.65, 0.45, 1.95, 0.65, 2.05, 0.6, 2.3, 0.5, 2.35]],
    'ψ': [[0.5, 0.78, 0.5, 2.35], [0.18, 1.05, 0.25, 1.6, 0.4, 1.88, 0.5, 1.9, 0.62, 1.88, 0.75, 1.6, 0.82, 1.05]],
    'χ': [[0.18, 1.05, 0.3, 1.03, 0.75, 2.32, 0.85, 2.35], [0.82, 1.05, 0.2, 2.35]], 'κ': [[0.3, 1.03, 0.3, 2.0], [0.75, 1.05, 0.3, 1.55, 0.78, 2.0]],
    'ν': [[0.2, 1.05, 0.3, 1.03, 0.48, 1.98, 0.68, 1.6, 0.8, 1.05]], 'Γ': [[0.25, 2.25, 0.25, 0.75, 0.8, 0.75, 0.8, 0.88]],
    'Λ': [[0.15, 2.25, 0.5, 0.75, 0.85, 2.25]], 'Θ': [arc(0.5, 1.5, 0.32, 0.75, -PI / 2, 1.5 * PI, 16), [0.32, 1.5, 0.68, 1.5]],
    '∠': [[0.85, 0.95, 0.15, 2.0, 0.88, 2.0]], '⊥': [[0.5, 0.85, 0.5, 2.0], [0.15, 2.0, 0.85, 2.0]], '∥': [[0.38, 0.8, 0.38, 2.2], [0.62, 0.8, 0.62, 2.2]],
    '≅': [[0.22, 1.22, 0.35, 1.1, 0.5, 1.18, 0.65, 1.26, 0.78, 1.13], [0.25, 1.5, 0.78, 1.5], [0.25, 1.75, 0.78, 1.75]],
    '∼': [[0.22, 1.55, 0.35, 1.42, 0.5, 1.5, 0.65, 1.58, 0.78, 1.45]], '≡': [[0.25, 1.28, 0.78, 1.28], [0.25, 1.5, 0.78, 1.5], [0.25, 1.72, 0.78, 1.72]],
    '⊂': [[0.8, 1.05, 0.45, 1.05, 0.28, 1.2, 0.22, 1.5, 0.28, 1.8, 0.45, 1.95, 0.8, 1.95]],
    '⊆': [[0.8, 0.95, 0.45, 0.95, 0.28, 1.08, 0.22, 1.35, 0.28, 1.62, 0.45, 1.75, 0.8, 1.75], [0.22, 2.0, 0.8, 2.0]],
    '⊃': [[0.2, 1.05, 0.55, 1.05, 0.72, 1.2, 0.78, 1.5, 0.72, 1.8, 0.55, 1.95, 0.2, 1.95]],
    '∪': [[0.25, 1.0, 0.25, 1.6, 0.35, 1.88, 0.5, 1.97, 0.65, 1.88, 0.75, 1.6, 0.75, 1.0]],
    '∩': [[0.25, 2.0, 0.25, 1.4, 0.35, 1.12, 0.5, 1.03, 0.65, 1.12, 0.75, 1.4, 0.75, 2.0]],
    '∅': [arc(0.5, 1.45, 0.28, 0.4, 0, 2 * PI, 14), [0.8, 0.85, 0.2, 2.05]],
    '∀': [[0.15, 0.75, 0.5, 2.25, 0.85, 0.75], [0.3, 1.45, 0.7, 1.45]], '∃': [[0.2, 0.75, 0.8, 0.75, 0.8, 2.25, 0.2, 2.25], [0.3, 1.5, 0.8, 1.5]],
    '∉': [[0.78, 1.08, 0.48, 1.08, 0.3, 1.2, 0.24, 1.5, 0.3, 1.8, 0.48, 1.92, 0.78, 1.92], [0.26, 1.5, 0.7, 1.5], [0.66, 0.95, 0.38, 2.05]],
    '⇔': [[0.25, 1.4, 0.75, 1.4], [0.25, 1.6, 0.75, 1.6], [0.34, 1.22, 0.1, 1.5, 0.34, 1.78], [0.66, 1.22, 0.9, 1.5, 0.66, 1.78]],
    '↔': [[0.12, 1.5, 0.88, 1.5], [0.32, 1.32, 0.12, 1.5, 0.32, 1.68], [0.68, 1.32, 0.88, 1.5, 0.68, 1.68]],
    '⇐': [[0.2, 1.4, 0.88, 1.4], [0.2, 1.6, 0.88, 1.6], [0.34, 1.22, 0.1, 1.5, 0.34, 1.78]],
    '↦': [[0.12, 1.5, 0.88, 1.5], [0.68, 1.32, 0.88, 1.5, 0.68, 1.68], [0.12, 1.35, 0.12, 1.65]],
    '∴': [[0.49, 1.2, 0.51, 1.22], [0.24, 1.93, 0.26, 1.95], [0.74, 1.93, 0.76, 1.95]], '∵': [[0.24, 1.2, 0.26, 1.22], [0.74, 1.2, 0.76, 1.22], [0.49, 1.93, 0.51, 1.95]],
    '□': [[0.25, 1.0, 0.75, 1.0, 0.75, 2.0, 0.25, 2.0, 0.25, 1.0]],
    '∝': [[0.85, 1.25, 0.7, 1.22, 0.5, 1.5, 0.32, 1.75, 0.18, 1.65, 0.18, 1.35, 0.32, 1.25, 0.5, 1.5, 0.7, 1.78, 0.85, 1.75]],
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
  function fontVariant(font, ch, k = K) { // k: box units per font unit (1 / that font's ก height)
    const g = font.charToGlyph(ch); if (!g || !g.index) return null;
    const ox = needsGhost(ch) ? GHOST.adv : GX;
    const polys = []; let cur = null, px = 0, py = 0;
    const P = (x, y) => { cur.push(+(ox + x * k).toFixed(4), +(BASE + y * k).toFixed(4)); px = x; py = y; };
    for (const c of g.getPath(0, 0, font.unitsPerEm).commands) {
      if (c.type === 'M') { cur = []; polys.push(cur); P(c.x, c.y); }
      else if (c.type === 'L') P(c.x, c.y);
      else if (c.type === 'Q') { const x0 = px, y0 = py; for (let t = 1; t <= 6; t++) { const s = t / 6, a = 1 - s; P(a * a * x0 + 2 * a * s * c.x1 + s * s * c.x, a * a * y0 + 2 * a * s * c.y1 + s * s * c.y); } }
      else if (c.type === 'C') { const x0 = px, y0 = py; for (let t = 1; t <= 8; t++) { const s = t / 8, a = 1 - s; P(a * a * a * x0 + 3 * a * a * s * c.x1 + 3 * a * s * s * c.x2 + s * s * s * c.x, a * a * a * y0 + 3 * a * a * s * c.y1 + 3 * a * s * s * c.y2 + s * s * s * c.y); } }
    }
    const p = polys.filter(q => q.length >= 6);
    return p.length ? { p, adv: g.advanceWidth * k } : null;
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
  // Top of a letter's body under a thin flick that rises over it (ศ ส ซ), else the ink top. Rows 0.02 deep from the top:
  // the body starts at the first row whose ink spans >= 50% of the body's width (its lower 60%: a flick sticking out
  // sideways doesn't count); a flick is thin (rows above it average < 35%). force: known flick, skip the thin test.
  function bodyTop(v, force) {
    const b = bbox(v), h = b.y1 - b.y0, n = Math.ceil(h / 0.02) + 1, lo = new Array(n).fill(Infinity), hi = new Array(n).fill(-Infinity);
    ink(v, (x, y) => { const r = Math.min(n - 1, Math.floor((y - b.y0) / 0.02)); if (x < lo[r]) lo[r] = x; if (x > hi[r]) hi[r] = x; }, 0.01);
    let bx0 = Infinity, bx1 = -Infinity; for (let r = 0; r < n; r++) if (r * 0.02 >= 0.4 * h && hi[r] >= lo[r]) { bx0 = Math.min(bx0, lo[r]); bx1 = Math.max(bx1, hi[r]); }
    const W = bx1 > bx0 ? bx1 - bx0 : b.x1 - b.x0;
    for (let r = 0, sum = 0; r < n && r * 0.02 < 0.5 * h; r++) {
      const sp = hi[r] > lo[r] ? hi[r] - lo[r] : 0;
      if (sp >= 0.5 * W) return force || (r * 0.02 >= 0.08 * h && sum / Math.max(r, 1) < 0.35 * W) ? b.y0 + r * 0.02 : b.y0;
      sum += sp;
    }
    return b.y0;
  }
  // Scale heights so the body's top and bottom land on t0, t1; a flick (fl) rides along at any length.
  function keepH(s, t0, t1, fl) {
    const o = { p: s }, b = bbox(o), y0 = fl ? bodyTop(o, true) : b.y0, z = (t1 - t0) / Math.max(b.y1 - y0, 0.01);
    return s.map(a => a.map((q, i) => (i % 2 ? t0 + (q - y0) * z : q)));
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
    if (plain) { // a flick over the body (ศ ส) may be drawn any length: size by the body under it
      if (bodyTop(w) > bbox(w).y0 || bodyTop(ref) > fr.y0) k = D(f.y1 - bodyTop(ref, true), E) / Math.max(u.y1 - bodyTop(w, true), 0.02); // a flick on either: both measured under it
    }
    // the limits only guard against odd drawings (a flat mark, a giant tail); checkLetter flags a letter that hits them
    if (mark) { k = Math.hypot(D(f.x1 - f.x0, E), D(f.y1 - f.y0, E)) / Math.max(Math.hypot(u.x1 - u.x0, u.y1 - u.y0), 0.02); lo = 0.6 * S; hi = 1.6 * S; }
    else if (!plain) { // size by the letter's body only: its tail may be drawn any length
      const up = fr.y1 <= BASE + 0.15, bu = body(w, up), bf = body(ref, up);
      k = bu && bf ? D(bf, E) / bu : Math.sqrt(kh * kw); lo = 0.65 * S; hi = 1.35 * S;
    }
    const kk = Math.min(Math.max(k, lo), hi);
    const topAlign = LOWER.has(ch) || (!mark && fr.y1 > BASE + 0.15); // hang below-line letters from the top
    const ty = topAlign ? f.y0 + HW - u.y0 * kk : f.y1 - HW - u.y1 * kk, tx = mark ? f.x1 - HW - u.x1 * kk : GX + HW - u.x0 * kk;
    let st = w.s.map(a => a.map((q, i) => i % 2 ? q * kk + ty : q * kk + tx));
    // Then by eye: lay it over the typed letter where the lines match best, pull its shape part way to the typed one,
    // and smooth at page size, so a letter drawn tiny and blown up gets the same pen as one drawn big.
    const L = typedLook(ref, P.sl || 0), F = fitInk(st, L, !plain && ch !== AM); // plain letters and ำ (stands on the line) keep their exact height and line
    if (F) st = F;
    st = st.map(a => resample(a, 0.016)); const s0 = F && smooth(st); if (F) st = calm(pull(st, L), st, dragW(st, L)); st = smooth(st); // the pull may bend a dragged line, never dent it
    const r4 = s => s.map(a => a.map(q => +q.toFixed(4)));
    const out = { s: r4(st) }; if (s0) out.s0 = r4(s0); // s0: the same letter with no pull (pull and smooth are linear, so copies can mix the two)
    NORM.set(v, { key, v: out }); return out;
  }

  // ---- Seeing letters: a coarse picture (0.02 cells) of the ink, to lay a drawn letter over the typed one ----
  const GR = 0.02, CAP = 0.3, PULL = 0.3, LIKE = 0.05; // LIKE: ink distance (as seen) above which a drawing isn't this letter's typed shape (fakes ≤0.03, a scribble 0.08)
  const grid = (b, m) => { const x0 = b.x0 - m, y0 = b.y0 - m; return { x0, y0, nx: Math.ceil((b.x1 - b.x0 + 2 * m) / GR) + 1, ny: Math.ceil((b.y1 - b.y0 + 2 * m) / GR) + 1 }; };
  function fillMask(polys, g) { // nonzero fill, like the canvas
    const m = new Uint8Array(g.nx * g.ny);
    for (let r = 0; r < g.ny; r++) {
      const y = g.y0 + (r + 0.5) * GR, xs = [];
      for (const a of polys) for (let i = 0, n = a.length; i < n; i += 2) {
        const x1 = a[i], y1 = a[i + 1], x2 = a[(i + 2) % n], y2 = a[(i + 3) % n];
        if ((y1 <= y) !== (y2 <= y)) xs.push([x1 + (y - y1) / (y2 - y1) * (x2 - x1), y2 > y1 ? 1 : -1]);
      }
      xs.sort((p, q) => p[0] - q[0]);
      for (let k = 0, wn = 0; k < xs.length - 1; k++) {
        wn += xs[k][1]; if (!wn) continue;
        for (let c = Math.max(0, Math.ceil((xs[k][0] - g.x0) / GR - 0.5)); c < g.nx && g.x0 + (c + 0.5) * GR < xs[k + 1][0]; c++) m[r * g.nx + c] = 1;
      }
    }
    return m;
  }
  function thin(m, g) { // Zhang-Suen: filled letter -> its centre line
    const W = g.nx, H = g.ny, at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0);
    for (let changed = true; changed;) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        const del = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const B = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7]; if (B < 2 || B > 6) continue;
          let A = 0; for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) A++;
          if (A !== 1 || (step ? p[0] * p[2] * p[6] || p[0] * p[4] * p[6] : p[0] * p[2] * p[4] || p[2] * p[4] * p[6])) continue;
          del.push(y * W + x);
        }
        for (const i of del) m[i] = 0; if (del.length) changed = true;
      }
    }
    return m;
  }
  function dist(m, g) { // distance to the nearest inked cell, box units (two-pass chamfer)
    const W = g.nx, H = g.ny, d = new Float32Array(W * H), S = Math.SQRT2;
    for (let i = 0; i < d.length; i++) d[i] = m[i] ? 0 : 1e9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i];
      if (x) v = Math.min(v, d[i - 1] + 1);
      if (y) { v = Math.min(v, d[i - W] + 1); if (x) v = Math.min(v, d[i - W - 1] + S); if (x < W - 1) v = Math.min(v, d[i - W + 1] + S); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + S); if (x) v = Math.min(v, d[i + W - 1] + S); }
      d[i] = v;
    }
    for (let i = 0; i < d.length; i++) d[i] *= GR;
    return d;
  }
  function look(d, g, x, y) { // smooth read of a distance map, CAP outside it
    const fx = (x - g.x0) / GR - 0.5, fy = (y - g.y0) / GR - 0.5, c = Math.floor(fx), r = Math.floor(fy);
    if (c < 0 || r < 0 || c >= g.nx - 1 || r >= g.ny - 1) return CAP;
    const a = fx - c, b = fy - r, i = r * g.nx + c;
    return Math.min(CAP, (d[i] * (1 - a) + d[i + 1] * a) * (1 - b) + (d[i + g.nx] * (1 - a) + d[i + g.nx + 1] * a) * b);
  }
  // The typed letter's centre line, leaned like this person writes (cached per font letter and lean).
  const LOOK = new WeakMap();
  function typedLook(ref, sl) {
    let c = LOOK.get(ref); if (!c) LOOK.set(ref, c = {}); if (c[sl]) return c[sl];
    const b = bbox(ref), my = (b.y0 + b.y1) / 2, polys = sl ? ref.p.map(a => a.map((q, i) => (i % 2 ? q : q + sl * (a[i + 1] - my)))) : ref.p;
    const g = grid(bbox({ p: polys }), 0.5), fill = fillMask(polys, g), df = dist(fill, g), sk = thin(fill.slice(), g), pts = [], fp = [];
    const at = i => [g.x0 + ((i % g.nx) + 0.5) * GR, g.y0 + (((i / g.nx) | 0) + 0.5) * GR];
    for (let i = 0; i < sk.length; i++) { if (sk[i]) pts.push(...at(i)); if (fill[i]) fp.push(...at(i)); }
    return (c[sl] = { g, df, fp, pts, sk }); // df: distance to the typed ink, fp: typed ink cells, pts: its centre line
  }
  // Centre-line cells -> pen strokes (to make test people who write single lines, like real ones).
  function trace(L) {
    const { g, sk } = L, W = g.nx, used = new Uint8Array(sk.length), out = [];
    const nb = i => { const x = i % W, y = (i / W) | 0, o = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < g.ny && sk[Y * W + X]) o.push(Y * W + X); } return o; }; // straight neighbours first
    const P = i => [+(g.x0 + ((i % W) + 0.5) * GR).toFixed(3), +(g.y0 + (((i / W) | 0) + 0.5) * GR).toFixed(3)];
    const cells = []; for (let i = 0; i < sk.length; i++) if (sk[i]) cells.push(i);
    for (const ends of [true, false]) for (const c0 of cells) { // start at line ends, then whatever is left (loops)
      if (used[c0] || (ends && nb(c0).length !== 1)) continue;
      const join = nb(c0).find(q => used[q]), a = join !== undefined ? [...P(join)] : [];
      for (let c = c0; c !== undefined; c = nb(c).find(q => !used[q])) { used[c] = 1; a.push(...P(c)); }
      if (a.length >= 6 || cells.length < 6) out.push(a);
    }
    return out;
  }
  const tmean = e => { e.sort(); const n = Math.max(1, Math.round(e.length * 0.85)); let t = 0; for (let i = 0; i < n; i++) t += e[i]; return t / n; }; // worst 15% ignored: stray ticks, a longer tail
  // Size (s), width (a) and place (tx, ty) that lay the drawn ink over the typed ink best, as the eye sees both, both ways.
  // null when the drawing doesn't look like the typed letter (another style, a scribble): then it is left as drawn.
  function fitInk(st, L, free) { // free: size and height may change too (tails, marks), else only width and sideways
    const b = bbox({ s: st }), gd = grid(b, 0.4), m = new Uint8Array(gd.nx * gd.ny), P = [];
    ink({ s: st }, (x, y) => { m[Math.floor((y - gd.y0) / GR) * gd.nx + Math.floor((x - gd.x0) / GR)] = 1; P.push(x, y); }, GR / 2);
    const dd = dist(m, gd), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, Q = L.fp;
    const sp = Math.max(1, Math.round(P.length / 400)) * 2, sq = Math.max(1, Math.round(Q.length / 400)) * 2; // ≤200 points each way
    const e1 = new Float32Array(Math.ceil(P.length / sp)), e2 = new Float32Array(Math.ceil(Q.length / sq));
    const err = (s, a, tx, ty) => {
      // as seen: the drawn line is HW thicker each side, the typed letter is filled
      for (let i = 0, j = 0; i < P.length; i += sp, j++) e1[j] = Math.max(look(L.df, L.g, cx + tx + s * a * (P[i] - cx), cy + ty + s * (P[i + 1] - cy)) - HW, 0);
      for (let i = 0, j = 0; i < Q.length; i += sq, j++) e2[j] = Math.max(s * look(dd, gd, cx + (Q[i] - cx - tx) / (s * a), cy + (Q[i + 1] - cy - ty) / s) - HW, 0);
      return (tmean(e1) + tmean(e2)) / 2;
    };
    const lo = [free ? 0.88 : 1, 0.85, -0.12, free ? -0.12 : 0], hi = [free ? 1.12 : 1, 1.15, 0.12, free ? 0.12 : 0];
    const cost = x => err(...x) + 0.004 * (Math.abs(Math.log(x[0])) / 0.12 + Math.abs(Math.log(x[1])) / 0.15 + (Math.abs(x[2]) + Math.abs(x[3])) / 0.12);
    let x = [1, 1, 0, 0], best = cost(x), step = [0.04, 0.05, 0.04, 0.04];
    for (let h = 0; h < 5; h++, step = step.map(q => q / 2)) for (let moved = true; moved;) {
      moved = false;
      for (let j = 0; j < 4; j++) for (const sg of [1, -1]) {
        const y = x.slice(); y[j] = Math.min(Math.max(y[j] + sg * step[j], lo[j]), hi[j]); if (y[j] === x[j]) continue;
        const c = cost(y); if (c < best - 1e-6) { best = c; x = y; moved = true; }
      }
    }
    if (err(...x) > LIKE) return null;
    const [s, a, tx, ty] = x;
    return st.map(q => q.map((v, i) => (i % 2 ? cy + ty + s * (v - cy) : cx + tx + s * a * (v - cx))));
  }
  function resample(a, step) { // points every `step` along the stroke, ends kept
    if (a.length < 4) return a;
    const o = [a[0], a[1]]; let left = step;
    for (let i = 2; i < a.length; i += 2) {
      let x = a[i - 2], y = a[i - 1]; const L = Math.hypot(a[i] - x, a[i + 1] - y); let d = L;
      while (d >= left) { const t = left / d; x += (a[i] - x) * t; y += (a[i + 1] - y) * t; o.push(x, y); d -= left; left = step; }
      left -= d;
    }
    if (o[o.length - 2] !== a[a.length - 2] || o[o.length - 1] !== a[a.length - 1]) o.push(a[a.length - 2], a[a.length - 1]);
    return o;
  }
  // Move each point PULL of the way to the typed centre line; parts far from it (a flourish, a longer tail) fade out
  // of the pull. The move is averaged along the stroke so it bends smoothly instead of snapping between branches.
  function pull(st, L, wf) { // wf(x, y): how far to pull there (default PULL)
    const Q = L.pts;
    return st.map(a => {
      const n = a.length / 2, mx = new Float64Array(n), my = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const x = a[2 * k], y = a[2 * k + 1]; let bd = Infinity, bx = x, by = y;
        for (let i = 0; i < Q.length; i += 2) { const d = (Q[i] - x) ** 2 + (Q[i + 1] - y) ** 2; if (d < bd) { bd = d; bx = Q[i]; by = Q[i + 1]; } }
        const w = (wf ? wf(x, y) : PULL) * Math.min(Math.max((0.3 - Math.sqrt(bd)) / 0.15, 0), 1); mx[k] = w * (bx - x); my[k] = w * (by - y);
      }
      return a.map((q, i) => {
        const k = i >> 1, k0 = Math.max(0, k - 5), k1 = Math.min(n - 1, k + 5); let t = 0;
        for (let j = k0; j <= k1; j++) t += i % 2 ? my[j] : mx[j];
        return q + t / (k1 - k0 + 1);
      });
    });
  }

  function variantsFor(hand, ch, fb, P) {
    const drawn = ((hand && hand.g && hand.g[ch]) || []).filter(v => v && v.s && v.s.length).map(v => normalize(v, ch, fb, P));
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
    const add = (v, dx, dy, m = true) => { parts.push({ v, dx, dy, m }); const q = vb(v); return { y0: q.y0 + dy, x1: q.x1 + dx }; }; // m: a mark, which never pushes letters apart
    for (const m of cl.marks) if (UPPER.has(m)) {
      const v = pick(m); if (!v) continue;
      const dx = mxOf(v); top = Math.min(top, add(v, dx, under(v, dx) - 0.1 - vb(v).y1).y0);
    }
    if (cl.am) { const v = pick(AM); if (v) { const q = add(v, mx0, 0, false); top = Math.min(top, q.y0); x1 = Math.max(x1, q.x1); } }
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

  // ---------- v18: AI-paste cleanup + LaTeX
  const BOLD = 1.8, OPS = '=+-<>×÷±∓≤≥≠≈→⇒∈', BIGOP = 'ΣΠ∑∏∐⋃⋂⨁⨂', INTS = '∫∬∭∮';
  const MSYM = { cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
    infty: '∞', pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', sum: 'Σ',
    to: '→', rightarrow: '→', Rightarrow: '⇒', implies: '⇒', in: '∈', ldots: '…', dots: '…', cdots: '…', circ: '°', degree: '°', lt: '<', gt: '>',
    '{': '{', '}': '}', '%': '%', $: '$', '#': '#', '&': '&', _: '_', '|': '|', lbrace: '{', rbrace: '}', vert: '|', mid: '|',
    int: '∫', oint: '∮', partial: '∂', nabla: '∇', prod: 'Π', epsilon: 'ε', varepsilon: 'ε', omega: 'ω', Omega: 'Ω', phi: 'φ', varphi: 'φ', Phi: 'Φ',
    rho: 'ρ', tau: 'τ', eta: 'η', zeta: 'ζ', xi: 'ξ', psi: 'ψ', chi: 'χ', kappa: 'κ', nu: 'ν', Gamma: 'Γ', Lambda: 'Λ', Pi: 'Π', Theta: 'Θ', vartheta: 'θ',
    angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', Vert: '∥', cong: '≅', sim: '∼', equiv: '≡', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩',
    emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', lnot: '¬', notin: '∉', Leftrightarrow: '⇔', iff: '⇔', leftrightarrow: '↔',
    leftarrow: '←', gets: '←', Leftarrow: '⇐', mapsto: '↦', ell: 'ℓ', prime: '′', therefore: '∴', because: '∵', propto: '∝', bullet: '•', ast: '*', colon: ':',
    langle: '<', rangle: '>', lvert: '|', rvert: '|', lceil: '[', rceil: ']', lfloor: '[', rfloor: ']', star: '*', square: '□', setminus: '\\', backslash: '\\' };
  const NOOP = /^(displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|nonumber|notag|[Bb]igg?[lrm]?|middle|quad\*|hline|centering)$/;
  const ACC = /^(vec|hat|widehat|bar|overline|underline|tilde|widetilde|dot|ddot|overrightarrow|overleftarrow|check)$/;
  const BRK = { pmatrix: '()', bmatrix: '[]', Bmatrix: '{}', vmatrix: '||', Vmatrix: '∥∥', cases: '{.', dcases: '{.' };
  const MSPACE = { ',': 0.17, ':': 0.22, ';': 0.28, ' ': 0.33, '\\': 0.33, quad: 1, qquad: 2, '!': 0 };
  const FN = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'max', 'min', 'exp']);
  // LaTeX math -> tree: row{a}, ch{c}, txt{s}, sp{w}, scr{b, sup, sub}, frac{n, d}, sqrt{b, ix}, lr{l, r, b}
  function mathParse(s) {
    let i = 0;
    const ws = () => { while (/\s/.test(s[i] || '')) i++; };
    const name = () => { i++; if (/[a-zA-Z]/.test(s[i] || '')) { let n = ''; while (/[a-zA-Z]/.test(s[i] || '')) n += s[i++]; return n; } return s[i++] || ''; };
    const raw = () => { ws(); if (s[i] !== '{') return ''; let t = '', d = 0; for (i++; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && !d--) break; t += s[i]; } i++; return t; };
    const arg = () => { ws(); if (s[i] === '{') { i++; const r = row('}'); i++; return r; } return atom() || { t: 'row', a: [] }; };
    const delim = () => { ws(); if (s[i] === '\\') { const n = name(); return MSYM.hasOwnProperty(n) ? MSYM[n] : n; } return s[i++] || '.'; };
    function atom() {
      ws(); const c = s[i]; if (c === undefined) return null;
      if (c === '{') { i++; const r = row('}'); i++; return r; }
      if (c !== '\\') { i++; return c === '}' || c === '&' ? null : { t: 'ch', c }; }
      const n = name();
      if (/^[dt]?frac$/.test(n)) return { t: 'frac', n: arg(), d: arg() };
      if (n === 'sqrt') { ws(); let ix = null; if (s[i] === '[') { i++; ix = row(']'); i++; } return { t: 'sqrt', b: arg(), ix }; }
      if (/^(text|textrm|textbf|mathrm|mbox|operatorname)$/.test(n)) return { t: 'txt', s: raw() };
      if (/^(mathbf|mathit|boldsymbol|mathsf|bm|mathbb|mathcal|mathfrak|mathscr|textit|emph|underbrace|overbrace)$/.test(n)) return arg(); // styles: the hand writes them the same
      if (n === 'boxed') return { t: 'boxed', b: arg() };
      if (NOOP.test(n)) return null;
      if (n === 'tag') return { t: 'txt', s: '(' + raw() + ')' };
      if (ACC.test(n)) return { t: 'acc', k: n, b: arg() };
      if (n === 'begin') { // matrix / cases / aligned: \\ = next row, & = next cell
        const nm = raw().replace('*', ''); if (nm === 'array') raw(); // column spec
        const rows = []; let cells = [];
        for (;;) {
          cells.push(row(['&', '\\\\', '\\end'])); ws();
          if (s[i] === '&') { i++; continue; }
          if (cells.some(c => c.a.length)) rows.push(cells); cells = [];
          if (s.startsWith('\\\\', i)) { i += 2; ws(); if (s[i] === '[') i = Math.max(i + 1, s.indexOf(']', i) + 1); continue; } // \\[2pt]
          if (s.startsWith('\\end', i)) { i += 4; raw(); }
          break;
        }
        return { t: 'env', name: nm, rows };
      }
      if (n === 'end') { raw(); return null; }
      if (n === 'left') { const l = delim(), b = row('\\right'); let r = '.'; if (s.startsWith('\\right', i)) { i += 6; r = delim(); } return { t: 'lr', l, r, b }; }
      if (n === 'right') return null;
      if (MSPACE.hasOwnProperty(n)) return { t: 'sp', w: MSPACE[n] };
      if (FN.has(n)) return { t: 'txt', s: n, fn: 1 };
      if (MSYM.hasOwnProperty(n)) return { t: 'ch', c: MSYM[n] };
      return n ? { t: 'txt', s: n } : null; // unknown command: write its name
    }
    function row(end) {
      const a = [], E = end == null ? [] : [].concat(end);
      for (;;) {
        ws(); if (i >= s.length || E.some(e => s.startsWith(e, i))) break;
        if (s[i] === '^' || s[i] === '_') {
          const k = s[i++] === '^' ? 'sup' : 'sub'; let b = a.pop() || { t: 'row', a: [] };
          if (b.t !== 'scr' || b[k]) b = { t: 'scr', b };
          b[k] = arg(); a.push(b); continue;
        }
        const x = atom(); if (x) a.push(x);
      }
      return { t: 'row', a };
    }
    return row(null);
  }
  const isCmd = n => MSYM.hasOwnProperty(n) || FN.has(n) || MSPACE.hasOwnProperty(n) || ACC.test(n) || NOOP.test(n)
    || /^([dt]?frac|binom|sqrt|text\w*|math\w+|operatorname|mbox|boxed|left|right|begin|end|bm|boldsymbol|emph|underbrace|overbrace|tag)$/.test(n);
  // one math token: a whole \begin..\end, \command, \, \_ \\, {..} nested 3 deep, 1-2 letters (dx, not "is"), a number, an operator
  let BR = String.raw`\{[^{}]*\}`; for (let d = 0; d < 4; d++) BR = String.raw`\{(?:[^{}]|` + BR + String.raw`)*\}`; // {..} nested 5 deep, may span lines
  const TOK = String.raw`(?:\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}|\\[a-zA-Z]+\*?|\\\\|\\[,;:! {}|_*]|` + BR + String.raw`|(?!(?:is|of|to|in|on|at|so|if|or|an|as|be|by|it|we|do|no|up|my|he|us|am)(?![A-Za-z]))[A-Za-z]{1,2}(?![A-Za-z])|\d+(?:\.\d+)?|[-+*/=<>]\s*|[()[\]|^_!',.&])`;
  // separate lines stay separate formulas; a formula carries on over a line break inside { } or next to = + - < >
  const BARE = new RegExp(TOK + String.raw`(?:(?:[ \t]*|\s*(?=[-+=<>]))` + TOK + ')*', 'g');
  // Pasted text -> ['\n' | {t:'txt', s, bold} | {t:'math', node}]. Markdown from AI chats: **bold**, __bold__, # headings, * / - / + bullets.
  function rich(text) {
    const B0 = '\u0001', B1 = '\u0002'; // bold on / off
    // v19: text copied from rendered math: invisible marks, odd spaces, math-italic letters (𝑥 has no glyph anywhere), x² / a₁
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ', SUPA = '0123456789+-=()ni', SUB = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎', SUBA = '0123456789+-=()';
    text = text.replace(/&(amp|lt|gt|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', nbsp: ' ' })[e]).replace(/[​-‍⁠-⁤﻿￼]/g, '').replace(/[  -  ]/g, ' ').replace(/−/g, '-')
      .replace(/\uD835[\uDC00-\uDFFF]|ℎ/g, c => c.normalize('NFKC'))
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+/g, t => '^{' + [...t].map(c => SUPA[SUP.indexOf(c)]).join('') + '}')
      .replace(/[₀-₎]+/g, t => '_{' + [...t].map(c => SUBA[SUB.indexOf(c)]).join('') + '}');
    text = text.replace(/\r/g, '').split('\n').map(l => {
      l = l.replace(/^(\s*)[*+-]\s+/, '$1• ');
      const h = l.match(/^\s*#{1,6}\s+(.*)$/); if (h) l = B0 + h[1] + B1;
      return l.replace(/\*\*(?=\S)(.+?)\*\*/g, B0 + '$1' + B1).replace(/__(?=\S)(.+?)__/g, B0 + '$1' + B1);
    }).join('\n');
    const out = []; let bold = false;
    // markdown-escaped math: \_ -> _, \\, -> \, ; \\\\ -> the row break \\ and \\{ -> the brace \{
    const unesc = (src, esc) => (esc || /\\[_*]/.test(src) || (/\\\\[,;:!]/.test(src) && !/\\begin/.test(src)) ? src.replace(/\\([\\_*[\]~])/g, '$1') : src);
    const sub = part => {
      // shortcut: a_n / x^2 outside $ is math too (user's choice), so snake_case words get a subscript; add an escape if that bites
      let last = 0; const re = /([A-Za-z0-9)\]])((?:[_^](?:\{[^{}\n]*\}|\d+|[A-Za-z]))+)/g; let m;
      const plain = s => out.push({ t: 'txt', s: s.replace(/\\([\\_*#~`[\]])/g, '$1'), bold }); // markdown escapes (a\_b, \*) are the plain character
      while ((m = re.exec(part))) {
        if (m.index > last) plain(part.slice(last, m.index));
        out.push({ t: 'math', node: mathParse(m[0]), bold }); last = re.lastIndex;
      }
      if (last < part.length) plain(part.slice(last));
    };
    const txt = s => {
      for (const part of s.split(/([\u0001\u0002])/)) {
        if (part === B0) { bold = true; continue; } if (part === B1) { bold = false; continue; }
        // LaTeX typed with no $ round it: a run of math tokens holding a known \command is math; English words (2+ letters) end the run
        let last = 0, m; BARE.lastIndex = 0;
        while ((m = BARE.exec(part))) {
          let st = m.index, r = m[0];
          if (/[A-Za-z]/.test(part[st - 1] || '')) { const w = /^[A-Za-z]*/.exec(r)[0].length; r = r.slice(w); st += w; } // "the \frac": the e belongs to the word
          if (!(r.match(/\\[a-zA-Z]+/g) || []).some(c => isCmd(c.slice(1)))) continue;
          const st2 = st + r.length - r.trimStart().length, core = r.trim(), en = st2 + core.length;
          const disp = !part.slice(part.lastIndexOf('\n', st2 - 1) + 1, st2).trim() && !/^[^\n]*/.exec(part.slice(en))[0].trim(); // alone on its line
          sub(part.slice(last, st2)); out.push({ t: 'math', node: mathParse(unesc(core)), bold, disp }); last = en;
        }
        sub(part.slice(last));
      }
    };
    const lineStart = () => { const e = out[out.length - 1]; return !e || e === '\n' || (e.t === 'txt' && /\n\s*$/.test(e.s)); };
    // $..$ needs no space just inside and no digit right after, so "$5 and $6" stays money
    // first two: markdown-escaped copies write \\[ .. \\] and \\( .. \\)
    const re = /\\\\\[([\s\S]+?)\\\\\]|\\\\\(([\s\S]+?)\\\\\)|\\\$|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)|\$\s+([^$\n]*[\\^_={][^$\n]*?)\s*\$(?!\d)/g; // last: "$ x^2 $" spaced, only when it looks like math
    let last = 0, m;
    while ((m = re.exec(text))) {
      txt(text.slice(last, m.index)); last = re.lastIndex;
      if (m[0] === '\\$') { out.push({ t: 'txt', s: '$', bold }); continue; }
      // $$..$$ mid-sentence is inline (Claude's copy button writes inline math that way); alone on its line it is display
      const lineAlone = !text.slice(text.lastIndexOf('\n', m.index - 1) + 1, m.index).trim() && !/^[^\n]*/.exec(text.slice(last))[0].trim();
      const disp = m[1] != null || m[4] != null || (m[3] != null && lineAlone);
      const node = mathParse(unesc(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7], m[1] != null || m[2] != null));
      if (disp && !lineStart()) out.push('\n');
      out.push({ t: 'math', node, bold, disp });
      if (disp && !/^\s*\n/.test(text.slice(last))) out.push('\n');
    }
    txt(text.slice(last));
    return out;
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
    for (const p of it.parts) if (!p.m) { e = pen(p.v) * it.sc; ink(p.v, (x, y) => put(x + p.dx, y + p.dy), 0.1); } // like typed text, marks never set the spacing
    // shortcut: a tone mark may touch a neighbouring tall tail (ป ฝ ฟ), as in typed text; upgrade only if it shows up
    return { L, R: Rt };
  }
  // How far the next cluster's start must sit from the previous one's so the visible gap is right: closest approach in any shared band.
  function kern(a, b) {
    let d = -Infinity;
    for (let j = 0; j < NB; j++) if (a.pr.R[j] > -Infinity && b.pr.L[j] < Infinity) d = Math.max(d, a.pr.R[j] - b.pr.L[j]);
    return d;
  }

  // Visible gap between two clusters when typed in the font (end of the 1st letter's ink to start of the 2nd's).
  const SPACE = 0.462, TG = new Map(); // SPACE: Sriracha's space width in box units; a word's last letter keeps gap 0.1 (about two side bearings)
  function typedGap(ca, cb, fb) {
    const key = JSON.stringify([ca, cb]); if (TG.has(key)) return TG.get(key);
    let g = 0.1;
    const ok = cl => cl.base && fb && fb(cl.base), adv = cl => fb(cl.base).adv + (cl.am && fb(AM) ? fb(AM).adv : 0);
    const T = cl => { const it = { ...buildCluster(cl, fb), sc: 1, sw: 1, sh: 0 }; it.pr = profile(it); return it; };
    if (ok(ca) && ok(cb)) { const A = T(ca), B = T(cb), d = kern(A, B); if (d > -Infinity) g = Math.min(Math.max(B.x0 + adv(ca) - A.x0 - d, 0.03), 0.3); }
    TG.set(key, g); return g;
  }

  // As seen: how far ink strays from the typed letter (pen width counted), worst 15% ignored.
  const seen = (st, Lk) => { const e = []; ink({ s: st }, (x, y) => e.push(Math.max(look(Lk.df, Lk.g, x, y) - HW, 0)), 0.02); return tmean(Float32Array.from(e)); };

  // Two drawn versions of one letter as matching point lists (same count per stroke, same direction),
  // or null when they were drawn differently (other stroke count or order, far apart): then they are never mixed.
  const MATCH = new WeakMap();
  function match(a, b) {
    let m = MATCH.get(a); if (!m) MATCH.set(a, m = new Map()); if (m.has(b)) return m.get(b);
    let r = null;
    if (a.s.length === b.s.length && !a.s0 === !b.s0) {
      const at = (p, t) => { const k = Math.floor(t), f = t - k; return 2 * k + 2 >= p.length ? [p[p.length - 2], p[p.length - 1]] : [p[2 * k] + (p[2 * k + 2] - p[2 * k]) * f, p[2 * k + 1] + (p[2 * k + 3] - p[2 * k + 1]) * f]; };
      const even = (p, N, rev) => { const o = [], n = p.length / 2 - 1; for (let i = 0; i < N; i++) o.push(...at(p, n * (rev ? N - 1 - i : i) / Math.max(N - 1, 1))); return o; }; // points are already evenly spaced
      const A = [], B = [], A0 = [], B0 = []; let d = 0, c = 0;
      for (let k = 0; k < a.s.length; k++) {
        const p = a.s[k], q = b.s[k], N = Math.max(p.length, q.length) / 2, e = p.length - 2, f = q.length - 2;
        const D = (i, j) => Math.hypot(p[i] - q[j], p[i + 1] - q[j + 1]), rev = D(0, f) + D(e, 0) < D(0, 0) + D(e, f);
        const pa = even(p, N), qb = even(q, N, rev);
        for (let i = 0; i < pa.length; i += 2) { d += Math.hypot(pa[i] - qb[i], pa[i + 1] - qb[i + 1]); c++; }
        A.push(pa); B.push(qb); if (a.s0) { A0.push(even(a.s0[k], N)); B0.push(even(b.s0[k], N, rev)); }
      }
      if (d / c < 0.15) r = { A, B, A0, B0 };
    }
    m.set(b, r); return r;
  }
  const mix = (A, B, w) => A.map((p, k) => p.map((q, i) => q + (B[k][i] - q) * w));
  const blend = (m, w) => m.A0.length ? { s: mix(m.A, m.B, w), s0: mix(m.A0, m.B0, w) } : { s: mix(m.A, m.B, w) };

  // One copy of a letter, redrawn the way a hand redraws it every time: its own mix of the person's shape and the
  // typed one, middle a little higher or lower, bowls leaning, top wider or narrower, tail longer or shorter, rounder
  // corners when writing fast. Never past what still reads as the letter: a copy that strays from the typed letter
  // (as seen) more than the drawing itself is tried at half strength, then left as drawn.
  const DOWN = new Set('ฎฏฐญฤฦ'), SEEN0 = new WeakMap();
  function vary(v, ch, R, fast, Lk, refs, sty) {
    const src = v.s || v.p, u = () => R() * 2 - 1, many = src.length > 1, neat = sty ? sty.neat : 1;
    // a reference hand that looks like this person's is a mold: the letter is stretched 18-42% of the way into it (fresh each copy)
    let rf = null;
    if (v.s && refs) {
      const [, st, i] = refs.out[refChoose(refs, R, sty)];
      rf = { d: mold(v, st, i, refs.v), a: 0.18 + 0.24 * R(), font: !HANDY.has(REFS.j.refs[i].kind) };
    }
    const t = Math.min(Math.max(0.3 + 0.5 * (R() + R() - 1) - 0.1 * fast - (rf ? 0.5 * rf.a : 0), 0), 0.8); // pull toward typed: 0 = as drawn, today's look 0.3; person, typed and mold share the letter
    const ky = 0.32 * u(), kx = 0.32 * u(), kt = 0.16 * u(), kl = 0.15 * u(), sh = src.map(() => [0.022 * u(), 0.022 * u()]);
    const W = v.s ? dragOf(v, Lk) : null, fl = !TALL.has(ch) && !DOWN.has(ch) && bodyTop(v) > bbox(v).y0; // fl: a flick over the body
    const up = TALL.has(ch), down = DOWN.has(ch), soft = (fast > 0.6 ? 2 : fast > 0 ? 1 : 0) + (rf && rf.font && neat >= 0.5 ? 1 : 0); // a neat sheet molded on a font borrows its tidy curves
    const np = src.reduce((q, a) => q + a.length / 2, 0), at = () => { let k = (R() * np) | 0; for (let j = 0; j < src.length; j++) { const a = src[j]; if (k < a.length / 2) return [a[2 * k], a[2 * k + 1], W ? W[j][k] : 0]; k -= a.length / 2; } };
    // parts of the letter change (each change on in about half the copies): loops and heads, corners, stroke ends, bulges
    const ops = [];
    if (v.s) {
      const on = () => R() < 0.65, info = src.map(a => ({ lp: loops(a), cn: corners(a), c: cumLen(a) }));
      if (on()) src.forEach((a, j) => info[j].lp.forEach(([i, k, f]) => {
        const z = 0.75 + 0.55 * R(), open = f < 0.35 && fast > 0.6 && R() < 0.25 ? 0.02 + 0.03 * R() : 0; // fast writers open a head now and then; knots only change size
        ops.push((S, g) => scaleLoop(S[j], i, k, 1 + g * (z - 1), g * open));
      }));
      if (on()) {
        const m = Math.max(2, Math.round(Math.min(0.08, 0.03 + 0.03 * R() + 0.02 * Math.max(fast, 0)) / 0.016));
        src.forEach((a, j) => info[j].cn.forEach(k => { if (R() < 0.5 && !info[j].lp.some(([i0, i1]) => k >= i0 - 3 && k <= i1 + 3)) ops.push((S, g) => roundAt(S[j], k, m, g)); }));
      }
      if (on()) src.forEach((a, j) => {
        const c = info[j].c, T = c[c.length - 1]; if (T < 0.2) return;
        const f = 0.1 + 0.1 * R(), z = 1 + 0.2 * u(), th = 0.17 * u(), e = c.findIndex(q => q >= (1 - f) * T);
        ops.push((S, g) => endTurn(S[j], e, 1 + g * (z - 1), g * th));
      });
      if (on()) for (let n = R() < 0.5 ? 1 : 2; n > 0; n--) {
        const [cx, cy, wc] = at(), r = 0.2 + 0.2 * R(), A = (1 - wc) * (0.03 + 0.02 * R()) * (R() < 0.5 ? -1 : 1) * 2.33 / r; // 2.33: peak move = amplitude; none on a dragged line
        ops.push((S, g) => S.forEach(a => { for (let i = 0; i < a.length; i += 2) { const dx = a[i] - cx, dy = a[i + 1] - cy, e = g * A * Math.exp(-(dx * dx + dy * dy) / (r * r)); a[i] += e * dx; a[i + 1] += e * dy; } }));
      }
    }
    const make = g => {
      const k = 1 + g * (t / PULL - 1);
      let s = src;
      if (v.s0) { // the mix keeps the letter's top and bottom, so its height stays on the lines
        s = v.s0.map((a, j) => a.map((q, i) => q + k * (v.s[j][i] - q)));
        s = keepH(s, fl ? bodyTop(v, true) : bbox(v).y0, bbox(v).y1, fl);
      }
      if (rf || ops.length) {
        const b1 = bbox({ p: s }), t1 = fl ? bodyTop({ p: s }, true) : b1.y0;
        s = rf ? s.map((a, j) => a.map((q, i) => q + rf.a * rf.d[j][i])) : s.map(a => a.slice()); // the mold stays whole; g tames the rest
        for (const f of ops) f(s, g);
        if (!up && !down) s = keepH(s, t1, b1.y1, fl); // shape changes, not size: same body top and bottom
      }
      const b = bbox({ p: s });
      const w = Math.max(b.x1 - b.x0, 0.05), h = Math.max(b.y1 - b.y0, 0.05), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      let out = s.map((a, j) => {
        const o = new Array(a.length);
        for (let i = 0; i < a.length; i += 2) {
          let x = a[i], y = a[i + 1];
          y += g * ky * (y - b.y0) * (b.y1 - y) / h; // middle higher/lower, top and bottom stay
          x += g * kx * (x - b.x0) * (b.x1 - x) / w; // bowls lean, sides stay
          x = cx + (x - cx) * (1 + g * kt * (y - cy) / h); // top a bit wider or narrower than the bottom
          if (up && y < XH) y -= g * kl * (XH - y); else if (down && y > BASE) y += g * kl * (y - BASE); // tail longer/shorter
          o[i] = x + (many ? g * sh[j][0] : 0); o[i + 1] = y + (many ? g * sh[j][1] : 0);
        }
        return o;
      });
      if (W) out = calm(out, src, W);
      if (v.s && g === 1) for (let n = 0; n < soft; n++) out = out.map(a => a.length > 16 ? smooth([a])[0] : a);
      return out;
    };
    const wrap = s => (v.s ? { s } : { p: s });
    if (!Lk) return wrap(make(1));
    let b0 = SEEN0.get(v); if (b0 === undefined) SEEN0.set(v, b0 = seen(src, Lk));
    let lim = Math.max(LIKE, b0 + 0.01);
    if (rf) { // a mold is a real hand's letter: measure from the molded letter, unless the mold itself strays too far
      const bm = seen(src.map((a, j) => a.map((q, i) => q + rf.a * rf.d[j][i])), Lk);
      if (bm > Math.max(LIKE, b0 + 0.02)) rf = null; else lim = Math.max(lim, bm + 0.01);
    }
    for (const g of [1, 0.7, 0.4]) { const s = make(g); if (seen(s, Lk) <= lim) return wrap(s); }
    return v;
  }

  // ---- Thai hand: parts of a letter (pen strokes, points ~0.016 apart) ----
  const cumLen = a => { const c = [0]; for (let i = 2; i < a.length; i += 2) c.push(c[c.length - 1] + Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1])); return c; };
  // How a hand moves: a long straight line is dragged in one go and comes out neat (an L); curves, heads and short
  // ticks are where a hand wobbles (an O, a B). Per point 0..1: 1 = on a long straight run, 0 = in a curve.
  function dragW(st, L) {
    const one = a => {
      const c = cumLen(a), n = c.length, t = new Float64Array(n), w = new Float64Array(n);
      for (let k = 0, i = 0, j = 0; k < n; k++) { // direction change over ±0.05 of ink
        while (c[k] - c[i] > 0.05) i++; while (j < n - 1 && c[j] - c[k] < 0.05) j++;
        if (i === k || j === k) continue;
        const ux = a[2 * k] - a[2 * i], uy = a[2 * k + 1] - a[2 * i + 1], vx = a[2 * j] - a[2 * k], vy = a[2 * j + 1] - a[2 * k + 1];
        t[k] = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      }
      for (let i = 0; i < n;) { // straight runs (turning < 20°); one as long as 0.4 (most of the x-height) is a full drag
        let j = i; while (j < n && t[j] < 0.35) j++;
        if (j === i) { i++; continue; }
        const f = Math.min(Math.max((c[j - 1] - c[i] - 0.08) / 0.3, 0), 1);
        for (let k = i; k < j; k++) w[k] = f * (1 - t[k] / 0.7);
        i = j;
      }
      return w;
    };
    const W = st.map(one); W.cn = st.map(a => corners(a)); // cn: notches and corners, kept at the drawn depth by calm
    if (!L) return W;
    // the typed letter says which lines are straight too, so a shaky drawn line that is straight there still counts as dragged
    let tc = TRW.get(L); if (!tc) { const T = trace(L).map(a => resample(smooth([a])[0], 0.016)).filter(a => a.length >= 6); TRW.set(L, tc = { T, tw: T.map(one) }); }
    const { T, tw } = tc;
    if (!tc.tc) tc.tc = T.flatMap(a => corners(a).map(k => [a[2 * k], a[2 * k + 1]]));
    tc.tc.forEach(([x, y]) => { // the typed letter's corners too: a notch drawn soft is still a notch the pull may deepen
      let bd = 0.06 * 0.06, bj = -1, bk = -1;
      st.forEach((a, j) => { for (let i = 0; i < a.length; i += 2) { const d = (a[i] - x) ** 2 + (a[i + 1] - y) ** 2; if (d < bd) { bd = d; bj = j; bk = i >> 1; } } });
      if (bj >= 0 && !W.cn[bj].some(k => Math.abs(k - bk) <= 3)) W.cn[bj].push(bk);
    });
    const out = W.map((w, j) => w.map((q, k) => {
      const x = st[j][2 * k], y = st[j][2 * k + 1]; let bd = 0.08 * 0.08, bw = -1;
      T.forEach((a, m) => { for (let i = 0; i < a.length; i += 2) { const d = (a[i] - x) ** 2 + (a[i + 1] - y) ** 2; if (d < bd) { bd = d; bw = tw[m][i >> 1]; } } });
      return bw < 0 ? q : (q + bw) / 2;
    }));
    out.cn = W.cn; return out;
  }
  const DRAG = new WeakMap(), TRW = new WeakMap();
  const dragOf = (v, L) => { let c = DRAG.get(v); if (!c || c.L !== L) DRAG.set(v, c = { L, w: dragW(v.s, L) }); return c.w; };
  // Keep a change broad where the hand drags: the move of each point is averaged over ±(0.03 + 0.1·w) of ink, so a long
  // line bends or tilts as a whole but never dents; a dragged run then stays as straight as it was drawn. Curves keep it all.
  function calm(out, src, W) {
    return out.map((a, j) => {
      const s = src[j], w = W[j], c = cumLen(s), n = c.length, o = a.slice();
      if (n < 3 || a.length !== s.length) return a;
      const sharp = W.cn ? W.cn[j] : corners(s);
      for (let k = 1; k < n - 1; k++) {
        const h = 0.03 + 0.1 * w[k]; let i = k, e = k, dx = a[2 * k] - s[2 * k], dy = a[2 * k + 1] - s[2 * k + 1];
        while (i > 0 && e < n - 1 && c[k] - c[i - 1] <= h && c[e + 1] - c[k] <= h) { i--; e++; dx += a[2 * i] - s[2 * i] + a[2 * e] - s[2 * e]; dy += a[2 * i + 1] - s[2 * i + 1] + a[2 * e + 1] - s[2 * e + 1]; } // same reach both sides: a straight move stays exact
        o[2 * k] = s[2 * k] + dx / (e - i + 1); o[2 * k + 1] = s[2 * k + 1] + dy / (e - i + 1);
      }
      for (let i = 0; i < n;) { // dragged runs: moved ends joined by the drawn line's own shape
        if (w[i] <= 0.6) { i++; continue; }
        let e = i; while (e + 1 < n && w[e + 1] > 0.6) e++;
        if (e - i >= 3) for (let k = i + 1; k < e; k++) {
          const t = (c[k] - c[i]) / (c[e] - c[i]), b = Math.min((w[k] - 0.6) / 0.3, 1);
          const px = o[2 * i] + t * (o[2 * e] - o[2 * i]) + s[2 * k] - (s[2 * i] + t * (s[2 * e] - s[2 * i]));
          const py = o[2 * i + 1] + t * (o[2 * e + 1] - o[2 * i + 1]) + s[2 * k + 1] - (s[2 * i + 1] + t * (s[2 * e + 1] - s[2 * i + 1]));
          o[2 * k] += b * (px - o[2 * k]); o[2 * k + 1] += b * (py - o[2 * k + 1]);
        }
        i = e + 1;
      }
      for (const q of sharp) { // a notch or corner (ต's top) keeps its depth: its own move differs from the moves around it by ≤0.015
        let i = q, e = q, mx = 0, my = 0;
        while (i > 0 && e < n - 1 && c[q] - c[i - 1] <= 0.2 && c[e + 1] - c[q] <= 0.2) { i--; e++; }
        for (let k = i; k <= e; k++) { mx += o[2 * k] - s[2 * k]; my += o[2 * k + 1] - s[2 * k + 1]; }
        mx /= e - i + 1; my /= e - i + 1;
        for (let k = i; k <= e; k++) {
          const lx = o[2 * k] - s[2 * k] - mx, ly = o[2 * k + 1] - s[2 * k + 1] - my, l = Math.hypot(lx, ly);
          const fade = Math.min(Math.max((0.08 - Math.abs(c[k] - c[q])) / 0.04, 0), 1); // full near the corner, none 0.08 away
          if (l > 0.015 && fade > 0) { const f = fade * (1 - 0.015 / l); o[2 * k] -= f * lx; o[2 * k + 1] -= f * ly; }
        }
      }
      return o;
    });
  }
  // Small loops (heads, knots): the stroke comes back within 0.04 of itself after 0.15-0.9 of ink, around real area (not a retrace).
  // [start, end, where it starts along the stroke 0..1]
  function loops(a) {
    const c = cumLen(a), n = c.length, out = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n && c[j] - c[i] <= 0.9; j++) {
      const L = c[j] - c[i]; if (L < 0.15 || Math.hypot(a[2 * j] - a[2 * i], a[2 * j + 1] - a[2 * i + 1]) >= 0.04) continue;
      let ar = a[2 * j] * a[2 * i + 1] - a[2 * i] * a[2 * j + 1];
      for (let k = i; k < j; k++) ar += a[2 * k] * a[2 * k + 3] - a[2 * k + 2] * a[2 * k + 1];
      if (Math.abs(ar) / 2 > 0.3 * L * L / (4 * Math.PI)) { out.push([i, j, c[i] / c[n - 1]]); i = j; break; } // ≥30% as round as a circle
    }
    return out;
  }
  function corners(a) { // sharpest point of each turn over 60° (directions taken ~0.05 each side)
    const n = a.length / 2, w = 3, ang = new Float64Array(n), out = [];
    for (let k = w; k < n - w; k++) {
      const ux = a[2 * k] - a[2 * k - 2 * w], uy = a[2 * k + 1] - a[2 * k - 2 * w + 1], vx = a[2 * k + 2 * w] - a[2 * k], vy = a[2 * k + 2 * w + 1] - a[2 * k + 1];
      ang[k] = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    }
    for (let k = w; k < n - w; k++) if (ang[k] > Math.PI / 3 && ang[k] >= ang[k - 1] && ang[k] > ang[k + 1]) out.push(k);
    return out;
  }
  function scaleLoop(a, i, j, z, open) { // loop grows/shrinks between its crossing points; open: its start lifts off the crossing
    let cx = 0, cy = 0; for (let q = i; q <= j; q++) { cx += a[2 * q]; cy += a[2 * q + 1]; } cx /= j - i + 1; cy /= j - i + 1;
    const dx = a[2 * i] - cx, dy = a[2 * i + 1] - cy, dl = Math.hypot(dx, dy) || 1, m = 0.4 * (j - i);
    for (let q = 0; q <= j; q++) {
      if (q >= i) { const w = Math.sin(Math.PI * (q - i) / (j - i)) * (z - 1); a[2 * q] += w * (a[2 * q] - cx); a[2 * q + 1] += w * (a[2 * q + 1] - cy); }
      const o = open * (q <= i ? 1 : Math.max(0, 1 - (q - i) / m)); a[2 * q] += o * dx / dl; a[2 * q + 1] += o * dy / dl;
    }
  }
  function roundAt(a, k, m, g) { // corner cut: points near k move toward the average of their neighbours
    const a0 = a.slice(), n = a.length / 2;
    for (let q = Math.max(1, k - m); q <= Math.min(n - 2, k + m); q++) {
      let sx = 0, sy = 0, c = 0; for (let j = Math.max(0, q - m); j <= Math.min(n - 1, q + m); j++) { sx += a0[2 * j]; sy += a0[2 * j + 1]; c++; }
      const w = g * Math.cos(Math.PI / 2 * (q - k) / (m + 1)) ** 2; a[2 * q] += w * (sx / c - a0[2 * q]); a[2 * q + 1] += w * (sy / c - a0[2 * q + 1]);
    }
  }
  function endTurn(a, e, z, th) { // the end of a stroke runs longer or shorter and turns a little
    const x0 = a[2 * e], y0 = a[2 * e + 1], c = Math.cos(th) * z, s = Math.sin(th) * z;
    for (let q = 2 * e + 2; q < a.length; q += 2) { const dx = a[q] - x0, dy = a[q + 1] - y0; a[q] = x0 + c * dx - s * dy; a[q + 1] = y0 + s * dx + c * dy; }
  }

  // ---- Reference hands (refs.json: open fonts + averaged real handwriting), centre lines in box units ----
  let REFS = null; const KW = { crowd: 3, hand: 3, looped: 2, loopless: 1 }, RW = new WeakMap();
  function setRefs(j) { REFS = j && j.g && j.refs ? { j, w: j.refs.map(r => KW[r.kind] || 1), d: {} } : null; }
  const unDelta = a => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (i > 1 ? o[i - 2] : 0) + a[i] / 100; return o; }; // stored as 0.01 steps from the previous point
  const refsOf = ch => !REFS ? [] : REFS.d[ch] || (REFS.d[ch] = (REFS.j.g[ch] || []).map(([i, st]) => [REFS.w[i], st.map(unDelta), i]));
  const HANDY = new Set(['crowd', 'hand']); // real or handwriting-font hands; the rest are print-like fonts
  const refKindMul = (i, neat) => (HANDY.has(REFS.j.refs[i].kind) ? 1.5 - neat : 0.5 + neat); // neat sheets lean on fonts, natural ones on real hands
  function styleHands(R, neat) { // 3 reference hands this sheet leans on, so the whole page reads as one hand
    const n = REFS ? REFS.j.refs.length : 0, out = new Set();
    for (let k = 0; k < 20 && out.size < Math.min(3, n); k++) {
      const ws = REFS.w.map((w, i) => (out.has(i) ? 0 : w * refKindMul(i, neat))); let x = R() * ws.reduce((a, b) => a + b, 0), i = ws.findIndex(w => (x -= w) <= 0);
      out.add(i < 0 ? n - 1 : i);
    }
    return out;
  }
  const fitBox = (st, b) => { const r = bbox({ s: st }), zx = (b.x1 - b.x0) / Math.max(r.x1 - r.x0, 0.05), zy = (b.y1 - b.y0) / Math.max(r.y1 - r.y0, 0.05); return st.map(a => a.map((q, i) => (i % 2 ? b.y0 + (q - r.y0) * zy : b.x0 + (q - r.x0) * zx))); };
  const near = (A, B) => { let t = 0; for (let i = 0; i < A.length; i += 2) { let m = Infinity; for (let j = 0; j < B.length; j += 2) m = Math.min(m, (A[i] - B[j]) ** 2 + (A[i + 1] - B[j + 1]) ** 2); t += Math.sqrt(m); } return t / (A.length / 2); };
  function refPick(v, ch) { // refs that look like this drawn letter: chance ∝ exp(-distance/0.07) × kind weight (null: none)
    if (!REFS || !v || !v.s) return null; if (RW.has(v)) return RW.get(v);
    const b = bbox(v), P = [], out = []; let tot = 0; ink(v, (x, y) => P.push(x, y), 0.04);
    for (const [w, st, i] of refsOf(ch)) {
      const Q = []; ink({ s: fitBox(st, b) }, (x, y) => Q.push(x, y), 0.04);
      const e = w * Math.exp(-(near(P, Q) + near(Q, P)) / 2 / 0.07); if (e > 1e-4) { out.push([e, st, i]); tot += e; }
    }
    const c = out.length ? { tot, out, v } : null; RW.set(v, c); return c; // v: the stored version, for mold()
  }
  function refChoose(refs, R, sty) { // which look-alike reference this copy molds into: this sheet's hands ×5, kind by neatness
    const neat = sty ? sty.neat : 1, ws = refs.out.map(([e, , i]) => e * refKindMul(i, neat) * (sty && sty.hands.has(i) ? 5 : 1));
    const pick = (r, w) => { let x = r * w.reduce((a, b) => a + b, 0), j = w.findIndex(q => (x -= q) <= 0); return j < 0 ? w.length - 1 : j; };
    if (!sty || !sty.pool) return pick(R(), ws);
    // v19: one box draws each letter from a pool of up to 8 references (picked by the same weights), so a long paste
    // works out at most 8 bends per letter instead of one per copy; other boxes and seeds get other pools
    let pool = sty.pool.get(refs);
    if (!pool) { const w = ws.slice(); pool = []; for (let k = 0; k < Math.min(8, w.length); k++) { const j = pick(sty.pr(), w); pool.push(j); w[j] = 0; } sty.pool.set(refs, pool); }
    return pool[pick(R(), pool.map(j => ws[j]))];
  }
  // Mold: one smooth bend that lays the drawn letter into a reference letter fitted to its box. Per point of v.s, full strength;
  // a copy takes a fraction of it, so the reference's proportions and curves come through while the person's pen detail rides along.
  const MOLD = new WeakMap();
  // v19: the bend is worked out once per stored version + reference (base); blended copies of two versions just look it up
  const MOLDF = new WeakMap();
  function mold(v, st, ri, base = v) {
    let c = MOLD.get(v); if (!c) MOLD.set(v, c = {}); if (c[ri]) return c[ri];
    let f = MOLDF.get(base); if (!f) MOLDF.set(base, f = {});
    const F = f[ri] || (f[ri] = moldField(base, st));
    return c[ri] = v.s.map(a => { const o = new Array(a.length); for (let i = 0; i < a.length; i += 2) { F(a[i], a[i + 1], o, i); } return o; });
  }
  function moldField(v, st) {
    const P0 = [], Q = []; ink(v, (x, y) => P0.push(x, y), 0.04); ink({ s: fitBox(st, bbox(v)) }, (x, y) => Q.push(x, y), 0.04);
    const n = P0.length / 2, m = Q.length / 2, P = P0.slice(), dx = new Float64Array(n), dy = new Float64Array(n), cn = new Float64Array(n);
    const nearest = (X, k, Y, ny) => { let b = 0, bd = Infinity; for (let j = 0; j < ny; j++) { const d = (Y[2 * j] - X[2 * k]) ** 2 + (Y[2 * j + 1] - X[2 * k + 1]) ** 2; if (d < bd) { bd = d; b = j; } } return b; };
    let ox = 0, oy = 0; const mx = new Float64Array(n), my = new Float64Array(n);
    const field = (x, y, sg, fx, fy) => { // Gaussian mean move into ox/oy; points past 4σ weigh < 3.4e-4 and are skipped (v19 speed)
      const c = 1 / (2 * sg * sg), cut = 16 * sg * sg; let sx = 0, sy = 0, sw = 0;
      for (let k = 0; k < n; k++) { const ex = x - P[2 * k], ey = y - P[2 * k + 1], d = ex * ex + ey * ey; if (d > cut) continue; const w = Math.exp(-d * c); sx += w * fx[k]; sy += w * fy[k]; sw += w; }
      ox = sw ? sx / sw : 0; oy = sw ? sy / sw : 0;
    };
    for (let r = 0; r < 12; r++) {
      dx.fill(0); dy.fill(0); cn.fill(0);
      for (let k = 0; k < n; k++) { const j = nearest(P, k, Q, m); dx[k] += Q[2 * j] - P[2 * k]; dy[k] += Q[2 * j + 1] - P[2 * k + 1]; cn[k]++; } // drawn ink goes to the mold
      for (let j = 0; j < m; j++) { const k = nearest(Q, j, P, n); dx[k] += Q[2 * j] - P[2 * k]; dy[k] += Q[2 * j + 1] - P[2 * k + 1]; cn[k]++; } // every part of the mold gets filled
      for (let k = 0; k < n; k++) { dx[k] /= cn[k]; dy[k] /= cn[k]; }
      const sg = 0.2 * Math.pow(0.3, r / 11); // broad bends first, then finer: 0.2 -> 0.06
      for (let k = 0; k < n; k++) { field(P[2 * k], P[2 * k + 1], sg, dx, dy); mx[k] = ox; my[k] = oy; }
      for (let k = 0; k < n; k++) { P[2 * k] += 0.7 * mx[k]; P[2 * k + 1] += 0.7 * my[k]; }
    }
    for (let k = 0; k < n; k++) { dx[k] = P[2 * k] - P0[2 * k]; dy[k] = P[2 * k + 1] - P0[2 * k + 1]; }
    for (let k = 0; k < 2 * n; k++) P[k] = P0[k]; // the total bend, looked up where the drawn points started
    return (x, y, o, i) => { field(x, y, 0.08, dx, dy); o[i] = ox; o[i + 1] = oy; };
  }

  // o: {x, y, width, u (page units per box unit), gap (line height in box units), seed, fb, thick, neat (0 natural .. 1 neat, default 1)}
  function layout(text, hand, o) {
    const R = rng(o.seed || 1), last = {}, cache = {}, P = person(hand, o.fb), neat = o.neat ?? 1;
    const mess = 0.8 - 0.6 * neat; // how far letters stray off the line: neat = 0.2x the old wobble, natural = 0.8x
    const J = a => (R() - 0.5) * 2 * a * mess;
    const vr = 1 - 0.5 * neat, u = () => R() * 2 - 1, V = a => u() * a * vr; // how much copies differ: neat half, natural full
    const sty = REFS ? { hands: styleHands(rng((o.seed || 1) * 7919 + 3), neat), neat, pool: new Map(), pr: rng((o.seed || 1) * 7919 + 11) } : null; // this sheet's reference hands
    // The writer drifts instead of jumping: size, speed and lean wander letter to letter (each about ±1, ~5-letter memory).
    // Faster = wider, leaning more, rounder, looser, spaced wider; the hand loosens a little line by line.
    const W = { sz: 0, fast: 0, ln: 0 }, cl2 = x => Math.min(Math.max(x, -2), 2);
    const step = () => { for (const k in W) W[k] = 0.8 * W[k] + 0.6 * (R() + R() + R() - 1.5) * 2; };
    const fastNow = () => Math.min(Math.max(W.fast + Math.min(0.03 * line, 0.3), -1.5), 1.5);
    const mods = o.mods || {}; let ci = -1; // lasso edits per cluster: {dx, dy, s, seed}
    const pickR = (ch, R, keep) => {
      const vs = cache[ch] || (cache[ch] = variantsFor(hand, ch, o.fb, P)); if (!vs.length) return null;
      let i = (R() * vs.length) | 0;
      if (vs.length > 1 && i === last[ch]) i = (i + 1 + ((R() * (vs.length - 1)) | 0)) % vs.length;
      if (keep) last[ch] = i; let v = vs[i];
      if (vs.length > 1 && v.s) { const w = vs[(i + 1 + ((R() * (vs.length - 1)) | 0)) % vs.length], m = w.s && match(v, w); if (m) v = blend(m, R()); } // somewhere between two of their versions
      const ref = o.fb && o.fb(ch);
      return vary(v, ch, R, fastNow(), ref && ref.p ? typedLook(ref, P.sl || 0) : null, refPick(vs[i], ch), sty);
    };
    // a reshuffled letter still draws from R first, so every other letter stays exactly as it was
    const pick = ch => { const v = pickR(ch, R, true), m = mods[ci]; return m && m.seed ? pickR(ch, rng(m.seed * 31 + ch.codePointAt(0)), false) : v; };
    const warp = () => ({ ax: J(0.03), ay: J(0.03), fx: 3 + R() * 4, fy: 3 + R() * 4, px: R() * 6.3, py: R() * 6.3 });
    const maxW = o.width / o.u, L = o.gap || 2.4, U = o.u;
    const strokes = [], fills = [], pws = [], cb = [];
    let cx = 0, line = 0, phase = R() * 6.3, slope = V(0.012), wrapped = false, yOff = 0, q = [];
    // a line is drawn once it is full, so a tall fraction can push it (and every line after it) down
    const flush = () => {
      const up = q.reduce((m, e) => Math.max(m, e.it.up || 0), 0), dn = q.reduce((m, e) => Math.max(m, e.it.down || 0), 0);
      yOff += up;
      for (const e of q) if (e.it.grp) for (const g of e.it.grp) emit(g.it, e.x + g.ox, yOff + g.oy); else emit(e.it, e.x, yOff);
      yOff += dn; q = [];
    };
    const newline = auto => { flush(); line++; cx = 0; phase = R() * 6.3; slope = V(0.012); wrapped = auto; }; // each line runs a touch up or down
    const emit = (it, cx, Y) => {
      const by = FIRST + line * L + Y + 0.06 * mess * Math.sin(cx * 0.35 + phase) + slope * cx + it.jy;
      const c = Math.cos(it.th), s = Math.sin(it.th), mine = [];
      it.parts.forEach((p0, k) => {
        const w = it.warps[k], list = p0.v.s ? strokes : fills;
        let p = p0;
        if (p0.m) { // marks placed by hand: a little left or right (never toward a tall tail), the upper ones together a little up or down
          const mx = V(0.08), low = bbox(p0.v).y0 + p0.dy > BASE - 0.2;
          p = { ...p0, dx: p0.dx + (it.tall ? -Math.abs(mx) : mx), dy: p0.dy + (low ? it.ml : it.mu) };
        }
        for (const a of (p.v.s || p.v.p)) {
          if (p.v.s) pws.push(it.pw);
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
          list.push(out); mine.push(out);
        }
      });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const a of mine) for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
      if (it.ci == null) return; // a hand-drawn math line (fraction bar, root sign): not a letter
      if (!mine.length) { cb[it.ci] = null; return; }
      const m = mods[it.ci];
      if (m && (m.dx || m.dy || (m.s && m.s !== 1))) { // scale about the letter's own centre, then move
        const k = m.s || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = m.dx || 0, dy = m.dy || 0;
        for (const a of mine) for (let i = 0; i < a.length; i += 2) { a[i] = mx + (a[i] - mx) * k + dx; a[i + 1] = my + (a[i + 1] - my) * k + dy; }
        x0 = mx + (x0 - mx) * k + dx; x1 = mx + (x1 - mx) * k + dx; y0 = my + (y0 - my) * k + dy; y1 = my + (y1 - my) * k + dy;
      }
      cb[it.ci] = [x0, y0, x1, y1];
    };
    // one letter cluster as the hand writes it; k = size (1 = normal text, smaller for powers and fractions)
    const clusterItem = (cl, sh, wz, pw, k = 1) => {
      step(); const f = fastNow(); ci++;
      const b = buildCluster(cl, pick), sc = k * wz * (1 + vr * (0.06 * cl2(W.sz) + 0.0375 * u())), sw = 1 + vr * (0.16 * u() + 0.1 * f);
      const w = b.parts.length ? sc * sw * (b.x1 - b.x0) : 0.5 * k, gx = vr * (0.04 * u() + 0.03 * f);
      return { ...b, sc, sw, sh: sh + vr * (0.06 * cl2(W.ln) + 0.04 * f), w, gap: 0.1 + J(0.03) + gx, th: J(0.035) + V(0.026), jy: J(0.02), warps: b.parts.map(warp), dk: 0,
        pw, tall: TALL.has(cl.base), mu: V(0.03), ml: V(0.03), ci, gx };
    };
    const place = items => {
      const ww = items.reduce((t, it) => t + it.w + (it.gap || 0) + (it.dk || 0), 0);
      if (cx > 0 && cx + ww > maxW && !items[0].sp) {
        const z = (maxW - cx) / ww; // a word that nearly fits is squeezed in, as a hand does near the edge
        if (z >= 0.9 && !items.some(it => it.grp)) for (const it of items) { it.w *= z; if (it.gap) it.gap *= z; if (it.dk) it.dk *= z; if (it.sw) it.sw *= z; }
        else newline(true);
      }
      for (const it of items) {
        if (it.sp) { if (!(cx === 0 && wrapped)) cx += it.w; continue; }
        if (cx > 0 && cx + it.dk + it.w > maxW + 1e-6) newline(true); else cx += it.dk; // word longer than the box
        q.push({ it, x: cx }); cx += it.w + it.gap; wrapped = false;
      }
    };
    // Math in the person's hand: boxes {its: [{it, ox, oy}], w, asc, desc}, units from the baseline (y down)
    const mathGroup = (node, pw, disp) => {
      const sh = J(0.06), wz = 1 + V(0.03);
      const B = (its, w, asc, desc) => ({ its, w, asc, desc });
      const sp = w => B([], w, 0, 0);
      const join = bs => { let x = 0, asc = 0, desc = 0; const its = []; for (const b of bs) { for (const g of b.its) its.push({ it: g.it, ox: g.ox + x, oy: g.oy }); x += b.w; asc = Math.max(asc, b.asc); desc = Math.max(desc, b.desc); } return B(its, x, asc, desc); };
      const at = (b, dx, dy) => b.its.map(g => ({ it: g.it, ox: g.ox + dx, oy: g.oy + dy }));
      const rule = (pts, k) => { // a pen line in baseline units, drawn like a letter stroke
        const s = pts.map((v, i) => (i % 2 ? BASE + v : v)), x1 = Math.max(...pts.filter((_, i) => !(i % 2)));
        return { parts: [{ v: { s: [s] }, dx: 0, dy: 0 }], x0: 0, x1, sc: 1, sw: 1, sh: 0, w: x1, gap: 0, th: J(0.01), jy: J(0.02) * k, warps: [warp()], dk: 0, pw, mu: 0, ml: 0 };
      };
      const glyphs = (str, k) => join(parse(str).map(cl => {
        if (cl.sp) return sp(SPACE * k);
        const it = clusterItem(cl, sh, wz, pw, k);
        let y0 = Infinity, y1 = -Infinity;
        for (const p of it.parts) { const b = bbox(p.v); y0 = Math.min(y0, b.y0 + p.dy); y1 = Math.max(y1, b.y1 + p.dy); }
        const asc = y0 < Infinity ? (BASE - y0) * it.sc : k, desc = y0 < Infinity ? Math.max(y1 - BASE, 0) * it.sc : 0;
        return B([{ it, ox: 0, oy: 0 }], it.w + (0.08 + J(0.02)) * k, asc, desc);
      }));
      const stretch = (ch, k, top, bot) => { // a bracket drawn as tall as what it holds
        if (ch === '.') return sp(0.1 * k); // \left. = no bracket
        const sh0 = SYNTH[ch]; if (!sh0) return glyphs(ch, k);
        const b = bbox({ s: sh0 }), kx = 1.1 * k, h = top + bot;
        const its = sh0.map(a => ({ it: rule(a.map((v, i) => (i % 2 ? -top + (v - b.y0) / (b.y1 - b.y0) * h : 0.08 * k + (v - b.x0) * kx)), k), ox: 0, oy: 0 }));
        return B(its, (b.x1 - b.x0) * kx + 0.16 * k, top, bot);
      };
      // D = display style (own-line math): big Σ ∫, limits under/over Σ and lim, full-size fractions
      const box = (n, k, D) => {
        switch (n.t) {
          case 'row': return join(n.a.flatMap((c, j) => {
            const p = n.a[j - 1], nx = n.a[j + 1];
            if (c.t === 'ch' && '+-±∓'.includes(c.c) && (!p || (p.t === 'ch' && (OPS.includes(p.c) || '([{,|'.includes(p.c))))) return [glyphs(c.c, k)]; // a sign (-1, e^{-t}): no side spaces
            const b = box(c, k, D);
            return (c.fn || (c.t === 'scr' && c.b.fn)) && nx && nx.t !== 'sp' && !(nx.t === 'ch' && (OPS.includes(nx.c) || '([{|'.includes(nx.c))) ? [b, sp(0.17 * k)] : [b]; // \sin x: thin space after the name
          }));
          case 'sp': return sp(n.w * k);
          case 'txt': return glyphs(n.s, k);
          case 'ch': {
            if (D && (BIGOP.includes(n.c) || INTS.includes(n.c))) { // big sign centred on the math axis
              const g = glyphs(n.c, (INTS.includes(n.c) ? 1.7 : 1.45) * k), dy = -0.5 * k - (g.desc - g.asc) / 2;
              return join([B(at(g, 0, dy), g.w, g.asc - dy, g.desc + dy), sp(0.08 * k)]);
            }
            return OPS.includes(n.c) ? join([sp(0.22 * k), glyphs(n.c, k), sp(0.22 * k)]) : glyphs(n.c, k);
          }
          case 'scr': {
            const o = n.b, sk = Math.max(k * 0.62, 0.42), up = n.sup && box(n.sup, sk), dn = n.sub && box(n.sub, sk);
            if (D && ((o.t === 'ch' && BIGOP.includes(o.c)) || (o.t === 'txt' && /^(lim|max|min)$/.test(o.s)))) { // limits written under and over
              const b = box(o, k, D), W = Math.max(b.w, up ? up.w : 0, dn ? dn.w : 0), its = at(b, (W - b.w) / 2, 0); let asc = b.asc, desc = b.desc;
              if (up) { const y = -b.asc - 0.1 * k - up.desc; its.push(...at(up, (W - up.w) / 2, y)); asc = up.asc - y; }
              if (dn) { const y = b.desc + 0.1 * k + dn.asc; its.push(...at(dn, (W - dn.w) / 2, y)); desc = y + dn.desc; }
              return B(its, W + 0.1 * k, asc, desc);
            }
            const b = box(o, k, D), x = b.w, tuck = D && o.t === 'ch' && INTS.includes(o.c) ? 0.25 * k : 0; // ∫: lower limit tucked under the curl
            const its = [...b.its]; let asc = b.asc, desc = b.desc, w = 0;
            if (up) { const y = -Math.max(0.55 * k, b.asc - 0.5 * up.asc); its.push(...at(up, x, y)); asc = Math.max(asc, up.asc - y); w = up.w; }
            if (dn) { const y = Math.max(0.3 * k, b.desc - 0.3 * dn.asc, up ? 0.15 * k + dn.asc - 0.3 * k : 0); its.push(...at(dn, x - tuck, y)); desc = Math.max(desc, y + dn.desc); w = Math.max(w, dn.w - tuck); }
            return B(its, x + w, asc, desc);
          }
          case 'boxed': { // a pen box round it, drawn in two strokes
            const b = box(n.b, k, D), p = 0.2 * k, x0 = 0.05 * k, top = Math.max(b.asc, 0.8 * k) + p, bot = Math.max(b.desc, 0.25 * k) + p, x1 = x0 + b.w + 2 * p;
            const its = [...at(b, x0 + p, 0), { it: rule([x0, -top, x1, -top + V(0.02), x1 + V(0.02), bot], k), ox: 0, oy: 0 }, { it: rule([x1, bot, x0, bot + V(0.02), x0 + V(0.02), -top], k), ox: 0, oy: 0 }];
            return B(its, x1 + 0.1 * k, top + 0.05 * k, bot + 0.05 * k);
          }
          case 'frac': {
            const fk = D ? k : Math.max(k * 0.8, 0.45), nb = box(n.n, fk), db = box(n.d, fk), W = Math.max(nb.w, db.w) + 0.15 * k, pd = 0.08 * k, ax = -0.5 * k;
            const ny = ax - 0.16 * k - nb.desc, dy = ax + 0.16 * k + db.asc;
            const its = [...at(nb, pd + (W - nb.w) / 2, ny), ...at(db, pd + (W - db.w) / 2, dy), { it: rule([pd, ax, pd + W * 0.5, ax + V(0.02), pd + W, ax + V(0.03)], k), ox: 0, oy: 0 }];
            return B(its, W + 2 * pd, nb.asc - ny, dy + db.desc);
          }
          case 'sqrt': {
            const b = box(n.b, k, D), top = Math.max(b.asc, k) + 0.22 * k, bot = Math.max(b.desc, 0) + 0.05 * k, x0 = 0.5 * k, its = at(b, x0 + 0.05 * k, 0);
            its.push({ it: rule([0, -0.4 * k, 0.1 * k, -0.47 * k, 0.28 * k, bot, x0, -top, x0 + b.w + 0.1 * k, -top], k), ox: 0, oy: 0 });
            if (n.ix) { const ib = box(n.ix, Math.max(k * 0.5, 0.4)); its.push(...at(ib, 0, -0.55 * k)); }
            return B(its, x0 + b.w + 0.2 * k, top + 0.05 * k, bot);
          }
          case 'acc': { // a small pen mark over (or under) what it holds
            const b = box(n.b, k), x0 = 0.04 * k, w = Math.max(b.w - 0.1 * k, 0.3 * k), xm = x0 + w / 2, K = n.k, its = [...b.its];
            const mark = pts => its.push({ it: rule(pts, k), ox: 0, oy: 0 });
            if (K === 'underline') { const y = Math.max(b.desc, 0) + 0.12 * k; mark([x0, y, x0 + w, y + V(0.02)]); return B(its, b.w, b.asc, y + 0.05 * k); }
            const y = -Math.max(b.asc, 0.75 * k) - 0.14 * k, hw = /wide/.test(K) ? w / 2 : Math.min(w / 2, 0.16 * k), a = 0.09 * k;
            if (/vec|rightarrow/.test(K)) { mark([x0, y, x0 + w, y]); mark([x0 + w - a, y - a, x0 + w, y, x0 + w - a, y + a]); }
            else if (/leftarrow/.test(K)) { mark([x0, y, x0 + w, y]); mark([x0 + a, y - a, x0, y, x0 + a, y + a]); }
            else if (/hat/.test(K)) mark([xm - hw, y + 0.06 * k, xm, y - 0.08 * k, xm + hw, y + 0.06 * k]);
            else if (K === 'check') mark([xm - hw, y - 0.08 * k, xm, y + 0.06 * k, xm + hw, y - 0.08 * k]);
            else if (/tilde/.test(K)) mark([xm - hw, y + 0.03 * k, xm - hw / 2, y - 0.05 * k, xm, y, xm + hw / 2, y + 0.05 * k, xm + hw, y - 0.03 * k]);
            else if (K === 'dot') mark([xm, y, xm + 0.02 * k, y + 0.02 * k]);
            else if (K === 'ddot') { mark([xm - 0.1 * k, y, xm - 0.08 * k, y + 0.02 * k]); mark([xm + 0.1 * k, y, xm + 0.12 * k, y + 0.02 * k]); }
            else mark(K === 'bar' ? [xm - hw, y, xm + hw, y] : [x0, y, x0 + w, y + V(0.02)]); // bar / overline
            return B(its, b.w, -y + 0.12 * k, b.desc);
          }
          case 'env': { // rows stacked round the math axis like a fraction; cells side by side
            const rows = n.rows.map(r => r.map(c => box(c, k))), nc = Math.max(1, ...rows.map(r => r.length)), gx = 1.0 * k, rg = 0.3 * k;
            const cw = [...Array(nc)].map((_, j) => Math.max(0, ...rows.map(r => (r[j] ? r[j].w : 0))));
            const left = /cases|align|split|flalign/.test(n.name), hs = rows.map(r => [Math.max(0.75 * k, ...r.map(c => c.asc)), Math.max(0.2 * k, ...r.map(c => c.desc))]);
            const tot = hs.reduce((t, [a, d]) => t + a + d, 0) + rg * Math.max(0, rows.length - 1), top = -0.5 * k - tot / 2, its = [];
            let y = top;
            rows.forEach((r, ri) => {
              const base = y + hs[ri][0]; let x = 0;
              r.forEach((c, j) => { its.push(...at(c, x + (left ? 0 : (cw[j] - c.w) / 2), base)); x += cw[j] + gx; });
              y = base + hs[ri][1] + rg;
            });
            const body = B(its, cw.reduce((t, w) => t + w, 0) + gx * (nc - 1), -top, y - rg), br = BRK[n.name];
            if (!br) return join([sp(0.1 * k), body, sp(0.1 * k)]);
            const t2 = body.asc + 0.1 * k, b2 = body.desc + 0.1 * k;
            return join([stretch(br[0], k, t2, b2), sp(0.1 * k), body, sp(0.1 * k), stretch(br[1], k, t2, b2)]);
          }
          case 'lr': {
            const b = box(n.b, k, D);
            if (b.asc + b.desc <= 1.7 * k) return join([n.l === '.' ? sp(0) : glyphs(n.l, k), b, n.r === '.' ? sp(0) : glyphs(n.r, k)]);
            const top = b.asc + 0.1 * k, bot = Math.max(b.desc, 0.3 * k) + 0.1 * k;
            return join([stretch(n.l, k, top, bot), b, stretch(n.r, k, top, bot)]);
          }
        }
        return sp(0);
      };
      const b = box(node, 1, disp);
      return { grp: b.its, w: b.w, gap: 0.1, dk: 0, up: Math.max(0, b.asc - 1.3), down: Math.max(0, b.desc - 0.45) };
    };
    for (const S of rich(text)) {
      if (S === '\n') { newline(false); continue; }
      const pw0 = () => [0.93, 1, 1.07][(R() * 3) | 0] * (S.bold ? BOLD : 1);
      if (S.t === 'math') { place([mathGroup(S.node, pw0(), S.disp)]); continue; }
      for (const seg of words(S.s)) {
      if (seg === '\n') { newline(false); continue; }
      const sh = J(0.06), wz = 1 + V(0.03), pw = pw0(); // each word: its own lean, a bit bigger or smaller, pen pressed softer or harder
      let prev = null;
      const items = parse(seg).map(cl => {
        if (cl.sp) { prev = null; return { sp: true, w: SPACE * (1 + V(0.3)) }; }
        const it = clusterItem(cl, sh, wz, pw), b = it, gx = it.gx;
        if (b.parts.length) {
          it.pr = profile(it);
          const d = prev ? kern(prev, it) : -Infinity; // space by the visible gap, not the boxes
          if (d > -Infinity) { it.dk = Math.min(Math.max(d - prev.w, -0.35), 0.3); const tg = typedGap(prev.cl, cl, o.fb); prev.gap = Math.min(Math.max(tg + J(0.03) + prev.gx, 0.7 * tg), tg + 0.05); } // never wide enough to look like a word break
          prev = it; it.cl = cl; it.gx = gx;
        }
        return it;
      });
      place(items);
      }
    }
    flush();
    const lw = U * 0.075 * (o.thick || 1), pens = [...new Set(pws)].sort((a, b) => a - b).map(k => [lw * k, strokes.filter((_, i) => pws[i] === k)]);
    return { strokes, fills, pens, cb, lines: line + 1, height: (FIRST + line * L + yOff + 0.85) * U, lw }; // pens: [line width, strokes] by pen pressure
  }

  // Test helper: a fake person who writes the font's centre lines with a pen. messy: each letter at its own
  // size, height and slant with a shaky pen; marks drawn big, small, high or low over the grey ก.
  function fakeHand(fb, seed, messy, lean = -0.12) { // lean: this fake person's usual slant (italic < 0)
    const R = rng(seed), J = a => messy ? (R() - 0.5) * 2 * a : 0, g = {};
    for (const [, chars] of GROUPS.slice(0, 3)) for (const ch of chars) {
      const f = fb(ch); if (!f || !f.p) continue;
      const b = bbox(f), mk = needsGhost(ch), tr = trace(typedLook(f, 0)), c = bbox({ s: tr });
      // people draw what they see: a thick small mark's centre line is too short, so stretch it until line + pen covers the typed mark
      const zx = !mk ? 1 : Math.max((b.x1 - b.x0 - 2 * HW) / Math.max(c.x1 - c.x0, 0.01), 1), zy = !mk ? 1 : Math.max((b.y1 - b.y0 - 2 * HW) / Math.max(c.y1 - c.y0, 0.01), 1);
      const lines = tr.map(a => a.map((q, i) => (i % 2 ? (b.y0 + b.y1) / 2 + (q - (c.y0 + c.y1) / 2) * zy : (b.x0 + b.x1) / 2 + (q - (c.x0 + c.x1) / 2) * zx)));
      g[ch] = [0, 1, 2].slice(0, messy ? 3 : 1).map(() => {
        const k = messy ? (mk ? 0.65 + R() * 0.95 : 0.7 + R() * 0.6) : 1, dy = J(mk ? 0.4 : 0.3), sl = messy ? lean + J(0.15) : 0;
        return { s: lines.map(a => {
          const o = [];
          for (let i = 0; i < a.length; i += 2) {
            const ry = (a[i + 1] - b.y1) * k;
            o.push(+(b.x0 + (a[i] - b.x0) * k + sl * ry + J(0.012)).toFixed(4), +(b.y1 + ry + dy + J(0.012)).toFixed(4));
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
    // v18: line breaks, AI-paste markdown, LaTeX
    const LO = (s, w = 999) => layout(s, null, { x: 0, y: 0, width: w, u: 10, gap: 2.4, seed: 2, fb });
    t('Enter starts a new line', LO('ก\nก').lines === 2 && LO('ก ก').lines === 1);
    const kinds = s => rich(s).map(x => (x === '\n' ? 'NL' : x.t + (x.bold ? '!' : '') + (x.s != null ? ':' + x.s : ''))).join('|');
    t('**bold** loses its stars and is bold', kinds('ก **ข** ค') === 'txt:ก |txt!:ข|txt: ค', kinds('ก **ข** ค'));
    t('* and # lines: bullet and bold heading', kinds('* ก\n## ข') === 'txt:• ก\n|txt!:ข' , kinds('* ก\n## ข'));
    t('bold words get a heavier pen', LO('-').pens[0][0] * 1.5 < LO('**-**').pens[0][0]);
    t('$..$, \\(..\\), a_n and $$..$$ are math; $5 and $6 is money', kinds('$x$ \\(y\\) a_n') === 'math|txt: |math|txt: |math' && kinds('$5 and $6') === 'txt:$5 and $6' && kinds('a\n$$x$$\nb') === 'txt:a\n|math|txt:\nb', kinds('a\n$$x$$\nb'));
    // v19: Claude's copy writes inline math as $$..$$; spaced "$ x^2 $"; highlight-copied math letters; matrices; new commands
    t('$$..$$ mid-sentence is inline, "$ x^2 $" is math', kinds('a $$x$$ b') === 'txt:a |math|txt: b' && kinds('$ x^2 $ ok') === 'math|txt: ok' && kinds('$ 5 and $') === 'txt:$ 5 and $', kinds('a $$x$$ b') + ' / ' + kinds('$ x^2 $ ok'));
    t('copied math letters and marks become plain', kinds('\u{1D465}²⁡ −y') === 'math|txt: -y', kinds('\u{1D465}²⁡ −y'));
    const mp = s => JSON.stringify(mathParse(s));
    t('LaTeX parse: frac, sqrt, scripts, \\left', mp('\\frac{1}{2}') === '{"t":"row","a":[{"t":"frac","n":{"t":"row","a":[{"t":"ch","c":"1"}]},"d":{"t":"row","a":[{"t":"ch","c":"2"}]}}]}'
      && /"t":"scr".*"sup".*"sub"|"t":"scr".*"sub".*"sup"/.test(mp('x_1^2')) && /"t":"lr","l":"\(","r":"\)"/.test(mp('\\left(x\\right)')) && /"t":"sqrt"/.test(mp('\\sqrt[3]{8}')) && mp('\\foo') === '{"t":"row","a":[{"t":"txt","s":"foo"}]}', mp('x_1^2'));
    t('matrix rows, accents, no-op commands', /"t":"env","name":"pmatrix","rows":\[\[.*\],\[.*\]\]/.test(mp('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}')) && /"t":"acc","k":"vec"/.test(mp('\\vec{v}'))
      && mp('\\displaystyle x') === '{"t":"row","a":[{"t":"ch","c":"x"}]}' && mp('\\mathbb{R}') === '{"t":"row","a":[{"t":"row","a":[{"t":"ch","c":"R"}]}]}', mp('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'));
    { const miss = Object.values(MSYM).filter(c => c.length === 1 && !SYNTH[c] && !(fb && fb(c))); t('every math symbol has a pen shape or a font glyph', !miss.length, miss.join(' ')); }
    { const A = LO('$\\begin{cases} x & 1 \\\\ y & 2 \\end{cases}$'), B = LO('$x$'); t('cases stack into rows (taller than a line)', A.height > B.height * 1.3, A.height.toFixed(2) + ' vs ' + B.height.toFixed(2)); }
    const ys = r => r.strokes.concat(r.fills).map(a => bbox({ s: [a] })), sub = ys(LO("$a_1$")), m1 = ys(LO("$a$"));
    t('subscript is smaller and lower', sub.length > m1.length && (() => { const a = sub[sub.length - 1]; return a.y1 - a.y0 < 0.8 * (m1[0].y1 - m1[0].y0) + 10 && a.y1 > m1[0].y1; })(), sub.map(b => b.y1.toFixed(1)).join(','));
    const fr = ys(LO('$\\frac{1}{2}$')), bar = fr.find(b => b.y1 - b.y0 < 2 && b.x1 - b.x0 > 3), ds = fr.filter(b => b !== bar).sort((a, b) => a.y0 - b.y0), num = ds[0], den = ds[ds.length - 1];
    t('fraction: number over a bar over number', bar && num.y1 < bar.y0 && den.y0 > bar.y1, bar ? num.y1.toFixed(1) + ' < ' + bar.y0.toFixed(1) + ' < ' + den.y0.toFixed(1) : 'no bar');
    // v20: markdown-escaped copies (\\[ .. \\], \_ , \\,), display limits, \boxed
    { const e = rich('a \\\\[ x \\\\] b'), ms = e.filter(x => x.t === 'math');
      t('escaped \\\\[ .. \\\\] is display math, no stray \\', ms.length === 1 && ms[0].disp && !e.some(x => x.t === 'txt' && x.s.includes('\\')), kinds('a \\\\[ x \\\\] b')); }
    { const j = JSON.stringify(rich('\\\\( x\\_{0} \\\\)')[0].node); t('\\_ is a subscript', /"t":"scr".*"sub"/.test(j), j); }
    { const j = JSON.stringify(rich('\\\\[ a\\\\,b \\\\]').find(x => x.t === 'math').node); t('\\\\, is a thin space, not a comma', /"t":"sp"/.test(j) && !/"c":","/.test(j), j); }
    t('&amp; &lt; are decoded', kinds('a &amp; b &lt; c') === 'txt:a & b < c', kinds('a &amp; b &lt; c'));
    { const iw = r => { const b = ys(r); return Math.max(...b.map(q => q.x1)) - Math.min(...b.map(q => q.x0)); };
      const sD = iw(LO('\\[\\sum_{n=1}^{9}\\]')), sI = iw(LO('$\\sum_{n=1}^{9}$')), iD = iw(LO('\\[\\int_{0}^{9}\\]')), i0 = iw(LO('\\[\\int\\]'));
      t('display: Σ limits under/over, ∫ limits beside', sD < sI * 0.85 && iD > i0 + 3, 'Σ ' + sD.toFixed(1) + ' vs ' + sI.toFixed(1) + ', ∫ ' + iD.toFixed(1) + ' vs ' + i0.toFixed(1)); }
    t('\\boxed draws a pen box', LO('$\\boxed{x}$').strokes.length >= LO('$x$').strokes.length + 2);
    t('LaTeX typed with no $ is math; words and C:\\Users stay text', kinds('ค่า \\frac{1}{2} คือ') === 'txt:ค่า |math|txt: คือ' && kinds('the answer is \\alpha + 1.') === 'txt:the answer is |math' && kinds('C:\\Users\\me') === 'txt:C:\\Users\\me' && kinds('\\int_0^1 x\\,dx') === 'math',
      kinds('ค่า \\frac{1}{2} คือ') + ' / ' + kinds('the answer is \\alpha + 1.') + ' / ' + kinds('C:\\Users\\me'));
    { const s = '\\boxed{\n\\lim_{n\\to\\infty}\n\\sum_{k=1}^{n}\\frac{1}{k^2}\n=\n\\frac{\\pi^2}{6}\n}', e = rich(s);
      const n = s => rich(s).filter(x => x.t === 'math').length;
      t('LaTeX typed over several lines is one formula; separate lines stay separate', e.length === 1 && e[0].disp && e[0].node.a[0].t === 'boxed' && n('\\alpha + 1\n\\beta') === 2 && n('\\frac{1}{2}\n= 0.5') === 1,
        kinds(s) + ' / ' + n('\\alpha + 1\n\\beta') + ' / ' + n('\\frac{1}{2}\n= 0.5')); }
    t('a fraction pushes the next line down', LO('$\\frac{1}{2}$\nก').height > LO('ก\nก').height + 2);
    const miss = [...GROUPS[5][1] + GROUPS[8][1]].filter(ch => !variantsFor(null, ch, fb, null).length);
    t('every Teach symbol can be written untaught', !miss.length, miss.join(''));

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
    t('neat: messy drawings come out even', sn.b < 0.03 && sn.h < 0.045, 'bottoms ±' + sn.b.toFixed(3) + ', heights ±' + (sn.h * 100).toFixed(1) + '%');
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
      const ok = Q.sl !== null && Math.abs(Q.sl - lean) < 0.08 && worst < 0.07 && e.b < 0.03 && e.h < 0.045;
      pOk = pOk && ok; pInfo += `lean ${lean}: usual ${(Q.sl || 0).toFixed(2)}, worst ${worst.toFixed(3)}${ok ? '' : ' ✗'}; `;
    }
    t('3 different people: each keeps their own slant, odd letters match it', pOk, pInfo);
    const shaky = [[]]; for (let i = 0; i <= 60; i++) shaky[0].push(0.5 + (i % 2 ? 0.02 : -0.02), 1 + i / 60);
    const rough = s => { let q = 0; const a = s[0]; for (let i = 2; i < a.length - 2; i += 2) q += Math.abs(a[i - 2] - 2 * a[i] + a[i + 2]); return q; };
    t('shaky strokes get smoothed', rough(smooth(shaky)) < 0.3 * rough(shaky), rough(smooth(shaky)).toFixed(2) + ' vs ' + rough(shaky).toFixed(2));
    const g2 = layout('กอ', mh, { x: 0, y: 0, width: 1e4, u: 1, seed: 4, fb }), na = mh.g['ก'][0].s.length;
    const vg = bbox({ s: g2.strokes.slice(na) }).x0 - bbox({ s: g2.strokes.slice(0, na) }).x1 - 2 * HW; // between visible edges
    t('letters keep a small visible gap', vg > 0.03 && vg < 0.25, vg.toFixed(2));
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
        const A = buildCluster(cl, ch => variantsFor(h, ch, fb, Q)[n]).parts, B = buildCluster(cl, pick).parts; nCl++;
        A.forEach((p, i) => {
          const a = at(p), b = at(B[i]), ch = ids[i], fr = bbox(B[i].v);
          if (i === 0 && cl.base) {
            const hang = fr.y1 > BASE + 0.15, plain = fr.y0 >= XH - 0.15 && !hang, e = hang ? a.y0 - b.y0 : a.y1 - b.y1;
            if (Math.abs(e) > 0.04) cInfo += ch + ' line ' + e.toFixed(2) + '; ';
            const fl = bodyTop(A[i].v) > bbox(A[i].v).y0 || bodyTop(B[i].v) > fr.y0, top = (p, q) => (fl ? bodyTop(p.v, true) + p.dy - pen(p.v) : q.y0); // a flick may be any length: compare bodies
            const kh = (a.y1 - top(A[i], a)) / (b.y1 - top(B[i], b));
            if (plain && Math.abs(kh - 1) > 0.08) cInfo += ch + ' height ' + kh.toFixed(2) + '; ';
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
    // v9: laid over the typed letter by eye, shape pulled part way, same pen at any drawn size, typed spacing.
    let fFar = '', fSum = 0, fN = 0;
    for (const ch of GROUPS[0][1]) mh.g[ch].forEach((v, i) => { // a messy letter ends up lying on the typed one, as seen
      const d = seen(variantsFor(mh, ch, fb, MP)[i].s, typedLook(fb(ch), MP.sl || 0)); fSum += d; fN++;
      if (d > 0.03) fFar += ch + ' ' + d.toFixed(3) + '; ';
    });
    t('messy letters lie on the typed letter', !fFar, 'ink off the typed letter ' + (fSum / fN).toFixed(3) + ' on average' + (fFar ? '; far: ' + fFar.slice(0, 200) : ''));
    // pull: a ก drawn 15% too big around its middle ends up ~30% nearer the typed centre line
    const Lg = typedLook(fb('ก'), 0), dsk = dist(Lg.sk, Lg.g), gb = bbox({ s: trace(Lg) }), mx = (gb.x0 + gb.x1) / 2, my = (gb.y0 + gb.y1) / 2;
    const cl = st => { const e = []; ink({ s: st }, (x, y) => e.push(look(dsk, Lg.g, x, y)), 0.02); return e.reduce((q, x) => q + x, 0) / e.length; };
    const big = trace(Lg).map(a => resample(a.map((q, i) => (i % 2 ? my + (q - my) * 1.15 : mx + (q - mx) * 1.15)), 0.016)), dOff = cl(big), dPull = cl(pull(big, Lg));
    t('shape pulled about 30% toward typed', dPull / dOff > 0.6 && dPull / dOff < 0.8, (dPull / dOff).toFixed(2) + ' of the distance left');
    // same pen: one shaky ก drawn at half size and at double size come out equally smooth
    const kg0 = fb('ก').p[0], shk = k => ({ s: [kg0.map((q, i) => (i % 2 ? 1.5 + (q - 1.5) * k : 0.25 + (q - 0.25) * k) + 0.012 * k * Math.sin(i * 1.7))] });
    const turn = st => { let q = 0, len = 0; for (const a of st) for (let i = 2; i < a.length - 2; i += 2) { q += Math.abs(Math.atan2(a[i + 3] - a[i + 1], a[i + 2] - a[i]) - Math.atan2(a[i + 1] - a[i - 1], a[i] - a[i - 2])) % Math.PI; len += Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]); } return q / len; };
    const tS = turn(variantsFor({ g: { 'ก': [shk(0.5)] } }, 'ก', fb, { k: 0, sl: null })[0].s), tB = turn(variantsFor({ g: { 'ก': [shk(2)] } }, 'ก', fb, { k: 0, sl: null })[0].s);
    t('same pen whether drawn small or big', Math.abs(tS / tB - 1) < 0.25, 'shake ' + tS.toFixed(1) + ' vs ' + tB.toFixed(1));
    // spacing: an upper mark never pushes the next letter away; spaces are typed width
    const gapAfter = txt => { const lay = layout(txt, null, { x: 0, y: 0, width: 1e4, u: 1, seed: 4, fb, neat: 1 }), f = lay.fills, bs = f.map(a => bbox({ p: [a] })); return bs[bs.length - 1].x0 - Math.max(...bs.slice(0, -1).filter(b => b.y1 > XH + 0.2).map(b => b.x1)); };
    const gm = gapAfter('รับ'), gn = gapAfter('รบ');
    t('mark does not push the next letter', Math.abs(gm - gn) < 0.03, 'ร→บ with mark ' + gm.toFixed(2) + ', without ' + gn.toFixed(2));

    // v10: every copy redrawn. A person who drew ก once: a row of ก has no two copies alike, sizes drift (not jump).
    const one = { g: { ...mh.g, 'ก': [mh.g['ก'][0]] } }, n1 = one.g['ก'][0].s.length;
    const copies = (txt, seed) => { const L = layout(txt, one, { x: 0, y: 0, width: 1e4, u: 1, seed, fb, neat: 1 }), o = []; for (let i = 0; i < L.strokes.length; i += n1) o.push(L.strokes.slice(i, i + n1)); return o; };
    const unit = st => { const b = bbox({ s: st }), h = b.y1 - b.y0, o = []; ink({ s: st }, (x, y) => o.push((x - b.x0) / h, (y - b.y0) / h), 0.02); return o; };
    const row = copies('กกกกกกกก', 4).map(unit); let dmin = Infinity;
    for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) dmin = Math.min(dmin, (near(row[i], row[j]) + near(row[j], row[i])) / 2);
    const hs8 = copies('กกกกกกกก', 4).map(st => { const b = bbox({ s: st }); return b.y1 - b.y0; }), hm8 = hs8.reduce((a, b) => a + b) / 8, hsd = Math.sqrt(hs8.reduce((a, h) => a + (h - hm8) ** 2, 0) / 8) / hm8;
    // v13: closest pair 0.012 -> 0.01, ก's long legs no longer dent (mean difference between copies unchanged)
    t('no two copies alike', dmin > 0.01 && hsd > 0.008, 'closest pair differs ' + dmin.toFixed(3) + ' of its height; heights ±' + (hsd * 100).toFixed(1) + '%');
    const h40 = copies('ก'.repeat(40), 9).map(st => { const b = bbox({ s: st }); return b.y1 - b.y0; }), m40 = h40.reduce((a, b) => a + b) / 40;
    let c0 = 0, c1 = 0; for (let i = 0; i < 40; i++) { c0 += (h40[i] - m40) ** 2; if (i) c1 += (h40[i] - m40) * (h40[i - 1] - m40); }
    t('sizes drift letter to letter, not jump', c1 / c0 > 0.3, 'neighbour likeness ' + (c1 / c0).toFixed(2));
    // common sense: varied copies of every letter still lie on the typed letter; the half-strength/as-drawn fallback is rare
    let vBad = '', vBack = 0, vN = 0;
    for (const ch of GROUPS[0][1]) mh.g[ch].forEach((v0, i) => {
      const v = variantsFor(mh, ch, fb, MP)[i], Lk = typedLook(fb(ch), MP.sl || 0), lim = Math.max(LIKE, seen(v.s, Lk) + 0.03); // v12: a mold may move it up to 0.02 more
      for (let sd = 1; sd <= 20; sd++) { const R = rng(sd * 97 + i), q = vary(v, ch, R, R() * 3 - 1.5, Lk, refPick(v, ch)); vN++; if (q === v) vBack++; else if (seen(q.s, Lk) > lim) vBad += ch + ' '; }
    });
    t('every copy still reads as its letter', !vBad && vBack < 0.1 * vN, (100 * vBack / vN).toFixed(1) + '% left as drawn' + (vBad ? '; strays: ' + vBad.slice(0, 100) : '') + (REFS ? ', refs on' : ''));
    // v11: sizes 25% calmer than v10 (v10: 200 copies of ก ±4.31%), loops found, references pull less than the typed letter
    const h200 = copies('ก'.repeat(200), 9).map(st => { const b = bbox({ s: st }); return b.y1 - b.y0; }), m200 = h200.reduce((a, b) => a + b) / 200;
    const sd200 = Math.sqrt(h200.reduce((a, h) => a + (h - m200) ** 2, 0) / 200) / m200;
    t('sizes calmer than v10', sd200 <= 0.78 * 0.0431, 'heights ±' + (sd200 * 100).toFixed(2) + '% (v10 ±4.31%)');
    // (the test people write the font's centre lines, whose heads are solid dots, so loops are drawn here by hand)
    const line = [], back = [], ring = (a, x, y) => { for (let i = 0; i <= 28; i++) a.push(x + 0.07 * Math.sin(i * 0.23), y + 0.07 * Math.cos(i * 0.23)); };
    for (let i = 0; i <= 60; i++) { line.push(0.3 + i * 0.01, 1 + i * 0.016); back.push(0.5, 1 + (i < 30 ? i : 60 - i) * 0.01 + (i < 30 ? 0 : 0.002)); }
    const head = []; ring(head, 0.4, 1.8); for (let i = 1; i <= 60; i++) head.push(0.4 + i * 0.012, 1.87 - i * 0.012);
    const knot = []; for (let i = 0; i <= 90; i++) knot.push(-0.04 + i * 0.008, 1.2); ring(knot, 0.68, 1.13); for (let i = 1; i <= 40; i++) knot.push(0.68 + i * 0.012, 1.2);
    const lh = loops(head), lk = loops(knot);
    t('loop finder: a head, a knot, none in a line or a retrace', lh.length === 1 && lh[0][2] < 0.35 && lk.length === 1 && lk[0][2] >= 0.35 && !loops(line).length && !loops(back).length,
      'head ' + JSON.stringify(lh.map(l => l[2].toFixed(2))) + ', knot ' + JSON.stringify(lk.map(l => l[2].toFixed(2))) + ', line ' + loops(line).length + ', retrace ' + loops(back).length);
    if (!REFS) t('reference hands loaded', false, 'no refs.json');
    else {
      const chars = GROUPS.filter((_, i) => i !== 5 && i < 7).map(g => g[1]).join(''), few = [...chars].filter(ch => refsOf(ch).length < 20);
      t('reference hands loaded', REFS.j.refs.length >= 40 && !few.length, REFS.j.refs.length + ' refs' + (few.length ? '; under 20: ' + few.join('') : ''));
      // v12: the letter stretches part-way into a look-alike reference (a mold); its own pen wobble survives
      let cut = 0, keep = 0, nm = 0, full = 0;
      for (const ch of 'กดบมสอ') { const v = variantsFor(mh, ch, fb, MP)[0], rk = refPick(v, ch); if (!rk) continue;
        const [, st, ri] = rk.out.reduce((a, b) => (b[0] > a[0] ? b : a)), Fi = []; ink({ s: fitBox(st, bbox(v)) }, (x, y) => Fi.push(x, y), 0.02);
        const dist = s => { const A = []; ink({ s }, (x, y) => A.push(x, y), 0.02); return Math.max(near(A, Fi), 1e-3); }; // how far the drawn ink lies from the mold (mold parts it never drew can't be filled)
        const d = mold(v, st, ri), q = v.s.map((a, j) => a.map((x, i) => x + 0.3 * d[j][i]));
        const wob = { s: v.s.map(a => a.map((x, i) => (i % 2 ? x + 0.012 * Math.sin(i * 1.7) : x))) }, dw = mold(wob, st, ri); let e = 0, w0 = 0;
        wob.s.forEach((a, j) => a.forEach((x, i) => { if (i % 2) { const w = x - v.s[j][i]; e += Math.abs(x + 0.3 * dw[j][i] - q[j][i] - w); w0 += Math.abs(w); } }));
        cut += 1 - dist(q) / dist(v.s); full = (full || 0) + 1 - dist(v.s.map((a, j) => a.map((x, i) => x + d[j][i]))) / dist(v.s); keep += 1 - e / w0; nm++;
      }
      t('letters stretch into a reference mold, pen detail kept', nm > 3 && cut / nm >= 0.2 && keep / nm >= 0.6, '30% mold: ' + (100 * cut / nm).toFixed(0) + '% closer to the reference (full mold ' + (100 * full / nm).toFixed(0) + '%), wobble kept ' + (100 * keep / nm).toFixed(0) + '%');
      // the sheet leans on its own 3 hands; neat sheets mold on fonts, natural ones on real hands
      const hs = styleHands(rng(5), 1); let sOn = 0, sOff = 0, f1 = 0, f0 = 0, nd = 0;
      for (const ch of GROUPS[0][1]) { const rk = refPick(variantsFor(mh, ch, fb, MP)[0], ch); if (!rk) continue;
        for (let sd = 1; sd <= 30; sd++) { const R = rng(sd * 31), ix = j => rk.out[j][2];
          sOn += hs.has(ix(refChoose(rk, R, { hands: hs, neat: 1 }))); sOff += hs.has(ix(refChoose(rk, R, { hands: new Set(), neat: 1 })));
          f1 += !HANDY.has(REFS.j.refs[ix(refChoose(rk, R, { hands: new Set(), neat: 1 }))].kind); f0 += !HANDY.has(REFS.j.refs[ix(refChoose(rk, R, { hands: new Set(), neat: 0 }))].kind); nd++; } }
      t('one sheet, one hand: its 3 reference hands lead', hs.size === 3 && sOn >= 2.5 * Math.max(sOff, 1), 'sheet hands picked ' + (100 * sOn / nd).toFixed(0) + '% (without the sheet ' + (100 * sOff / nd).toFixed(0) + '%)');
      t('neat molds on fonts, natural on real hands', f1 > 1.3 * f0, 'font molds: neat ' + (100 * f1 / nd).toFixed(0) + '%, natural ' + (100 * f0 / nd).toFixed(0) + '%');
    }
    // two close versions of a letter mix; two different ones never do
    const ka = mh.g['ก'][0], kb = { s: ka.s.map(a => a.map((q, i) => (i % 2 ? q : q + 0.6 * (q - 0.5) * 0.15))) }, kd = mh.g['ด'][0];
    const [na1, nb1] = variantsFor({ g: { 'ก': [ka, kb] } }, 'ก', fb, MP), [, nd] = variantsFor({ g: { 'ก': [ka, kd] } }, 'ก', fb, MP);
    const mm = na1.s.length === nb1.s.length && match(na1, nb1), mid = mm && bbox(blend(mm, 0.5)), ba = bbox(na1), bb2 = bbox(nb1);
    t('close versions mix, different ones never', mm && mid.x1 > Math.min(ba.x1, bb2.x1) - 1e-3 && mid.x1 < Math.max(ba.x1, bb2.x1) + 1e-3 && !(nd.s.length === na1.s.length && match(na1, nd)), mm ? 'mixed right edge ' + mid.x1.toFixed(3) + ' between ' + ba.x1.toFixed(3) + ' and ' + bb2.x1.toFixed(3) : 'no match');
    // v13: a flick over the body (ศ) may be drawn any length; the body keeps a plain letter's (ก) height
    { const sv = mh.g['ศ'][0], y0 = bodyTop(sv, true), lng = { s: sv.s.map(a => a.map((q, i) => (i % 2 && q < y0 ? y0 - 3 * (y0 - q) : q))) };
      const ns = variantsFor({ g: { 'ศ': [lng] } }, 'ศ', fb, MP)[0], nk = variantsFor(mh, 'ก', fb, MP)[0], r1 = (bbox(ns).y1 - bodyTop(ns, true)) / (bbox(nk).y1 - bbox(nk).y0);
      t('a long flick never shrinks ศ', Math.abs(r1 - 1) < 0.05, 'ศ body ' + r1.toFixed(3) + ' of ก, flick ' + (bodyTop(ns, true) - bbox(ns).y0).toFixed(2)); }
    // v13: long straight lines are dragged in one go: copies bend or tilt them, never dent them (curves keep their wobble)
    { let worst = 0, runs = 0;
      for (const ch of 'บตกม') {
        const v = variantsFor(mh, ch, fb, MP)[0], Lk = typedLook(fb(ch), MP.sl || 0), W = dragOf(v, Lk);
        for (let sd = 1; sd <= 25; sd++) {
          const cp = vary(v, ch, rng(sd * 7), sd % 3 ? 0 : 0.8, Lk, refPick(v, ch), { hands: new Set(), neat: sd % 2 }).s;
          v.s.forEach((a, j) => { const w = W[j], n = a.length / 2; if (!cp[j] || cp[j].length !== a.length) return;
            for (let i = 0; i < n;) { if (w[i] < 0.9) { i++; continue; } let e = i; while (e + 1 < n && w[e + 1] >= 0.9) e++;
              if (e - i >= 6) { const dev = p => { let m = 0; const ax = p[2 * i], ay = p[2 * i + 1], dx = p[2 * e] - ax, dy = p[2 * e + 1] - ay, L = Math.hypot(dx, dy) || 1; for (let k = i; k <= e; k++) m = Math.max(m, Math.abs((p[2 * k] - ax) * dy - (p[2 * k + 1] - ay) * dx) / L); return m; };
                worst = Math.max(worst, dev(cp[j]) - dev(a)); runs++; }
              i = e + 1; } });
        }
      }
      t('dragged lines stay straight', runs > 20 && worst < 0.006, runs + ' long runs, worst extra bend ' + worst.toFixed(4)); }
    { // lasso edits: move/scale touch only their letter; a reshuffle leaves earlier letters and every letter's count alone
      const o = { x: 0, y: 0, width: 400, u: 16, gap: 2.4, seed: 5, fb }, txt = 'สวัสดี ครับ', A = layout(txt, mh, o);
      const B = layout(txt, mh, { ...o, mods: { 2: { dx: 10, dy: -4, s: 1.5 } } }), S = layout(txt, mh, { ...o, mods: { 3: { seed: 99 } } });
      const same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
      const others = A.cb.every((b, i) => i === 2 || same(b, B.cb[i])), a2 = A.cb[2], b2 = B.cb[2];
      const moved = Math.abs((b2[0] + b2[2]) / 2 - (a2[0] + a2[2]) / 2 - 10) < 1e-6 && Math.abs((b2[2] - b2[0]) - 1.5 * (a2[2] - a2[0])) < 1e-6;
      t('lasso move/resize only its letter', others && moved && A.cb.length > 6);
      t('lasso reshuffle redraws only from that letter', A.cb.slice(0, 3).every((b, i) => same(b, S.cb[i])) && !same(A.cb[3], S.cb[3]) && S.cb.length === A.cb.length); }
    return r;
  }

  const API = { VERSION, XH, BASE, BOX_W, BOX_H, GX, GHOST, GROUPS, REQUIRED_GROUPS, needsGhost, isMark, fontVariant, variantsFor, parse, buildCluster, layout, bbox, fakeHand, selfTest, setRefs, synth, rich, mathParse, _look: typedLook, _trace: trace };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Hand = API;
})(this);
