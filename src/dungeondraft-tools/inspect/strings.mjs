// `strings` for Windows: prints ASCII and UTF-16 strings from a binary that match a regex.
// Use it on the extracted Dungeondraft.dll to find enum members (ASCII identifier heap) and JSON keys (UTF-16 string heap),
// e.g. `LineJointMode` showed that wall.joint is Godot's Line2D joint mode.
// Usage: node src/dungeondraft-tools/inspect/strings.mjs <file> <regex>
import fs from 'node:fs';

const [file, pattern] = process.argv.slice(2);
if (!file || !pattern) {
  console.error('Usage: node strings.mjs <file> <regex>');
  process.exit(2);
}
const bytes = fs.readFileSync(file);
const re = new RegExp(pattern, 'i');
const found = new Set();
const printable = (c) => c >= 32 && c < 127;

let run = '';
for (const c of bytes) {
  if (printable(c)) { run += String.fromCharCode(c); } else { if (run.length >= 3) { found.add(run); } run = ''; }
}
// UTF-16LE strings can start on either byte parity
for (const start of [0, 1]) {
  run = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    if (bytes[i + 1] === 0 && printable(bytes[i])) { run += String.fromCharCode(bytes[i]); } else { if (run.length >= 3) { found.add(`U:${run}`); } run = ''; }
  }
}
[...found].filter((s) => re.test(s)).sort().forEach((s) => console.log(s.slice(0, 160)));
