// Builds bank.json: real Thai sentences for the Sentences tab, each pre-wrapped into 1-2 pad lines.
// Source: Tatoeba Thai export (CC BY 2.0 FR) -> tools/cache/tatoeba/tha.tsv (download + bunzip2 by hand):
//   https://downloads.tatoeba.org/exports/per_language/tha/tha_sentences.tsv.bz2
// Plus the traditional Thai alphabet poem (rare letters ฆ ฌ ฎ ฏ ฑ ฒ ฬ). Run: node tools/bank.js
// English (v28): node tools/bank.js en -> bank-en.json, from the Tatoeba English export unpacked to tools/cache/tatoeba/eng.tsv:
//   https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
// Grammar: only sentences whose owner is a native speaker (Tatoeba level 5) of that language, never tagged for a fix
// (@needs native check, @change, @check, unnatural, archaic …) and never reviewed "not OK" or "unsure". Needed in
// tools/cache/tatoeba/: {tha,eng}_sentences_detailed.tsv + {tha,eng}_tags.tsv (per_language/xxx/), user_languages.csv
// (user_languages.tar.bz2) and users_sentences.csv, all from https://downloads.tatoeba.org/exports/
const fs = require('fs'), P = require('path'), H = require('../hand.js');
const T = f => P.join(__dirname, 'cache/tatoeba', f), rows = f => fs.readFileSync(T(f), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
function good(lang) { // -> {ok: texts that pass, all: every text (word counts)}
  const native = new Set(rows('user_languages.csv').filter(r => r[0] === lang && r[1] === '5').map(r => r[2]));
  const BAD = /^@|native check|unnatural|archaic|old-fashioned|dated|outdated|vulgar|wrong|error/i, bad = new Set(rows(lang + '_tags.tsv').filter(r => BAD.test(r[1])).map(r => r[0]));
  for (const r of rows('users_sentences.csv')) if (r[2] === '-1' || r[2] === '0') bad.add(r[1]);
  const src = rows(lang + '_sentences_detailed.tsv'); // id, lang, text, owner, added, modified
  return { ok: src.filter(r => r[2] && native.has(r[3]) && !bad.has(r[0])).map(r => r[2]), all: src.map(r => r[2] || '') };
}
if (process.argv[2] === 'en') { english(); process.exit(0); }
const MAXL = 18, MIN = 6; // clusters per pad line; shortest sentence worth a line
const POEM = [
  ['เป็นมนุษย์สุดประเสริฐเลิศคุณค่า', 'กว่าบรรดาฝูงสัตว์เดรัจฉาน'],
  ['จงฝ่าฟันพัฒนาวิชาการ', 'อย่าล้างผลาญฤๅเข่นฆ่าบีฑาใคร'],
  ['ไม่ถือโทษโกรธแช่งซัดฮึดฮัดด่า', 'หัดอภัยเหมือนกีฬาอัชฌาสัย'],
  ['ปฏิบัติประพฤติกฎกำหนดใจ', 'พูดจาให้จ๊ะ ๆ จ๋า ๆ น่าฟังเอย'],
];
const OK = /^[ก-ฺเ-๎ ]+$/; // Thai letters, vowels, marks, ๆ ฯ and spaces only
const n = s => H.parse(s).filter(c => !c.sp).length;
const seg = new Intl.Segmenter('th', { granularity: 'word' });
// one line if it fits, else the word break nearest the middle (a space beats a word break)
function wrap(s) {
  if (n(s) <= MAXL) return [s];
  const cuts = []; let i = 0;
  for (const w of seg.segment(s)) { i += w.segment.length; if (i < s.length) cuts.push(i); }
  const best = cuts.map(c => [c, Math.abs(n(s.slice(0, c)) - n(s.slice(c))) - (s[c] === ' ' || s[c - 1] === ' ' ? 3 : 0)]).sort((a, b) => a[1] - b[1])[0];
  if (!best) return null;
  const a = s.slice(0, best[0]).trim(), b = s.slice(best[0]).trim();
  return n(a) <= MAXL && n(b) <= MAXL && n(a) >= 3 && n(b) >= 3 ? [a, b] : null;
}
const src = good('tha').ok;
const seen = new Set(), out = [];
for (let s of src) {
  s = s.normalize('NFC').trim().replace(/^["“'(]+|["”'.!?,)…]+$/g, '').replace(/\s+/g, ' ').replace(/ํา/g, 'ำ');
  if (!OK.test(s) || n(s) < MIN || seen.has(s)) continue;
  const w = wrap(s); if (!w) continue;
  seen.add(s); out.push(w);
}
const bank = [...POEM.flat().map(wrap), ...out]; // each poem line is its own item
fs.writeFileSync(P.join(__dirname, '../bank.json'), JSON.stringify(bank));
const have = new Set(bank.flat().join(''));
const need = H.GROUPS.slice(0, 3).map(g => g[1]).join('');
console.log(bank.length, 'sentences,', (fs.statSync(P.join(__dirname, '../bank.json')).size / 1024).toFixed(0), 'KB; missing letters:', [...need].filter(c => !have.has(c)).join(' ') || 'none');

// Plain English lines (common words, no names) no wider (typed) than most Thai pages, so the pad keeps handwriting size.
function english() {
  const opentype = require('../lib/opentype.min.js'), font = opentype.loadSync(P.join(__dirname, '../lib/Sriracha-Regular.ttf')), C = {};
  const fb = ch => (ch in C ? C[ch] : (C[ch] = H.fontVariant(font, ch)));
  const width = s => { const cb = H.layout(s, null, { x: 0, y: 0, width: 1e4, u: 1, seed: 1, fb }).cb.filter(Boolean); return cb.length ? Math.max(...cb.map(c => c[2])) - Math.min(...cb.map(c => c[0])) : 0; };
  const th = JSON.parse(fs.readFileSync(P.join(__dirname, '../bank.json'), 'utf8')).filter(i => i.length === 1 && i[0].replace(/[ัิ-ฺ็-๎ ]/g, '').length <= 14).map(i => width(i[0])).sort((a, b) => a - b);
  const CAP = th[Math.floor(0.9 * th.length)];
  const g = good('eng'), src = g.ok.map(s => s.trim());
  const freq = new Map(), words = s => s.toLowerCase().match(/[a-z']+/g) || [];
  for (const s of g.all) for (const w of s.match(/(?<![A-Za-z'])[a-z][a-z']*/g) || []) freq.set(w, (freq.get(w) || 0) + 1); // written in lower case: names never are
  const OKEN = /^[A-Z][A-Za-z' ,]*[.?!]$/, NAMES = /\b(Tom|Mary|John)\b/, letters = s => s.replace(/[^A-Za-z]/g, '').length;
  let R = 7; const rnd = () => ((R = (R * 16807) % 2147483647) / 2147483647); // fixed shuffle: the same bank every run
  const cand = [...new Set(src.filter(s => OKEN.test(s) && !NAMES.test(s) && letters(s) >= 10 && letters(s) <= 30 && words(s).every(w => /^i('|$)/.test(w) || freq.get(w) >= 20)))];
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const PANG = ['The quick brown fox jumps over the lazy dog.', 'Pack my box with five dozen liquor jugs.', 'Sphinx of black quartz, judge my vow.'];
  const out = [];
  for (const p of PANG) if (width(p) <= CAP) out.push([p]); // whole sentences only (halves aren't grammatical); too wide = tiny handwriting, the picker finds rare letters anyway
  for (const s of cand) { if (out.length >= 3000) break; if (width(s) <= CAP) out.push([s]); }
  fs.writeFileSync(P.join(__dirname, '../bank-en.json'), JSON.stringify(out));
  const have = new Set(out.flat().join('').toLowerCase());
  console.log(out.length, 'English lines (of', cand.length, 'plain ones), width cap', CAP.toFixed(2), ',', (fs.statSync(P.join(__dirname, '../bank-en.json')).size / 1024).toFixed(0), 'KB; pangrams:', JSON.stringify(out.slice(0, 6)), '; missing letters:', [...'abcdefghijklmnopqrstuvwxyz'].filter(c => !have.has(c)).join(' ') || 'none');
}
