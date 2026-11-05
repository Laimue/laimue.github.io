// LaiMue motion, "Live render" look from the reference video: handwriting that writes itself, the orange ember, karaoke titles,
// ember-traced frames, whip transitions, strike-outs, small moments (no full-screen cards), the export filmstrip, the intro (GSAP), Lottie icons.
// Every effect is skipped when the device asks for reduced motion or a library failed to load; the app works the same without them.
// Big elements only move with transform/opacity (smooth on iPad); blur is kept to text-sized things. Sounds (sfx.js) are called
// before the motion check, so they follow their own switch, not reduced motion.
const M = (() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const can = () => !calm.matches && typeof gsap !== 'undefined';
  const sfx = n => { try { if (typeof S !== 'undefined') S.play(n); } catch { } };
  const NS = 'http://www.w3.org/2000/svg', inking = () => document.body.classList.contains('inking');

  // Draw every path.stk under el stroke by stroke, in document order; filled (typed-font) letters fade in alongside.
  function writeOn(el, maxSec = 3.5) {
    if (!el || !can()) return null;
    const ps = [...el.querySelectorAll('path.stk')], fills = [...el.querySelectorAll('path.fil')];
    gsap.killTweensOf([...ps, ...fills]);
    if (ps.length > 400) return null; // shortcut: long text skips the animation (one tween per stroke stutters on iPad)
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

  // ---------- spark: one glowing orange ember with a particle trail on the #fx canvas; the canvas only animates while something moves
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
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(now, last); // rAF's frame time can be older than a job's performance.now() start
      x.clearRect(0, 0, innerWidth, innerHeight);
      for (const j of jobs) {
        if (j.dead) continue;
        const t = Math.max(0, Math.min(1, (now - j.t0) / (j.dur * 1000))), [px, py] = j.at(t);
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
    const box = el => { if (!el.getBoundingClientRect) return el; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
    // once round el's border, clockwise from the top middle, in sec seconds
    function loop(el, sec, done) {
      const b = box(el), m = 6, L = b.l - m, T = b.t - m, W = b.w + 2 * m, Hh = b.h + 2 * m, P = 2 * (W + Hh);
      return run({ dur: sec, done, rate: 2, at: t => {
        let d = (t * P + W / 2) % P;
        if (d < W) return [L + d, T]; d -= W; if (d < Hh) return [L + W, T + d]; d -= Hh; if (d < W) return [L + W - d, T + Hh]; d -= W; return [L, T + Hh - d];
      } });
    }
    // from the middle of a to the middle of b along an arc (a / b: elements or {l, t, w, h} boxes); pings unless quiet
    function fly(a, b, done, quiet) {
      if (!quiet) sfx('ping');
      if (!a || !b) return () => { };
      const A = box(a), B = box(b), x0 = A.l + A.w / 2, y0 = A.t + A.h / 2, x1 = B.l + B.w / 2, y1 = B.t + B.h / 2, cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 80;
      return run({ dur: 0.6, done, rate: 4, at: t => { const e = 1 - Math.pow(1 - t, 3), u = 1 - e; return [u * u * x0 + 2 * u * e * cx + e * e * x1, u * u * y0 + 2 * u * e * cy + e * e * y1]; } });
    }
    function burst(px, py, sec = 0.7, done) { return run({ dur: sec, done, rate: 10, at: () => [px, py], r: t => 2 + 5 * Math.sin(Math.PI * t) }); }
    function line(x0, y0, x1, y1, sec, done) { return run({ dur: sec, done, rate: 3, at: t => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t] }); }
    function follow(at, sec) { return run({ dur: sec, rate: 1, at, r: () => 2 }); } // at() = where the ember is now
    return { loop, fly, burst, line, follow };
  })();

  // ---------- karaoke titles (video 0:04-0:51): letters write on left to right; the word being written glows orange,
  // the rest waits as a faint ghost, finished words cool back to ink (<em> words stay orange); the ember rides the write head.
  const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
  const graphemes = s => (seg ? [...seg.segment(s)].map(g => g.segment) : [...s]);
  function chars(w) { const t = w.textContent; w.textContent = ''; for (const g of graphemes(t)) { const c = document.createElement('span'); c.className = 'c'; c.textContent = g; w.append(c); } }
  function split(el) {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 1) { n.classList.add('w'); chars(n); continue; }
      if (n.nodeType !== 3) continue;
      const f = document.createDocumentFragment();
      for (const s of n.textContent.split(/(\s+)/)) { if (!s) continue; if (/^\s+$/.test(s)) { f.append(s); continue; } const w = document.createElement('span'); w.className = 'w'; w.textContent = s; chars(w); f.append(w); }
      n.replaceWith(f);
    }
  }
  function type(el, delay = 0) {
    if (!el) return null;
    if (!el.querySelector('.c')) { // first time, or the text was replaced since
      el.setAttribute('aria-label', el.textContent.trim()); split(el); }
    if (!can()) return null;
    const ws = [...el.querySelectorAll('.w')], cs = [...el.querySelectorAll('.c')];
    if (el._ty) el._ty.kill(); if (el._sp) el._sp();
    const head = w => ws.forEach(x => x.classList.toggle('hd', x === w));
    gsap.set(cs, { opacity: 0.14 });
    let cur = cs[0], t = 0;
    const tl = gsap.timeline({ delay, onComplete: () => { head(null); gsap.set(cs, { clearProps: 'opacity' }); } });
    for (const w of ws) {
      tl.call(head, [w], t);
      for (const c of w.querySelectorAll('.c')) { tl.to(c, { opacity: 1, duration: 0.14, ease: 'power1.out', onStart: () => (cur = c) }, t); t += 1 / 26; }
      t += 0.07;
    }
    tl.call(head, [null], t + 0.25);
    tl.call(() => { el._sp = spark.follow(() => { const r = cur.getBoundingClientRect(); return r.width ? [r.right + 2, r.top + r.height * 0.78] : [-99, -99]; }, t); }, null, 0);
    el._ty = tl;
    return tl;
  }

  // ---------- frames: the ember draws the border once (video 0:35), corner brackets grow in (CSS --bk)
  function trace(el, sec = 0.7) {
    if (!el || !can() || !el.offsetWidth) return;
    let s = el.querySelector(':scope > svg.trace');
    if (!s) { s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'trace'); s.setAttribute('aria-hidden', 'true'); s.append(document.createElementNS(NS, 'path')); el.append(s); }
    const m = 6, W = el.offsetWidth + 2 * m, Hh = el.offsetHeight + 2 * m, L = 2 * (W + Hh), p = s.firstChild; // layout size: right even mid-transform
    s.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    p.setAttribute('d', `M${W / 2} 1H${W - 1}V${Hh - 1}H1V1Z`); // starts top-middle, clockwise: the same path spark.loop runs
    gsap.killTweensOf(p);
    gsap.timeline().fromTo(p, { strokeDasharray: L, strokeDashoffset: L, opacity: 1 }, { strokeDashoffset: 0, duration: sec, ease: 'none' }).to(p, { opacity: 0, duration: 0.7 });
    spark.loop(el, sec);
  }
  function frame(el) { if (!el || !can()) return; el.classList.add('pre'); void el.offsetWidth; el.classList.remove('pre'); trace(el); }

  // ---------- letter change: out with a stretch, mid() redraws, the new one slams in from the other side
  function swap(els, dir, mid) {
    els = els.filter(Boolean);
    if (!can()) { mid(); return; }
    gsap.killTweensOf(els);
    gsap.timeline()
      .to(els, { x: -dir * 36, scaleX: 1.08, opacity: 0, duration: 0.12, ease: 'power2.in', onComplete: mid })
      .fromTo(els, { x: dir * 70, scaleX: 1.15, opacity: 0 }, { x: 0, scaleX: 1, opacity: 1, duration: 0.34, ease: 'expo.out', clearProps: 'transform,opacity' }); // only what the swap set: 'all' also wiped the app's own size (the Sentences pad went to raw canvas pixels, 2x on iPad)
  }
  // stop a swap at once (the Pencil came down); true if one was running
  function settle(el) { if (typeof gsap === 'undefined' || !gsap.isTweening(el)) return false; gsap.killTweensOf(el); gsap.set(el, { clearProps: 'transform,opacity,filter' }); return true; }

  // ---------- whip (video 0:10): the new screen pushes in stretched from the side it comes from; an orange smear sweeps across
  function tab(el, dir = 1) {
    sfx('whoosh');
    if (!el || !can()) return;
    const s = document.getElementById('scan');
    gsap.fromTo(s, { x: dir > 0 ? -0.35 * innerWidth : innerWidth, scaleX: dir > 0 ? 1 : -1, opacity: 1 }, { x: dir > 0 ? innerWidth : -0.35 * innerWidth, duration: 0.45, ease: 'power2.inOut', onComplete: () => gsap.set(s, { opacity: 0 }) });
    gsap.fromTo(el, { x: dir * 80, scaleX: 1.12, opacity: 0, transformOrigin: dir > 0 ? '100% 50%' : '0% 50%' }, { x: 0, scaleX: 1, opacity: 1, duration: 0.5, ease: 'expo.out', clearProps: 'transform,opacity,transformOrigin' });
  }

  // ---------- the warm glow slides behind whatever is in focus (video 0:16); never moves while inking
  function focus(el) {
    const g = document.querySelector('.glow');
    if (!el || !g || !can() || inking()) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const s = g.offsetWidth;
    gsap.to(g, { x: r.left + r.width / 2 - s / 2, y: r.top + r.height / 2 - s / 2, duration: 1.4, ease: 'power3.inOut' });
  }

  // ---------- strike-out (video 0:06): two orange lines with ember tips cross el. Returns how long it takes (s), 0 without motion.
  function strike(el) {
    sfx('zip');
    if (!el || !can()) return 0;
    const r = el.getBoundingClientRect(); if (!r.width) return 0;
    const W = r.width, Hh = r.height, L = Math.hypot(W, Hh), s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'strike'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    Object.assign(s.style, { left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: Hh + 'px' });
    s.innerHTML = `<path d="M0 0L${W} ${Hh}"/><path d="M${W} 0L0 ${Hh}"/>`;
    document.body.append(s);
    const [a, b] = s.querySelectorAll('path');
    gsap.set([a, b], { strokeDasharray: L, strokeDashoffset: L });
    spark.line(r.left, r.top, r.right, r.bottom, 0.2); setTimeout(() => spark.line(r.right, r.top, r.left, r.bottom, 0.2), 100);
    gsap.timeline({ onComplete: () => s.remove() })
      .to(a, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.in' })
      .to(b, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.in' }, 0.1)
      .to(s, { opacity: 0, duration: 0.3 }, 0.42);
    return 0.32;
  }

  // ---------- worksheet opens: pages drop in (staggered), then once each page's picture is drawn (ready) an orange line scans
  // down it and the picture is revealed behind the line; any handwriting writes itself on after. Only pages on screen animate.
  function pageIn(pages, ready) {
    const t0 = performance.now(), live = can();
    pages.forEach((p, i) => {
      if (!live || i > 3 || p.el.getBoundingClientRect().top > innerHeight) { ready[i].catch(() => { }); return; }
      const at = i * 0.15, line = document.createElement('div'); line.className = 'pscan'; line.style.opacity = 0; p.el.append(line);
      gsap.fromTo(p.el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: at, ease: 'expo.out', clearProps: 'transform,opacity' });
      gsap.set(p.bg, { clipPath: 'inset(0% 0% 100% 0%)' }); // blank paper until the scan
      const end = () => { line.remove(); gsap.set(p.bg, { clearProps: 'clipPath' }); };
      ready[i].then(() => {
        gsap.timeline({ delay: Math.max(0, at + 0.45 - (performance.now() - t0) / 1000), onComplete: () => { end(); writeOn(p.svg, 2); } })
          .fromTo(line, { top: '0%', opacity: 1 }, { top: '100%', duration: 0.9, ease: 'power2.inOut' })
          .fromTo(p.bg, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power2.inOut' }, 0)
          .to(line, { opacity: 0, duration: 0.15 });
      }, end);
    });
  }

  // ---------- typed text hands over to handwriting: the text blurs out in orange while the box flickers
  function handover(box, ta) {
    if (!box || !ta || !can()) return;
    const g = document.createElement('div'); g.className = 'typed-out'; g.textContent = ta.value; g.style.fontSize = ta.style.fontSize; g.style.lineHeight = ta.style.lineHeight; box.append(g);
    gsap.fromTo(g, { opacity: 1 }, { opacity: 0, color: '#ff4d17', filter: 'blur(6px)', duration: 0.4, ease: 'power2.out', onComplete: () => g.remove() });
    gsap.to(box, { keyframes: [{ backgroundColor: 'rgba(255,77,23,.28)', duration: 0.05 }, { backgroundColor: 'rgba(255,77,23,.04)', duration: 0.06 }, { backgroundColor: 'rgba(255,77,23,.2)', duration: 0.05 }, { backgroundColor: 'rgba(255,77,23,0)', duration: 0.3 }],
      onComplete: () => gsap.set(box, { clearProps: 'backgroundColor' }) });
  }

  // ---------- a moment without a card: the chime, a small mono line types on under opt.at (default the header logo) with one spark
  // burst, gone after ~1.5 s; no text = the ember traces opt.at once (a button moment). Nothing covers the screen, so onCover runs
  // at once. opt: at (element), hold (s). false = not shown (the app shows a toast).
  function flash(text, done, onCover, opt = {}) {
    sfx('chime'); onCover && onCover();
    const at = opt.at || document.querySelector('.mark'), r = at && at.getBoundingClientRect();
    if (!can() || !r || !r.width) { done && done(); return false; }
    if (!text) { trace(at, 0.6); if (done) setTimeout(done, 1300); return true; }
    const s = document.createElement('span'), left = r.left + r.width / 2 < innerWidth / 2;
    s.className = 'mono moment'; s.textContent = text; s.setAttribute('aria-hidden', 'true');
    s.style.top = r.bottom + 6 + 'px'; s.style[left ? 'left' : 'right'] = (left ? r.left : innerWidth - r.right) + 'px';
    document.body.append(s); type(s); spark.burst(r.left + r.width / 2, r.top + r.height / 2, 0.7);
    gsap.to(s, { opacity: 0, duration: 0.3, delay: opt.hold ?? 1.4, onComplete: () => { s.remove(); done && done(); } });
    return true;
  }

  // ---------- letters learned from a sentence: a small "+N" chip with the letters rises off the paper and flies into toEl (the newest
  // filmstrip card). Waits until the pen has been up 0.6 s; a pen coming down drops it at once. false = no motion (the app shows a toast).
  const lq = []; let lT = 0, lUp = 0, chip = null;
  new MutationObserver(() => {
    if (!inking()) { lUp = performance.now(); return; }
    if (chip) { gsap.killTweensOf(chip); chip.remove(); chip = null; }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  function learned(chars, toEl) {
    if (!can()) { sfx('learn'); return false; }
    lq.push([chars, toEl]); if (!lT) lT = setInterval(nextLearn, 250);
    return true;
  }
  function nextLearn() {
    if (!lq.length) { clearInterval(lT); lT = 0; return; }
    if (inking() || performance.now() - lUp < 600 || chip || document.hidden) return;
    const [chars, toEl] = lq.shift(), pr = document.getElementById('spadWrap')?.getBoundingClientRect();
    const x0 = pr && pr.width ? pr.left + pr.width / 2 : innerWidth / 2, y0 = pr && pr.width ? pr.top : innerHeight / 2;
    const c = chip = document.createElement('span'), b = toEl && toEl.getBoundingClientRect(), fin = () => { c.remove(); if (chip === c) chip = null; };
    sfx('learn');
    c.className = 'learnchip'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = `<b class="mono">+${chars.length}</b>`; c.append(chars.join(' '));
    Object.assign(c.style, { left: x0 + 'px', top: y0 + 'px' }); document.body.append(c);
    const tl = gsap.timeline({ onComplete: fin });
    tl.fromTo(c, { xPercent: -50, yPercent: -50, y: 16, opacity: 0 }, { y: -28, opacity: 1, duration: 0.45, ease: 'expo.out' });
    if (b && b.width) tl.to(c, { x: b.left + b.width / 2 - x0, y: b.top + b.height / 2 - y0, scale: 0.3, opacity: 0, duration: 0.6, ease: 'expo.in',
      onStart: () => spark.fly({ l: x0, t: y0 - 28, w: 0, h: 0 }, toEl, null, true) }, '+=0.5');
    else tl.to(c, { opacity: 0, duration: 0.3 }, '+=0.6');
  }

  // ---------- PDF export (video 0:51): the pages slide past as a filmstrip with an orange progress line. step(i) per page, end() closes.
  function film(pages) {
    const f = document.getElementById('film'), none = { step() { }, end() { } };
    if (!f || !can() || !pages.length) return none;
    f.innerHTML = ''; const reel = document.createElement('div'); reel.className = 'reel';
    const frs = pages.map((pg, i) => {
      const fr = document.createElement('div'), c = document.createElement('canvas'), h = 120, w = Math.max(40, Math.round(h * pg.w / pg.h)), l = document.createElement('span');
      c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
      try { c.getContext('2d').drawImage(pg.bg, 0, 0, c.width, c.height); } catch { /* blank frame */ }
      fr.className = 'fr'; l.className = 'mono'; l.textContent = 'P.' + String(i + 1).padStart(2, '0'); fr.append(c, l); reel.append(fr); return fr;
    });
    const bar = document.createElement('div'), cap = document.createElement('div');
    bar.className = 'pbar'; bar.innerHTML = '<i></i>'; cap.className = 'mono fcap';
    f.append(reel, bar, cap); f.hidden = false;
    gsap.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    const t0 = performance.now();
    return {
      step(i) {
        frs.forEach((fr, j) => fr.classList.toggle('on', j === i));
        gsap.to(reel, { x: -(frs[i].offsetLeft + frs[i].offsetWidth / 2), duration: 0.45, ease: 'expo.out' });
        gsap.to(bar.firstChild, { scaleX: (i + 1) / frs.length, duration: 0.4, ease: 'power2.out' });
        cap.textContent = `render ${i + 1} / ${frs.length}   t = ${((performance.now() - t0) / 1000).toFixed(2)} s`;
      },
      end(toEl) { // with toEl the strip closes into it (the Save button)
        const b = toEl && toEl.getBoundingClientRect(), r = f.getBoundingClientRect(), close = { onComplete: () => { f.hidden = true; f.innerHTML = ''; gsap.set(f, { clearProps: 'opacity,transform,transformOrigin' }); } };
        gsap.to(f, b && b.width ? { ...close, opacity: 0, scale: 0.04, transformOrigin: `${b.left + b.width / 2 - r.left}px ${b.top + b.height / 2 - r.top}px`, duration: 0.45, ease: 'expo.in' } : { ...close, opacity: 0, duration: 0.25 });
      },
    };
  }

  // ---------- a dialog card arrives: lifts in, the ember traces it, the title writes on
  function pop(card, title) {
    sfx('soft');
    if (!card || !can()) return;
    trace(card, 0.6);
    gsap.fromTo(card, { y: 18, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'expo.out', clearProps: 'transform,opacity' });
    if (title) type(title, 0.1);
  }

  // ---------- terminal prompt typed out with a caret (the caret blinks in CSS)
  function prompt(el, text) {
    if (!el) return;
    clearInterval(el._t); el.textContent = text;
    if (!can()) return;
    const g = graphemes(text);
    let i = 0; el.textContent = '';
    el._t = setInterval(() => { el.textContent = g.slice(0, ++i).join(''); if (i >= g.length) clearInterval(el._t); }, 60);
  }

  // ---------- welcome (video opening): the ember ignites, a hairline grows from it with mono labels, the app name writes itself
  // in the person's hand, Teach. Type. Save. write on karaoke-style, the Start button is traced. Start: the name shrinks into the
  // header logo (FLIP), the ember settles as the logo dot, the app fades in under it
  function intro(titleSvg, onDone) {
    const ov = document.getElementById('intro'); if (!ov.hidden) return;
    ov.querySelector('.in-title').innerHTML = titleSvg; ov.hidden = false;
    const q = s => ov.querySelectorAll(s), steps = [...q('.in-steps b')];
    const end = () => { ov.hidden = true; if (typeof gsap !== 'undefined') { gsap.killTweensOf(q('*')); gsap.set(q('.in-steps b, .in-steps span, .in-start, .in-skip, .in-rule i, .in-rule span'), { clearProps: 'transform,opacity' }); } onDone && onDone(); };
    ov.querySelector('.in-skip').onclick = end;
    ov.querySelector('.in-start').onclick = () => {
      sfx('chime');
      const t = ov.querySelector('.in-title'), mk = document.querySelector('.mark'), dot = mk && mk.querySelector('i'), a = t.getBoundingClientRect(), b = mk && mk.getBoundingClientRect();
      tab(document.querySelector('main section:not([hidden])'), 1);
      if (!can() || !b || !b.width || !a.width) { end(); return; }
      const c = t.cloneNode(true); c.className = 'in-title flyer'; c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', margin: 0, zIndex: 96, pointerEvents: 'none' });
      document.body.append(c); t.style.visibility = 'hidden'; mk.style.opacity = 0;
      gsap.set(ov, { pointerEvents: 'none' });
      gsap.to(ov, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => { t.style.visibility = ''; gsap.set(ov, { clearProps: 'opacity,pointerEvents' }); end(); } });
      gsap.to(c, { x: b.left - a.left, y: b.top - a.top, scale: Math.min(b.width / a.width, b.height / a.height), transformOrigin: '0 0', duration: 0.7, ease: 'expo.inOut', onComplete: () => { c.remove(); mk.style.opacity = ''; } });
      if (dot) spark.fly({ l: a.left + a.width / 2, t: a.top + a.height / 2, w: 0, h: 0 }, dot, null, true);
    };
    ov.querySelector('.in-start').focus();
    if (!can()) return;
    const title = ov.querySelector('.in-title'), rule = ov.querySelector('.in-rule i'), on = { y: 0, opacity: 1 };
    frame(ov.querySelector('.in-stage'));
    const r = title.getBoundingClientRect(); spark.burst(r.left + r.width / 2, r.top + r.height / 2, 0.6);
    gsap.set(steps, { opacity: 0 });
    const tl = gsap.timeline({ delay: 0.35 });
    const w = writeOn(title, 1.6); if (w) tl.add(w, 0);
    tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'expo.inOut', onStart: () => { const b = rule.getBoundingClientRect(); spark.line(b.left, b.top, b.left + b.width, b.top, 0.9); } }, 0.1)
      .fromTo(q('.in-rule span'), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.15 }, 0.5);
    steps.forEach((b, i) => tl.call(() => { gsap.set(b, { clearProps: 'opacity' }); type(b); }, null, 1.2 + i * 0.35));
    tl.fromTo(q('.in-steps li > span'), { y: 10, opacity: 0 }, { ...on, duration: 0.45, stagger: 0.1, ease: 'power2.out' }, 1.5)
      .fromTo(q('.in-start, .in-skip'), { y: 8, opacity: 0 }, { ...on, duration: 0.35, stagger: 0.06 }, 2.3)
      .call(() => trace(ov.querySelector('.in-start'), 0.6), null, 2.7);
  }

  // ---------- a thing flies home (FLIP): a copy of el starts over `from` (same aspect) and shrinks into el's place; el shows once
  // it lands. A fixed copy, so a scrolling strip around el can't clip the flight.
  function into(el, from) {
    if (!el || !from || !can()) return;
    const a = from.getBoundingClientRect(), b = el.getBoundingClientRect(); if (!a.width || !b.width) return;
    const c = el.cloneNode(true); c.setAttribute('class', 'flyer');
    Object.assign(c.style, { position: 'fixed', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', margin: 0, zIndex: 60, pointerEvents: 'none' });
    document.body.append(c); el.style.opacity = 0;
    gsap.fromTo(c, { x: a.left - b.left, y: a.top - b.top, scale: a.width / b.width, transformOrigin: '0 0' }, { x: 0, y: 0, scale: 1, duration: 0.6, ease: 'expo.inOut', onComplete: () => { c.remove(); el.style.opacity = ''; } });
  }

  return { writeOn, icon, spark, words: type, type, frame, trace, swap, settle, tab, focus, strike, pageIn, handover, flash, learned, film, pop, prompt, intro, into, can };
})();
