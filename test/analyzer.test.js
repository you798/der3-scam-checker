// Regression tests for the Der3 demo analyzer and caller number check.
// Run with:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const engine = require(path.join(__dirname, '..', 'public', 'js', 'engine.js'));
const numberCheck = require(path.join(__dirname, '..', 'public', 'js', 'number-check.js'));
const numberList = require(path.join(__dirname, '..', 'public', 'js', 'verified-numbers.js'));
global.window = {};
require(path.join(__dirname, '..', 'public', 'js', 'samples.js'));
const samples = global.window.Der3Samples.checker;

function ids(r) { return r.signals.map((s) => s.id); }

// ---- Sensitive-data requests must ALWAYS be "Likely scam" ----
const MUST_BE_SCAM = [
  ['call', 'أنا يوسف من شركة البنك الأهلي ممكن بيانات الفيزا؟'], // reported false negative
  ['call', 'معاك محمد من بنك مصر، ابعتلي الكود اللي جالك على الموبايل'],
  ['call', 'ممكن الرقم السري بتاع الكارت عشان نحدث بياناتك'],
  ['call', 'حضرتك ممكن تقولي التلات ارقام اللي ورا الكارت؟'],
  ['call', 'عايزين بيانات حسابك عشان نفعل الخدمة'],
  ['call', 'معك خدمة العملاء، أعطني رمز التحقق من فضلك'],
  ['call', 'من فضلك ابعت الـOTP اللي وصلك'],
  ['call', 'ابعتلي ٥٠٠ جنيه على فودافون كاش ضروري'],
  ['message', 'عميلنا العزيز يرجى تحديث بيانات البطاقة لتجنب الإيقاف'],
  ['call', 'Hi, I am calling from your bank, can you confirm your card details and CVV?'],
  ['call', 'This is Sara from Al Rajhi, what is the OTP you just received?'],
  ['call', 'Could you tell me your PIN please'],
  ['call', 'Please install AnyDesk so we can secure your account'],
  ['message', 'pls send me el OTP code'],
  ['call', 'ab3atly el code elly gālak']
];

for (const [type, text] of MUST_BE_SCAM) {
  test(`sensitive request is high risk: ${text}`, () => {
    const r = engine.analyze(type, text);
    assert.equal(r.ok, true);
    assert.equal(r.verdict, 'scam', `got ${r.verdict} ${r.score} ${ids(r)}`);
    assert.ok(r.score >= 75);
  });
}

test('reported case explains the card-data request, impersonation, and the unverified identity', () => {
  const r = engine.analyze('call', 'أنا يوسف من شركة البنك الأهلي ممكن بيانات الفيزا؟');
  for (const id of ['credentials', 'brandPlusSensitive']) assert.ok(ids(r).includes(id), `missing ${id}`);
  assert.equal(r.identity.claimed, true);
  assert.equal(r.identity.verified, false);
  assert.ok(r.identity.kinds.includes('bank'));
});

// ---- Deterministic high-risk override (reported live false negative) ----
const EXACT_AR = 'أمن البنك ممكن تبعت لنا الرمز اللي أرسلناه لحضرتك؟';
const EXACT_EN = 'I’m from your bank; please read me the code we sent you';

for (const text of [EXACT_AR, EXACT_AR.replace('؟', ''), EXACT_EN, EXACT_EN.replace('’', "'")]) {
  test(`override: ${text}`, () => {
    const r = engine.analyze('call', text);
    assert.equal(r.verdict, 'scam', `got ${r.verdict} ${r.score} ${ids(r)}`);
    assert.ok(r.score >= 85, `score ${r.score}`);
    assert.equal(r.confidence, 'high');
    assert.ok(r.override, 'override must be set');
    assert.equal(r.override.reason, 'credentials');
    assert.ok(r.override.phrase.length > 0, 'matched phrase must be shown');
  });
}

test('override quotes the caller’s own words', () => {
  const r = engine.analyze('call', EXACT_AR);
  assert.ok(r.override.phrase.includes('الرمز'), r.override.phrase);
});

