// Builds bank.json: real Thai sentences for the Sentences tab, each pre-wrapped into 1-2 pad lines.
// Source: Tatoeba Thai export (CC BY 2.0 FR) -> tools/cache/tatoeba/tha.tsv (download + bunzip2 by hand):
//   https://downloads.tatoeba.org/exports/per_language/tha/tha_sentences.tsv.bz2
// Plus the traditional Thai alphabet poem (rare letters ฆ ฌ ฎ ฏ ฑ ฒ ฬ). Run: node tools/bank.js
const fs = require('fs'), P = require('path'), H = require('../hand.js');
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
const src = fs.readFileSync(P.join(__dirname, 'cache/tatoeba/tha.tsv'), 'utf8').split('\n').map(l => l.split('\t')[2]).filter(Boolean);
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
