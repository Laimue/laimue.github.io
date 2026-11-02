// LaiMue motion: handwriting that writes itself, the orange spark, kinetic words, bracket frames, letter swaps, flash slides, the intro (GSAP),
// animated icons (Lottie). Every effect is skipped when the device asks for reduced motion or a library failed to load; the app works the same without them.
const M = (() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const can = () => !calm.matches && typeof gsap !== 'undefined';

  // Draw every path.stk under el stroke by stroke, in document order; filled (typed-font) letters fade in alongside.
  function writeOn(el, maxSec = 3.5) {
    if (!el || !can()) return null;
    const ps = [...el.querySelectorAll('path.stk')], fills = [...el.querySelectorAll('path.fil')];
    gsap.killTweensOf([...ps, ...fills]);
    if (ps.length > 1500) return null; // shortcut: huge sheets skip the animation, iPad would stutter
    const lens = ps.map(p => p.getTotalLength() || 0.01), sum = lens.reduce((a, b) => a + b, 0);
    const k = Math.min(maxSec, 0.09 * ps.length + 0.3) / (sum || 1); // seconds per unit length, total capped
    const tl = gsap.timeline({ onComplete: () => gsap.set(ps, { clearProps: 'strokeDasharray,strokeDashoffset,visibility' }) });
    ps.forEach((p, i) => { const L = lens[i]; gsap.set(p, { strokeDasharray: L + 1, strokeDashoffset: L + 1, visibility: 'hidden' }); tl.set(p, { visibility: 'visible' }).to(p, { strokeDashoffset: 0, duration: Math.max(0.04, L * k), ease: 'power1.inOut' }); });
    if (fills.length) tl.fromTo(fills, { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.15 }, 0);
    return tl;
  }

  // Lottie icon into el; json in anim/. Without Lottie the element stays empty.
  function icon(el, name, loop = false) {
    if (!el || typeof lottie === 'undefined') return null;
    el.innerHTML = '';
    return lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay: !calm.matches, path: 'anim/' + name + '.json' });
  }

  // ---------- spark: one glowing orange dot with a particle trail on the #fx canvas; the canvas only animates while something moves
  const spark = (() => {
    let cv, x, raf = 0, jobs = [], parts = [], last = 0;
    const fit = () => { const d = devicePixelRatio || 1, W = Math.round(innerWidth * d), Hh = Math.round(innerHeight * d); if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; } x.setTransform(d, 0, 0, d, 0, 0); };
    function run(job) {
      if (!can()) { job.done && job.done(); return () => { }; }
      if (!cv) { cv = document.getElementById('fx'); x = cv.getContext('2d'); }
      fit(); job.t0 = performance.now(); jobs.push(job);
      if (!raf) { last = job.t0; raf = requestAnimationFrame(tick); }
      return () => { job.dead = true; };
    }
    function dot(px, py, r) {
      const g = x.createRadialGradient(px, py, 0, px, py, r * 5);
      g.addColorStop(0, 'rgba(255,235,210,1)'); g.addColorStop(0.18, 'rgba(255,120,60,0.95)'); g.addColorStop(1, 'rgba(255,77,23,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r * 5, 0, 7); x.fill();
    }
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      x.clearRect(0, 0, innerWidth, innerHeight);
      for (const j of jobs) {
        if (j.dead) continue;
        const t = Math.min(1, (now - j.t0) / (j.dur * 1000)), [px, py] = j.at(t);
        for (let n = 0; n < (j.rate || 3); n++) parts.push({ x: px, y: py, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60 - 10, l: 1, s: 0.6 + Math.random() });
        dot(px, py, j.r ? j.r(t) : 2.6);
        if (t >= 1) { j.dead = true; j.done && j.done(); }
      }
      jobs = jobs.filter(j => !j.dead);
      x.fillStyle = '#ff6a2c';
      for (const p of parts) { p.l -= dt / 0.5; p.x += p.vx * dt; p.y += p.vy * dt; if (p.l > 0) { x.globalAlpha = p.l; x.beginPath(); x.arc(p.x, p.y, 1.4 * p.s * p.l + 0.3, 0, 7); x.fill(); } }
      x.globalAlpha = 1; parts = parts.filter(p => p.l > 0);
      raf = jobs.length || parts.length ? requestAnimationFrame(tick) : 0;
      if (!raf) x.clearRect(0, 0, innerWidth, innerHeight);
    }
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
    // once round el's border, clockwise from the top middle, in sec seconds
    function loop(el, sec, done) {
      const b = box(el), m = 6, L = b.l - m, T = b.t - m, W = b.w + 2 * m, Hh = b.h + 2 * m, P = 2 * (W + Hh);
      return run({ dur: sec, done, rate: 2, at: t => {
        let d = (t * P + W / 2) % P;
        if (d < W) return [L + d, T]; d -= W; if (d < Hh) return [L + W, T + d]; d -= Hh; if (d < W) return [L + W - d, T + Hh]; d -= W; return [L, T + Hh - d];
      } });
    }
    // from the middle of a to the middle of b along an arc
    function fly(a, b, done) {
      if (!a || !b) return () => { };
      const A = box(a), B = box(b), x0 = A.l + A.w / 2, y0 = A.t + A.h / 2, x1 = B.l + B.w / 2, y1 = B.t + B.h / 2, cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 80;
      return run({ dur: 0.6, done, rate: 4, at: t => { const e = 1 - Math.pow(1 - t, 3), u = 1 - e; return [u * u * x0 + 2 * u * e * cx + e * e * x1, u * u * y0 + 2 * u * e * cy + e * e * y1]; } });
    }
    function burst(px, py, sec = 0.7, done) { return run({ dur: sec, done, rate: 10, at: () => [px, py], r: t => 2 + 5 * Math.sin(Math.PI * t) }); }
    return { loop, fly, burst };
  })();

  // ---------- kinetic words: each word slides in from a horizontal smear and sharpens; an <em> word stays orange (CSS)
  function split(el) {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 1) { n.classList.add('w'); continue; }
      if (n.nodeType !== 3) continue;
      const f = document.createDocumentFragment();
      for (const s of n.textContent.split(/(\s+)/)) { if (!s) continue; if (/^\s+$/.test(s)) { f.append(s); continue; } const w = document.createElement('span'); w.className = 'w'; w.textContent = s; f.append(w); }
      n.replaceWith(f);
    }
  }
  function words(el, delay = 0) {
    if (!el) return null;
    if (!el.dataset.split) { split(el); el.dataset.split = 1; }
    if (!can()) return null;
    return gsap.fromTo(el.querySelectorAll('.w'), { opacity: 0, x: -30, scaleX: 1.35, filter: 'blur(8px)' },
      { opacity: 1, x: 0, scaleX: 1, filter: 'blur(0px)', duration: 0.6, stagger: 0.09, ease: 'expo.out', delay, clearProps: 'filter,transform' });
  }

  // ---------- corner brackets grow in (CSS transition on --bk)
  function frame(el) { if (!el || !can()) return; el.classList.add('pre'); void el.offsetWidth; el.classList.remove('pre'); }

  // ---------- letter change: out with a smear, mid() redraws, the new one slams in from the other side
  function swap(els, dir, mid) {
    els = els.filter(Boolean);
    if (!can()) { mid(); return; }
    gsap.killTweensOf(els);
    gsap.timeline()
      .to(els, { x: -dir * 36, opacity: 0, filter: 'blur(6px)', duration: 0.12, ease: 'power2.in', onComplete: mid })
      .fromTo(els, { x: dir * 70, opacity: 0, scale: 1.05, filter: 'blur(10px)' }, { x: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.34, ease: 'expo.out', clearProps: 'all' });
  }
  // stop a swap at once (the Pencil came down); true if one was running
  function settle(el) { if (typeof gsap === 'undefined' || !gsap.isTweening(el)) return false; gsap.killTweensOf(el); gsap.set(el, { clearProps: 'all' }); return true; }

  // ---------- tab switch: an orange scan line sweeps across, the new section sharpens in
  function tab(el) {
    if (!el || !can()) return;
    const s = document.getElementById('scan');
    gsap.fromTo(s, { x: 0, opacity: 1 }, { x: innerWidth + 8, duration: 0.5, ease: 'power2.inOut', onComplete: () => gsap.set(s, { opacity: 0 }) });
    gsap.fromTo(el, { opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.45, ease: 'power2.out', clearProps: 'filter,opacity' });
  }

  // ---------- full-screen orange flash slide with one huge black word. onCover runs while the screen is fully orange. false = not shown.
  function flash(text, done, onCover) {
    if (!can()) { onCover && onCover(); done && done(); return false; }
    const f = document.getElementById('flash'), b = f.firstElementChild; b.textContent = text; f.hidden = false;
    gsap.killTweensOf([f, b]);
    gsap.timeline({ onComplete: () => { f.hidden = true; gsap.set([f, b], { clearProps: 'all' }); done && done(); } })
      .fromTo(f, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.32, ease: 'expo.inOut' })
      .call(() => onCover && onCover())
      .fromTo(b, { scale: 1.3, opacity: 0, filter: 'blur(14px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'expo.out' }, 0.12)
      .to(f, { clipPath: 'inset(0 0 0 100%)', duration: 0.36, ease: 'expo.inOut' }, '+=0.5');
    return true;
  }

  // ---------- terminal prompt typed out with a caret (the caret blinks in CSS)
  function prompt(el, text) {
    if (!el) return;
    clearInterval(el._t); el.textContent = text;
    if (!can()) return;
    const g = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text)].map(s => s.segment) : [...text];
    let i = 0; el.textContent = '';
    el._t = setInterval(() => { el.textContent = g.slice(0, ++i).join(''); if (i >= g.length) clearInterval(el._t); }, 60);
  }

  // ---------- welcome: spark ignites, the app name writes itself in the person's hand, Teach. Type. Save., then an orange flash into the app
  function intro(titleSvg, onDone) {
    const ov = document.getElementById('intro'); if (!ov.hidden) return;
    ov.querySelector('.in-title').innerHTML = titleSvg; ov.hidden = false;
    const end = () => { ov.hidden = true; if (typeof gsap !== 'undefined') gsap.set(ov, { clearProps: 'all' }); onDone && onDone(); };
    ov.querySelector('.in-skip').onclick = () => { if (typeof gsap !== 'undefined') gsap.killTweensOf(ov.querySelectorAll('*')); end(); };
    ov.querySelector('.in-start').onclick = () => flash('LaiMue.', null, end);
    ov.querySelector('.in-start').focus();
    if (!can()) return;
    const q = s => ov.querySelectorAll(s), title = ov.querySelector('.in-title'), on = { y: 0, opacity: 1 }; // explicit ends: from() reads them off the page
    frame(ov.querySelector('.in-stage'));
    const r = title.getBoundingClientRect(); spark.burst(r.left + r.width / 2, r.top + r.height / 2, 0.6);
    const tl = gsap.timeline({ delay: 0.35 });
    const w = writeOn(title, 1.6); if (w) tl.add(w, 0);
    tl.fromTo(q('.in-steps b'), { opacity: 0, x: -30, scaleX: 1.35, filter: 'blur(8px)' }, { opacity: 1, x: 0, scaleX: 1, filter: 'blur(0px)', duration: 0.6, stagger: 0.14, ease: 'expo.out', clearProps: 'filter,transform' }, '-=0.5')
      .fromTo(q('.in-steps span'), { y: 10, opacity: 0 }, { ...on, duration: 0.45, stagger: 0.1, ease: 'power2.out' }, '-=0.4')
      .fromTo(q('.in-start, .in-skip'), { y: 8, opacity: 0 }, { ...on, duration: 0.35, stagger: 0.06 }, '-=0.2');
  }

  return { writeOn, icon, spark, words, frame, swap, settle, tab, flash, prompt, intro, can };
})();
