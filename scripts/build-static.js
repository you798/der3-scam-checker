/*
 * Der3 | درع — static build for hosting (e.g. Vercel).
 *
 * Copies the local OCR files (tesseract.js, its WebAssembly core, and the Arabic +
 * English language data) from node_modules into public/vendor/, at the SAME paths
 * the local server uses (/vendor/tesseract/, /vendor/tesseract-core/, /vendor/tessdata/).
 * The hosted site is then fully static: the analyzer, caller-number check and OCR all
 * run in the visitor's browser, and nothing the user types or uploads is sent anywhere.
 *
 * Run with:  npm run build   (Vercel runs it automatically)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'vendor');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(out, { recursive: true, force: true });

// 1) tesseract.js (main + worker) and its license
const dist = path.join(nm, 'tesseract.js', 'dist');
['tesseract.min.js', 'worker.min.js'].forEach((f) => copy(path.join(dist, f), path.join(out, 'tesseract', f)));
copy(path.join(nm, 'tesseract.js', 'LICENSE.md'), path.join(out, 'tesseract', 'LICENSE.md'));

// 2) WebAssembly core: every build variant (the browser picks the one it supports)
const core = path.join(nm, 'tesseract.js-core');
fs.readdirSync(core).filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f))
  .forEach((f) => copy(path.join(core, f), path.join(out, 'tesseract-core', f)));
copy(path.join(core, 'LICENSE'), path.join(out, 'tesseract-core', 'LICENSE'));

// 3) Language data — the same "best_int" LSTM models the local server serves
['ara', 'eng'].forEach((lang) => {
  copy(path.join(nm, '@tesseract.js-data', lang, '4.0.0_best_int', lang + '.traineddata.gz'),
    path.join(out, 'tessdata', lang + '.traineddata.gz'));
});

let files = 0, bytes = 0;
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; }
  });
})(out);
console.log(`Static build ready: ${files} OCR files (${(bytes / 1048576).toFixed(1)} MB) copied to public/vendor/`);
