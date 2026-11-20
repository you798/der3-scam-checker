/*
 * Der3 | درع — "Check a screenshot" rules (UMD: browser + Node tests).
 *
 * OCR runs locally in the browser (tesseract.js, served from this computer).
 * These helpers only judge HOW WELL the screenshot was read and make sure an
 * unclear screenshot can never end up labelled "Likely safe".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3Screenshot = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_CONFIDENCE = 70;   // tesseract mean word confidence (0–100)
  var MIN_CHARS_OK = 25;     // fewer readable characters than this = "couldn't read clearly"
  var MIN_CHARS_ANY = 8;     // fewer than this = practically nothing recognized
  var MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif'];

  // Letters (Arabic + Latin) and digits only — ignores OCR noise like "|", "~", "—".
  function readableChars(text) {
    var m = String(text || '').match(/[A-Za-z0-9؀-ۿݐ-ݿ٠-٩]/g);
    return m ? m.length : 0;
  }

  // Tidy raw OCR output for the editable preview (never changes the meaning).
  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      // OCR adds invisible direction marks (LRM/RLM/embeddings) around Latin text in
      // Arabic lines; they would hide inside the editable text and inside web addresses.
      .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 5000);
  }

  /**
   * quality: 'ok'    — read clearly
   *          'low'   — something was read, but confidence or amount is too low
   *          'empty' — almost nothing was recognized
   */
  function assessOcr(ocr) {
    var text = cleanText(ocr && ocr.text);
    var chars = readableChars(text);
    var conf = Number(ocr && ocr.confidence);
    if (!isFinite(conf)) conf = 0;
    var quality = chars < MIN_CHARS_ANY ? 'empty'
      : (conf < MIN_CONFIDENCE || chars < MIN_CHARS_OK) ? 'low'
      : 'ok';
    return { quality: quality, text: text, chars: chars, confidence: Math.round(conf) };
  }

  function checkFile(file) {
    if (!file) return { ok: false, error: 'none' };
    if (IMAGE_TYPES.indexOf(String(file.type).toLowerCase()) === -1) return { ok: false, error: 'type' };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'size' };
    return { ok: true };
  }

  /*
   * After the confirmed text has been analyzed by the normal engine:
   * if the screenshot was NOT read clearly, the result may never be "Likely safe"
   * (even if the user edited the text — Der3 can't confirm it matches the image).
   * Returns a new result object; the engine's own result is not modified.
   */
  function applyOcrSafety(result, quality) {
    if (!result || !result.ok) return result;
    var r = JSON.parse(JSON.stringify(result));
    r.meta = Object.assign({}, r.meta, { source: 'screenshot', ocrQuality: quality });
    if (quality === 'ok') return r;
    if (r.verdict === 'safe') {
      var floor = 30;
      r.signals.push({ id: 'ocrUnclear', weight: Math.max(0, floor - r.score), evidence: '' });
      r.score = Math.max(r.score, floor);
      r.verdict = 'caution';
      r.confidence = 'low';
      r.steps = ['ocrRetype'];
    } else {
      r.signals.push({ id: 'ocrUnclear', weight: 0, info: true, evidence: '' });
    }
    r.signals.sort(function (a, b) { return b.weight - a.weight; });
    return r;
  }

  return {
    MIN_CONFIDENCE: MIN_CONFIDENCE, MIN_CHARS_OK: MIN_CHARS_OK, MAX_IMAGE_BYTES: MAX_IMAGE_BYTES, IMAGE_TYPES: IMAGE_TYPES,
    readableChars: readableChars, cleanText: cleanText, assessOcr: assessOcr, checkFile: checkFile, applyOcrSafety: applyOcrSafety
  };
});
