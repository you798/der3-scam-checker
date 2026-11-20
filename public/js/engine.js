/*
 * Der3 | درع — SIMULATED DEMO ENGINE
 * ------------------------------------------------------------
 * This is NOT artificial intelligence and NOT a certified security check.
 * It is a transparent, pattern-based scoring engine built for a university demo.
 * Every rule below is visible and has a fixed weight, so results can be explained.
 *
 * The same file is used in two places:
 *   1. By the Express server (server.js)      -> require('./public/js/engine.js')
 *   2. By the browser as an offline fallback  -> window.Der3Engine
 *
 * Privacy: this engine never opens, visits, or fetches any submitted link.
 * It only reads the text of the address.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Der3Engine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENGINE_NAME = 'Der3 simulated demo engine v1.3 (pattern-based)';
  var MAX_LENGTH = 5000;

  // Any request for these is high risk, whoever the sender claims to be.
  var OVERRIDE_SCORE = 85;   // deterministic score when a sensitive-data request is found
  var UNVERIFIED_FLOOR = 30; // minimum score when any warning sign is present ("Needs caution")

  /* ---------- Helpers ---------- */

  // Lower-case and simplify Arabic letters so one pattern can match common spellings
  // (Gulf, Egyptian and Modern Standard Arabic), and convert Arabic-Indic digits.
  function normalizeArabicLetters(s) {
    return s
      .replace(/[ً-ْـ]/g, '') // remove Arabic diacritics and tatweel
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي');
  }

  // Patterns are normalized the same way as the text, so "على" in a rule still
  // matches "علي" in normalized input.
  function normRe(re) { return new RegExp(normalizeArabicLetters(re.source), re.flags); }

  function normalize(text) {
    return normalizeArabicLetters(String(text).toLowerCase())
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ');
  }

  // Arabic has no \b in JS regex: match a word (with optional و/ب/ل/ف prefix and a
  // possessive ending such as ك/ه/ي) only when it stands on its own.
  function arWords(list) {
    return new RegExp('(?:^|[\\s،,:"\'«(\\-])(?:و|ب|ل|ف)?(?:' + list.map(normalizeArabicLetters).join('|') + ')(?:ك|ه|ي|كم|ها|هم|نا)?(?=$|[\\s،,:"\'»)?؟.!\\-])');
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function snippet(str) {
    var s = String(str).trim();
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }

  // Text is split into sentences so negation checks stay local.
  function splitSentences(text) {
    return text.split(/[.!?؟\n؛;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Same split, but remembers whether each sentence was a question ("…؟" / "…?").
  function splitWithQuestions(text) {
    return (text.match(/[^.!?؟\n؛;]+[.!?؟\n؛;]*/g) || []).map(function (s) {
      return { text: s.replace(/[.!?؟\n؛;]+$/, '').trim(), question: /[?؟]/.test(s) };
    }).filter(function (s) { return s.text; });
  }

  var NEGATION = /(\bnot\b|\bnever\b|\bdon'?t\b|\bdoesn'?t\b|\bwon'?t\b|(^|\s)لا(\s|$)|(^|\s)لن(\s|$)|عدم|ابدا)/;

  function levenshtein(a, b) {
    var m = a.length, n = b.length, i, j;
    if (!m) return n;
    if (!n) return m;
    var prev = [], cur = [];
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /* ---------- Text rules (calls + messages) ----------
   * id:        key used by the interface to show a plain-language explanation
   * weight:    points added to the risk score (negative = reassuring)
   * negatable: if true, sentences containing "not / never / لا / لن" are ignored
   */
  /* ---------- Sensitive-data requests ----------
   * A sentence is treated as a REQUEST for sensitive data when it names the data
   * AND contains a request word or ends with a question mark — in English,
   * Modern Standard / Gulf / Egyptian Arabic, or Latin-letter Egyptian ("ab3atly el code").
   * "Don't share your code" style warnings are ignored (negation just before the term).
   */
  var SENSITIVE = {
    // Unambiguous terms: any request cue (strong or polite) is enough.
    credentials: {
      en: /\b(otp|one[- ]?time (pass)?(code|password|pin)|verification code|verify code|security code|sms code|activation code|auth(entication)? code|passcode|password|passwd|pin( code| number)?|cvv2?|cvc|login details|username and password|card (number|details|info|information|data|no)|credit card (number|details)|debit card (number|details)|visa (card|details|number|info)|mastercard (number|details)|expiry date|expiration date|(3|three)[- ]digits?( code| number)?|el ?(code|otp|pin|visa|card|password)|rakam (el )?serr?y|(code|number|digits) (that )?(we|i) (just )?(sent|texted|messaged)( (to )?you)?|(code|number) you (just )?(got|received)|(text|sms) message code)\b/,
      ar: arWords(['الرقم السري', 'رقم سري', 'رقمك السري', 'الباسورد', 'باسورد', 'الباسوورد', 'كلمه السر', 'كلمه المرور', 'كود التحقق', 'كود التفعيل', 'كود الامان', 'كود الحمايه', 'رمز التحقق', 'رمز التفعيل', 'رمز الامان', 'رمز التاكيد', 'otp', 'او تي بي', 'cvv', 'سي في في', 'بيانات الفيزا', 'رقم الفيزا', 'بيانات الكارت', 'رقم الكارت', 'بيانات البطاقه', 'رقم البطاقه', 'رقم بطاقتك', 'بيانات بطاقتك', 'البطاقه الائتمانيه', 'بطاقه الائتمان', 'بطاقه الصراف', 'تاريخ الانتهاء', 'تاريخ انتهاء البطاقه', 'الثلاث ارقام', 'التلات ارقام', 'الارقام اللي ورا الكارت', 'الارقام اللي ورا البطاقه', 'الرقم اللي ورا الكارت', 'رقم التعريف الشخصي', 'الرقم الشخصي',
        // "the code/number we sent you" — only an OTP request talks like this
        'الرقم اللي بعتناه', 'الرقم اللي بعتناهولك', 'الرقم اللي ارسلناه', 'الرقم اللي وصلك', 'الرقم اللي جالك',
        'الكود اللي بعتناه', 'الكود اللي ارسلناه', 'الكود اللي وصلك', 'الكود اللي جالك', 'الكود اللي وصل',
        'الرمز اللي بعتناه', 'الرمز اللي ارسلناه', 'الرمز اللي وصلك', 'الرمز اللي جالك', 'الرمز الذي ارسلناه', 'الرمز الذي وصلك',
        'رساله التحقق', 'كود الرساله', 'رمز الرساله', 'الكود اللي في الرساله', 'الرقم اللي في الرساله'])
    },
    bankDetails: {
      en: /\b(bank (account|details|login|info)|account (number|details|info)|iban|sort code|routing number|online banking (login|password|details)|internet banking|banking app (login|password))\b/,
      ar: arWords(['بيانات حسابك', 'بيانات الحساب', 'بيانات حسابك البنكي', 'رقم الحساب', 'رقم حسابك', 'حسابك البنكي', 'الحساب البنكي', 'ايبان', 'الايبان', 'رقم الايبان', 'بيانات الدخول', 'اسم المستخدم', 'يوزر', 'اليوزر', 'بيانات البنك', 'بياناتك البنكيه'])
    }
  };
  // Generic words ("code", "card", "visa") count only with a clear request verb or a question.
  var SENSITIVE_GENERIC = {
    credentials: {
      en: /\b(code|codes|pin|visa|card)\b/,
      ar: arWords(['الكود', 'كود', 'الرمز', 'رمز', 'الفيزا', 'فيزا', 'فيزتك', 'الكارت', 'كارت', 'كارتك', 'بطاقتك', 'الماستر كارد', 'ماستر كارد'])
    }
  };
  // Arabic request verbs: a stem plus the spoken prefixes (ت/ي/ن/بت/هت/ح…) and
  // object endings (لي/لنا/ني/هولنا…), matched as whole words. This covers
  // "تبعت لنا", "تبعتلنا", "ابعتلنا", "تقولنا", "تقرالي", "تملي علينا", "تديني", "اكدلنا"…
  function arVerbs(stems) {
    return '(?:^|[\\s،,:"\'«(\\-])(?:و|ف)?(?:ت|ي|ن|بت|بي|بن|هت|هي|هن|ح)?(?:' + stems.map(normalizeArabicLetters).join('|') +
      ')(?:ي|ين|و|وا|ه|ها|هم|نا|ني|لي|لنا|لك|ولي|ولنا|يلي|يلنا|هولي|هولنا|هالي|هالنا|يني|ينا)?(?=$|[\\s،,.:"\'»)?؟!\\-])';
  }
  var AR_REQUEST_STEMS = [
    'ارسل', 'رسل', 'ابعت', 'بعت', 'ابعث', 'بعث', 'شارك', 'اعط', 'اعطي', 'عطي', 'اعطني', 'اعطيني', 'ادي', 'اديني', 'اديلي', 'ادني',
    'تدي', 'تديني', 'تدينا', 'تديلي', 'تديلنا', 'هات', 'قول', 'قل', 'اقرا', 'قرا', 'اقري', 'قري', 'املي', 'ملي', 'اكتب', 'كتب',
    'اكد', 'اكدل', 'ادخل', 'دخل', 'زود', 'حول', 'بلغ', 'ابلغ', 'اذكر', 'عايز', 'عاوز', 'محتاج', 'نحتاج', 'نريد', 'اريد',
    'ابغي', 'ابغا', 'نبغي', 'حدث', 'تحديث', 'نحدث', 'نطلب', 'نبي'
  ];
  var STRONG_CUE = new RegExp([
    "\\b(send|share|give|tell|read|confirm|provide|enter|type|say|reply|text|forward|need|require|verify|update|what('s| is)|ab3at|eb3at|ib3at|ba3at|ebaat|ab3atly|eb3atly|ba3atly|teb3at|teb3atly|2ol|2oly|2olli|2olna|olli|olna|eddini|edini|3ayez|3awez|3ayz|3awz)\\b",
    arVerbs(AR_REQUEST_STEMS)
  ].join('|'));
  var POLITE_CUE = /(\b(please|pls|plz|kindly|can you|could you|can i|may i|momken|mmkn|law sama7t)\b|ممكن|ممكنش|لو سمحت|لو سمحتي|من فضلك|رجاء|ارجو|يا ريت|ياريت)/;

  function negatedBefore(sentence, index) {
    return NEGATION.test(sentence.slice(Math.max(0, index - 25), index + 1));
  }

  function findTerm(sentence, re) {
    var m = sentence.match(re);
    if (!m) return null;
    var idx = m.index + (m[0].length - m[0].replace(/^[\s،,:"'«(\-]+/, '').length);
    return negatedBefore(sentence, idx) ? null : { text: m[0].trim(), index: idx };
  }

  function detectSensitive(sentences, found, signals, original) {
    ['credentials', 'bankDetails'].forEach(function (id) {
      for (var i = 0; i < sentences.length; i++) {
        var s = sentences[i];
        var strong = STRONG_CUE.test(s.text) || s.question;
        var polite = POLITE_CUE.test(s.text);
        var hit = (strong || polite) && (findTerm(s.text, SENSITIVE[id].en) || findTerm(s.text, SENSITIVE[id].ar));
        if (!hit && strong && SENSITIVE_GENERIC[id]) {
          hit = findTerm(s.text, SENSITIVE_GENERIC[id].en) || findTerm(s.text, SENSITIVE_GENERIC[id].ar);
        }
        if (hit) {
          found[id] = true;
          // Quote the user's own words (normalization does not change sentence breaks).
          var quote = original && original[i] ? original[i].text : s.text;
          signals.push({ id: id, weight: id === 'credentials' ? 40 : 35, critical: true, evidence: snippet(quote) });
          return;
        }
      }
    });
  }

  var TEXT_RULES = [
    {
      id: 'payment', weight: 30, negatable: true, critical: true,
      patterns: [
        /\b(gift ?cards?|itunes card|google play card|steam card|wire (transfer|the money)|bitcoin|crypto(currency)?|usdt|western union|moneygram|pay (a|the) (small )?(fee|fine|charge|penalty)|processing fee|release fee|customs fee|delivery fee|transfer (the )?money|send (me )?money|transfer now|money transfer|need (some )?money|7awel|7awelly)\b/,
        /(بطاقه هدايا|بطاقات هدايا|بطاقات شحن|كارت شحن|كروت شحن|كارت جوجل بلاي|كروت جوجل بلاي|حول المبلغ|حولي المبلغ|تحويل (مبلغ|المبلغ|الاموال|فلوس)|رسوم (جمركيه|شحن|توصيل|معالجه|رمزيه)|سداد رسوم|ادفع|بيتكوين|عمله رقميه|عملات رقميه|حواله|تحولي|تحول لي|حول لي|حوللي|حولي لي|ارسل لي مبلغ|ارسلي مبلغ|محتاج فلوس|محتاجه فلوس|عايز فلوس|عايزه فلوس|احتاج مبلغ|محتاج مبلغ|(ابعت|ابعتلي|ابعتي|ارسل|حول)[^.!?؟]{0,20}(فلوس|مبلغ|المبلغ|رصيد|على فودافون كاش|على انستاباي|على المحفظه))/
      ]
    },
    {
      id: 'threat', weight: 20, negatable: false,
      patterns: [
        // "will be closed" only counts when it is YOUR account/card/line — "the branch
        // will be closed on Friday" is a neutral notice, not a threat.
        /\b(suspend(ed)?|blocked|frozen|freeze|locked|arrest(ed)?|warrant|legal action|lawsuit|penalty|fined|a fine|deactivat(ed|e)|terminated|(account|card|service|line|number|wallet|sim|access|subscription)s? (will be|has been|is being|is) (closed|cancelled|canceled|deleted|blocked|disabled|terminated))\b/,
        /(ايقاف|موقوف|حظر|تجميد|سيتم اغلاق (حسابك|الحساب|بطاقتك|البطاقه|خطك|الخط|محفظتك|المحفظه|رقمك)|اغلاق حسابك|القبض|مذكره|غرامه|اجراء قانوني|اجراءات قانونيه|تعليق حسابك|سيتم حذف|سيتم ايقاف)/
      ]
    },
    {
      id: 'urgency', weight: 15, negatable: false,
      patterns: [
        /\b(urgent(ly)?|immediately|right now|act now|asap|final (notice|warning)|today only|last chance|expires? (today|soon|in)|within \d+ ?(hours?|hrs?|minutes?|mins?))\b/,
        /(عاجل|فورا|حالا|بسرعه|الان|اخر فرصه|اليوم فقط|قبل فوات|خلال \d+ ?(ساعه|ساعات|دقيقه|دقائق)|اخر تنبيه|انذار نهائي)/
      ]
    },
    {
      // A request to PAY something (a fee, a fine, an amount). Not critical on its own —
      // real bills exist — but it is content risk, and combined with urgency and a
      // suspicious link it becomes high risk (see "urgentPaymentLink" below).
      id: 'feeRequest', weight: 20, negatable: true,
      patterns: [
        /\b(pay|paying|settle|send|transfer)\b[^.!?\n]{0,40}?\b(fee|fees|charge|fine|penalty|amount|balance|\d+([.,]\d+)?\s?(egp|le|sar|aed|usd|gbp|eur|pounds?|riyals?|dirhams?|dollars?))\b/,
        /\b(re-?delivery|delivery|shipping|customs|processing|release|unlock|reactivation|activation|clearance|handling) (fee|charge|payment)s?\b/,
        /((ادفع|سدد|سداد|دفع|تدفع|حول|تحويل)[^.!?؟\n]{0,30}(رسوم|مبلغ|غرامه|فاتوره|جنيه|ريال|درهم|\d))/,
        /(رسوم (اعاده التوصيل|التوصيل|الشحن|الجمارك|الاستلام|التخليص|التفعيل))/
      ]
    },
    {
      // "Call us back on 0100…", "اتصل بنا على …": the sender supplies the number to use.
      // Verification must use a number the user finds independently.
      id: 'suppliedContact', weight: 15, negatable: true,
      patterns: [
        /\b(call|ring|contact|text|whatsapp|reach) (us|me|our (team|office|agent)|this number|back)\b[^.!?\n]{0,25}?(\+?\d[\d\s-]{6,}\d)/,
        /((اتصل|كلم|كلمنا|كلمني|تواصل|كلمونا|اتصلوا)[^.!?؟\n]{0,25}(\+?\d[\d\s-]{6,}\d))/
      ]
    },
    {
      id: 'prize', weight: 20, negatable: false,
      patterns: [
        /\b(you('ve| have)? won|winner|congratulations|prize|lottery|jackpot|free (gift|iphone|money|reward)|claim (your|now|it))\b/,
        /(مبروك|ربحت|فزت|جائزه|الفائز|السحب|هديه مجانيه|استلم جائزتك|مكافاه مجانيه)/
      ]
    },
    {
      id: 'secrecy', weight: 20, negatable: false,
      patterns: [
        /\b(don'?t tell|do not tell|keep (this|it) (a )?secret|between us|don'?t hang up|do not hang up|stay on the line|don'?t (call|contact) (your|the) bank)\b/,
        /(لا تخبر|لا تقل لاحد|لا تقول لاحد|سري للغايه|هذا سر|لا تغلق الخط|ابق على الخط|بيني وبينك)/
      ]
    },
    {
      id: 'remoteAccess', weight: 30, negatable: true, critical: true,
      patterns: [
        /\b(anydesk|any desk|teamviewer|team viewer|rustdesk|quick ?support|remote access|install (this|the|an|our)? ?app|download (this|the|our)? ?app|share (your )?screen|screen ?sharing|\.apk)\b/,
        /((ثبت|تثبيت|نزل|نزلي|تنزيل|حمل|حملي|تحميل)\s?(ال)?(تطبيق|برنامج|ابلكيشن|ابليكيشن)|انيديسك|اني ديسك|تيم فيور|تيم فيوير|مشاركه الشاشه|شير سكرين)/
      ]
    },
    {
      id: 'familyEmergency', weight: 20, negatable: false,
      patterns: [
        /\b(hi (mum|mom|dad|grandma|grandpa)|it'?s me|my new number|new number|lost my phone|broke my phone|i'?m in trouble|had an accident|in (the )?hospital|need money (urgently|now|fast|today))\b/,
        /(رقمي الجديد|هذا رقمي|انا في ورطه|تعرضت لحادث|في المستشفى|ضاع جوالي|انكسر جوالي|محتاج فلوس|احتاج مبلغ)/
      ]
    },
    {
      id: 'techScare', weight: 20, negatable: true,
      patterns: [
        /\b(virus|infected|malware|been hacked|is hacked|hacked)\b/,
        /(فيروس|مصاب|اختراق|مخترق)/
      ]
    },
    {
      id: 'robocall', weight: 10, negatable: false,
      patterns: [/\bpress (\d|one|two|nine)\b/, /(اضغط \d|اضغط على الرقم|اضغط الرقم)/]
    },
    {
      id: 'safetyAdvice', weight: 0, info: true, negatable: false,
      patterns: [
        /\b(never ask|will never|do not share|don'?t share|never share|we won'?t ask|do not give this code)\b/,
        /(لن نطلب|لا تشارك|لا تشاركه|لا تعطي|لن يطلب|لا نطلب|لا تفصح)/
      ]
    }
  ];

  /* ---------- Organization claims (identity) ----------
   * Naming a bank, delivery company, government office or brand is recorded
   * SEPARATELY as `identity` — it is never part of the risk score, never verifies
   * the sender, and never lowers risk. Only a claim COMBINED with a sensitive
   * request adds content risk ("brandPlusSensitive").
   */
  var ORG_KINDS = [
    { kind: 'bank', patterns: [
      /\b(your bank|the bank|bank of|national bank|bank security|banking|bank branch|card issuer|credit card (department|team)|fraud (department|team)|visa|mastercard|instapay|cib|nbe|qnb|hsbc|banque misr|al ?rajhi|el ?bank|bank)\b/,
      /(البنك|بنك|مصرف|المصرف|امن الحسابات|قسم الاحتيال|الراجحي|الانماء|الاهلي|بنك مصر|بنك القاهره|التجاري الدولي|سي اي بي|انستاباي|ميزه|مدي)/
    ] },
    { kind: 'delivery', patterns: [
      /\b(courier|delivery (company|service|team|driver)|post office|postal service|parcel|package|shipment|aramex|dhl|fedex|ups|bosta|smsa)\b/,
      /(البريد|شركه الشحن|شركه التوصيل|مندوب التوصيل|الطرد|طرد|شحنتك|الشحنه|ارامكس|سمسا|بوسطه)/
    ] },
    { kind: 'government', patterns: [
      /\b(ministry|government|tax (office|authority)|police|customs|immigration|court|social (security|insurance)|traffic (department|office))\b/,
      /(الوزاره|وزاره|جهه حكوميه|الجهات الحكوميه|الضرائب|الزكاه والضريبه|الشرطه|النيابه|المرور|الجوازات|التموين|الجمارك|المحكمه|التامينات|ابشر|نفاذ|توكلنا)/
    ] },
    { kind: 'company', patterns: [
      /\b(tech(nical)? support|customer (service|support|care)|calling from|i'?m from|this is \w+ from|microsoft|apple support|amazon|paypal|netflix|whatsapp support|vodafone|orange|etisalat|fawry|stc pay)\b/,
      /(شركه|الدعم الفني|خدمه العملاء|فودافون|اورنج|اتصالات|فوري|موبايلي|اس تي سي|معك [^\s]+ من|معاك [^\s]+ من|انا من)/
    ] }
  ];
  ORG_KINDS.forEach(function (k) { k.patterns = k.patterns.map(normRe); });

  function detectIdentity(text) {
    var kinds = [], evidence = '';
    ORG_KINDS.forEach(function (k) {
      for (var i = 0; i < k.patterns.length; i++) {
        var m = text.match(k.patterns[i]);
        if (m) { kinds.push(k.kind); if (!evidence) evidence = snippet(m[0]); break; }
      }
    });
    return kinds.length ? { claimed: true, verified: false, kinds: kinds, evidence: evidence } : null;
  }

  TEXT_RULES.forEach(function (rule) { rule.patterns = rule.patterns.map(normRe); });
  STRONG_CUE = normRe(STRONG_CUE);
  POLITE_CUE = normRe(POLITE_CUE);

  var URL_IN_TEXT =/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-z0-9][a-z0-9.-]*\.(com|net|org|info|xyz|top|ly|co|sa|io|click|live|site|online|shop|icu|buzz|link|me)(\/[^\s<>"']*)?)/gi;

  function analyzeText(type, raw) {
    var text = normalize(raw);
    var sentences = splitSentences(text);
    var signals = [];
    var found = {};

    detectSensitive(splitWithQuestions(text), found, signals, splitWithQuestions(String(raw).replace(/\s+/g, ' ')));

    TEXT_RULES.forEach(function (rule) {
      if (found[rule.id]) return;
      var pool = rule.negatable ? sentences : [text];
      for (var p = 0; p < rule.patterns.length && !found[rule.id]; p++) {
        for (var s = 0; s < pool.length; s++) {
          var m = pool[s].match(rule.patterns[p]);
          // "Do NOT share your code" is advice, not a request: skip if a negation
          // word appears in the 25 characters just before the match.
          if (m && rule.negatable && NEGATION.test(pool[s].slice(Math.max(0, m.index - 25), m.index + 3))) m = null;
          if (m) {
            found[rule.id] = true;
            signals.push({ id: rule.id, weight: rule.weight, critical: !!rule.critical, info: !!rule.info, evidence: snippet(m[0]) });
            break;
          }
        }
      }
    });

    // Links inside a message are checked with the link rules (text only, never opened).
    var links = String(raw).match(URL_IN_TEXT) || [];
    var worst = null;
    if (links.length) {
      signals.push({ id: 'containsLink', weight: 10, evidence: snippet(links[0]) });
      links.slice(0, 3).forEach(function (l) {
        var r = analyzeLink(l);
        if (r.ok && (!worst || r.score > worst.score)) worst = r;
      });
      if (worst && worst.score >= 30) {
        signals.push({ id: 'riskyLink', weight: clamp(Math.round(worst.score / 2), 15, 40), evidence: snippet(worst.input) });
      }
      // A link that is high-risk on its own (e.g. a login page on a raw IP address)
      // keeps that deterministic rating inside a message too.
      if (worst && worst.override) {
        signals.push({ id: worst.override.reason, weight: 30, critical: true, evidence: snippet(worst.input) });
      }
    }

    var asks = found.credentials || found.bankDetails || found.payment || found.remoteAccess;
    var pushes = found.urgency || found.threat || found.secrecy;
    if (asks && pushes) {
      signals.push({ id: 'pressureCombo', weight: 10, evidence: '' });
    }

    // URGENT PAYMENT REQUEST + SUSPICIOUS LINK → high risk (deterministic).
    // e.g. "Pay the redelivery fee within 24 hours: http://…top/pay".
    var paysAsked = found.payment || found.feeRequest;
    if (paysAsked && pushes && worst && worst.score >= 30 && !found.urgentPaymentLink) {
      signals.push({ id: 'urgentPaymentLink', weight: 30, critical: true, evidence: snippet(worst.input) });
    }

    // Naming a bank / company / office is recorded SEPARATELY (identity, 0 points):
    // it never verifies the sender and never lowers risk. Only together with a
    // request for private data or money is it content risk (impersonation).
    var identity = detectIdentity(text);
    if (identity && asks) signals.push({ id: 'brandPlusSensitive', weight: 15, evidence: identity.evidence });

    return finish(type, raw, signals, null, identity);
  }

  /* ---------- Link rules ---------- */

  var SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'cutt.ly', 'rb.gy', 'tiny.cc', 'shorturl.at', 'buff.ly', 'rebrand.ly', 't.ly', 's.id', 'v.gd'];
  var RISKY_TLDS = ['xyz', 'top', 'click', 'zip', 'mov', 'icu', 'buzz', 'live', 'rest', 'cam', 'gq', 'tk', 'ml', 'cf', 'ga', 'work', 'support', 'country', 'loan', 'win', 'shop', 'online', 'site'];
  var TWO_PART_SUFFIXES = ['com.sa', 'gov.sa', 'edu.sa', 'org.sa', 'net.sa', 'med.sa', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.eg', 'gov.eg', 'com.au', 'co.jp', 'com.br', 'co.in', 'gov.ae', 'co.ae', 'com.kw', 'com.qa', 'com.jo', 'com.tr'];
  // Well-known names that scammers like to copy, with their real website.
  var BRANDS = {
    paypal: 'paypal.com', apple: 'apple.com', amazon: 'amazon.com', microsoft: 'microsoft.com',
    google: 'google.com', netflix: 'netflix.com', facebook: 'facebook.com', instagram: 'instagram.com',
    whatsapp: 'whatsapp.com', aramex: 'aramex.com', fedex: 'fedex.com', absher: 'absher.sa',
    alrajhi: 'alrajhibank.com.sa', alrajhibank: 'alrajhibank.com.sa', stcpay: 'stcpay.com.sa',
    splonline: 'splonline.com.sa', icloud: 'icloud.com', outlook: 'outlook.com'
  };
  var BAIT_WORDS = ['login', 'signin', 'sign-in', 'verify', 'verification', 'secure', 'update', 'account', 'confirm', 'wallet', 'password', 'unlock', 'suspend', 'bonus', 'prize', 'gift', 'free', 'refund', 'payment', 'claim', 'reward'];
  var FILE_EXT = /\.(apk|exe|scr|bat|msi|cmd|jar|vbs|dmg|pkg)(\?|#|$)/i;
  var IP_LOGIN_WORDS = /(bank|banking|e-?bank|login|log-?in|logon|sign-?in|signin|account|verify|verification|secure|password|passwd|wallet|payment|card|otp|auth)/;

  function deLeet(s) {
    return s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/4/g, 'a').replace(/rn/g, 'm').replace(/vv/g, 'w');
  }

  function analyzeLink(rawInput) {
    var raw = String(rawInput || '').trim().replace(/^[<("']+|[>)"'.,;]+$/g, '');
    if (!raw) return { ok: false, error: 'empty' };
    if (/\s/.test(raw)) return { ok: false, error: 'invalidUrl' };

    var signals = [];

    if (/^(javascript|data|vbscript|file):/i.test(raw)) {
      signals.push({ id: 'dangerScheme', weight: 60, evidence: snippet(raw.split(':')[0] + ':') });
      return finish('link', raw, signals);
    }

    var hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    var u;
    try {
      u = new URL(hasScheme ? raw : 'http://' + raw);
    } catch (e) {
      return { ok: false, error: 'invalidUrl' };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      signals.push({ id: 'dangerScheme', weight: 60, evidence: u.protocol });
      return finish('link', raw, signals);
    }

    var host = u.hostname.toLowerCase().replace(/\.$/, '');
    var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.charAt(0) === '[';
    if (!isIp && (host.indexOf('.') === -1 || /\.$/.test(host))) return { ok: false, error: 'invalidUrl' };

    var labels = host.split('.');
    var lastTwo = labels.slice(-2).join('.');
    var n = TWO_PART_SUFFIXES.indexOf(lastTwo) !== -1 ? 3 : 2;
    var registered = isIp ? host : labels.slice(-n).join('.');
    var core = isIp ? host : (labels[labels.length - n] || '');
    var subs = isIp ? [] : labels.slice(0, -n).filter(function (l) { return l !== 'www'; });
    var tld = labels[labels.length - 1];
    var lowerFull = raw.toLowerCase();

    if (isIp) signals.push({ id: 'ipHost', weight: 35, evidence: host });
    // RAW IP ADDRESS + BANK / LOGIN PAGE → high risk (deterministic). Real banks and
    // sign-in pages use a name, never just numbers.
    if (isIp) {
      var pathWords = (u.pathname + ' ' + u.search).toLowerCase().match(IP_LOGIN_WORDS);
      if (pathWords) signals.push({ id: 'ipLogin', weight: 30, critical: true, evidence: snippet(host + u.pathname), vars: { word: pathWords[0] } });
    }

    if (u.username || u.password || /^[^/?#]*@/.test(raw.replace(/^[a-z]+:\/\//i, ''))) {
      signals.push({ id: 'userinfo', weight: 45, evidence: snippet(raw.replace(/^[a-z]+:\/\//i, '').split('/')[0]) });
    }

    if (SHORTENERS.indexOf(host.replace(/^www\./, '')) !== -1) {
      signals.push({ id: 'shortener', weight: 35, evidence: host });
    }

    if (host.indexOf('xn--') !== -1) signals.push({ id: 'punycode', weight: 35, evidence: host });
    else if (/[^\x00-\x7F]/.test(raw.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0])) {
      signals.push({ id: 'nonAscii', weight: 25, evidence: snippet(raw.split(/[/?#]/)[hasScheme ? 2 : 0] || raw) });
    }

    // Brand checks
    var officialMatch = null;
    var brandHit = null;
    if (!isIp) {
      Object.keys(BRANDS).forEach(function (brand) {
        var official = BRANDS[brand];
        var isOfficial = host === official || host.slice(-(official.length + 1)) === '.' + official;
        if (isOfficial) { officialMatch = official; return; }
        if (brandHit) return;
        if (host.indexOf(brand) !== -1) {
          brandHit = { id: 'brandMisuse', weight: 40, evidence: host, vars: { brand: brand, domain: registered } };
          return;
        }
        var cleaned = deLeet(core);
        var dist = levenshtein(core, brand);
        var limit = brand.length >= 7 ? 2 : 1;
        if (brand.length >= 5 && core !== brand && (cleaned === brand || cleaned.indexOf(brand) !== -1 || dist <= limit)) {
          brandHit = { id: 'lookalike', weight: 60, evidence: registered, vars: { brand: official, domain: registered } };
        }
      });
    }
    if (officialMatch) {
      signals.push({ id: 'knownOfficial', weight: 0, info: true, evidence: host, vars: { domain: officialMatch } });
    } else if (brandHit) {
      signals.push(brandHit);
    }

    if (u.protocol === 'http:' && hasScheme) signals.push({ id: 'noHttps', weight: 10, evidence: 'http://' });
    if (subs.length >= 3) signals.push({ id: 'subdomains', weight: 15, evidence: host });
    if (!isIp && RISKY_TLDS.indexOf(tld) !== -1) signals.push({ id: 'badTld', weight: 15, evidence: '.' + tld, vars: { tld: '.' + tld } });
    if ((core.match(/-/g) || []).length >= 2 || (host.match(/-/g) || []).length >= 3) signals.push({ id: 'hyphens', weight: 10, evidence: host });

    var bait = BAIT_WORDS.filter(function (w) { return lowerFull.indexOf(w) !== -1; });
    if (bait.length) signals.push({ id: 'baitWords', weight: Math.min(30, bait.length * 10), evidence: bait.slice(0, 3).join(', '), vars: { words: bait.slice(0, 3).join(', ') } });

    if (raw.length > 100) signals.push({ id: 'longUrl', weight: 10, evidence: raw.length + ' characters' });
    if (u.port && u.port !== '80' && u.port !== '443') signals.push({ id: 'oddPort', weight: 15, evidence: ':' + u.port });
    var ext = u.pathname.match(FILE_EXT);
    if (ext) signals.push({ id: 'fileDownload', weight: 35, evidence: ext[0].replace(/[?#]$/, ''), vars: { ext: ext[0].replace(/[?#]$/, '') } });
    if ((raw.match(/%[0-9a-f]{2}/gi) || []).length >= 5) signals.push({ id: 'encoded', weight: 10, evidence: snippet(u.pathname + u.search) });
    if (/(=|\/)(https?(:|%3a)|www\.)/i.test(u.pathname + u.search)) signals.push({ id: 'redirect', weight: 15, evidence: snippet(u.search || u.pathname) });

    return finish('link', raw, signals, { host: host, registered: registered });
  }

  /* ---------- Scoring, verdict, next steps ---------- */

  var STEPS = {
    call: {
      scam: ['hangUp', 'noShare', 'callOfficial', 'trusted', 'report'],
      caution: ['pause', 'verify', 'noShare', 'trusted'],
      safe: ['stillCareful', 'officialChannels', 'trusted']
    },
    message: {
      scam: ['stop', 'noShare', 'callOfficial', 'trusted', 'report', 'delete'],
      caution: ['pause', 'verify', 'noShare', 'trusted'],
      safe: ['stillCareful', 'officialChannels', 'trusted']
    },
    link: {
      scam: ['dontOpen', 'typeYourself', 'noShare', 'trusted', 'report'],
      caution: ['dontOpenYet', 'typeYourself', 'trusted'],
      safe: ['notGuarantee', 'typeYourself', 'stillCareful']
    }
  };

  function sumWeights(signals) { return signals.reduce(function (sum, s) { return sum + s.weight; }, 0); }

  function finish(type, raw, signals, meta, identity) {
    var len = String(raw).trim().length;
    var verdict, score, confidence;
    var override = null;

    // 1) DETERMINISTIC HIGH-RISK OVERRIDE — checked BEFORE any score threshold.
    //    A request for an OTP / verification code / PIN / password / CVV / card number /
    //    banking login, money or a remote-access app is ALWAYS "Likely scam", whatever
    //    organization the sender names and however polite or official it sounds.
    var critical = signals.filter(function (s) { return s.critical; });
    if (critical.length) {
      var lift = OVERRIDE_SCORE - sumWeights(signals);
      if (lift > 0) signals.push({ id: 'sensitiveOverride', weight: lift, evidence: '' });
      override = { reason: critical[0].id, phrase: critical[0].evidence };
      score = Math.max(OVERRIDE_SCORE, clamp(Math.round(sumWeights(signals)), 0, 100));
      verdict = 'scam';
      confidence = 'high';
    } else {
      // 2) Normal scoring. Any warning sign at all means at least "Needs caution".
      score = clamp(Math.round(sumWeights(signals)), 0, 100);
      if (score > 0 && score < UNVERIFIED_FLOOR) {
        signals.push({ id: 'safetyFloor', weight: UNVERIFIED_FLOOR - score, evidence: '' });
        score = UNVERIFIED_FLOOR;
      }
      verdict = score >= 60 ? 'scam' : score >= 30 ? 'caution' : 'safe';
      var warnings = signals.filter(function (s) { return s.weight > 0; }).length;
      if (type !== 'link' && len < 25) confidence = 'low';
      else if (verdict === 'scam') confidence = warnings >= 3 || score >= 85 ? 'high' : 'medium';
      else if (verdict === 'caution') confidence = 'medium';
      else confidence = warnings === 0 && (type === 'link' || len >= 40) ? 'medium' : 'low';

      // 3) Never show a green "Likely safe" when the evidence is thin.
      if (verdict === 'safe' && confidence === 'low') {
        signals.push({ id: 'lowConfidence', weight: UNVERIFIED_FLOOR - score, evidence: '' });
        score = UNVERIFIED_FLOOR;
        verdict = 'caution';
      }
    }

    signals.sort(function (a, b) { return b.weight - a.weight; });

    return {
      ok: true,
      type: type,
      input: String(raw).slice(0, 300),
      verdict: verdict,
      score: score,
      confidence: confidence,
      override: override,
      signals: signals,
      // Organization claim, reported SEPARATELY from the risk score. Always unverified.
      identity: identity || null,
      steps: STEPS[type][verdict],
      meta: Object.assign({ engine: ENGINE_NAME, simulated: true }, meta || {})
    };
  }

  function analyze(type, input) {
    if (['call', 'message', 'link'].indexOf(type) === -1) return { ok: false, error: 'badType' };
    if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'empty' };
    if (input.length > MAX_LENGTH) return { ok: false, error: 'tooLong' };
    if (type === 'link') return analyzeLink(input);
    if (input.trim().length < 8) return { ok: false, error: 'tooShort' };
    return analyzeText(type, input);
  }

  return { analyze: analyze, ENGINE_NAME: ENGINE_NAME, MAX_LENGTH: MAX_LENGTH };
});
