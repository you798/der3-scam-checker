/*
 * Der3 | درع — one-click example content for the checker.
 * All examples are made up for teaching. Example links are for practice only:
 * do not type them into a browser.
 */
window.Der3Samples = {
  // One-click examples in the checker. "kind" is shown on the button so it is clear
  // which examples are scams and which are legitimate.
  checker: {
    call: [
      {
        kind: 'scam',
        label: { en: 'Bank “security” call', ar: 'مكالمة «أمن البنك»' },
        text: {
          en: 'Hello, this is the fraud department of your bank. Your account will be blocked today because of suspicious activity. To stop this, please read me the verification code we just sent to your phone. Do not hang up and don\'t tell anyone, this is confidential.',
          ar: 'مرحباً، معك قسم الاحتيال في البنك. سيتم إيقاف حسابك اليوم بسبب نشاط مشبوه. لإيقاف ذلك، أرسل لي رمز التحقق الذي وصلك الآن على جوالك. لا تغلق الخط ولا تخبر أحداً، هذا الأمر سري للغاية.'
        }
      },
      {
        kind: 'scam',
        label: { en: '“Tech support” call', ar: 'مكالمة «دعم فني»' },
        text: {
          en: 'Hi, I am calling from Microsoft technical support. Your computer has a dangerous virus. You need to install AnyDesk right now so I can fix it, and pay a small fee of 200 dollars with gift cards.',
          ar: 'مرحباً، أتصل بك من الدعم الفني. جهازك مصاب بفيروس خطير. يجب أن تقوم بتثبيت تطبيق انيديسك الآن حتى أصلحه، ثم ادفع رسوم رمزية 200 ريال عن طريق بطاقات هدايا.'
        }
      },
      {
        kind: 'safe',
        label: { en: 'Clinic reminder (real)', ar: 'تذكير من العيادة (حقيقي)' },
        text: {
          en: 'Hello, this is the receptionist at the family health clinic. I\'m calling to remind you of your appointment with Dr. Sara on Tuesday at 10 in the morning. If you need to change it, you can call the clinic\'s usual number. Have a good day.',
          ar: 'مرحباً، معك موظفة الاستقبال في مركز صحة الأسرة. أتصل لتذكيرك بموعدك مع الدكتورة سارة يوم الثلاثاء الساعة العاشرة صباحاً. إذا أردت تغيير الموعد يمكنك الاتصال على رقم المركز المعتاد. يومك سعيد.'
        }
      }
    ],
    message: [
      {
        kind: 'scam',
        label: { en: 'Parcel “customs fee”', ar: 'رسوم «جمارك» لطرد' },
        text: {
          en: 'Your parcel is held at customs. Pay the customs fee of 12.50 within 24 hours or it will be returned: http://parcel-track-delivery.top/pay?id=8812',
          ar: 'طردك محجوز لدى الجمارك. يرجى سداد رسوم جمركيه 12.50 ريال خلال 24 ساعة وإلا سيتم إرجاعه: http://parcel-track-delivery.top/pay?id=8812'
        }
      },
      {
        kind: 'scam',
        label: { en: '“Hi Mum, new number”', ar: '«هذا رقمي الجديد»' },
        text: {
          en: 'Hi Mum, it\'s me. I lost my phone so this is my new number. I\'m in trouble and need money urgently for a bill. Can you transfer now? Please don\'t tell Dad yet.',
          ar: 'هلا يمه، هذا رقمي الجديد لأن جوالي ضاع. أنا في ورطة ومحتاج فلوس عاجل لسداد فاتورة. ممكن تحولي المبلغ الآن؟ ولا تخبري أبوي الآن.'
        }
      },
      {
        kind: 'safe',
        label: { en: 'Login code (real)', ar: 'رمز دخول (حقيقي)' },
        text: {
          en: 'Your verification code is 482913. Do not share this code with anyone. We will never call you to ask for it.',
          ar: 'رمز التحقق الخاص بك هو 482913. لا تشارك هذا الرمز مع أي شخص. لن نطلب منك هذا الرمز في أي مكالمة.'
        }
      }
    ],
    link: [
      {
        kind: 'scam',
        label: { en: 'Misspelled name', ar: 'اسم بإملاء خاطئ' },
        text: { en: 'http://paypa1-secure-login.com/verify-account', ar: 'http://paypa1-secure-login.com/verify-account' }
      },
      {
        kind: 'scam',
        label: { en: 'Famous name in front', ar: 'اسم معروف في البداية' },
        text: { en: 'https://absher.sa.account-update.top/login', ar: 'https://absher.sa.account-update.top/login' }
      },
      {
        kind: 'scam',
        label: { en: 'Short link', ar: 'رابط مختصر' },
        text: { en: 'bit.ly/free-gift-claim', ar: 'bit.ly/free-gift-claim' }
      },
      {
        kind: 'safe',
        label: { en: 'Official address', ar: 'عنوان رسمي' },
        text: { en: 'https://www.absher.sa', ar: 'https://www.absher.sa' }
      }
    ]
  }
};
