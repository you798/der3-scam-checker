/*
 * Der3 | درع — "I'm on a call right now" guided check (UMD: browser + Node tests).
 *
 * This is user-guided only. The website cannot detect, listen to, or end a phone call.
 * The person answers three questions; the rules below turn those answers into guidance.
 *
 * Rules (deterministic):
 *   - any "yes"      -> level "high"    (High risk)
 *   - any "unsure"   -> level "verify"  (Pause and verify) — never "safe"
 *   - all three "no" -> level "noSigns" (No warning signs reported — still verify)
 *   - otherwise      -> level "incomplete"
 * There is deliberately no "safe" level.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3OnCall = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var QUESTIONS = ['sensitive', 'pressure', 'control'];
  var VALUES = ['yes', 'no', 'unsure'];

  function clean(answers) {
    var out = {};
    QUESTIONS.forEach(function (q) {
      var v = answers && answers[q];
      out[q] = VALUES.indexOf(v) >= 0 ? v : null;
    });
    return out;
  }

  function assess(answers) {
    var a = clean(answers);
    var yes = QUESTIONS.filter(function (q) { return a[q] === 'yes'; });
    var unsure = QUESTIONS.filter(function (q) { return a[q] === 'unsure'; });
    var answered = QUESTIONS.filter(function (q) { return a[q] !== null; }).length;
    var level;
    if (yes.length) level = 'high';
    else if (unsure.length) level = 'verify';
    else if (answered === QUESTIONS.length) level = 'noSigns';
    else level = 'incomplete';
    return { level: level, yes: yes, unsure: unsure, answered: answered, total: QUESTIONS.length, answers: a };
  }

  /*
   * Privacy-safe summary for someone the user trusts.
   * Contains ONLY the risk level and which kinds of warning signs were answered.
   * Never includes a transcript, phone number, names, codes, or any typed text.
   * `t(key)` is the caller's translation function.
   */
  function buildSummary(result, t) {
    var lines = [t('ocSumIntro'), t('ocSumLevel_' + result.level)];
    if (result.yes.length) {
      lines.push(t('ocSumYes'));
      result.yes.forEach(function (q) { lines.push('• ' + t('ocSumSign_' + q)); });
    }
    if (result.unsure.length) {
      lines.push(t('ocSumUnsure'));
      result.unsure.forEach(function (q) { lines.push('• ' + t('ocSumSign_' + q)); });
    }
    lines.push(t('ocSumAsk'));
    lines.push(t('ocSumFooter'));
    return lines.join('\n');
  }

  return { QUESTIONS: QUESTIONS, VALUES: VALUES, assess: assess, buildSummary: buildSummary };
});
