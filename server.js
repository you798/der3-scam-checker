/*
 * Der3 | درع — local demo server
 * Runs only on your own computer (http://localhost:3000).
 * - Serves the website from the /public folder.
 * - Runs the SIMULATED pattern-based demo engine.
 * - Never sends anything to external services and never opens submitted links.
 * - Does not save or log what users type.
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const engine = require('./public/js/engine.js');
const numberCheck = require('./public/js/number-check.js');
const numberList = require('./public/js/verified-numbers.js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Default: only reachable from this computer.
// Phone mode (opt-in, "npm run start:phone"): reachable from devices on the SAME Wi-Fi,
// so the demo can be tried on a real phone. Use it only on a network you trust.
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';

app.disable('x-powered-by');

// Basic safety headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Local OCR for "Check a screenshot" (tesseract.js runs IN THE BROWSER).
// The library, its WebAssembly core and the Arabic/English language data are served
// from this computer's node_modules — no CDN, and the image never leaves the browser.
const NM = path.join(__dirname, 'node_modules');
const vendorOpts = { index: false, fallthrough: false, immutable: true, maxAge: '7d' };
app.use('/vendor/tesseract', express.static(path.join(NM, 'tesseract.js', 'dist'), vendorOpts));
app.use('/vendor/tesseract-core', express.static(path.join(NM, 'tesseract.js-core'), vendorOpts));
const OCR_LANGS = { ara: '@tesseract.js-data/ara', eng: '@tesseract.js-data/eng' };
app.get('/vendor/tessdata/:file', (req, res) => {
  const m = /^(ara|eng)\.traineddata\.gz$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  // "best_int" = the LSTM models tesseract.js uses by default; served as a plain file
  // (tesseract.js unzips it itself), so no Content-Encoding header is set.
  res.type('application/octet-stream');
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(path.join(NM, OCR_LANGS[m[1]], '4.0.0_best_int', m[1] + '.traineddata.gz'), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// Health check: lets the website show "Connected to local demo server"
app.get('/api/health', (req, res) => {
  res.json({ ok: true, engine: engine.ENGINE_NAME, simulated: true });
});

// Analyze a call transcript, a message, or a link (as text only)
app.post('/api/analyze', (req, res) => {
  const { type, input } = req.body || {};
  const result = engine.analyze(type, input);
  if (!result.ok) {
    return res.status(422).json(result);
  }
  // Note: the result is calculated locally and is not stored anywhere.
  res.json(result);
});

// Caller number check — user-initiated, offline. Looks ONLY in the local, explicitly
// configured list (public/js/verified-numbers.js). No reputation service is called,
// and an unlisted number is reported as "unknown", never "safe". Nothing is logged.
app.post('/api/number-check', (req, res) => {
  const number = req.body && req.body.number;
  const result = numberCheck.checkNumber(typeof number === 'string' ? number : '', numberList);
  if (!result.ok) return res.status(422).json(result);
  res.json(result);
});

// "Ask someone you trust" — DEMO ONLY. Nothing is sent to anyone.
app.post('/api/help-request', (req, res) => {
  const allowed = ['family', 'friend', 'neighbour'];
  const contactType = allowed.includes(req.body && req.body.contactType) ? req.body.contactType : 'family';
  res.json({
    ok: true,
    demo: true,
    contactType,
    reference: 'DEMO-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    message: 'Demo only: no message was sent.'
  });
});

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'notFound' });
});

// Bad JSON or other errors
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(400).json({ ok: false, error: err.type === 'entity.too.large' ? 'tooLong' : 'badRequest' });
  }
  console.error('Unexpected error:', err && err.message);
  res.status(500).json({ ok: false, error: 'server' });
});

function lanAddresses() {
  const out = [];
  const nets = require('os').networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      const v4 = n.family === 'IPv4' || n.family === 4;
      if (v4 && !n.internal && !/^169\.254\./.test(n.address)) out.push(n.address);
    });
  });
  return out;
}

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Der3 | درع demo is running.');
  console.log(`  Open this address in your browser:  http://localhost:${PORT}`);
  if (LAN) {
    const ips = lanAddresses();
    console.log('');
    console.log('  PHONE MODE — reachable from devices on the same Wi-Fi network:');
    if (ips.length) ips.forEach((ip) => console.log(`    http://${ip}:${PORT}`));
    else console.log('    (no Wi-Fi/LAN address found — is this computer connected to a network?)');
    console.log('  وضع الموبايل — افتح أحد العناوين أعلاه من موبايل متصل بنفس شبكة الـ Wi-Fi.');
    console.log('');
    console.log('  Use this only on a network you trust (home / your own hotspot), and stop it when done.');
    console.log('  If Windows asks, allow Node.js on PRIVATE networks only.');
    console.log('  Note: over plain http:// phones disable the share sheet; Der3 offers "Copy" instead.');
  }
  console.log('  Press Ctrl + C in this terminal to stop it.');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  Port ${PORT} is already in use — Der3 is probably already running in another terminal.`);
    console.error(`  Just open http://localhost:${PORT} in your browser,`);
    console.error('  or stop the other one with Ctrl + C and run "npm start" again.');
    console.error(`  المنفذ ${PORT} مستخدم بالفعل — غالباً «درع» يعمل في نافذة طرفية أخرى. افتح http://localhost:${PORT} مباشرة.`);
    console.error('');
    process.exit(1);
  }
  throw err;
});
