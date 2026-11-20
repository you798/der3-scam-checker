/*
 * Der3 | درع — text for "Read result aloud" (UMD: browser + Node tests).
 *
 * Builds a SHORT spoken summary (verdict, main warning signs, next step) and picks
 * a matching built-in voice. Speaking itself uses the browser's speechSynthesis API
 * in app.js — no external service, nothing is sent anywhere.
 * The summary never repeats the user's own text (no transcript, numbers, or quotes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3ReadAloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function list(items, lang) {
    return items.join(lang === 'ar' ? '، ' : ', ');
  }
  function endStop(s) {
    s = String(s || '').trim();
    return /[.!?؟。]$/.test(s) ? s : s + '.';
  }

  // Checker result from engine.js
  function checkerSummary(r, t, lang) {
    var parts = [];
    parts.push(endStop(t('speakVerdict', { verdict: t('verdict_' + r.verdict), score: r.score })));
    var signs = r.signals.filter(function (s) { return s.weight > 0; }).slice(0, 3)
      .map(function (s) { return t('sig_' + s.id + '_t', s.vars || {}); });
    parts.push(endStop(signs.length ? t('speakSigns', { signs: list(signs, lang) }) : t('speakNoSigns')));
    // Identity is separate from the score: say it, but never as reassurance.
    if (r.identity && r.identity.claimed) parts.push(endStop(t('speakIdentity')));
    var next;
    if (r.override) {
      var key = 'overrideAdvice_' + r.override.reason;
      next = t(key) !== key ? t(key) : t('overrideAdvice_credentials');
    } else {
      next = t('step_' + (r.steps && r.steps[0]));
    }
    parts.push(endStop(t('speakNext', { step: next })));
    return parts.join(' ');
  }

  // "I'm on a call right now" result from on-call.js
  function onCallSummary(r, t, lang) {
    var parts = [endStop(t('speakResult', { verdict: t('ocLevel_' + r.level) }))];
    var signs = r.yes.map(function (q) { return t('ocSumSign_' + q); });
    if (signs.length) parts.push(endStop(t('speakCallerDid', { signs: list(signs, lang) })));
    var unsure = r.unsure.map(function (q) { return t('ocSumSign_' + q); });
    if (unsure.length) parts.push(endStop(t('speakCallerUnsure', { signs: list(unsure, lang) })));
    parts.push(endStop(t('ocDesc_' + r.level)));
    if (r.level === 'high' || r.level === 'verify') parts.push(endStop(t('speakScript', { script: t('ocScript') })));
    return parts.join(' ');
  }

  // Short chunks: some browsers stop long utterances after ~15 seconds.
  function chunks(text, max) {
    max = max || 180;
    var sentences = String(text).match(/[^.!?؟]+[.!?؟]*/g) || [];
    var out = [];
    sentences.forEach(function (s) {
      s = s.trim();
      if (!s) return;
      while (s.length > max) {
        var cut = s.lastIndexOf(' ', max);
        if (cut < 40) cut = max;
        out.push(s.slice(0, cut).trim());
        s = s.slice(cut).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  // Best installed voice for 'ar' or 'en'; null if none matches.
  function pickVoice(voices, lang) {
    var want = lang === 'ar' ? 'ar' : 'en';
    var matching = (voices || []).filter(function (v) {
      return String(v.lang || '').toLowerCase().replace('_', '-').split('-')[0] === want;
    });
    if (!matching.length) return null;
    var prefs = want === 'ar' ? ['ar-eg', 'ar-sa'] : ['en-us', 'en-gb'];
    function score(v) {
      var l = String(v.lang).toLowerCase().replace('_', '-');
      var p = prefs.indexOf(l);
      return (p === -1 ? 5 : p) + (v.localService ? 0 : 2);
    }
    return matching.slice().sort(function (a, b) { return score(a) - score(b); })[0];
  }

  return { checkerSummary: checkerSummary, onCallSummary: onCallSummary, chunks: chunks, pickVoice: pickVoice };
});