const EGYPTIAN_VARIANTS = [
  'معاك البنك، تبعتلنا الكود اللي وصلك',
  'ابعتلنا كود التحقق لو سمحت',
  'ممكن تقولنا الرقم اللي بعتناه لحضرتك',
  'حضرتك تملي علينا رمز التحقق',
  'من البنك، ممكن تقرالي الكود',
  'محتاجين بيانات الفيزا علشان التحديث',
  'قولنا الـOTP بسرعة',
  'اكدلنا الـ PIN',
  'ممكن تديني الـCVV اللي ورا الكارت',
  'Bank security here. Can you share the SMS code',
  'Please confirm the CVV on the back of your card'
];
for (const text of EGYPTIAN_VARIANTS) {
  test(`override variant: ${text}`, () => {
    const r = engine.analyze('call', text);
    assert.equal(r.verdict, 'scam', `got ${r.verdict} ${r.score} ${ids(r)}`);
    assert.ok(r.score >= 85);
    assert.ok(r.override);
  });
}

// ---- Neutral mentions of a bank are NOT automatically scams ----
const NEUTRAL_BANK = [
  'Your bank branch will be closed on Friday for the holiday.',
  'فرع البنك سيكون مغلقاً يوم الجمعة بمناسبة العيد.',
  'ذهبت إلى البنك اليوم لأسأل عن ساعات العمل الجديدة.',
  'I visited the bank this morning to ask about opening hours.'
];
for (const text of NEUTRAL_BANK) {
  test(`neutral bank mention gets no risk points, but identity stays "not verified": ${text}`, () => {
    const r = engine.analyze('message', text);
    assert.notEqual(r.verdict, 'scam', `got ${r.verdict} ${r.score} ${ids(r)}`);
    assert.equal(r.override, null);
    assert.equal(r.score, 0, 'mentioning a bank must not add risk points');
    assert.ok(r.identity && r.identity.claimed && !r.identity.verified, 'identity is reported separately, unverified');
    assert.ok(r.identity.kinds.includes('bank'));
  });
}

// ---- Organization names never verify identity and never reduce risk ----
test('naming a real organization never lowers the score', () => {
  const plain = engine.analyze('message', 'Please send the verification code you just received to this number.');
  const branded = engine.analyze('message', 'This is Banque Misr. Please send the verification code you just received to this number.');
  assert.equal(branded.verdict, 'scam');
  assert.ok(branded.score >= plain.score, `${branded.score} < ${plain.score}`);
  assert.ok(ids(branded).includes('brandPlusSensitive'));
});

test('organization kinds are detected for the verification guide', () => {
  assert.deepEqual(engine.analyze('message', 'Your parcel from Aramex is waiting at the depot for collection.').identity.kinds, ['delivery']);
  assert.ok(engine.analyze('call', 'معاك مصلحة الضرائب بخصوص الإقرار الضريبي السنوي بتاعك').identity.kinds.includes('government'));
  assert.equal(engine.analyze('message', 'See you at dinner tonight, I will bring the dessert.').identity, null);
});

// ---- New general rules ----
test('urgent payment request + suspicious link is high risk (general, not one string)', () => {
  for (const text of [
    'Your package could not be delivered. Pay the 2.50 shipping fee within 12 hours: http://redeliver-now.click/pay',
    'Final notice: settle the 35 EGP customs charge today at http://customs-clear.xyz/eg',
    'شحنتك متوقفة. ادفع رسوم الشحن 25 جنيه خلال 24 ساعة عبر الرابط http://track-parcel.top/pay'
  ]) {
    const r = engine.analyze('message', text);
    assert.equal(r.verdict, 'scam', `${text}: ${r.verdict} ${r.score} ${ids(r)}`);
    assert.ok(ids(r).includes('urgentPaymentLink'), text);
  }
});

test('raw IP address + bank/login path is high risk, in links and inside messages', () => {
  for (const url of ['http://198.51.100.7/secure/login', 'https://203.0.113.9/ebank/account?id=1', '192.0.2.44/signin.php']) {
    const r = engine.analyze('link', url);
    assert.equal(r.verdict, 'scam', `${url}: ${r.verdict} ${r.score}`);
    assert.equal(r.override.reason, 'ipLogin');
  }
  const m = engine.analyze('message', 'Please check your statement here: http://198.51.100.7/bank/login');
  assert.equal(m.verdict, 'scam');
});

