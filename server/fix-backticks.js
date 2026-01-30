const fs = require('fs');
const path = 'server.js';
let s = fs.readFileSync(path, 'utf8');
const backtick = '\u0060';
// Replace common Unicode lookalikes for backtick with ASCII backtick
const replacements = [
  ['\u2018', backtick], // LEFT SINGLE QUOTATION MARK
  ['\u2019', backtick], // RIGHT SINGLE QUOTATION MARK
  ['\u02CB', backtick], // MODIFIER LETTER GRAVE ACCENT
];
let total = 0;
for (const [from, to] of replacements) {
  const count = (s.match(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (count) {
    total += count;
    s = s.split(from).join(to);
  }
}
fs.writeFileSync(path, s);
console.log('Replaced', total, 'non-ASCII backtick-like characters');
