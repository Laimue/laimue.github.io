// LaiMue motion: handwriting that writes itself + the welcome intro (GSAP), animated icons (Lottie).
// Every effect is skipped when the device asks for reduced motion or a library failed to load; the app works the same without them.
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
    if (fills.length) tl.from(fills, { opacity: 0, duration: 0.5, stagger: 0.15 }, 0);
    return tl;
  }

  // Lottie icon into el; json in anim/. Without Lottie the element stays empty.
  function icon(el, name, loop = false) {
    if (!el || typeof lottie === 'undefined') return null;
    el.innerHTML = '';
    return lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay: !calm.matches, path: 'anim/' + name + '.json' });
  }

  // Welcome scene. titleSvg = the app name in the person's handwriting (path.stk / path.fil). onDone runs once it closes.
  function intro(titleSvg, onDone) {
    const ov = document.getElementById('intro'); if (!ov.hidden) return;
    ov.querySelector('.in-title').innerHTML = titleSvg; ov.hidden = false;
    const close = () => {
      const end = () => { ov.hidden = true; if (typeof gsap !== 'undefined') gsap.set(ov, { clearProps: 'all' }); onDone && onDone(); };
      if (can()) gsap.to(ov, { opacity: 0, scale: 1.02, duration: 0.35, ease: 'power2.in', onComplete: end }); else end();
    };
    ov.querySelector('.in-start').onclick = ov.querySelector('.in-skip').onclick = close;
    ov.querySelector('.in-start').focus();
    if (!can()) return;
    const q = s => ov.querySelectorAll(s);
    const tl = gsap.timeline();
    const on = { y: 0, opacity: 1 }; // explicit ends: from() reads them off the page, where a CSS transition or a replay can leave 0
    tl.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: 0.3 })
      .fromTo(q('.in-card'), { y: 24, opacity: 0 }, { ...on, duration: 0.5, ease: 'power3.out' }, 0.05);
    const w = writeOn(ov.querySelector('.in-title'), 1.6); if (w) tl.add(w, 0.35);
    tl.fromTo(q('.in-tag'), { y: 10, opacity: 0 }, { ...on, duration: 0.45, ease: 'power2.out' }, '-=0.4')
      .fromTo(q('.in-step'), { y: 16, opacity: 0 }, { ...on, duration: 0.45, stagger: 0.12, ease: 'power2.out' }, '-=0.15')
      .fromTo(q('.in-step .i'), { scale: 0.4, rotate: -20 }, { scale: 1, rotate: 0, duration: 0.5, stagger: 0.12, ease: 'back.out(2.5)' }, '<')
      .fromTo(q('.in-start, .in-skip'), { y: 8, opacity: 0 }, { ...on, duration: 0.35, stagger: 0.06 }, '-=0.2');
  }

  return { writeOn, icon, intro };
})();
