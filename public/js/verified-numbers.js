/*
 * Der3 | درع — CALLER NUMBER LIST (explicitly configured, local, offline)
 * ------------------------------------------------------------------------
 * This is the ONLY source Der3 uses to name the organization behind a number.
 * There is no reputation database and no outside service.
 *
 * The two entries below are FICTIONAL demo entries that use numbers reserved
 * for drama/fiction (US 555-0100…0199 and UK 020 7946 0xxx). They are here so
 * the "listed" result can be demonstrated without claiming anything about a
 * real organization.
 *
 * To add a real organization, use ONLY a number you have confirmed from an
 * official source (e.g. printed on your bank card or on the organization's
 * official website), and set source to describe where it came from.
 * Even then, a listed number does NOT prove who is calling: caller ID can be spoofed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3VerifiedNumbers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    mode: 'demo',          // 'demo' = offline list only. No reputation provider is configured.
    provider: null,        // a real provider must be integrated server-side before changing this
    entries: [
      {
        number: '+12025550143',
        name: { en: 'Der3 Partner Clinic (fictional demo entry)', ar: 'عيادة شريكة لدرع (إدخال تجريبي وهمي)' },
        source: 'demo'
      },
      {
        number: '+442079460018',
        name: { en: 'Der3 Demo Bank Helpline (fictional demo entry)', ar: 'خط مساعدة بنك درع التجريبي (إدخال تجريبي وهمي)' },
        source: 'demo'
      }
    ]
  };
});
