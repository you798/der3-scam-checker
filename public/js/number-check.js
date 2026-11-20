/*
 * Der3 | درع — CALLER NUMBER CHECK (user-initiated, offline, demo)
 * ------------------------------------------------------------------
 * - Looks the number up ONLY in the explicitly configured local list
 *   (verified-numbers.js). Nothing is sent anywhere.
 * - A number that is not listed is "Unknown — identity not verified", never "safe".
 * - A listed number is still not proof of identity: caller ID can be spoofed.
 * - A website cannot see incoming calls or the phone's caller ID; the user types the number.
 *
 * Used by the Express server (require) and by the browser as an offline fallback.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3NumberCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HIDDEN = /^(private|unknown|no caller id|restricted|blocked|withheld|hidden|anonymous|رقم خاص|خاص|مجهول|مخفي|رقم مخفي|غير معروف|محجوب|private number)$/i;

  // Keep digits only (Arabic-Indic digits converted); remember a leading "+" or "00".
  function normalizeNumber(raw) {
    var s = String(raw || '').trim()
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    var intl = /^\s*(\+|00)/.test(s);
    var digits = s.replace(/\D/g, '');
    if (/^00/.test(s.replace(/[^\d+]/g, ''))) digits = digits.replace(/^00/, '');
    return { digits: digits, intl: intl };
  }

  function format(n) { return (n.intl ? '+' : '') + n.digits; }

  // Match exactly, or — when the user left out the country code — by the last 9+ digits.
  function sameNumber(a, b) {
    if (a === b) return true;
    var shorter = a.length < b.length ? a : b;
    var longer = a.length < b.length ? b : a;
    var local = shorter.replace(/^0+/, '');
    return local.length >= 9 && longer.slice(-local.length) === local;
  }

  function checkNumber(raw, list) {
    var input = String(raw || '').trim();
    if (!input) return { ok: false, error: 'empty' };
    if (input.length > 40) return { ok: false, error: 'invalidNumber' };

    var config = list || { mode: 'demo', entries: [] };
    var base = { ok: true, mode: config.mode || 'demo', provider: config.provider || null, notes: ['spoofing', 'noAutoScreening'] };

    if (HIDDEN.test(input)) {
      return Object.assign(base, { status: 'hidden', number: input, notes: ['hiddenCaller'].concat(base.notes) });
    }
    if (/[^\d\s+()\-.٠-٩۰-۹]/.test(input)) return { ok: false, error: 'invalidNumber' };

    var n = normalizeNumber(input);
    if (n.digits.length < 3 || n.digits.length > 15) return { ok: false, error: 'invalidNumber' };

    var entry = null;
    (config.entries || []).some(function (e) {
      var en = normalizeNumber(e.number);
      if (sameNumber(n.digits, en.digits)) { entry = e; return true; }
      return false;
    });

    var notes = base.notes.slice();
    if (n.digits.length <= 6) notes.unshift('shortNumber');

    if (entry) {
      return Object.assign(base, {
        status: 'listed',
        number: format(n),
        entry: { name: entry.name, source: entry.source || 'demo', demo: (entry.source || 'demo') === 'demo' },
        notes: notes
      });
    }
    return Object.assign(base, { status: 'unknown', number: format(n), notes: notes });
  }

  return { checkNumber: checkNumber, normalizeNumber: normalizeNumber };
});