test('neutral notices stay neutral; threats about YOUR account still count', () => {
  assert.equal(engine.analyze('message', 'Your bill of 250 EGP is ready. You can pay it before the 15th of the month.').verdict, 'safe');
  assert.ok(ids(engine.analyze('message', 'Your account will be closed today unless you update your details.')).includes('threat'));
  assert.ok(ids(engine.analyze('message', 'سيتم اغلاق حسابك اليوم إذا لم تحدث بياناتك')).includes('threat'));
  assert.ok(!ids(engine.analyze('message', 'سيتم اغلاق الفرع يوم الجمعة بمناسبة العيد')).includes('threat'));
});

test('genuine uncertainty is still "Needs caution" — nothing is forced to safe', () => {
  const cases = [
    ['link', 'http://198.51.100.7/'],                                                       // raw IP, no login path
    ['message', 'Please pay the outstanding balance of 250 EGP to keep your service running.'], // payment request, no link
    ['message', 'Please settle the balance via https://pay-portal-billing.online/account'],  // payment + suspicious link, no urgency
    ['call', 'This is your bank. Please call us back on 0100 555 0199 about your account.'], // claim + supplied number
    ['call', 'أنا من البنك الأهلي']                                                          // too short to judge
  ];
  for (const [type, text] of cases) {
    const r = engine.analyze(type, text);
    assert.equal(r.verdict, 'caution', `${text}: ${r.verdict} ${r.score} ${ids(r)}`);
  }
});

// ---- Thin evidence is never green ----
test('low-confidence text is "Needs caution", not "Likely safe"', () => {
  const r = engine.analyze('message', 'Hi, how are you today?');
  assert.equal(r.verdict, 'caution');
});

test('short Arabic stems do not match inside other words', () => {
  // "انتقل" contains "قل" — it must not be read as a request verb.
  const r = engine.analyze('message', 'انتقل الكود إلى الفرع الجديد بسهولة وبدون أي مشاكل');
  assert.notEqual(r.verdict, 'scam');
});

// ---- Naming an organization is never "safe" and never lowers the score ----
test('organization claim alone needs caution', () => {
  const r = engine.analyze('call', 'أنا من البنك الأهلي');
  assert.equal(r.verdict, 'caution');
});

test('reassuring words never lower the score', () => {
  const r = engine.analyze('call', 'This is your bank. We will never ask for your password. Please read me the verification code.');
  assert.equal(r.verdict, 'scam');
  assert.ok(r.signals.every((s) => s.weight >= 0), 'no signal may subtract points');
});

// ---- Genuine messages stay safe ----
const MUST_BE_SAFE = [
  ['call', 'Hello, this is the receptionist at the family health clinic. Reminder of your appointment with Dr. Sara on Tuesday at 10 in the morning.'],
  ['call', 'مرحباً، معك موظفة الاستقبال في مركز صحة الأسرة. أتصل لتذكيرك بموعدك مع الدكتورة سارة يوم الثلاثاء الساعة العاشرة صباحاً.'],
  ['message', 'Your verification code is 482913. Do not share this code with anyone. We will never call you to ask for it.'],
  ['message', 'رمز التحقق الخاص بك هو 482913. لا تشارك هذا الرمز مع أي شخص. لن نطلب منك هذا الرمز في أي مكالمة.']
];

test('"أثبت" (prove) is not read as "install an app"', () => {
  const r = engine.analyze('message', 'أثبت حضورك في الاجتماع غداً الساعة 5');
  assert.ok(!ids(r).includes('remoteAccess'));
  assert.notEqual(r.verdict, 'scam');
});
for (const [type, text] of MUST_BE_SAFE) {
  test(`genuine message stays safe: ${text.slice(0, 40)}`, () => {
    assert.equal(engine.analyze(type, text).verdict, 'safe');
  });
}

