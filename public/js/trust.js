/*
 * Der3 | درع — Trust circle helpers (UMD: browser + Node tests).
 *
 * Trusted contacts are kept ONLY on this device (localStorage in app.js).
 * They are never sent to the Der3 server or to any external service.
 * Calls happen only when the user taps a tel: link; alerts are shared only
 * after the user confirms, through the device's own share sheet or by copying.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3Trust = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CONTACTS = 10;
  var MAX_NAME = 40;

  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toLatinDigits(s) {
    return String(s || '').replace(/[٠-٩۰-۹]/g, function (d) {
      var i = AR_DIGITS.indexOf(d);
      return String(i >= 0 ? i : FA_DIGITS.indexOf(d));
    });
  }

  // "+20 100-123 4567" / "٠١٠٠ ١٢٣ ٤٥٦٧" / "0020…" → "+201001234567" / "01001234567"
  function normalizePhone(raw) {
    var s = toLatinDigits(raw).trim();
    var plus = /^\s*(\+|00)/.test(s);
    var digits = s.replace(/^\s*(\+|00)/, '').replace(/[\s\-().‎‏]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    if (digits.length < 3 || digits.length > 15) return null;
    return (plus ? '+' : '') + digits;
  }

  function cleanName(raw) {
    return String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  // Returns { ok, contact } or { ok:false, errors:{ name?, phone? } }
  function validate(input) {
    var name = cleanName(input && input.name);
    var phone = normalizePhone(input && input.phone);
    var errors = {};
    if (!name) errors.name = 'empty';
    if (!String(input && input.phone || '').trim()) errors.phone = 'empty';
    else if (!phone) errors.phone = 'invalid';
    if (Object.keys(errors).length) return { ok: false, errors: errors };
    return { ok: true, contact: { name: name, phone: phone } };
  }

  // Parse whatever is in storage defensively; drop anything malformed.
  function parseStored(json) {
    var list;
    try { list = JSON.parse(json || '[]'); } catch (e) { return []; }
    if (!Array.isArray(list)) return [];
    return list.map(function (c) {
      var v = validate(c || {});
      return v.ok ? { id: String((c && c.id) || '').slice(0, 40) || newId(), name: v.contact.name, phone: v.contact.phone } : null;
    }).filter(Boolean).slice(0, MAX_CONTACTS);
  }

  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function telHref(phone) {
    var p = normalizePhone(phone);
    return p ? 'tel:' + p : null;
  }

  /*
   * Short alert to share with a trusted person.
   * Contains ONLY: what kind of thing was checked and that it looks high-risk,
   * plus a request to talk. Never the transcript, the checked phone number or link,
   * names, or any other personal details.
   * kind: 'call' | 'message' | 'link' | 'screenshot' | 'oncall'
   */
  function buildAlert(kind, t) {
    var k = ['call', 'message', 'link', 'screenshot', 'oncall'].indexOf(kind) >= 0 ? kind : 'message';
    return [t('trAlertLine1_' + k), t('trAlertLine2'), t('trAlertLine3')].join('\n');
  }

  return {
    MAX_CONTACTS: MAX_CONTACTS, MAX_NAME: MAX_NAME,
    normalizePhone: normalizePhone, cleanName: cleanName, validate: validate,
    parseStored: parseStored, newId: newId, telHref: telHref, buildAlert: buildAlert
  };
});
