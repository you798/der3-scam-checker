/*
 * Der3 | درع — VERIFIED ORGANIZATION CONTACTS (offline, explicit list).
 *
 * Used by "Verify this organization safely". The guide shows a phone number or
 * web address ONLY if it is listed here with an official SOURCE and a LAST-CHECKED
 * date. Otherwise it shows the safe general instructions instead.
 *
 * This list is intentionally EMPTY. Contacts must not be guessed, copied from a
 * message or a search result, or taken from memory. Add an entry only after you
 * have confirmed it yourself on an official source — for example, printed on the
 * organization's own card or paperwork, or on its official website that you typed
 * in yourself — and re-check it regularly (numbers change).
 *
 * Entry format:
 *   {
 *     kind: 'bank' | 'delivery' | 'government' | 'company',
 *     match: ['nbe', 'البنك الاهلي'],            // lower-case words that identify it in a message
 *     name: { en: '…', ar: '…' },
 *     phone: '…',                                 // optional
 *     website: 'https://…',                       // optional — shown as text, never auto-opened
 *     source: { en: 'Printed on the back of the bank card', ar: '…' },
 *     checked: 'YYYY-MM-DD'                       // date you last confirmed it
 *   }
 *
 * An entry missing `source` or `checked` is ignored by the page.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3VerifiedOrgs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return { entries: [] };
});
