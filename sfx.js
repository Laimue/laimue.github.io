// LaiMue sounds: short, quiet UI ticks made with WebAudio (no sound files). Never while the pen is down, never per stroke.
// Switch: ⋯ menu (localStorage lm.sfx, on by default). iPhone silent switch respected via audioSession 'ambient'.
const S = (() => {
  let ac = null, out = null, nb = null;
  const on = () => { try { return JSON.parse(localStorage.getItem('lm.sfx') ?? 'true') !== false; } catch { return true; } };
  // iOS only lets a page start audio inside a user gesture: make / resume the context on the first touch, click or key
  function unlock() {
    try {
      if (!ac) {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // mixes with music, silent with the ring switch
        ac = new A(); out = ac.createGain(); out.gain.value = 0.2; out.connect(ac.destination);
      }
      if (ac.state !== 'running') ac.resume().catch(() => { });
    } catch { /* no audio on this device: the app is the same without it */ }
  }
  function tone(type, f0, f1, len, lvl, at = 0) { // one oscillator voice with a fast attack and an exponential fade
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.03);
  }
  function noise(len, lvl, f0, f1, q = 1, at = 0) { // band-passed noise sweep (whoosh, zip, click texture)
    if (!nb) { nb = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + len * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + len + 0.03);
  }
  const FX = {
    tick: () => { tone('square', 2400, 1700, 0.022, 0.12); noise(0.02, 0.12, 6000, 4000, 2); },
    whoosh: () => noise(0.24, 0.32, 500, 3600, 0.8),
    ping: () => { tone('sine', 1320, 1320, 0.22, 0.26); tone('sine', 1980, 1980, 0.14, 0.1, 0.03); },
    chime: () => [880, 1108.7, 1318.5, 1760].forEach((f, i) => tone('sine', f, f, 0.55, 0.2, i * 0.07)),
    learn: () => { tone('triangle', 990, 990, 0.12, 0.22); tone('triangle', 1480, 1480, 0.24, 0.22, 0.09); },
    zip: () => { noise(0.16, 0.28, 4200, 500, 1.2); tone('sawtooth', 640, 120, 0.14, 0.05); },
    soft: () => tone('sine', 660, 990, 0.14, 0.18),
  };
  let n = 0; // plays so far (the checks read it)
  function play(name) {
    if (!on() || !ac || ac.state !== 'running' || !FX[name] || document.body.classList.contains('inking')) return false;
    try { FX[name](); n++; return true; } catch { return false; }
  }
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, true);
  // every button / tab press ticks; drawing surfaces never do (they are canvases, not buttons)
  addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('button, summary'); if (b && !b.disabled) play('tick'); }, true);
  return { play, on, get ctx() { return ac; }, get n() { return n; }, set(v) { try { localStorage.setItem('lm.sfx', JSON.stringify(!!v)); } catch { } if (v) { unlock(); play('soft'); } } };
})();
