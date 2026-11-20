/*
 * Der3 | درع — DEMO EVALUATION SET (fictional examples, editable).
 *
 * Every example below is invented for the university presentation. Names,
 * numbers, and web addresses are fictional. Edit freely: change `text`, set
 * `expected` to 'scam' or 'legit', and `type` to 'call', 'message', or 'link'.
 * Examples can also be edited, added, or removed on the page ("Demo evaluation").
 *
 * The page runs the REAL analyzer (engine.js) on these texts and counts the
 * results. The numbers describe only this small curated set — they are NOT a
 * measure of real-world accuracy.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3EvalSet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return [
    // ---------- Scam calls ----------
    { id: 'ar-bank-otp', type: 'call', lang: 'ar', expected: 'scam',
      text: 'أمن البنك ممكن تبعت لنا الرمز اللي أرسلناه لحضرتك؟' },
    { id: 'en-bank-pin', type: 'call', lang: 'en', expected: 'scam',
      text: 'This is the fraud department of your bank. Your account will be frozen today unless you confirm your card number and PIN.' },
    { id: 'ar-tech-support', type: 'call', lang: 'ar', expected: 'scam',
      text: 'معاك الدعم الفني، جهازك فيه فيروس خطير، نزّل تطبيق AnyDesk دلوقتي عشان نصلحه.' },
    { id: 'en-grandchild', type: 'call', lang: 'en', expected: 'scam',
      text: 'Grandma, it’s me. I’m in trouble and I need you to buy gift cards and send me the codes right now. Please don’t tell Mom.' },

    // ---------- Scam messages ----------
    { id: 'ar-prize', type: 'message', lang: 'ar', expected: 'scam',
      text: 'مبروك! ربحت جائزة 50,000 جنيه. ادفع رسوم الاستلام على فودافون كاش خلال ساعة وإلا تُلغى الجائزة.' },
    { id: 'en-parcel', type: 'message', lang: 'en', expected: 'scam',
      text: 'Your parcel is on hold. Pay the 1.99 redelivery fee within 24 hours: http://parcel-redelivery-fee.top/pay' },

    // ---------- Scam links ----------
    { id: 'link-lookalike', type: 'link', lang: 'en', expected: 'scam',
      text: 'http://secure-bank-login-verify.xyz/account/update' },
    { id: 'link-ip', type: 'link', lang: 'en', expected: 'scam',
      text: 'http://203.0.113.45/bank/login.php' },

    // ---------- Legitimate calls ----------
    { id: 'ar-clinic', type: 'call', lang: 'ar', expected: 'legit',
      text: 'مرحباً، معك موظفة الاستقبال في مركز صحة الأسرة. أتصل لتذكيرك بموعدك مع الدكتورة سارة يوم الثلاثاء الساعة العاشرة صباحاً.' },
    { id: 'en-pharmacy', type: 'call', lang: 'en', expected: 'legit',
      text: 'Hi, this is Omar from the neighbourhood pharmacy. Your prescription is ready, and you can pick it up any time tomorrow.' },

    // ---------- Legitimate messages ----------
    { id: 'ar-otp-notice', type: 'message', lang: 'ar', expected: 'legit',
      text: 'رمز التحقق الخاص بك هو 482913. لا تشارك هذا الرمز مع أي شخص. لن نطلب منك هذا الرمز في أي مكالمة.' },
    { id: 'en-dentist', type: 'message', lang: 'en', expected: 'legit',
      text: 'Reminder: your dentist appointment is on Sunday at 4 pm. See you then, and call the clinic if you need to change it.' },
    { id: 'ar-branch-closed', type: 'message', lang: 'ar', expected: 'legit',
      text: 'فرع البنك سيكون مغلقاً يوم الجمعة بمناسبة العيد.' },

    // ---------- Legitimate links ----------
    { id: 'link-wikipedia', type: 'link', lang: 'en', expected: 'legit',
      text: 'https://www.wikipedia.org/' },
    { id: 'link-example', type: 'link', lang: 'en', expected: 'legit',
      text: 'https://www.example.com/opening-hours' }
  ];
});