// ---- One-click examples keep their labels ----
for (const type of ['call', 'message', 'link']) {
  samples[type].forEach((s) => {
    for (const lang of ['en', 'ar']) {
      test(`example ${type}/${lang}: ${s.label.en}`, () => {
        const r = engine.analyze(type, s.text[lang]);
        assert.equal(r.verdict, s.kind === 'scam' ? 'scam' : 'safe');
      });
    }
  });
}

// ---- Caller number check ----
test('unknown number is "unknown", never safe', () => {
  const r = numberCheck.checkNumber('+20 100 123 4567', numberList);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'unknown');
  assert.ok(r.notes.includes('spoofing'));
  assert.equal(r.mode, 'demo');
});

test('listed demo number still carries a spoofing warning', () => {
  const r = numberCheck.checkNumber('+1 (202) 555-0143', numberList);
  assert.equal(r.status, 'listed');
  assert.equal(r.entry.demo, true);
  assert.ok(r.notes.includes('spoofing'));
});

test('hidden caller and invalid input', () => {
  assert.equal(numberCheck.checkNumber('رقم خاص', numberList).status, 'hidden');
  assert.equal(numberCheck.checkNumber('abc', numberList).ok, false);
  assert.equal(numberCheck.checkNumber('', numberList).error, 'empty');
});

// ---- "I'm on a call right now" guided check ----
const onCall = require(path.join(__dirname, '..', 'public', 'js', 'on-call.js'));
global.window = global.window || {};
require(path.join(__dirname, '..', 'public', 'js', 'i18n.js'));
const I18N = global.window.Der3I18n;

test('on-call: any "Yes" is High risk', () => {
  for (const q of onCall.QUESTIONS) {
    const a = { sensitive: 'no', pressure: 'unsure', control: 'no' };
    a[q] = 'yes';
    assert.equal(onCall.assess(a).level, 'high', q);
  }
  assert.equal(onCall.assess({ sensitive: 'yes' }).level, 'high', 'yes counts even before all are answered');
});

test('on-call: any "Not sure" (and no Yes) is Pause and verify, never safe', () => {
  assert.equal(onCall.assess({ sensitive: 'no', pressure: 'unsure', control: 'no' }).level, 'verify');
  assert.equal(onCall.assess({ sensitive: 'unsure', pressure: 'unsure', control: 'unsure' }).level, 'verify');
});

test('on-call: all "No" is not called safe; unanswered is incomplete', () => {
  assert.equal(onCall.assess({ sensitive: 'no', pressure: 'no', control: 'no' }).level, 'noSigns');
  assert.equal(onCall.assess({ sensitive: 'no' }).level, 'incomplete');
  assert.equal(onCall.assess({}).level, 'incomplete');
  assert.equal(onCall.assess({ sensitive: 'hacked' }).answers.sensitive, null, 'unknown values are ignored');
  for (const lang of ['en', 'ar']) {
    for (const lvl of ['high', 'verify', 'noSigns', 'incomplete']) {
      assert.ok(!/\bsafe\b/i.test(I18N[lang]['ocLevel_' + lvl]), `${lang} ${lvl} must not say safe`);
    }
  }
});

test('on-call: summary has only the level and sign types, in both languages', () => {
  const r = onCall.assess({ sensitive: 'yes', pressure: 'unsure', control: 'no' });
  for (const lang of ['en', 'ar']) {
    const t = (k) => I18N[lang][k];
    const s = onCall.buildSummary(r, t);
    assert.ok(s.includes(t('ocSumLevel_high')));
    assert.ok(s.includes(t('ocSumSign_sensitive')));
    assert.ok(s.includes(t('ocSumSign_pressure')));
    assert.ok(!s.includes(t('ocSumSign_control')), 'a "No" answer is not listed');
    assert.ok(!/\d{4,}/.test(s), 'no numbers, codes, or phone numbers');
    assert.ok(!s.includes('undefined'));
  }
});

test('on-call: every on-call key exists in both languages', () => {
  const en = Object.keys(I18N.en).filter((k) => k.startsWith('oc'));
  const ar = Object.keys(I18N.ar).filter((k) => k.startsWith('oc'));
  assert.deepEqual(en.sort(), ar.sort());
  assert.equal(I18N.en.ocScript, 'I won’t share any codes. I’m ending this call and contacting the organization using its official number.');
});

