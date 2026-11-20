/*
 * Der3 | درع — demo evaluation (UMD: browser + Node tests).
 *
 * Runs the existing analyzer on a small, curated, fictional example set and
 * counts what it ACTUALLY returned. Nothing here is hard-coded: every number is
 * calculated from the analyzer's outputs at the moment "Run evaluation" is pressed.
 *
 * Definitions (shown on the page too):
 *   expected 'scam'  + verdict 'scam'    → correct
 *   expected 'legit' + verdict 'safe'    → correct
 *   expected 'legit' + verdict 'scam'    → false positive (a genuine example flagged as a scam)
 *   expected 'scam'  + verdict 'safe'    → false negative (a scam missed)
 *   verdict 'caution' (either expected)  → "needs caution": not counted as correct
 *                                          and not counted as an error, reported separately
 *   analyzer error (empty / too short…)  → "error", reported separately
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Der3Evaluation = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['call', 'message', 'link'];
  var EXPECTED = ['scam', 'legit'];
  var VERDICTS = ['scam', 'caution', 'safe'];

  function outcomeOf(expected, verdict) {
    if (!verdict) return 'error';
    if (verdict === 'caution') return 'caution';
    if (expected === 'scam') return verdict === 'scam' ? 'correct' : 'falseNegative';
    return verdict === 'safe' ? 'correct' : 'falsePositive';
  }

  function sanitizeExample(ex, i) {
    return {
      id: String((ex && ex.id) || 'ex-' + (i + 1)).slice(0, 60),
      type: TYPES.indexOf(ex && ex.type) >= 0 ? ex.type : 'message',
      lang: (ex && ex.lang) === 'ar' ? 'ar' : 'en',
      expected: EXPECTED.indexOf(ex && ex.expected) >= 0 ? ex.expected : 'scam',
      text: String((ex && ex.text) || '').slice(0, 5000)
    };
  }

  /**
   * @param examples  array of { id, type, lang, expected, text }
   * @param analyze   the real analyzer: (type, text) => engine result
   */
  function evaluate(examples, analyze) {
    var rows = (examples || []).map(function (raw, i) {
      var ex = sanitizeExample(raw, i);
      var r = analyze(ex.type, ex.text);
      var verdict = r && r.ok ? r.verdict : null;
      return {
        example: ex,
        verdict: verdict,
        score: r && r.ok ? r.score : null,
        error: r && !r.ok ? r.error : null,
        override: !!(r && r.override),
        // Organization claim, reported separately — never part of the score.
        identityClaimed: !!(r && r.identity && r.identity.claimed),
        engine: r && r.meta ? r.meta.engine : null,
        outcome: outcomeOf(ex.expected, verdict)
      };
    });

    var matrix = { scam: { scam: 0, caution: 0, safe: 0, error: 0 }, legit: { scam: 0, caution: 0, safe: 0, error: 0 } };
    var counts = { total: rows.length, correct: 0, falsePositive: 0, falseNegative: 0, caution: 0, error: 0 };
    var byType = {};
    TYPES.forEach(function (tp) { byType[tp] = { total: 0, correct: 0 }; });

    rows.forEach(function (row) {
      matrix[row.example.expected][row.verdict || 'error']++;
      counts[row.outcome]++;
      byType[row.example.type].total++;
      if (row.outcome === 'correct') byType[row.example.type].correct++;
    });

    var decided = counts.total - counts.caution - counts.error;
    return {
      rows: rows,
      matrix: matrix,
      counts: counts,
      byType: byType,
      scamCases: matrix.scam.scam + matrix.scam.caution + matrix.scam.safe + matrix.scam.error,
      legitCases: matrix.legit.scam + matrix.legit.caution + matrix.legit.safe + matrix.legit.error,
      // Share of ALL examples that were exactly right (caution counts as not correct).
      correctShare: counts.total ? counts.correct / counts.total : 0,
      decided: decided
    };
  }

  return { TYPES: TYPES, EXPECTED: EXPECTED, VERDICTS: VERDICTS, outcomeOf: outcomeOf, sanitizeExample: sanitizeExample, evaluate: evaluate };
});
