/*
 * Der3 | درع — HELD-OUT EVALUATION SET (fictional examples).
 *
 * Purpose: a fairer test than the development set. These examples were written
 * AFTER the analyzer rules (engine v1.3) were frozen, and the rules were NOT
 * changed after seeing these results. Whatever the analyzer gets wrong here is
 * reported as-is.
 *
 * Honest limitation: they were written by the same developer who wrote the rules,
 * so they may still share blind spots. For the strongest test, ask someone who has
 * NOT seen the rules to write new examples and paste them in on the page
 * (Demo evaluation → Held-out set → Add example), or replace this list.
 *
 * All names, numbers and web addresses are fictional.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3EvalHoldout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return [
    // ---------- Scam ----------
    { id: 'h-ar-electricity', type: 'call', lang: 'ar', expected: 'scam',
      text: 'ألو، معاك قسم الشكاوى في شركة الكهربا. عداد حضرتك عليه متأخرات وهيتشال النهارده لو مدفعتش 450 جنيه دلوقتي على فودافون كاش.' },
    { id: 'h-en-tax-refund', type: 'message', lang: 'en', expected: 'scam',
      text: 'Tax office: You are due a tax refund of 312.40. Claim it before midnight: https://tax-refund-claims.online/start' },
    { id: 'h-ar-login-alert', type: 'message', lang: 'ar', expected: 'scam',
      text: 'تنبيه أمني: تم تسجيل دخول غير معتاد إلى حسابك. لإلغاء العملية اضغط على الرابط وأدخل بياناتك: http://secure-account-verify.com/login' },
    { id: 'h-en-windows', type: 'call', lang: 'en', expected: 'scam',
      text: 'Hello, this is Windows technical support. We detected errors on your computer. Please go to your computer now so I can guide you to fix it.' },
    { id: 'h-ar-new-number', type: 'message', lang: 'ar', expected: 'scam',
      text: 'ماما ده رقمي الجديد، التليفون وقع مني. ممكن تحوليلي 2000 جنيه ضروري هرجعهملك بكره؟' },
    { id: 'h-link-subdomain', type: 'link', lang: 'en', expected: 'scam',
      text: 'http://paypal.com.account-review.info/signin' },

    // ---------- Legitimate ----------
    { id: 'h-en-dental', type: 'call', lang: 'en', expected: 'legit',
      text: 'Good morning, this is Mona from the dental clinic. Just a reminder that your check-up is tomorrow at 11. No need to call back.' },
    { id: 'h-ar-salary', type: 'message', lang: 'ar', expected: 'legit',
      text: 'تم إيداع راتبك لشهر نوفمبر في حسابك. للاستفسار تفضّل بزيارة أقرب فرع.' },
    { id: 'h-en-order', type: 'message', lang: 'en', expected: 'legit',
      text: 'Your order #48213 has shipped and should arrive on Thursday. You can track it in the store’s app.' },
    { id: 'h-ar-nephew', type: 'call', lang: 'ar', expected: 'legit',
      text: 'أهلاً يا حاج، أنا محمود ابن أخوك، كنت بطمن عليك بس، هعدّي عليك بكرة بعد الشغل.' },
    { id: 'h-link-news', type: 'link', lang: 'en', expected: 'legit',
      text: 'https://www.bbc.com/arabic' },
    { id: 'h-en-family', type: 'message', lang: 'en', expected: 'legit',
      text: 'Hi Dad, the kids loved the presents! We will visit you on Saturday afternoon.' }
  ];
});