// ---- Read result aloud ----
const readAloud = require(path.join(__dirname, '..', 'public', 'js', 'read-aloud.js'));
function tr(lang) {
  return (k, vars) => {
    let s = I18N[lang][k] != null ? I18N[lang][k] : k;
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.split('{' + n + '}').join(v);
    return s;
  };
}

test('read aloud: checker summary has verdict, signs, next step — and no user text', () => {
  const r = engine.analyze('call', EXACT_AR);
  for (const lang of ['en', 'ar']) {
    const s = readAloud.checkerSummary(r, tr(lang), lang);
    assert.ok(s.includes(I18N[lang].verdict_scam), s);
    assert.ok(s.includes(I18N[lang].overrideAdvice_credentials), 'override advice is the next step');
    assert.ok(!s.includes('أرسلناه'), 'the caller’s words are not read back');
    assert.ok(!/\{\w+\}/.test(s), 'no unfilled placeholders');
  }
  const safe = engine.analyze('message', MUST_BE_SAFE[2][1]);
  assert.ok(readAloud.checkerSummary(safe, tr('en'), 'en').includes(I18N.en.speakNoSigns));
});

test('read aloud: on-call summary includes the level and the script', () => {
  const r = onCall.assess({ sensitive: 'yes', pressure: 'no', control: 'unsure' });
  for (const lang of ['en', 'ar']) {
    const s = readAloud.onCallSummary(r, tr(lang), lang);
    assert.ok(s.includes(I18N[lang].ocLevel_high));
    assert.ok(s.includes(I18N[lang].ocScript));
    assert.ok(!/\{\w+\}/.test(s));
  }
});

test('read aloud: speech is split into short chunks', () => {
  const long = ('This is a sentence that keeps going and going without stopping at all ').repeat(8) + '. Next. التالي؟ نعم.';
  const parts = readAloud.chunks(long, 180);
  assert.ok(parts.length >= 4);
  assert.ok(parts.every((p) => p.length <= 180 && p.length > 0));
});

test('read aloud: picks a voice in the selected language or none', () => {
  const voices = [
    { name: 'US', lang: 'en-US', localService: true },
    { name: 'Saudi', lang: 'ar-SA', localService: false },
    { name: 'Egypt', lang: 'ar_EG', localService: true }
  ];
  assert.equal(readAloud.pickVoice(voices, 'ar').name, 'Egypt');
  assert.equal(readAloud.pickVoice(voices, 'en').name, 'US');
  assert.equal(readAloud.pickVoice([{ lang: 'en-GB' }], 'ar'), null, 'no Arabic voice → null, never an English voice');
  assert.equal(readAloud.pickVoice([], 'en'), null);
});

// ---- Check a screenshot ----
const shot = require(path.join(__dirname, '..', 'public', 'js', 'screenshot.js'));

test('screenshot: OCR quality — clear, low, empty', () => {
  const clear = 'Your verification code is 482913. Do not share this code with anyone.';
  assert.equal(shot.assessOcr({ text: clear, confidence: 91 }).quality, 'ok');
  assert.equal(shot.assessOcr({ text: clear, confidence: 42 }).quality, 'low', 'low confidence');
  assert.equal(shot.assessOcr({ text: 'Hi there ok', confidence: 95 }).quality, 'low', 'too little text');
  assert.equal(shot.assessOcr({ text: ' | ~ — . ', confidence: 90 }).quality, 'empty', 'noise only');
  assert.equal(shot.assessOcr({ text: '', confidence: 0 }).quality, 'empty');
  assert.equal(shot.assessOcr({ text: 'رمز التحقق الخاص بك هو ٤٨٢٩١٣ لا تشاركه مع أحد', confidence: 88 }).quality, 'ok', 'Arabic counts');
});

test('screenshot: an unclear screenshot is never "Likely safe"', () => {
  const genuine = engine.analyze('message', MUST_BE_SAFE[2][1]);
  assert.equal(genuine.verdict, 'safe');
  for (const q of ['low', 'empty']) {
    const r = shot.applyOcrSafety(genuine, q);
    assert.equal(r.verdict, 'caution', q);
    assert.ok(r.score >= 30);
    assert.ok(ids(r).includes('ocrUnclear'));
    assert.equal(r.meta.source, 'screenshot');
  }
  assert.equal(genuine.verdict, 'safe', 'engine result is not mutated');
  assert.equal(shot.applyOcrSafety(genuine, 'ok').verdict, 'safe', 'a clearly read genuine message may be safe');
});

test('screenshot: scam text from OCR keeps its high-risk verdict, incl. visible links', () => {
  const ocr = 'Your account is suspended. Verify now: http://secure-bank-verify.xyz/login and send the OTP code';
  const r = shot.applyOcrSafety(engine.analyze('message', shot.cleanText(ocr)), 'low');
  assert.equal(r.verdict, 'scam');
  assert.ok(ids(r).includes('containsLink'));
  assert.ok(ids(r).includes('ocrUnclear'));
});

test('screenshot: invisible direction marks from OCR are removed', () => {
  const raw = 'يرجى تحديث بيانات البطاقة\n‎bank-update-eg.com/verify‏\n\n\n\nوأرسل الرمز';
  const clean = shot.cleanText(raw);
  assert.ok(!/[‎‏]/.test(clean));
  assert.ok(clean.includes('\nbank-update-eg.com/verify\n'));
  assert.ok(!clean.includes('\n\n\n'));
});

test('screenshot: only image files under the size limit are accepted', () => {
  assert.equal(shot.checkFile({ type: 'image/png', size: 1000 }).ok, true);
  assert.equal(shot.checkFile({ type: 'application/pdf', size: 1000 }).error, 'type');
  assert.equal(shot.checkFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 }).error, 'size');
  assert.equal(shot.checkFile(null).error, 'none');
});

// ---- Trust circle ----
const trust = require(path.join(__dirname, '..', 'public', 'js', 'trust.js'));

test('trust: phone numbers are normalized and validated', () => {
  assert.equal(trust.normalizePhone('+20 100-123 4567'), '+201001234567');
  assert.equal(trust.normalizePhone('0020 (100) 123 4567'), '+201001234567');
  assert.equal(trust.normalizePhone('٠١٠٠ ١٢٣ ٤٥٦٧'), '01001234567');
  assert.equal(trust.normalizePhone('call me'), null);
  assert.equal(trust.normalizePhone('12'), null);
  assert.equal(trust.normalizePhone('1234567890123456'), null);
  assert.equal(trust.telHref('+20 100 123 4567'), 'tel:+201001234567');
  assert.deepEqual(trust.validate({ name: '  ', phone: 'x' }).errors, { name: 'empty', phone: 'invalid' });
  assert.equal(trust.validate({ name: 'سارة <b>', phone: '0100 123 4567' }).contact.name, 'سارة b');
});

test('trust: stored data is parsed defensively', () => {
  assert.deepEqual(trust.parseStored('not json'), []);
  assert.deepEqual(trust.parseStored('{"a":1}'), []);
  const list = trust.parseStored(JSON.stringify([{ id: 'a', name: 'Mona', phone: '+20 111' }, { name: '', phone: '1' }, null]));
  assert.equal(list.length, 1);
  assert.equal(list[0].phone, '+20111');
});

test('trust: the shared alert has no transcript, checked number, or names', () => {
  for (const lang of ['en', 'ar']) {
    for (const kind of ['call', 'message', 'link', 'screenshot', 'oncall']) {
      const alert = trust.buildAlert(kind, tr(lang));
      assert.ok(alert.length > 20 && !/\{\w+\}/.test(alert), alert);
      assert.ok(!/\d{3,}/.test(alert), 'no phone numbers or codes');
      assert.ok(!/https?:|www\./i.test(alert), 'no links');
      assert.ok(!/[a-z0-9-]+\.(com|net|org|xyz|top)/i.test(alert), 'no domains');
    }
  }
});

// ---- Demo evaluation ----
const evalSet = require(path.join(__dirname, '..', 'public', 'js', 'eval-set.js'));
const evaluation = require(path.join(__dirname, '..', 'public', 'js', 'evaluation.js'));

test('evaluation: the Egyptian bank/OTP example is in the set as a scam case — and is caught', () => {
  const ex = evalSet.find((e) => e.text === EXACT_AR);
  assert.ok(ex, 'the exact example must be in the demo set');
  assert.equal(ex.expected, 'scam');
  const r = evaluation.evaluate([ex], engine.analyze);
  assert.equal(r.rows[0].verdict, 'scam');
  assert.equal(r.rows[0].outcome, 'correct');
  assert.equal(r.matrix.scam.scam, 1);
});

test('evaluation: the set covers scam and legit calls, messages, links in both languages', () => {
  for (const exp of ['scam', 'legit']) {
    for (const type of ['call', 'message', 'link']) {
      assert.ok(evalSet.some((e) => e.expected === exp && e.type === type), `${exp} ${type}`);
    }
    for (const lang of ['ar', 'en']) assert.ok(evalSet.some((e) => e.expected === exp && e.lang === lang), `${exp} ${lang}`);
  }
});

test('evaluation: numbers come from the analyzer’s actual outputs', () => {
  const r = evaluation.evaluate(evalSet, engine.analyze);
  // Recompute independently from raw engine outputs.
  let correct = 0, fp = 0, fn = 0, caution = 0;
  for (const ex of evalSet) {
    const v = engine.analyze(ex.type, ex.text).verdict;
    if (v === 'caution') caution++;
    else if (ex.expected === 'scam') (v === 'scam' ? correct++ : fn++);
    else (v === 'safe' ? correct++ : fp++);
  }
  assert.deepEqual([r.counts.correct, r.counts.falsePositive, r.counts.falseNegative, r.counts.caution], [correct, fp, fn, caution]);
  const m = r.matrix;
  const matrixTotal = ['scam', 'legit'].reduce((a, e) => a + m[e].scam + m[e].caution + m[e].safe + m[e].error, 0);
  assert.equal(matrixTotal, evalSet.length);
  assert.equal(r.counts.total, evalSet.length);
});

test('held-out set: separate from the development set, both labels, counts come from the analyzer', () => {
  const holdout = require(path.join(__dirname, '..', 'public', 'js', 'eval-holdout.js'));
  assert.ok(holdout.length >= 10);
  const devTexts = new Set(evalSet.map((e) => e.text));
  assert.ok(holdout.every((e) => !devTexts.has(e.text)), 'no example may appear in both sets');
  for (const exp of ['scam', 'legit']) assert.ok(holdout.some((e) => e.expected === exp));
  const r = evaluation.evaluate(holdout, engine.analyze);
  const c = r.counts;
  assert.equal(c.correct + c.falsePositive + c.falseNegative + c.caution + c.error, holdout.length);
  // Deliberately NO assertion on the score: held-out results are reported as they are.
});

test('evaluation: outcome rules, including a fake analyzer to prove nothing is hard-coded', () => {
  assert.equal(evaluation.outcomeOf('scam', 'safe'), 'falseNegative');
  assert.equal(evaluation.outcomeOf('legit', 'scam'), 'falsePositive');
  assert.equal(evaluation.outcomeOf('legit', 'caution'), 'caution');
  assert.equal(evaluation.outcomeOf('scam', null), 'error');
  const everythingSafe = () => ({ ok: true, verdict: 'safe', score: 0 });
  const r = evaluation.evaluate(evalSet, everythingSafe);
  assert.equal(r.counts.falseNegative, evalSet.filter((e) => e.expected === 'scam').length);
  assert.equal(r.counts.falsePositive, 0);
  const tooShort = evaluation.evaluate([{ type: 'message', expected: 'scam', text: 'hi' }], engine.analyze);
  assert.equal(tooShort.counts.error, 1);
});

test('no result status is ever "safe"', () => {
  for (const n of ['+12025550143', '19623', 'private', '0100 123 4567']) {
    const r = numberCheck.checkNumber(n, numberList);
    assert.notEqual(r.status, 'safe');
  }
});
