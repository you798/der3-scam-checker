/*
 * Der3 | درع — interface logic (vanilla JavaScript, no frameworks).
 *
 * The page sends text to the local Express server (POST /api/analyze).
 * If the page is opened without the server, the same simulated engine runs in the browser.
 * Submitted links are NEVER opened, fetched, or visited.
 * "Recent checks" are kept in sessionStorage only (this browser tab) and never sent anywhere.
 */
(function () {
  'use strict';

  var I18N = window.Der3I18n;
  var Engine = window.Der3Engine;
  var Samples = window.Der3Samples;
  var TYPES = ['call', 'message', 'link'];
  var TABS = TYPES.concat('screenshot');
  var MAX = 5000;
  var HISTORY_KEY = 'der3-history';
  var HISTORY_MAX = 8;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    lang: 'en',
    tab: 'call',
    view: { name: 'empty' },
    lastResult: null,
    history: [],
    serverOnline: false,
    canUseServer: location.protocol === 'http:' || location.protocol === 'https:',
    busy: false,
    recognition: null,
    listening: false,
    micMessage: '',
    audioUrl: null,
    audioMessage: { key: 'callAudioHint', kind: '' },
    numberView: null
  };

  /* ---------- Helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function t(key, vars) {
    var dict = I18N[state.lang] || I18N.en;
    var str = dict[key] != null ? dict[key] : (I18N.en[key] != null ? I18N.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { str = str.split('{' + k + '}').join(vars[k]); });
    return str;
  }

  // Build DOM safely: user text is always set with textContent.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // static SVG strings only
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Translated text with a user-typed value inside <bdi>, so a name in another
  // script/direction (e.g. "Omar" in an Arabic sentence) can't scramble the line.
  function tIsolated(key, varName, value) {
    var parts = t(key).split('{' + varName + '}');
    var out = [parts[0]];
    for (var i = 1; i < parts.length; i++) { out.push(el('bdi', { text: value })); out.push(parts[i]); }
    return out.filter(function (p) { return p !== ''; });
  }

  // A screenshot is analyzed with the message rules but labelled "Screenshot".
  function kindKey(r) { return r && r.meta && r.meta.source === 'screenshot' ? 'kind_screenshot' : 'kind_' + r.type; }

  function storeGet(storage, key) { try { return window[storage].getItem(key); } catch (e) { return null; } }
  function storeSet(storage, key, value) { try { window[storage].setItem(key, value); } catch (e) { /* storage unavailable */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var ICONS = {
    call: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    message: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5z"/></svg>',
    link: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    screenshot: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
    cross: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
    people: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M17 7v6M14 10h6"/></svg>',
    radar: '<svg class="radar" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="none" stroke="rgba(148,182,224,.18)"/><circle cx="60" cy="60" r="38" fill="none" stroke="rgba(148,182,224,.14)"/><circle cx="60" cy="60" r="20" fill="none" stroke="rgba(148,182,224,.12)"/><g class="radar-sweep"><path d="M60 60 L60 4 A56 56 0 0 1 108 32 Z" fill="rgba(45,212,191,.14)"/><line x1="60" y1="60" x2="60" y2="4" stroke="#2DD4BF" stroke-width="1.5"/></g><path d="M60 42 47 47v9c0 8 5.5 13.6 13 15.6 7.5-2 13-7.6 13-15.6v-9z" fill="#0D1B31" stroke="#2DD4BF" stroke-width="1.6"/></svg>'
  };

  /* =========================================================
     LANGUAGE + TEXT SIZE
     ========================================================= */
  function applyLanguage(lang) {
    state.lang = lang === 'ar' ? 'ar' : 'en';
    var html = document.documentElement;
    html.lang = state.lang;
    html.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('pageTitle');

    $$('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $$('[data-i18n-placeholder]').forEach(function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-placeholder'))); });
    $$('[data-i18n-aria-label]').forEach(function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria-label'))); });
    $$('.menu-item[data-lang]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-lang') === state.lang ? 'true' : 'false'); });

    storeSet('localStorage', 'der3-lang', state.lang);
    // Text is about to change language, so stop any reading in the old language.
    if (speech.status !== 'idle') stopSpeech(true);
    speech.note = null;

    renderSamples();
    renderServerStatus();
    renderAudioMessage();
    renderMic();
    TYPES.forEach(updateCount);
    renderResultView();
    renderHistory();
    renderAnalysis();
    renderSafety();
    renderNumberResult();
    if ($('#helpDialog').open && !$('#helpDone').hidden) renderHelpDone();
    renderOnCall();
    renderTrust();
    renderEval();
    if (Shot) {
      setShotPhase(shot.phase);
      renderShotQuality();
      if (shot.url) $('#shotPreview').alt = t('shotPreviewAlt');
    }
  }

  function applyTextSize(size) {
    var large = size === 'large';
    document.documentElement.classList.toggle('large-text', large);
    $$('.menu-item[data-size]').forEach(function (b) { b.setAttribute('aria-checked', (b.getAttribute('data-size') === 'large') === large ? 'true' : 'false'); });
    storeSet('localStorage', 'der3-size', large ? 'large' : 'normal');
  }

  /* =========================================================
     OVERFLOW MENU (three dots) — keyboard + mouse accessible
     ========================================================= */
  function initMoreMenu() {
    var btn = $('#moreBtn');
    var menu = $('#moreMenu');
    function items() { return $$('.menu-item', menu); }
    function isOpen() { return !menu.hidden; }

    function open(focusWhich) {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var list = items();
      var target = focusWhich === 'last' ? list[list.length - 1]
        : (list.filter(function (i) { return i.getAttribute('aria-checked') === 'true'; })[0] || list[0]);
      if (focusWhich === 'first') target = list[0];
      target.focus();
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) btn.focus();
    }

    btn.addEventListener('click', function () { isOpen() ? close(false) : open(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); open('first'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); open('last'); }
    });

    menu.addEventListener('keydown', function (e) {
      var list = items();
      var i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') { close(false); }
    });

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('.menu-item');
      if (!item) return;
      if (item.hasAttribute('data-lang')) {
        if (state.listening && state.recognition) state.recognition.stop();
        applyLanguage(item.getAttribute('data-lang'));
      } else if (item.hasAttribute('data-size')) {
        applyTextSize(item.getAttribute('data-size'));
      }
      close(true);
    });

    document.addEventListener('pointerdown', function (e) {
      if (isOpen() && !$('#more').contains(e.target)) close(false);
    });
  }

  /* =========================================================
     SERVER STATUS
     ========================================================= */
  function fetchWithTimeout(url, opts, ms) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  function checkServer() {
    if (!state.canUseServer) { state.serverOnline = false; renderServerStatus(); return; }
    fetchWithTimeout('/api/health', { method: 'GET' }, 4000)
      .then(function (r) { state.serverOnline = r.ok; })
      .catch(function () { state.serverOnline = false; })
      .then(renderServerStatus);
  }

  function renderServerStatus() {
    var box = $('#serverStatus');
    box.classList.toggle('online', state.serverOnline);
    box.classList.toggle('offline', !state.serverOnline);
    $('#serverStatusText').textContent = state.serverOnline ? t('serverOnline') : t('serverOffline');
  }

  /* =========================================================
     TABS
     ========================================================= */
  function selectTab(type, focus) {
    state.tab = type;
    $$('.tab').forEach(function (tab) {
      var on = tab.getAttribute('data-tab') === type;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    TABS.forEach(function (tp) { $('#panel-' + tp).hidden = tp !== type; });
  }

  function onTabKey(e) {
    var tabs = $$('.tab');
    var i = tabs.indexOf(e.currentTarget);
    var rtl = document.documentElement.dir === 'rtl';
    var next = null;
    if (e.key === 'ArrowRight') next = rtl ? i - 1 : i + 1;
    else if (e.key === 'ArrowLeft') next = rtl ? i + 1 : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    next = (next + tabs.length) % tabs.length;
    selectTab(tabs[next].getAttribute('data-tab'), true);
  }

  /* =========================================================
     SAMPLES
     ========================================================= */
  function renderSamples() {
    TYPES.forEach(function (type) {
      var box = $('[data-samples="' + type + '"]');
      box.textContent = '';
      Samples.checker[type].forEach(function (s, idx) {
        box.appendChild(el('button', {
          type: 'button', class: 'sample-btn', disabled: state.busy,
          onclick: function () { loadSample(type, idx); }
        }, [s.label[state.lang], el('span', { class: 'tag ' + s.kind, text: s.kind === 'scam' ? t('tagScam') : t('tagSafe') })]));
      });
    });
  }

  function loadSample(type, idx) {
    var input = $('#input-' + type);
    input.value = Samples.checker[type][idx].text[state.lang];
    updateCount(type);
    clearFieldError(type);
    runAnalysis(type, true);
  }

  /* =========================================================
     INPUT HELPERS
     ========================================================= */
  function updateCount(type) {
    var c = $('#count-' + type);
    if (!c) return;
    var n = $('#input-' + type).value.length;
    c.textContent = n ? t('charCount', { n: n }) : '';
  }
  function setFieldError(type) { var i = $('#input-' + type); i.setAttribute('aria-invalid', 'true'); i.focus(); }
  function clearFieldError(type) { $('#input-' + type).removeAttribute('aria-invalid'); }

  function setBusy(type, busy) {
    state.busy = busy;
    $$('.analyze-btn').forEach(function (btn) {
      var mine = btn.closest('form').getAttribute('data-type') === type;
      var labelKey = btn.getAttribute('data-label') || 'analyzeBtn';
      btn.disabled = busy || btn.hasAttribute('data-locked');
      btn.setAttribute('aria-busy', busy && mine ? 'true' : 'false');
      btn.textContent = '';
      if (busy && mine) {
        btn.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
        btn.appendChild(el('span', { text: t('analyzing') }));
      } else {
        btn.appendChild(el('span', { 'data-i18n': labelKey, text: t(labelKey) }));
      }
    });
    $$('.sample-btn').forEach(function (b) { b.disabled = busy; });
  }

  /* =========================================================
     ANALYSIS
     ========================================================= */
  function runAnalysis(type, fromSample) {
    if (state.busy) return;
    var input = $('#input-' + type).value;

    if (!input.trim()) { showError(type, 'empty_' + type); return; }
    if (input.length > MAX) { showError(type, 'tooLong'); return; }

    clearFieldError(type);
    setBusy(type, true);
    state.view = { name: 'loading' };
    renderResultView();
    if (window.innerWidth < 960) scrollToResult();

    var minDelay = wait(reduceMotion ? 250 : 850);
    var request;
    // Screenshot text is checked with the normal MESSAGE rules (incl. visible links).
    var engineType = type === 'screenshot' ? 'message' : type;

    if (state.canUseServer) {
      request = fetchWithTimeout('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: engineType, input: input })
      }, 8000).then(function (r) {
        return r.json().then(function (body) {
          state.serverOnline = true;
          renderServerStatus();
          if (body && (body.ok || body.error)) return { result: body, source: 'server' };
          throw new Error('bad response');
        });
      }).catch(function (err) {
        if (err && err.message === 'bad response') return { result: { ok: false, error: 'server' }, source: 'server' };
        state.serverOnline = false;
        renderServerStatus();
        return { result: Engine.analyze(engineType, input), source: 'browser' };
      });
    } else {
      request = Promise.resolve({ result: Engine.analyze(engineType, input), source: 'browser' });
    }

    Promise.all([request, minDelay]).then(function (out) {
      var res = out[0];
      setBusy(type, false);
      if (!res.result.ok) {
        var code = res.result.error === 'empty' ? 'empty_' + type : res.result.error;
        showError(type, code, code === 'server');
        return;
      }
      // An unclear screenshot can never be "Likely safe".
      if (type === 'screenshot') res.result = window.Der3Screenshot.applyOcrSafety(res.result, shot.quality || 'low');
      state.lastResult = res.result;
      state.view = { name: 'result', result: res.result, source: res.source };
      addToHistory(res.result, res.source);
      renderResultView(true);
      renderAnalysis();
      renderSafety();
      if (fromSample) announce(t('sampleLoaded'));
    }).catch(function () {
      setBusy(type, false);
      showError(type, 'server', true);
    });
  }

  function showError(type, code, keepFocus) {
    state.view = { name: 'error', code: code, type: type };
    renderResultView(true);
    if (!keepFocus) setFieldError(type);
  }

  function announce(msg) {
    var live = $('#resultLive');
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 50);
  }

  function scrollToResult() {
    var card = $('#resultCard');
    var rect = card.getBoundingClientRect();
    if (rect.top < 80 || rect.top > window.innerHeight - 120) {
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* =========================================================
     RESULT PANEL (empty / loading / error / result)
     ========================================================= */
  function renderResultView(focusHeading) {
    var body = $('#resultBody');
    body.textContent = '';
    var v = state.view;
    // A new or cleared result ends any reading / safety pause tied to the old one.
    var currentRef = v.name === 'result' ? v.result : null;
    if (speech.owner === 'checker' && speech.ref !== currentRef && speech.status !== 'idle') stopSpeech(true);
    if (spause.owner === 'checker' && spause.ref !== currentRef) resetPause('checker');

    if (v.name === 'empty') {
      body.appendChild(el('div', { class: 'state-empty' }, [
        el('div', { html: ICONS.radar }),
        el('h3', { text: t('resultEmptyTitle') }),
        el('p', { text: t('resultEmptyText') })
      ]));
      return;
    }

    if (v.name === 'loading') {
      body.setAttribute('aria-busy', 'true');
      body.appendChild(el('div', { class: 'state-loading' }, [
        el('div', { class: 'loading-bar', 'aria-hidden': 'true' }, [el('span')]),
        el('h3', { text: t('resultLoading') }),
        el('p', { text: t('resultLoadingSub') }),
        el('div', { class: 'skeleton', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span'), el('span')])
      ]));
      announce(t('resultLoading'));
      return;
    }
    body.removeAttribute('aria-busy');

    if (v.name === 'error') {
      var h = el('h3', { tabindex: '-1', html: ICONS.cross });
      h.appendChild(document.createTextNode(t('errTitle')));
      body.appendChild(el('div', { class: 'state-error', role: 'alert' }, [
        h,
        el('p', { text: t('err_' + v.code) }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm',
          onclick: function () {
            if (v.code === 'server') runAnalysis(v.type);
            else { selectTab(v.type); $('#input-' + v.type).focus(); }
          }
        }, [t('tryAgain')])
      ]));
      if (focusHeading) h.focus({ preventScroll: true });
      return;
    }

    // ----- result: verdict -> reasons -> recommended next step -----
    var r = v.result;
    var heading = el('h3', { tabindex: '-1', text: t('verdict_' + r.verdict) });

    var top = el('div', { class: 'result-top' }, [
      el('div', null, [
        el('span', { class: 'label', text: t('resultLabel') + ' · ' + t(kindKey(r)) }),
        el('div', { class: 'verdict-line' }, [el('span', { class: 'status-dot ' + r.verdict, 'aria-hidden': 'true' }), heading]),
        el('p', { class: 'verdict-summary', text: t('summary_' + r.verdict) })
      ]),
      el('div', { class: 'score-box' }, [
        el('div', { class: 'score-num', 'aria-label': t('riskOf', { n: r.score }) }, [String(r.score), el('small', { text: '/100' })]),
        el('div', { class: 'score-conf' }, [t('confidence') + ': ', el('strong', { text: t('conf_' + r.confidence) })])
      ])
    ]);

    var marker = el('span', { class: 'meter-marker', 'aria-hidden': 'true' });
    var meterBlock = el('div', { class: 'meter-block' }, [
      el('div', {
        class: 'meter', role: 'meter',
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(r.score),
        'aria-valuetext': t('riskOf', { n: r.score }) + ' — ' + t('verdict_' + r.verdict),
        'aria-label': t('riskLabel')
      }, [el('i'), el('i'), el('i'), marker]),
      el('div', { class: 'meter-scale', 'aria-hidden': 'true' }, [
        el('span', { text: t('meterLow') }), el('span', { text: t('meterMid') }), el('span', { text: t('meterHigh') })
      ])
    ]);

    var warnings = r.signals.filter(function (s) { return s.weight > 0; });
    // Informational signs (0 points) are shown, but they never lower the risk.
    var goods = r.signals.filter(function (s) { return s.weight < 0 || s.info; });

    function signalItem(s) {
      var vars = s.vars || {};
      var li = el('li', { class: 'signal ' + (s.weight <= 0 ? 'good' : s.weight < 20 ? 'mid' : '') }, [
        el('span', { class: 'sev', 'aria-hidden': 'true' }),
        el('strong', { text: t('sig_' + s.id + '_t', vars) }),
        el('p', { text: t('sig_' + s.id + '_d', vars) })
      ]);
      if (s.evidence) li.appendChild(el('p', { class: 'evidence' }, [t('foundText') + ' ', el('bdi', { text: s.evidence })]));
      return li;
    }

    var reasons = el('section', { class: 'result-section' }, [el('h4', { class: 'result-h', text: t('whyTitle') })]);
    reasons.appendChild(warnings.length
      ? el('ul', { class: 'signal-list' }, warnings.map(signalItem))
      : el('p', { class: 'no-signs', text: t('noSigns') }));

    var sections = [top];
    sections.push(speechControls('checker', r, function () { return ReadAloud.checkerSummary(r, t, state.lang); }));
    // Deterministic high-risk override: show the matched phrase and fixed advice first.
    if (r.override) {
      var adviceKey = 'overrideAdvice_' + (I18N.en['overrideAdvice_' + r.override.reason] ? r.override.reason : 'credentials');
      sections.push(el('div', { class: 'override', role: 'alert' }, [
        el('p', { class: 'override-title', text: t('overrideTitle') }),
        r.override.phrase ? el('p', { class: 'override-phrase' }, [t('overrideMatched') + ' ', el('bdi', { text: r.override.phrase })]) : null,
        el('p', { class: 'override-advice', text: t(adviceKey) })
      ]));
    }
    // Organization claim: shown SEPARATELY from the risk score, with a safe way to verify.
    if (r.identity && r.identity.claimed) sections.push(identityBox(r));
    if (r.verdict === 'scam' || r.verdict === 'caution') sections.push(safetyPause('checker', r));
    // High risk: offer to call someone from the trust circle, or share a privacy-safe alert.
    if (r.verdict === 'scam') sections.push(trustPanel(r.meta && r.meta.source === 'screenshot' ? 'screenshot' : r.type));
    sections.push(meterBlock, reasons);
    if (goods.length) {
      sections.push(el('section', { class: 'result-section' }, [
        el('h4', { class: 'result-h', text: t('goodTitle') }),
        el('ul', { class: 'signal-list' }, goods.map(signalItem))
      ]));
    }
    sections.push(el('section', { class: 'result-section' }, [
      el('h4', { class: 'result-h', text: t('stepsTitle') }),
      el('p', { class: 'next-step', text: t('step_' + r.steps[0]) })
    ]));

    sections.push(el('div', { class: 'result-actions' }, [
      el('a', { class: 'btn btn-primary', href: '#safety' }, [t('openSafety')]),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: openHelp }, [el('span', { html: ICONS.people }), t('resultHelp')]),
      el('button', {
        type: 'button', class: 'btn btn-text',
        onclick: function () { var i = $('#input-' + state.tab); i.value = ''; updateCount(state.tab); i.focus(); }
      }, [t('checkAnother')])
    ]));

    var sourceKey = v.source === 'history' ? 'sourceHistory' : v.source === 'server' ? 'sourceServer' : 'sourceBrowser';
    sections.push(el('p', { class: 'result-foot', text: t(sourceKey) }));

    var wrap = el('div', { class: 'result ' + r.verdict });
    sections.forEach(function (n) { wrap.appendChild(n); });
    body.appendChild(wrap);

    var pos = Math.max(1, Math.min(99, r.score));
    if (reduceMotion || !focusHeading) marker.style.insetInlineStart = pos + '%';
    else requestAnimationFrame(function () { requestAnimationFrame(function () { marker.style.insetInlineStart = pos + '%'; }); });

    if (focusHeading) {
      announce(t('resultReady', { verdict: t('verdict_' + r.verdict) }));
      heading.focus({ preventScroll: window.innerWidth >= 960 });
    }
  }

  /* =========================================================
     IDENTITY NOT VERIFIED + "VERIFY THIS ORGANIZATION SAFELY"
     A named organization never proves who sent a message or made a call,
     and it never changes the risk score. The guide only lists a contact if it
     is in verified-orgs.js WITH an official source and a last-checked date.
     ========================================================= */
  var ORG_GUIDE_KINDS = ['bank', 'delivery', 'government', 'company'];

  function primaryKind(identity) {
    var k = (identity && identity.kinds) || [];
    for (var i = 0; i < ORG_GUIDE_KINDS.length; i++) if (k.indexOf(ORG_GUIDE_KINDS[i]) >= 0) return ORG_GUIDE_KINDS[i];
    return 'company';
  }

  // Only entries with an official source + last-checked date, matching the claimed name.
  function verifiedContactsFor(identity, input) {
    var list = (window.Der3VerifiedOrgs && window.Der3VerifiedOrgs.entries) || [];
    var hay = String(input || '').toLowerCase();
    return list.filter(function (e) {
      if (!e || !e.source || !e.checked || !/^\d{4}-\d{2}-\d{2}$/.test(e.checked)) return false;
      if (!e.phone && !e.website) return false;
      return (e.match || []).some(function (w) { return w && hay.indexOf(String(w).toLowerCase()) !== -1; });
    });
  }

  function verifyGuide(kind, contacts) {
    var steps = ['vgStep1', 'vgStep2_' + kind, 'vgStep3', 'vgStep4'];
    var parts = [
      el('h4', { class: 'vg-title', tabindex: '-1', text: t('vgTitle') }),
      el('p', { class: 'vg-why', text: t('vgWhy') }),
      el('ol', { class: 'vg-steps' }, steps.map(function (k) { return el('li', { text: t(k) }); }))
    ];
    if (contacts.length) {
      parts.push(el('div', { class: 'vg-contacts' }, [el('p', { class: 'vg-contacts-title', text: t('vgContactsTitle') })].concat(contacts.map(function (c) {
        var name = (c.name && (c.name[state.lang] || c.name.en)) || '';
        var src = (c.source && (c.source[state.lang] || c.source.en)) || '';
        return el('div', { class: 'vg-contact' }, [
          el('p', { class: 'vg-contact-name' }, [el('bdi', { text: name })]),
          c.phone ? el('p', null, [t('vgPhone') + ' ', el('bdi', { dir: 'ltr', text: c.phone })]) : null,
          // Shown as plain text — never turned into a clickable link.
          c.website ? el('p', null, [t('vgWebsite') + ' ', el('bdi', { dir: 'ltr', text: c.website })]) : null,
          el('p', { class: 'vg-source', text: t('vgSource', { source: src, date: c.checked }) })
        ]);
      }))));
    } else {
      parts.push(el('p', { class: 'vg-nolist', text: t('vgNoList') }));
    }
    parts.push(el('div', { class: 'vg-script' }, [
      el('p', { class: 'vg-script-title', text: t('vgScriptTitle') }),
      el('blockquote', { text: t('vgScript_' + kind) })
    ]));
    return parts;
  }

  function identityBox(r) {
    var kind = primaryKind(r.identity);
    var guide = el('div', { class: 'vg', id: 'vg-' + Math.random().toString(36).slice(2, 8), hidden: true });
    var btn = el('button', { type: 'button', class: 'btn btn-ghost id-verify-btn', 'aria-expanded': 'false', 'aria-controls': guide.id }, [
      el('span', { html: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3z"/><path d="m9 12 2 2 4-4"/></svg>' }),
      el('span', { text: t('vgBtn') })
    ]);
    btn.addEventListener('click', function () {
      var open = guide.hidden;
      if (open && !guide.childNodes.length) verifyGuide(kind, verifiedContactsFor(r.identity, r.input)).forEach(function (n) { guide.appendChild(n); });
      guide.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) $('.vg-title', guide).focus();
    });
    return el('section', { class: 'identity-box', 'aria-label': t('idTitle') }, [
      el('div', { class: 'id-head' }, [
        el('span', { class: 'id-badge', text: t('idBadge') }),
        el('p', { class: 'id-title', text: t('idTitle') })
      ]),
      el('p', { class: 'id-claim' }, tIsolated('idClaim_' + kind, 'quote', r.identity.evidence || '')),
      el('p', { class: 'id-note', text: t('idNotInScore') }),
      btn,
      guide
    ]);
  }

  /* =========================================================
     RECENT CHECKS (sessionStorage, this tab only)
     ========================================================= */
  function loadHistory() {
    try { state.history = JSON.parse(storeGet('sessionStorage', HISTORY_KEY) || '[]') || []; } catch (e) { state.history = []; }
    if (!Array.isArray(state.history)) state.history = [];
  }
  function saveHistory() { storeSet('sessionStorage', HISTORY_KEY, JSON.stringify(state.history)); }

  function addToHistory(result) {
    state.history.unshift({ id: Date.now() + '-' + Math.random().toString(16).slice(2, 6), time: Date.now(), result: result });
    state.history = state.history.slice(0, HISTORY_MAX);
    saveHistory();
    renderHistory();
  }

  function formatTime(ms) {
    try {
      return new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-u-nu-latn' : 'en', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    } catch (e) { return new Date(ms).toLocaleTimeString(); }
  }

  function renderHistory() {
    var box = $('#historyBody');
    box.textContent = '';
    $('#historyClear').disabled = !state.history.length;

    if (!state.history.length) {
      box.appendChild(el('p', { class: 'empty-box', text: t('historyEmpty') }));
      return;
    }
    var list = el('ul', { class: 'history-list' });
    state.history.forEach(function (h) {
      var r = h.result;
      var time = formatTime(h.time);
      var preview = String(r.input || '').replace(/\s+/g, ' ').slice(0, 70);
      list.appendChild(el('li', null, [el('button', {
        type: 'button', class: 'history-item',
        'aria-label': t('historyViewLabel', { kind: t(kindKey(r)), verdict: t('verdict_' + r.verdict), score: r.score, time: time }),
        onclick: function () { showFromHistory(h); }
      }, [
        el('span', { class: 'history-type', html: ICONS[r.meta && r.meta.source === 'screenshot' ? 'screenshot' : r.type] }),
        el('span', { class: 'history-main' }, [
          el('span', { class: 'history-line' }, [
            el('span', { class: 'status-dot ' + r.verdict }),
            el('span', { class: 'v-' + r.verdict, text: t('verdict_' + r.verdict) })
          ]),
          el('span', { class: 'history-meta' }, [t(kindKey(r)) + ' · ' + time + ' · ', el('bdi', { text: preview })])
        ]),
        el('span', { class: 'history-score' }, [String(r.score), el('small', { text: t('riskLabel') })])
      ])]));
    });
    box.appendChild(list);
  }

  function showFromHistory(h) {
    state.lastResult = h.result;
    state.view = { name: 'result', result: h.result, source: 'history' };
    selectTab(h.result.type);
    renderResultView(true);
    renderAnalysis();
    renderSafety();
    if (window.innerWidth < 960 || $('#resultCard').getBoundingClientRect().top < 0) {
      $('#resultCard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
    var live = $('#resultLive');
    live.textContent = '';
    setTimeout(function () { live.textContent = t('historyCleared'); }, 50);
    $('#historyTitle').setAttribute('tabindex', '-1');
    $('#historyTitle').focus();
  }

  /* =========================================================
     HOW DER3 ANALYZES — score breakdown of the latest check
     ========================================================= */
  function weightClass(w) { return w >= 30 ? 'w-high' : w >= 15 ? 'w-mid' : 'w-low'; }
  var SWATCH = { 'w-high': 'var(--scam)', 'w-mid': 'var(--caution)', 'w-low': 'var(--blue)' };

  function renderAnalysis() {
    var box = $('#breakdown');
    box.textContent = '';
    var r = state.lastResult;
    if (!r) {
      box.appendChild(el('p', { class: 'empty-box', text: t('breakdownEmpty') }));
      return;
    }

    var pos = r.signals.filter(function (s) { return s.weight > 0; });
    var neg = r.signals.filter(function (s) { return s.weight <= 0; });
    var rawTotal = r.signals.reduce(function (a, s) { return a + s.weight; }, 0);

    box.appendChild(el('div', { class: 'bd-head' }, [
      el('strong', { text: t('breakdownFor', { kind: t(kindKey(r)) }) }),
      el('span', { class: 'v-' + r.verdict, text: t('verdict_' + r.verdict) })
    ]));

    // Stacked bar: each warning sign's points, capped at 100.
    var stack = el('div', { class: 'stack', role: 'img', 'aria-label': t('riskOf', { n: r.score }) });
    var used = 0;
    pos.forEach(function (s) {
      var w = Math.min(s.weight, 100 - used);
      if (w <= 0) return;
      used += w;
      stack.appendChild(el('span', { class: weightClass(s.weight), style: 'width:' + w + '%' }));
    });
    var wrap = el('div', { class: 'stack-wrap' }, [
      stack,
      el('span', { class: 'thr', style: 'inset-inline-start:30%', 'aria-hidden': 'true' }),
      el('span', { class: 'thr', style: 'inset-inline-start:60%', 'aria-hidden': 'true' })
    ]);
    box.appendChild(wrap);
    box.appendChild(el('div', { class: 'ticks', 'aria-hidden': 'true' }, [
      el('span', { style: 'inset-inline-start:0', text: '0' }),
      el('span', { style: 'inset-inline-start:30%', text: '30' }),
      el('span', { style: 'inset-inline-start:60%', text: '60' }),
      el('span', { text: '100' })
    ]));
    box.appendChild(el('div', { class: 'bands' }, [
      el('span', null, [el('i', { style: 'background:var(--safe)' }), t('bandSafe')]),
      el('span', null, [el('i', { style: 'background:var(--caution)' }), t('bandCaution')]),
      el('span', null, [el('i', { style: 'background:var(--scam)' }), t('bandScam')])
    ]));

    if (!r.signals.length) {
      box.appendChild(el('p', { class: 'empty-box', text: t('noSignalsBreakdown') }));
    } else {
      var list = el('ul', { class: 'bd-list' });
      pos.concat(neg).forEach(function (s) {
        var neg2 = s.weight <= 0;
        list.appendChild(el('li', { class: neg2 ? 'neg' : '' }, [
          el('span', { class: 'sw', style: 'background:' + (neg2 ? 'var(--safe)' : SWATCH[weightClass(s.weight)]), 'aria-hidden': 'true' }),
          el('span', { text: t('sig_' + s.id + '_t', s.vars || {}) }),
          el('span', { class: 'pts', text: s.weight === 0 ? t('ptsInfo') : neg2 ? t('ptsNeg', { n: Math.abs(s.weight) }) : t('pts', { n: s.weight }) })
        ]));
      });
      box.appendChild(list);
    }

    box.appendChild(el('div', { class: 'bd-total' }, [
      el('span', null, [t('total') + ' ', rawTotal > 100 ? el('span', { class: 'bd-cap', text: '(' + t('capped') + ')' }) : null]),
      el('span', { class: 'num' }, [String(r.score), el('small', { class: 'bd-cap', text: '/100' })])
    ]));

    // Identity is reported beside — not inside — the score.
    if (r.identity && r.identity.claimed) {
      box.appendChild(el('p', { class: 'bd-identity' }, [
        el('span', { class: 'id-badge', text: t('idBadge') }),
        el('span', { text: t('bdIdentity') })
      ]));
    }
  }

  /* =========================================================
     SAFETY CENTER — adapts to the latest check's warning signs
     ========================================================= */
  var ADVICE_FOR = {
    credentials: 'codes', bankDetails: 'codes',
    payment: 'money',
    impersonation: 'verify', threat: 'verify', unverifiedIdentity: 'verify', brandPlusSensitive: 'verify',
    identityClaim: 'verify', suppliedContact: 'verify',
    feeRequest: 'money', urgentPaymentLink: 'money', ipLogin: 'link',
    urgency: 'slow', secrecy: 'slow', pressureCombo: 'slow',
    remoteAccess: 'device', techScare: 'device', fileDownload: 'device',
    familyEmergency: 'family',
    prize: 'prize',
    robocall: 'hangup',
    containsLink: 'link', riskyLink: 'link', shortener: 'link', lookalike: 'link', brandMisuse: 'link',
    ipHost: 'link', userinfo: 'link', punycode: 'link', nonAscii: 'link', badTld: 'link', subdomains: 'link',
    dangerScheme: 'link', redirect: 'link', hyphens: 'link', baitWords: 'link', longUrl: 'link',
    encoded: 'link', oddPort: 'link', noHttps: 'link'
  };

  function renderSafety() {
    var r = state.lastResult;
    var lead = $('#safetyLead');
    lead.textContent = !r ? t('safetyLeadGeneral') : t('safetyLead_' + r.verdict);

    // Group warning signs by the advice they need (strongest first).
    var groups = {};
    var order = [];
    if (r) {
      r.signals.filter(function (s) { return s.weight > 0; }).forEach(function (s) {
        var a = ADVICE_FOR[s.id];
        if (!a) return;
        if (!groups[a]) { groups[a] = []; order.push(a); }
        groups[a].push(s);
      });
      // An organization claim is never verified — always advise checking it independently
      // (shown even when the content looks safe; it does not change the score).
      if (r.identity && r.identity.claimed) {
        if (!groups.verify) { groups.verify = []; order.push('verify'); }
        groups.verify.push({ id: 'identityClaim', weight: 0 });
      }
    }

    // Highlight the core steps that matter most for this check.
    var risky = r && r.verdict !== 'safe';
    var prio = {
      1: risky && r.verdict === 'scam',
      2: risky && !!(groups.codes || groups.money || groups.device),
      3: !!r && (!!(r.identity && r.identity.claimed) || (risky && !!(groups.verify || groups.link || groups.family || r.verdict === 'caution'))),
      4: risky
    };
    [1, 2, 3, 4].forEach(function (n) {
      var card = $('#core-' + n);
      card.classList.toggle('priority', !!prio[n]);
      card.classList.toggle('scam', !!prio[n] && r.verdict === 'scam');
      $('.priority-tag', card).hidden = !prio[n];
    });

    var box = $('#adaptiveBody');
    box.textContent = '';
    if (!r) { box.appendChild(el('p', { class: 'empty-box', text: t('adaptiveEmpty') })); return; }
    if (!order.length) { box.appendChild(el('p', { class: 'empty-box', text: t('adaptiveNone') })); return; }

    var list = el('ul', { class: 'advice-list' });
    order.forEach(function (a) {
      var chips = groups[a].slice(0, 3).map(function (s) { return el('span', { class: 'chip', text: t('sig_' + s.id + '_t', s.vars || {}) }); });
      list.appendChild(el('li', { class: 'advice' }, [
        el('h4', { text: t('adv_' + a + '_t') }),
        el('p', { text: t('adv_' + a + '_d') }),
        el('div', { class: 'because' }, [el('span', { text: t('triggeredBy') })].concat(chips))
      ]));
    });
    box.appendChild(list);
  }

  /* =========================================================
     CALLER NUMBER CHECK — user-initiated, offline demo list only.
     A website cannot see incoming calls or caller ID; the user types the number.
     Unlisted numbers are "unknown — identity not verified", never "safe".
     ========================================================= */
  function runNumberCheck(e) {
    e.preventDefault();
    var input = $('#callerInput');
    var value = input.value;
    if (!value.trim()) {
      state.numberView = { ok: false, error: 'empty' };
      input.setAttribute('aria-invalid', 'true');
      renderNumberResult();
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    state.numberView = { loading: true };
    renderNumberResult();
    $('#callerBtn').disabled = true;

    function local() { return window.Der3NumberCheck.checkNumber(value, window.Der3VerifiedNumbers); }
    var req = state.canUseServer
      ? fetchWithTimeout('/api/number-check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: value })
        }, 6000).then(function (r) { return r.json(); })
          .then(function (b) { return b && (b.ok || b.error) ? b : local(); })
          .catch(local)
      : Promise.resolve(local());

    Promise.all([req, wait(reduceMotion ? 150 : 500)]).then(function (out) {
      $('#callerBtn').disabled = false;
      state.numberView = out[0];
      if (!out[0].ok) input.setAttribute('aria-invalid', 'true');
      renderNumberResult(true);
    });
  }

  function renderNumberResult(focus) {
    var box = $('#callerResult');
    box.textContent = '';
    var v = state.numberView;
    if (!v) return;

    if (v.loading) {
      box.appendChild(el('div', { class: 'num-result' }, [
        el('div', { class: 'loading-bar', 'aria-hidden': 'true' }, [el('span')]),
        el('p', { text: t('callerChecking') })
      ]));
      return;
    }
    if (!v.ok) {
      box.appendChild(el('div', { class: 'num-result error', role: 'alert' }, [
        el('div', { class: 'num-head' }, [el('span', { class: 'num-status', text: t('numErr_' + v.error) })])
      ]));
      return;
    }

    var name = v.entry ? (v.entry.name[state.lang] || v.entry.name.en) : '';
    var statusText = v.status === 'listed' ? t('numListed', { name: name }) : v.status === 'hidden' ? t('numHidden') : t('numUnknown');
    var heading = el('h4', { class: 'num-status', tabindex: '-1' }, [
      el('span', { class: 'status-dot ' + (v.status === 'listed' ? 'listed' : 'caution'), 'aria-hidden': 'true' }),
      statusText
    ]);
    var notes = ['numAdvice'].concat(v.notes.map(function (n) { return 'numNote_' + n; }));

    box.appendChild(el('div', { class: 'num-result ' + v.status }, [
      el('div', { class: 'num-head' }, [heading, el('bdi', { class: 'num-number', dir: 'ltr', text: v.number })]),
      el('span', { class: 'num-tag', text: v.provider ? t('numModeProvider') : t('numModeDemo') }),
      el('p', { text: t('numDesc_' + v.status) }),
      el('ul', { class: 'num-warn' }, notes.map(function (k) { return el('li', { text: t(k) }); })),
      el('div', { class: 'num-actions' }, [
        el('button', {
          type: 'button', class: 'btn btn-primary btn-sm',
          onclick: function () {
            selectTab('call');
            var c = $('#input-call');
            c.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
            c.focus({ preventScroll: true });
          }
        }, [t('numCheckWords')]),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: openHelp }, [el('span', { html: ICONS.people }), t('resultHelp')])
      ])
    ]));
    if (focus) heading.focus({ preventScroll: true });
  }

  /* =========================================================
     AUDIO FILE (stays on the device; never uploaded)
     ========================================================= */
  function onAudioChosen(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|aac|opus|webm|amr|3gp)$/i.test(file.name)) {
      state.audioMessage = { key: 'callAudioWrongType', kind: 'is-error' };
      e.target.value = '';
      renderAudioMessage();
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      state.audioMessage = { key: 'callAudioTooBig', kind: 'is-error' };
      e.target.value = '';
      renderAudioMessage();
      return;
    }
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(file);
    var player = $('#audioPlayer');
    player.src = state.audioUrl;
    player.hidden = false;
    $('#audioRemove').hidden = false;
    state.audioMessage = { key: 'callAudioLoaded', vars: { name: file.name }, kind: 'is-ok' };
    renderAudioMessage();
  }

  function removeAudio() {
    var player = $('#audioPlayer');
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.hidden = true;
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = null;
    $('#audioInput').value = '';
    $('#audioRemove').hidden = true;
    state.audioMessage = { key: 'callAudioHint', kind: '' };
    renderAudioMessage();
    $('#audioInput').focus();
  }

  function renderAudioMessage() {
    var p = $('#audioStatus');
    var m = state.audioMessage;
    p.className = 'note ' + (m.kind || '');
    p.textContent = t(m.key, m.vars);
  }

  /* =========================================================
     DICTATION (optional, user-started, only if supported)
     ========================================================= */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function renderMic() {
    var btn = $('#micBtn');
    var status = $('#micStatus');
    if (!SR) {
      btn.hidden = true;
      $('#micLimits').hidden = true;
      status.className = 'note';
      status.textContent = t('micUnsupported');
      return;
    }
    btn.setAttribute('aria-pressed', state.listening ? 'true' : 'false');
    $('#micBtnText').textContent = state.listening ? t('micStop') : t('micStart');
    $('#recDot').hidden = !state.listening;
    status.className = 'note' + (state.micMessage === 'micDenied' || state.micMessage === 'micError' ? ' is-error' : '');
    status.textContent = state.micMessage ? t(state.micMessage) : '';
  }

  function toggleMic() {
    if (!SR) return;
    if (state.listening) { if (state.recognition) state.recognition.stop(); return; }
    var rec = new SR();
    rec.lang = state.lang === 'ar' ? 'ar-SA' : 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    var box = $('#input-call');
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          var said = ev.results[i][0].transcript.trim();
          if (said) box.value = (box.value ? box.value.replace(/\s*$/, ' ') : '') + said;
        }
      }
      updateCount('call');
    };
    rec.onerror = function (ev) {
      state.micMessage = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'micDenied'
        : (ev.error === 'no-speech' || ev.error === 'aborted' ? 'micStopped' : 'micError');
    };
    rec.onend = function () {
      state.listening = false;
      if (state.micMessage === 'micListening') state.micMessage = 'micStopped';
      renderMic();
    };
    try {
      rec.start();
      state.recognition = rec;
      state.listening = true;
      state.micMessage = 'micListening';
    } catch (e) { state.micMessage = 'micError'; }
    renderMic();
  }

  /* =========================================================
     HELP DIALOG ("Ask someone you trust") — DEMO ONLY
     ========================================================= */
  var helpState = { who: 'family', name: '', ref: '' };

  function openHelp() {
    var dlg = $('#helpDialog');
    $('#helpForm').hidden = false;
    $('#helpDone').hidden = true;
    $('#helpError').hidden = true;
    $('#copyStatus').textContent = '';
    setHelpSending(false);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    var checked = $('#helpForm input[name="who"]:checked');
    if (checked) checked.focus();
  }
  function closeHelp() {
    var dlg = $('#helpDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  function setHelpSending(on) {
    var btn = $('#helpSend');
    btn.disabled = on;
    btn.textContent = '';
    if (on) {
      btn.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
      btn.appendChild(el('span', { text: t('dlgSending') }));
    } else {
      btn.appendChild(el('span', { 'data-i18n': 'dlgSend', text: t('dlgSend') }));
    }
  }
  function localRef() { return 'DEMO-' + Math.random().toString(16).slice(2, 8).toUpperCase(); }

  function submitHelp(e) {
    e.preventDefault();
    var who = ($('#helpForm input[name="who"]:checked') || {}).value || 'family';
    helpState.who = who;
    helpState.name = $('#helpName').value.trim().slice(0, 40);
    $('#helpError').hidden = true;
    setHelpSending(true);
    // Only the contact *type* goes to the local server — never the name or any checked text.
    var req = state.canUseServer
      ? fetchWithTimeout('/api/help-request', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactType: who })
        }, 6000).then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); })
          .catch(function () { return { ok: true, demo: true, reference: localRef() }; })
      : Promise.resolve({ ok: true, demo: true, reference: localRef() });

    Promise.all([req, wait(reduceMotion ? 200 : 700)]).then(function (out) {
      setHelpSending(false);
      if (!out[0] || !out[0].ok) {
        $('#helpError').textContent = t('dlgError');
        $('#helpError').hidden = false;
        return;
      }
      helpState.ref = out[0].reference;
      $('#helpForm').hidden = true;
      $('#helpDone').hidden = false;
      renderHelpDone();
      $('#helpDoneTitle').focus();
    });
  }

  function renderHelpDone() {
    $('#helpDoneText').textContent = t('dlgDoneText', { who: helpState.name || t('dlgSomeone') });
    $('#helpRef').textContent = t('dlgRef', { ref: helpState.ref });
    $('#copyNote').value = buildNote();
  }

  function buildNote() {
    var r = state.lastResult;
    if (!r) return t('copyNoteGeneric');
    var signs = r.signals.filter(function (s) { return s.weight > 0; }).slice(0, 3)
      .map(function (s) { return t('sig_' + s.id + '_t', s.vars || {}); })
      .join(state.lang === 'ar' ? '، ' : ', ');
    return t('copyNoteResult', {
      kind: t(kindKey(r)).toLowerCase(),
      verdict: t('verdict_' + r.verdict),
      score: r.score,
      signs: signs || t('copyNoneSigns')
    });
  }

  function copyNote() {
    var text = $('#copyNote').value;
    var status = $('#copyStatus');
    function ok() { status.className = 'note is-ok'; status.textContent = t('dlgCopied'); }
    function fail() {
      status.className = 'note is-error'; status.textContent = t('dlgCopyFail');
      $('#copyNote').focus(); $('#copyNote').select();
    }
    function fallback() {
      try { var ta = $('#copyNote'); ta.focus(); ta.select(); if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(); }
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  /* =========================================================
     CHECK A SCREENSHOT — local OCR (tesseract.js) in this browser.
     The image is never uploaded; only the text the user CONFIRMS is analyzed.
     Links found in the text are read as text and never opened.
     ========================================================= */
  var Shot = window.Der3Screenshot;
  var shot = { file: null, url: null, quality: null, ocrText: '', confidence: 0, worker: null, workerReady: null, job: 0, phase: 'idle' };
  var OCR_BASE = '/vendor/';

  function loadOcrLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = OCR_BASE + 'tesseract/tesseract.min.js';   // served by server.js from node_modules
      s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('lib')); };
      s.onerror = function () { reject(new Error('lib')); };
      document.head.appendChild(s);
    });
  }

  function getWorker(onProgress) {
    if (shot.workerReady) return shot.workerReady;
    shot.workerReady = loadOcrLibrary().then(function (T) {
      return T.createWorker(['ara', 'eng'], 1, {
        workerPath: OCR_BASE + 'tesseract/worker.min.js',
        corePath: OCR_BASE + 'tesseract-core/',      // picks the right .wasm build for this browser
        langPath: OCR_BASE + 'tessdata',
        gzip: true,
        cacheMethod: 'none',                        // nothing is stored in the browser
        workerBlobURL: false,
        logger: function (m) { if (shot.onProgress) shot.onProgress(m); }
      });
    }).then(function (w) { shot.worker = w; return w; });
    shot.workerReady.catch(function () { shot.workerReady = null; shot.worker = null; });
    return shot.workerReady;
  }

  function setShotPhase(phase) {
    shot.phase = phase;
    $('#shotProgress').hidden = phase !== 'reading';
    $('#shotReview').hidden = phase !== 'review';
    $('#shotPreviewWrap').hidden = !shot.url;
    $('#shotPickLabel').textContent = t(shot.url ? 'shotPickAgain' : 'shotPickBtn');
    var btn = $('#panel-screenshot .analyze-btn');
    if (phase === 'review') btn.removeAttribute('data-locked'); else btn.setAttribute('data-locked', '');
    btn.disabled = phase !== 'review' || state.busy;
  }

  function setShotProgress(pct, key) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    $('#shotBar').setAttribute('aria-valuenow', String(p));
    $('#shotBar span').style.width = p + '%';
    if (key) $('#shotStatus').textContent = t(key, { n: p });
  }

  function clearShot(keepError) {
    shot.job++;
    if (shot.url) URL.revokeObjectURL(shot.url);
    shot.file = null; shot.url = null; shot.quality = null; shot.ocrText = '';
    $('#shotInput').value = '';
    $('#shotPreview').removeAttribute('src');
    $('#input-screenshot').value = '';
    updateCount('screenshot');
    if (!keepError) $('#shotFileError').textContent = '';
    setShotPhase('idle');
  }

  function onShotChosen(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var check = Shot.checkFile(file);
    if (!check.ok) { clearShot(); $('#shotFileError').textContent = t('shotErr_' + check.error); return; }
    if (!state.canUseServer) { clearShot(); $('#shotFileError').textContent = t('shotErr_noServer'); return; }
    $('#shotFileError').textContent = '';
    if (shot.url) URL.revokeObjectURL(shot.url);
    shot.file = file;
    shot.url = URL.createObjectURL(file);           // local preview only
    $('#shotPreview').src = shot.url;
    $('#shotPreview').alt = t('shotPreviewAlt');
    $('#shotName').textContent = file.name;
    readShot();
  }

  function readShot() {
    var job = ++shot.job;
    shot.ocrFailed = false;
    setShotPhase('reading');
    setShotProgress(0, 'shotPreparing');
    shot.onProgress = function (m) {
      if (job !== shot.job || !m) return;
      if (m.status === 'recognizing text') setShotProgress(m.progress * 100, 'shotReadingPct');
      else setShotProgress(5, 'shotPreparing');
    };
    getWorker().then(function (w) {
      if (job !== shot.job) return null;
      return w.recognize(shot.file);
    }).then(function (res) {
      if (!res || job !== shot.job) return;
      var a = Shot.assessOcr({ text: res.data && res.data.text, confidence: res.data && res.data.confidence });
      shot.quality = a.quality;
      shot.ocrText = a.text;
      shot.confidence = a.confidence;
      $('#input-screenshot').value = a.text;
      updateCount('screenshot');
      showShotReview();
    }).catch(function () {
      if (job !== shot.job) return;
      // OCR could not run: let the user type the text instead — never "safe".
      shot.quality = 'empty';
      shot.ocrText = '';
      shot.ocrFailed = true;
      $('#input-screenshot').value = '';
      showShotReview();
    });
  }

  function renderShotQuality() {
    var q = shot.quality;
    var unclear = q === 'low' || q === 'empty';
    $('#shotUnclear').hidden = !unclear;
    $('#shotUnclearText').textContent = unclear ? t(shot.ocrFailed ? 'shotOcrFailed' : q === 'empty' ? 'shotUnclearEmpty' : 'shotUnclearLow') : '';
    $('#shotQuality').textContent = q === 'ok' ? t('shotReadOk', { n: shot.confidence }) : '';
    $('#shotQuality').hidden = q !== 'ok';
  }

  function showShotReview() {
    setShotPhase('review');
    renderShotQuality();
    var ta = $('#input-screenshot');
    if (shot.quality === 'ok') { $('#shotReviewTitle').focus(); }
    else { ta.focus(); }
  }

  function cancelShot() {
    shot.job++;
    // Stop the OCR work right away; a fresh worker is created next time.
    if (shot.worker) { try { shot.worker.terminate(); } catch (e) { /* ignore */ } }
    shot.worker = null; shot.workerReady = null;
    setShotPhase('idle');
    $('#shotStatus').textContent = '';
    $('#shotFileError').textContent = t('shotCancelled');
    $('#shotInput').focus();
  }

  function initShot() {
    $('#shotInput').addEventListener('change', onShotChosen);
    $('#shotRemove').addEventListener('click', function () { clearShot(); $('#shotInput').focus(); });
    $('#shotStartOver').addEventListener('click', function () {
      clearShot();
      if (state.view.name !== 'loading' && state.tab === 'screenshot') { state.view = { name: 'empty' }; renderResultView(); }
      $('#shotInput').focus();
    });
    $('#shotCancel').addEventListener('click', cancelShot);
    var form = $('#panel-screenshot');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (shot.phase !== 'review') return;
      runAnalysis('screenshot');
    });
    $('#input-screenshot').addEventListener('input', function () { updateCount('screenshot'); clearFieldError('screenshot'); });
    setShotPhase('idle');
  }

  /* =========================================================
     READ RESULT ALOUD — browser's built-in speechSynthesis only.
     Never starts by itself; nothing is sent anywhere.
     ========================================================= */
  var ReadAloud = window.Der3ReadAloud;
  var synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;
  var speech = { owner: null, ref: null, status: 'idle', token: 0, note: null, parts: [], index: 0, voice: null, lang: 'en' };
  var SPEAK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var PAUSE_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  var PLAY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
  var STOP_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';

  function loadVoices() {
    return new Promise(function (resolve) {
      var v = synth.getVoices();
      if (v.length) return resolve(v);
      var done = false;
      function finish() { if (done) return; done = true; resolve(synth.getVoices()); }
      synth.addEventListener && synth.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, 1200);
    });
  }

  function stopSpeech(silent) {
    speech.token++;
    if (synth) synth.cancel();
    speech.status = 'idle';
    if (!silent) updateSpeechUI();
  }

  function startSpeech(owner, ref, getText) {
    speech.note = null;
    if (!synth) { speech.owner = owner; speech.ref = ref; speech.note = 'speechUnsupported'; updateSpeechUI(); return; }
    stopSpeech(true);
    var token = speech.token;
    var lang = state.lang;
    speech.owner = owner; speech.ref = ref; speech.status = 'loading';
    updateSpeechUI();
    loadVoices().then(function (voices) {
      if (token !== speech.token) return;
      var voice = ReadAloud.pickVoice(voices, lang);
      // If the device lists voices but none in this language, say so instead of
      // reading Arabic with an English voice (or the reverse).
      if (voices.length && !voice) { speech.status = 'idle'; speech.note = 'speechNoVoice'; updateSpeechUI(true); return; }
      speech.parts = ReadAloud.chunks(getText());
      speech.voice = voice;
      speech.lang = lang;
      if (!speech.parts.length) { speech.status = 'idle'; updateSpeechUI(); return; }
      speakFrom(0);
    });
  }

  // Queue the sentences from index `from`. Pause = stop after noting the current
  // sentence; Resume = start again from that sentence. This works on every browser,
  // including voices that ignore speechSynthesis.pause().
  function speakFrom(from) {
    synth.cancel();
    var token = ++speech.token;
    var parts = speech.parts, voice = speech.voice;
    speech.index = from;
    speech.status = 'speaking';
    updateSpeechUI(true);
    parts.slice(from).forEach(function (p, k) {
      var i = from + k;
      var u = new SpeechSynthesisUtterance(p);
      u.lang = voice ? voice.lang : (speech.lang === 'ar' ? 'ar-EG' : 'en-US');
      if (voice) u.voice = voice;
      u.rate = 0.9;
      u.onstart = function () { if (token === speech.token) speech.index = i; };
      u.onerror = function (ev) {
        if (token !== speech.token) return;
        if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return;
        speech.token++; synth.cancel();
        speech.status = 'idle'; speech.note = ev && ev.error === 'not-allowed' ? 'speechBlocked' : 'speechFailed';
        updateSpeechUI(true);
      };
      if (i === parts.length - 1) {
        u.onend = function () {
          if (token !== speech.token) return;
          speech.status = 'idle'; speech.note = 'speakDone';
          updateSpeechUI(true);
        };
      }
      synth.speak(u);
    });
  }

  function togglePauseSpeech() {
    if (!synth) return;
    if (speech.status === 'speaking') {
      speech.token++;            // ignore events from the cancelled queue
      synth.cancel();
      speech.status = 'paused';
      updateSpeechUI(true);
    } else if (speech.status === 'paused') {
      speakFrom(speech.index || 0);
    }
  }

  // Controls are built once per result and only toggled, so keyboard focus is never lost.
  function speechControls(owner, ref, getText) {
    var read = el('button', { type: 'button', class: 'btn btn-ghost speak-read', onclick: function () { if (speech.status !== 'loading') startSpeech(owner, ref, getText); } },
      [el('span', { html: SPEAK_ICON }), el('span', { text: t('speakBtn') })]);
    var pause = el('button', { type: 'button', class: 'btn btn-ghost speak-pause', onclick: togglePauseSpeech });
    var stop = el('button', { type: 'button', class: 'btn btn-ghost speak-stop', onclick: function () { stopSpeech(); read.focus(); } },
      [el('span', { html: STOP_ICON }), el('span', { text: t('speakStop') })]);
    var status = el('p', { class: 'speak-status', role: 'status' });
    var box = el('div', { class: 'speak', 'data-owner': owner }, [
      el('div', { class: 'speak-row' }, [read, pause, stop]), status
    ]);
    box._ref = ref;
    renderSpeechBox(box, false);
    return box;
  }

  function renderSpeechBox(box, moveFocus) {
    var mine = speech.owner === box.getAttribute('data-owner') && speech.ref === box._ref;
    var st = mine ? speech.status : 'idle';
    var read = $('.speak-read', box), pause = $('.speak-pause', box), stop = $('.speak-stop', box), status = $('.speak-status', box);
    var focused = box.contains(document.activeElement) ? document.activeElement : null;
    read.hidden = st === 'speaking' || st === 'paused';
    read.setAttribute('aria-busy', st === 'loading' ? 'true' : 'false');
    pause.hidden = stop.hidden = !(st === 'speaking' || st === 'paused');
    pause.textContent = '';
    pause.appendChild(el('span', { html: st === 'paused' ? PLAY_ICON : PAUSE_ICON }));
    pause.appendChild(el('span', { text: t(st === 'paused' ? 'speakResume' : 'speakPause') }));
    var msg = st === 'speaking' ? t('speakReading') : st === 'paused' ? t('speakPaused')
      : (mine && speech.note) ? t(speech.note, { language: t('langName_' + state.lang) }) : '';
    status.textContent = msg;
    status.className = 'speak-status' + (mine && /No|Unsupported|Failed|Blocked/.test(speech.note || '') && st === 'idle' ? ' is-warn' : '');
    // If the button the user was on just disappeared, move focus to the one that replaced it.
    if (moveFocus && focused && focused.hidden) (pause.hidden ? read : pause).focus();
  }

  function updateSpeechUI(moveFocus) {
    $$('.speak').forEach(function (b) { renderSpeechBox(b, moveFocus); });
  }

  /* =========================================================
     TEN-SECOND SAFETY PAUSE — inline (non-blocking), user-started.
     ========================================================= */
  var PAUSE_MS = 10000;
  var REMINDERS = ['spRem1', 'spRem2', 'spRem3', 'spRem4'];
  var spause = { owner: null, ref: null, phase: 'idle', start: 0, timer: null };
  var RING_C = 2 * Math.PI * 52;

  function pauseFor(owner, ref) { return spause.owner === owner && spause.ref === ref ? spause.phase : 'idle'; }

  function setPausePhase(owner, ref, phase, focusSel) {
    clearInterval(spause.timer);
    spause.timer = null;
    spause.owner = owner; spause.ref = ref; spause.phase = phase;
    if (phase === 'running') {
      spause.start = Date.now();
      spause.timer = setInterval(tickPause, 250);
    }
    $$('.spause[data-owner="' + owner + '"]').forEach(function (box) { if (box._ref === ref) renderPauseBox(box); });
    var say = owner === 'oncall'
      ? function (m) { var l = $('#ocLive'); l.textContent = ''; setTimeout(function () { l.textContent = m; }, 50); }
      : announce;
    if (phase === 'running') say(t('spStartedSr'));
    if (phase === 'done') say(t('spDoneSr'));
    if (focusSel) { var f = $('.spause[data-owner="' + owner + '"] ' + focusSel); if (f) f.focus(); }
  }

  function resetPause(owner) {
    if (spause.owner !== owner) return;
    clearInterval(spause.timer);
    spause.timer = null; spause.phase = 'idle'; spause.ref = null;
  }

  function tickPause() {
    var box = $('.spause[data-owner="' + spause.owner + '"]');
    if (!box || box._ref !== spause.ref) { resetPause(spause.owner); return; }
    var elapsed = Date.now() - spause.start;
    if (elapsed >= PAUSE_MS) { setPausePhase(spause.owner, spause.ref, 'done', '.sp-done-title'); return; }
    updatePauseProgress(box, elapsed, false);
  }

  function updatePauseProgress(box, elapsed, initial) {
    var left = Math.max(0, Math.ceil((PAUSE_MS - elapsed) / 1000));
    var num = $('.sp-num', box), bar = $('.sp-progress', box), ring = $('.sp-ring-fg', box);
    if (num) num.textContent = String(left);
    if (bar) { bar.setAttribute('aria-valuenow', String(left)); bar.setAttribute('aria-valuetext', t('spSecondsLeft', { n: left })); }
    var idx = Math.min(REMINDERS.length - 1, Math.floor(elapsed / (PAUSE_MS / REMINDERS.length)));
    $$('.sp-rem li', box).forEach(function (li, i) { li.classList.toggle('active', i === idx); });
    if (!ring) return;
    if (reduceMotion) {
      ring.style.transition = 'none';
      ring.style.strokeDashoffset = String(RING_C * (1 - left / 10));
    } else if (initial) {
      // Smooth, calm sweep for the remaining time (survives a language switch mid-pause).
      ring.style.transition = 'none';
      ring.style.strokeDashoffset = String(RING_C * (elapsed / PAUSE_MS));
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        ring.style.transition = 'stroke-dashoffset ' + Math.max(0, PAUSE_MS - elapsed) + 'ms linear';
        ring.style.strokeDashoffset = String(RING_C);
      }); });
    }
  }

  function safetyPause(owner, ref) {
    var box = el('section', { class: 'spause', 'data-owner': owner, 'aria-label': t('spRegion') });
    box._ref = ref;
    renderPauseBox(box);
    return box;
  }

  function renderPauseBox(box) {
    var owner = box.getAttribute('data-owner'), ref = box._ref;
    var phase = pauseFor(owner, ref);
    box.textContent = '';
    box.className = 'spause phase-' + phase;

    if (phase === 'idle') {
      box.appendChild(el('button', {
        type: 'button', class: 'btn btn-pause btn-lg sp-start',
        onclick: function () { setPausePhase(owner, ref, 'running', '.sp-skip'); }
      }, [el('span', { class: 'sp-start-dot', 'aria-hidden': 'true' }), el('span', { text: t('spStart') })]));
      box.appendChild(el('p', { class: 'sp-sub', text: t('spSub') }));
      return;
    }

    if (phase === 'running') {
      var elapsed = Date.now() - spause.start;
      var ring = el('div', { class: 'sp-ring', 'aria-hidden': 'true', html:
        '<svg viewBox="0 0 120 120"><circle class="sp-ring-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="sp-ring-fg" cx="60" cy="60" r="52" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="0"/>' +
        '<circle class="sp-breathe" cx="60" cy="60" r="34"/></svg>' });
      ring.appendChild(el('span', { class: 'sp-num' }));
      box.appendChild(el('div', { class: 'sp-run' }, [
        el('div', {
          class: 'sp-progress', role: 'progressbar', 'aria-label': t('spTitle'),
          'aria-valuemin': '0', 'aria-valuemax': '10'
        }, [ring]),
        el('div', { class: 'sp-copy' }, [
          el('h4', { class: 'sp-title', text: t('spTitle') }),
          el('p', { class: 'sp-breath', text: t('spBreath') }),
          el('ul', { class: 'sp-rem' }, REMINDERS.map(function (k) { return el('li', { text: t(k) }); }))
        ])
      ]));
      box.appendChild(el('div', { class: 'sp-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary sp-skip', onclick: function () { setPausePhase(owner, ref, 'done', '.sp-done-title'); } }, [t('spSkip')]),
        el('button', { type: 'button', class: 'btn btn-text sp-stop', onclick: function () { setPausePhase(owner, ref, 'idle', '.sp-start'); } }, [t('spStop')])
      ]));
      updatePauseProgress(box, elapsed, true);
      return;
    }

    // done: clear next steps
    box.appendChild(el('h4', { class: 'sp-done-title', tabindex: '-1', text: t('spDoneTitle') }));
    box.appendChild(el('ol', { class: 'sp-steps' }, ['spNext1', 'spNext2', 'spNext3'].map(function (k) {
      return el('li', null, [el('strong', { text: t(k + 'T') }), el('span', { text: t(k + 'D') })]);
    })));
    box.appendChild(el('div', { class: 'sp-actions' }, [
      el('button', { type: 'button', class: 'btn btn-primary', onclick: openHelp }, [el('span', { html: ICONS.people }), t('resultHelp')]),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { setPausePhase(owner, ref, 'running', '.sp-skip'); } }, [t('spAgain')]),
      el('button', { type: 'button', class: 'btn btn-text', onclick: function () { setPausePhase(owner, ref, 'idle', '.sp-start'); } }, [t('spHide')])
    ]));
  }

  /* =========================================================
     "I'M ON A CALL RIGHT NOW" — user-guided, nothing is sent.
     The website cannot detect, listen to, or end a phone call.
     ========================================================= */
  var OnCall = window.Der3OnCall;
  var ocOpener = null;

  function ocAnswers() {
    var a = {};
    OnCall.QUESTIONS.forEach(function (q) {
      var c = $('#ocForm input[name="oc-' + q + '"]:checked');
      a[q] = c ? c.value : null;
    });
    return a;
  }

  function openOnCall(e) {
    var dlg = $('#callDialog');
    ocOpener = e && e.currentTarget ? e.currentTarget : document.activeElement;
    renderOnCall();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    // Focus the heading first so screen readers announce the screen; Tab then reaches question 1.
    $('#ocTitle').setAttribute('tabindex', '-1');
    $('#ocTitle').focus();
  }
  function closeOnCall() {
    var dlg = $('#callDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function ocToggle(btnSel, panelSel, open) {
    var btn = $(btnSel), panel = $(panelSel);
    var show = open == null ? panel.hidden : open;
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
    return show;
  }

  function renderOnCall() {
    if (!OnCall) return;
    var r = OnCall.assess(ocAnswers());
    var box = $('#ocResult');
    box.className = 'oc-result lvl-' + r.level;
    box.textContent = '';

    var icon = r.level === 'high' ? ICONS.cross
      : '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3z"/><path d="M12 8v5M12 16v.5"/></svg>';
    box.appendChild(el('div', { class: 'oc-result-head' }, [
      el('span', { class: 'oc-result-icon', html: icon }),
      el('div', null, [
        el('p', { class: 'oc-result-title', text: t('ocLevel_' + r.level) }),
        el('p', { class: 'oc-progress', text: t('ocProgress', { n: r.answered, total: r.total }) })
      ])
    ]));
    box.appendChild(el('p', { class: 'oc-result-desc', text: t('ocDesc_' + r.level) }));

    var why = r.yes.map(function (q) { return el('li', { class: 'why-yes', text: t('ocWhy_' + q) }); })
      .concat(r.unsure.map(function (q) { return el('li', { class: 'why-unsure', text: t('ocWhyUnsure_' + q) }); }));
    if (why.length) {
      box.appendChild(el('p', { class: 'oc-why-title', text: t('ocWhyTitle') }));
      box.appendChild(el('ul', { class: 'oc-why' }, why));
    }

    // Visual state on each question card
    $$('#ocForm .oc-q').forEach(function (fs) {
      var v = r.answers[fs.getAttribute('data-q')];
      fs.setAttribute('data-answer', v || '');
    });

    // Read aloud (always available) + safety pause (High risk / Pause and verify only)
    var tools = $('#ocTools');
    var toolsFocus = tools.contains(document.activeElement) ? document.activeElement.className : null;
    tools.textContent = '';
    if (r.level !== 'incomplete') {
      tools.appendChild(speechControls('oncall', 'oncall', function () {
        return ReadAloud.onCallSummary(OnCall.assess(ocAnswers()), t, state.lang);
      }));
    }
    if (r.level === 'high' || r.level === 'verify') tools.appendChild(safetyPause('oncall', 'oncall'));
    if (r.level === 'high') tools.appendChild(trustPanel('oncall'));
    else resetPause('oncall');
    if (toolsFocus) {
      var again = $('.' + toolsFocus.split(' ').filter(function (c) { return /^(speak-|sp-)/.test(c); })[0], tools);
      if (again) again.focus();
    }

    $('#ocLang').textContent = state.lang === 'ar' ? 'English' : 'العربية';
    $('#ocLang').setAttribute('lang', state.lang === 'ar' ? 'en' : 'ar');

    if (!$('#ocShare').hidden) $('#ocSummary').value = OnCall.buildSummary(r, t);
  }

  function ocShowVerify() {
    if (ocToggle('#ocVerifyBtn', '#ocVerify')) {
      $('#ocVerifyTitle').focus();
      $('#ocVerify').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function ocShowShare() {
    // Opening the panel only PREVIEWS the summary. Nothing leaves the page until
    // the user presses "Share now" or "Copy summary".
    $('#ocShareStatus').textContent = '';
    if (ocToggle('#ocShareBtn', '#ocShare')) {
      $('#ocSummary').value = OnCall.buildSummary(OnCall.assess(ocAnswers()), t);
      $('#ocShareTitle').focus();
      $('#ocShare').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function ocStatus(key, kind) {
    var s = $('#ocShareStatus');
    s.className = 'note' + (kind ? ' is-' + kind : '');
    s.textContent = t(key);
  }

  function ocCopy(afterKey) {
    var text = $('#ocSummary').value;
    function ok() { ocStatus(afterKey || 'ocCopied', 'ok'); }
    function fail() { ocStatus('ocCopyFail', 'error'); var ta = $('#ocSummary'); ta.focus(); ta.select(); }
    function fallback() {
      try { var ta = $('#ocSummary'); ta.focus(); ta.select(); if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(); }
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  function ocShareNow() {
    var text = $('#ocSummary').value;
    if (navigator.share) {
      navigator.share({ title: t('ocShareSubject'), text: text })
        .then(function () { ocStatus('ocShared', 'ok'); })
        .catch(function (err) {
          if (err && err.name === 'AbortError') ocStatus('ocShareCancelled');
          else ocCopy('ocShareUnavailable');
        });
    } else {
      ocCopy('ocShareUnavailable');
    }
  }

  function ocReset() {
    if (speech.owner === 'oncall') stopSpeech(true);
    resetPause('oncall');
    $('#ocForm').reset();
    ocToggle('#ocVerifyBtn', '#ocVerify', false);
    ocToggle('#ocShareBtn', '#ocShare', false);
    $('#ocShareStatus').textContent = '';
    renderOnCall();
    $('#ocForm input[name="oc-sensitive"]').focus();
  }

  function initOnCall() {
    $$('[data-open-oncall]').forEach(function (b) { b.addEventListener('click', openOnCall); });
    $$('[data-close-oncall]').forEach(function (b) { b.addEventListener('click', closeOnCall); });
    $('#ocForm').addEventListener('change', function () {
      // Answers changed, so an in-progress reading is out of date.
      if (speech.owner === 'oncall' && speech.status !== 'idle') stopSpeech(true);
      renderOnCall();
    });
    $('#ocForm').addEventListener('submit', function (e) { e.preventDefault(); });
    $('#ocVerifyBtn').addEventListener('click', ocShowVerify);
    $('#ocShareBtn').addEventListener('click', ocShowShare);
    $('#ocShareSend').addEventListener('click', ocShareNow);
    $('#ocCopy').addEventListener('click', function () { ocCopy(); });
    $('#ocReset').addEventListener('click', ocReset);
    $('#ocLang').addEventListener('click', function () { applyLanguage(state.lang === 'ar' ? 'en' : 'ar'); $('#ocLang').focus(); });
    var dlg = $('#callDialog');
    dlg.addEventListener('click', function (e) { if (e.target === e.currentTarget) closeOnCall(); });
    dlg.addEventListener('close', function () {
      if (speech.owner === 'oncall') stopSpeech(true);
      resetPause('oncall');
      renderOnCall();
      if (ocOpener && typeof ocOpener.focus === 'function') ocOpener.focus();
    });
  }

  /* =========================================================
     TRUST CIRCLE — contacts live ONLY in this browser (localStorage).
     Never sent to the server. Calls/sharing only happen when the user taps.
     ========================================================= */
  var Trust = window.Der3Trust;
  var TRUST_KEY = 'der3-trust';
  var trust = { list: [], editId: null, removeId: null, selected: null };

  function loadTrust() { trust.list = Trust.parseStored(storeGet('localStorage', TRUST_KEY)); }
  function saveTrust() { storeSet('localStorage', TRUST_KEY, JSON.stringify(trust.list)); }
  function trustSay(msg) { var l = $('#trLive'); l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 50); }

  function setTrustErrors(errors) {
    var n = $('#trName'), p = $('#trPhone');
    $('#trNameErr').textContent = errors.name ? t('trErrName_' + errors.name) : '';
    $('#trPhoneErr').textContent = errors.phone ? t('trErrPhone_' + errors.phone) : '';
    if (errors.name) n.setAttribute('aria-invalid', 'true'); else n.removeAttribute('aria-invalid');
    if (errors.phone) p.setAttribute('aria-invalid', 'true'); else p.removeAttribute('aria-invalid');
  }

  function renderTrustForm() {
    var editing = !!trust.editId;
    $('#trFormTitle').textContent = t(editing ? 'trEditTitle' : 'trAddTitle');
    $('#trSave').textContent = t(editing ? 'trSaveBtn' : 'trAddBtn');
    $('#trCancel').hidden = !editing;
  }

  function resetTrustForm() {
    trust.editId = null;
    $('#trName').value = ''; $('#trPhone').value = '';
    setTrustErrors({});
    renderTrustForm();
  }

  function submitTrust(e) {
    e.preventDefault();
    var v = Trust.validate({ name: $('#trName').value, phone: $('#trPhone').value });
    if (!v.ok) { setTrustErrors(v.errors); (v.errors.name ? $('#trName') : $('#trPhone')).focus(); return; }
    if (!trust.editId && trust.list.length >= Trust.MAX_CONTACTS) { setTrustErrors({}); $('#trPhoneErr').textContent = t('trErrFull', { n: Trust.MAX_CONTACTS }); return; }
    var msg;
    if (trust.editId) {
      trust.list.forEach(function (c) { if (c.id === trust.editId) { c.name = v.contact.name; c.phone = v.contact.phone; } });
      msg = t('trUpdated', { name: v.contact.name });
    } else {
      var c = { id: Trust.newId(), name: v.contact.name, phone: v.contact.phone };
      trust.list.push(c);
      if (!trust.selected) trust.selected = c.id;
      msg = t('trAdded', { name: v.contact.name });
    }
    saveTrust();
    resetTrustForm();
    renderTrust();
    trustSay(msg);
    $('#trName').focus();
  }

  function startEditTrust(c) {
    trust.editId = c.id; trust.removeId = null;
    $('#trName').value = c.name; $('#trPhone').value = c.phone;
    setTrustErrors({});
    renderTrustForm();
    renderTrustList();
    $('#trFormTitle').scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    $('#trName').focus();
  }

  function removeTrust(c) {
    trust.list = trust.list.filter(function (x) { return x.id !== c.id; });
    if (trust.selected === c.id) trust.selected = trust.list[0] ? trust.list[0].id : null;
    if (trust.editId === c.id) resetTrustForm();
    trust.removeId = null;
    saveTrust();
    renderTrust();
    trustSay(t('trRemoved', { name: c.name }));
    var first = $('#trustList button') || $('#trName');
    first.focus();
  }

  function renderTrustList() {
    var box = $('#trustList');
    box.textContent = '';
    if (!trust.list.length) {
      box.appendChild(el('p', { class: 'trust-empty', text: t('trEmpty') }));
      return;
    }
    box.appendChild(el('ul', { class: 'trust-list' }, trust.list.map(function (c) {
      var confirming = trust.removeId === c.id;
      var li = el('li', { class: 'trust-item' + (trust.editId === c.id ? ' is-editing' : '') }, [
        el('div', { class: 'trust-who' }, [
          el('span', { class: 'trust-avatar', 'aria-hidden': 'true', text: (c.name.trim()[0] || '?').toUpperCase() }),
          el('div', null, [
            el('p', { class: 'trust-name' }, [el('bdi', { text: c.name })]),
            el('p', { class: 'trust-phone' }, [el('bdi', { dir: 'ltr', text: c.phone })])
          ])
        ])
      ]);
      if (confirming) {
        li.appendChild(el('div', { class: 'trust-confirm', role: 'group', 'aria-label': t('trRemoveAsk', { name: c.name }) }, [
          el('p', null, tIsolated('trRemoveAsk', 'name', c.name)),
          el('div', { class: 'trust-actions' }, [
            el('button', { type: 'button', class: 'btn btn-danger-soft btn-sm tr-yes', onclick: function () { removeTrust(c); } }, [t('trRemoveYes')]),
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm tr-no', onclick: function () {
              trust.removeId = null; renderTrustList();
              var b = $('#trustList [data-remove="' + c.id + '"]'); if (b) b.focus();
            } }, [t('trRemoveNo')])
          ])
        ]));
      } else {
        li.appendChild(el('div', { class: 'trust-actions' }, [
          el('a', { class: 'btn btn-ghost btn-sm', href: Trust.telHref(c.phone), 'aria-label': t('trCallAria', { name: c.name }) }, [el('span', { html: ICONS.call }), t('trCall')]),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': t('trEditAria', { name: c.name }), onclick: function () { startEditTrust(c); } }, [t('trEdit')]),
          el('button', { type: 'button', class: 'btn btn-text btn-sm tr-remove', 'data-remove': c.id, 'aria-label': t('trRemoveAria', { name: c.name }), onclick: function () {
            trust.removeId = c.id; renderTrustList();
            var y = $('#trustList .tr-no'); if (y) y.focus();
          } }, [t('trRemove')])
        ]));
      }
      return li;
    })));
  }

  function renderTrust() {
    renderTrustForm();
    renderTrustList();
    // Refresh any open "contact your trust circle" panels in results.
    $$('.trustp').forEach(function (p) { fillTrustPanel(p); });
  }

  // Panel shown on HIGH-RISK results (checker "Likely scam", on-call "High risk").
  function trustPanel(kind) {
    var p = el('section', { class: 'trustp', 'aria-label': t('trpTitle') });
    p._kind = kind;
    fillTrustPanel(p);
    return p;
  }

  function fillTrustPanel(p) {
    var kind = p._kind;
    var hadFocusClass = p.contains(document.activeElement) ? document.activeElement.getAttribute('data-f') : null;
    p.textContent = '';
    p.appendChild(el('h4', { class: 'trustp-title', text: t('trpTitle') }));
    if (!trust.list.some(function (c) { return c.id === trust.selected; })) trust.selected = trust.list[0] ? trust.list[0].id : null;

    if (trust.list.length) {
      var name = 'trp-' + Math.random().toString(36).slice(2, 7);
      var sel = trust.list.filter(function (c) { return c.id === trust.selected; })[0];
      if (trust.list.length > 1) {
        p.appendChild(el('fieldset', { class: 'trustp-pick' }, [el('legend', { text: t('trpChoose') })].concat(trust.list.map(function (c) {
          var input = el('input', { type: 'radio', name: name, value: c.id, 'data-f': 'pick-' + c.id });
          input.checked = c.id === trust.selected;
          input.addEventListener('change', function () { trust.selected = c.id; $$('.trustp').forEach(fillTrustPanel); });
          return el('label', { class: 'trustp-option' }, [input, el('bdi', { text: c.name })]);
        }))));
      }
      p.appendChild(el('a', { class: 'btn btn-primary btn-lg trustp-call', href: Trust.telHref(sel.phone), 'data-f': 'call' }, [
        el('span', { html: ICONS.call }), el('span', null, tIsolated('trCallAria', 'name', sel.name))
      ]));
      p.appendChild(el('p', { class: 'trustp-note', text: t('trpCallNote') }));
    } else {
      p.appendChild(el('p', { class: 'trustp-empty' }, [t('trpEmpty') + ' ', el('a', { href: '#trust', 'data-f': 'add', onclick: function () {
        // Close the on-call dialog first so the link can reach the page section.
        var d = $('#callDialog'); if (d.open) closeOnCall();
        setTimeout(function () { $('#trName').focus(); }, 300);
      } }, [t('trpAddLink')])]));
    }

    // Share an alert — only after the user confirms the exact text.
    var confirmBox = el('div', { class: 'trustp-confirm', hidden: true });
    var shareBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-lg trustp-share', 'aria-expanded': 'false', 'data-f': 'share' }, [
      el('span', { html: ICONS.people }), el('span', { text: t('trpShareBtn') })
    ]);
    shareBtn.addEventListener('click', function () {
      var open = confirmBox.hidden;
      confirmBox.hidden = !open;
      shareBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { status.textContent = ''; $('textarea', confirmBox).value = Trust.buildAlert(kind, t); $('.trustp-confirm-title', confirmBox).focus(); }
    });
    var canShare = !!navigator.share;
    var status = el('p', { class: 'note', role: 'status' });
    var ta = el('textarea', { rows: '4', dir: 'auto', readonly: true, 'aria-label': t('trpPreviewLabel') });
    function copyAlert(afterKey) {
      function ok() { status.className = 'note is-ok'; status.textContent = t(afterKey || 'trpCopied'); }
      function fail() { status.className = 'note is-error'; status.textContent = t('trpCopyFail'); ta.focus(); ta.select(); }
      function fallback() { try { ta.focus(); ta.select(); if (document.execCommand('copy')) ok(); else fail(); } catch (e2) { fail(); } }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(ok, fallback); else fallback();
    }
    confirmBox.appendChild(el('p', { class: 'trustp-confirm-title', tabindex: '-1', text: t('trpConfirmTitle') }));
    confirmBox.appendChild(el('p', { class: 'note note-muted', text: t('trpConfirmNote') }));
    confirmBox.appendChild(ta);
    if (!canShare) confirmBox.appendChild(el('p', { class: 'note', text: t('trpNoShare') }));
    confirmBox.appendChild(el('div', { class: 'trustp-row' }, [
      canShare ? el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        navigator.share({ title: t('trpShareTitle'), text: ta.value })
          .then(function () { status.className = 'note is-ok'; status.textContent = t('trpShared'); })
          .catch(function (err) {
            if (err && err.name === 'AbortError') { status.className = 'note'; status.textContent = t('trpShareCancelled'); }
            else copyAlert('trpShareFailedCopied');
          });
      } }, [t('trpShareYes')]) : null,
      el('button', { type: 'button', class: 'btn ' + (canShare ? 'btn-ghost' : 'btn-primary'), onclick: function () { copyAlert(); } }, [t('trpCopy')]),
      el('button', { type: 'button', class: 'btn btn-text', onclick: function () {
        confirmBox.hidden = true; shareBtn.setAttribute('aria-expanded', 'false'); shareBtn.focus();
      } }, [t('trpCancel')])
    ]));
    confirmBox.appendChild(status);
    p.appendChild(shareBtn);
    p.appendChild(confirmBox);
    p.appendChild(el('p', { class: 'trustp-spoof', text: t('trpSpoof') }));
    if (hadFocusClass) { var f = p.querySelector('[data-f="' + hadFocusClass + '"]'); if (f) f.focus(); }
  }

  function initTrust() {
    loadTrust();
    trust.selected = trust.list[0] ? trust.list[0].id : null;
    $('#trustForm').addEventListener('submit', submitTrust);
    $('#trCancel').addEventListener('click', function () {
      var id = trust.editId; resetTrustForm(); renderTrustList(); trustSay(t('trEditCancelled'));
      var b = id && $('#trustList [data-remove="' + id + '"]'); (b ? b.previousElementSibling : $('#trName')).focus();
    });
    ['#trName', '#trPhone'].forEach(function (s) {
      $(s).addEventListener('input', function () { $(s).removeAttribute('aria-invalid'); $(s === '#trName' ? '#trNameErr' : '#trPhoneErr').textContent = ''; });
    });
  }

  /* =========================================================
     DEMO EVALUATION — runs the REAL analyzer on a small curated,
     fictional set. Every number is computed from actual outputs.
     ========================================================= */
  var Evaluation = window.Der3Evaluation;
  var EVAL_KEY = 'der3-eval-set';
  var evalState = { set: [], result: null, stale: false, editIdx: -1, ranAt: null, running: false };

  function defaultEvalSet() { return JSON.parse(JSON.stringify(window.Der3EvalSet || [])); }
  function loadEvalSet() {
    var saved = null;
    try { saved = JSON.parse(storeGet('localStorage', EVAL_KEY) || 'null'); } catch (e) { saved = null; }
    evalState.set = Array.isArray(saved) && saved.length ? saved.map(Evaluation.sanitizeExample) : defaultEvalSet();
    evalState.custom = Array.isArray(saved) && saved.length > 0;
  }
  function saveEvalSet() { storeSet('localStorage', EVAL_KEY, JSON.stringify(evalState.set)); evalState.custom = true; }
  function markEvalStale() { if (evalState.result) evalState.stale = true; }
  function detectLang(text) { return /[؀-ۿ]/.test(text) ? 'ar' : 'en'; }
  function evalSay(msg) { var s = $('#evStatus'); s.textContent = ''; setTimeout(function () { s.textContent = msg; }, 50); }

  function runEvaluation() {
    if (evalState.running) return;
    if (!evalState.set.length) { evalSay(t('evNoExamples')); return; }
    evalState.running = true;
    var btn = $('#evRun');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    evalSay(t('evRunning'));
    wait(reduceMotion ? 50 : 500).then(function () {
      // Same engine.js the server uses — real outputs, nothing hard-coded.
      evalState.result = Evaluation.evaluate(evalState.set, Engine.analyze);
      evalState.stale = false;
      evalState.ranAt = Date.now();
      evalState.running = false;
      btn.disabled = false;
      btn.setAttribute('aria-busy', 'false');
      renderEval();
      var c = evalState.result.counts;
      evalSay(t('evDoneSr', { correct: c.correct, total: c.total, fp: c.falsePositive, fn: c.falseNegative, caution: c.caution }));
    });
  }

  function verdictLabel(v) { return v ? t('verdict_' + v) : t('evErrorLabel'); }

  function renderEvalSummary() {
    var box = $('#evSummary');
    box.textContent = '';
    var r = evalState.result;
    if (!r) {
      box.appendChild(el('div', { class: 'panel eval-empty' }, [el('p', { text: t('evNotRun', { n: evalState.set.length }) })]));
      return;
    }
    var c = r.counts;
    var pct = Math.round(r.correctShare * 100);
    var cards = [
      { k: 'total', v: c.total, label: t('evStatTotal'), sub: t('evStatTotalSub', { scam: r.scamCases, legit: r.legitCases }) },
      { k: 'correct', v: c.correct, label: t('evStatCorrect'), sub: t('evStatCorrectSub', { pct: pct, total: c.total }) },
      { k: 'caution', v: c.caution, label: t('evStatCaution'), sub: t('evStatCautionSub') },
      { k: 'fp', v: c.falsePositive, label: t('evStatFP'), sub: t('evStatFPSub') },
      { k: 'fn', v: c.falseNegative, label: t('evStatFN'), sub: t('evStatFNSub') }
    ];
    if (c.error) cards.push({ k: 'err', v: c.error, label: t('evStatError'), sub: t('evStatErrorSub') });
    box.appendChild(el('ul', { class: 'eval-stats' }, cards.map(function (s) {
      return el('li', { class: 'panel eval-stat stat-' + s.k }, [
        el('span', { class: 'eval-stat-num', text: String(s.v) }),
        el('span', { class: 'eval-stat-label', text: s.label }),
        el('span', { class: 'eval-stat-sub', text: s.sub })
      ]);
    })));

    // Confusion matrix: expected (rows) × actual verdict (columns)
    var cols = ['scam', 'caution', 'safe'].concat(c.error ? ['error'] : []);
    function cellClass(exp, col) {
      if ((exp === 'scam' && col === 'scam') || (exp === 'legit' && col === 'safe')) return 'm-correct';
      if ((exp === 'scam' && col === 'safe') || (exp === 'legit' && col === 'scam')) return 'm-wrong';
      return 'm-mid';
    }
    var table = el('table', { class: 'eval-matrix' }, [
      el('caption', { text: t('evMatrixCaption') }),
      el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: t('evMatrixCorner') })].concat(cols.map(function (col) {
        return el('th', { scope: 'col', text: col === 'error' ? t('evErrorLabel') : t('evActual') + ': ' + t('verdict_' + col) });
      })))]),
      el('tbody', null, ['scam', 'legit'].map(function (exp) {
        return el('tr', null, [el('th', { scope: 'row', text: t('evExpected') + ': ' + t('evExp_' + exp) })].concat(cols.map(function (col) {
          var n = r.matrix[exp][col];
          return el('td', { class: cellClass(exp, col) + (n ? '' : ' m-zero') }, [el('span', { class: 'm-num', text: String(n) })]);
        })));
      }))
    ]);
    box.appendChild(el('div', { class: 'panel eval-matrix-card' }, [
      el('h3', { class: 'card-title', text: t('evMatrixTitle') }),
      el('div', { class: 'eval-matrix-wrap' }, [table]),
      el('p', { class: 'eval-legend' }, [
        el('span', { class: 'lg lg-correct', text: t('evLegendCorrect') }),
        el('span', { class: 'lg lg-mid', text: t('evLegendMid') }),
        el('span', { class: 'lg lg-wrong', text: t('evLegendWrong') })
      ]),
      el('p', { class: 'eval-ran', text: t('evRanAt', { time: formatTime(evalState.ranAt) }) + ' · ' + (Engine.ENGINE_NAME || '') + (evalState.stale ? ' · ' + t('evStale') : '') })
    ]));
  }

  function renderEvalList() {
    var box = $('#evList');
    box.textContent = '';
    var rowsByIdx = evalState.result && !evalState.stale ? evalState.result.rows : null;
    if (!evalState.set.length) { box.appendChild(el('p', { class: 'trust-empty', text: t('evNoExamples') })); return; }
    box.appendChild(el('ol', { class: 'eval-list' }, evalState.set.map(function (ex, i) {
      if (evalState.editIdx === i) return evalEditor(ex, i);
      var row = rowsByIdx && rowsByIdx[i];
      var actual = row
        ? el('span', { class: 'ev-verdict v-' + (row.verdict || 'error') }, [verdictLabel(row.verdict) + (row.score != null ? ' · ' + row.score + '/100' : '')])
        : el('span', { class: 'ev-verdict v-none', text: t('evNotRunShort') });
      var outcome = row ? el('span', { class: 'ev-outcome o-' + row.outcome, text: t('evOutcome_' + row.outcome) }) : null;
      return el('li', { class: 'eval-item' + (row ? ' o-' + row.outcome : '') }, [
        el('div', { class: 'eval-item-head' }, [
          el('span', { class: 'ev-num', 'aria-hidden': 'true', text: String(i + 1) }),
          el('span', { class: 'ev-chip', html: ICONS[ex.type] }),
          el('span', { class: 'ev-chip-text', text: t('kind_' + ex.type) + ' · ' + t('evLang_' + ex.lang) }),
          outcome
        ]),
        el('p', { class: 'ev-text', lang: ex.lang, dir: ex.type === 'link' ? 'ltr' : 'auto' }, [el('bdi', { text: ex.text })]),
        el('dl', { class: 'ev-compare' }, [
          el('div', null, [el('dt', { text: t('evExpected') }), el('dd', null, [el('span', { class: 'ev-exp e-' + ex.expected, text: t('evExp_' + ex.expected) })])]),
          el('div', null, [el('dt', { text: t('evActual') }), el('dd', null, [actual])])
        ]),
        row && row.override ? el('p', { class: 'ev-override', text: t('evOverrideNote') }) : null,
        row && row.identityClaimed ? el('p', { class: 'ev-identity' }, [el('span', { class: 'id-badge', text: t('idBadge') }), el('span', { text: t('evIdentityNote') })]) : null,
        el('div', { class: 'ev-actions' }, [
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': t('evEditAria', { n: i + 1 }), onclick: function () {
            evalState.editIdx = i; renderEvalList(); var f = $('#evList .ev-edit textarea'); if (f) f.focus();
          } }, [t('evEdit')]),
          el('button', { type: 'button', class: 'btn btn-text btn-sm', 'aria-label': t('evRemoveAria', { n: i + 1 }), onclick: function () {
            evalState.set.splice(i, 1); if (evalState.result) evalState.result.rows.splice(i, 1);
            markEvalStale(); saveEvalSet(); renderEval(); evalSay(t('evRemoved', { n: i + 1 }));
            var next = $$('#evList .eval-item .btn-ghost')[Math.min(i, evalState.set.length - 1)] || $('#evAdd'); next.focus();
          } }, [t('evRemove')])
        ])
      ]);
    })));
  }

  function evalEditor(ex, i) {
    var uid = 'ev' + i;
    function select(id, labelKey, options, value) {
      var s = el('select', { id: id }, options.map(function (o) {
        var opt = el('option', { value: o.v, text: o.l }); if (o.v === value) opt.selected = true; return opt;
      }));
      return el('div', { class: 'field ev-field' }, [el('label', { for: id, text: t(labelKey) }), s]);
    }
    var err = el('p', { class: 'note is-error', role: 'alert' });
    var ta = el('textarea', { id: uid + '-text', rows: '4', dir: 'auto', maxlength: '5000' });
    ta.value = ex.text;
    var form = el('form', { class: 'ev-edit', novalidate: true }, [
      el('p', { class: 'ev-edit-title', text: t('evEditTitle', { n: i + 1 }) }),
      el('div', { class: 'ev-edit-row' }, [
        select(uid + '-type', 'evTypeLabel', Evaluation.TYPES.map(function (v) { return { v: v, l: t('kind_' + v) }; }), ex.type),
        select(uid + '-exp', 'evExpectedLabel', [{ v: 'scam', l: t('evExp_scam') }, { v: 'legit', l: t('evExp_legit') }], ex.expected)
      ]),
      el('div', { class: 'field' }, [el('label', { for: uid + '-text', text: t('evTextLabel') }), ta]),
      err,
      el('div', { class: 'ev-actions' }, [
        el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, [t('evSave')]),
        el('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: function () {
          var wasNew = ex._new; if (wasNew) evalState.set.splice(i, 1);
          evalState.editIdx = -1; renderEvalList();
          var b = $$('#evList .eval-item .btn-ghost')[i] || $('#evAdd'); b.focus();
        } }, [t('evCancel')])
      ])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) { err.textContent = t('evErrEmpty'); ta.focus(); return; }
      evalState.set[i] = Evaluation.sanitizeExample({
        id: ex.id, type: $('#' + uid + '-type').value, expected: $('#' + uid + '-exp').value, text: text, lang: detectLang(text)
      }, i);
      evalState.editIdx = -1;
      markEvalStale(); saveEvalSet(); renderEval();
      evalSay(t('evSaved', { n: i + 1 }));
      var b = $$('#evList .eval-item .btn-ghost')[i]; if (b) b.focus();
    });
    return el('li', { class: 'eval-item is-editing' }, [form]);
  }

  function renderEval() {
    renderEvalSummary();
    renderEvalList();
    $('#evReset').hidden = !evalState.custom;
  }

  function initEval() {
    loadEvalSet();
    $('#evRun').addEventListener('click', runEvaluation);
    $('#evAdd').addEventListener('click', function () {
      evalState.set.push({ id: 'custom-' + Date.now().toString(36), type: 'message', lang: state.lang, expected: 'scam', text: '', _new: true });
      evalState.editIdx = evalState.set.length - 1;
      renderEvalList();
      var f = $('#evList .ev-edit textarea'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
    });
    $('#evReset').addEventListener('click', function () {
      if (!window.confirm(t('evResetConfirm'))) return;
      try { localStorage.removeItem(EVAL_KEY); } catch (e) { /* ignore */ }
      evalState.set = defaultEvalSet(); evalState.custom = false; evalState.editIdx = -1;
      markEvalStale();
      renderEval();
      evalSay(t('evResetDone'));
      $('#evRun').focus();
    });
  }

  /* =========================================================
     MOBILE NAV
     ========================================================= */
  function initNav() {
    var btn = $('#menuToggle');
    var nav = $('#siteNav');
    function set(open) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); nav.classList.toggle('open', open); }
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      set(open);
      if (open) { var first = $('a', nav); if (first) first.focus(); }
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); }
    });
  }

  /* =========================================================
     START
     ========================================================= */
  function init() {
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-tab')); });
      tab.addEventListener('keydown', onTabKey);
    });

    $$('.tab-panel').forEach(function (form) {
      var type = form.getAttribute('data-type');
      if (type === 'screenshot') return; // wired in initShot()
      var input = $('#input-' + type);
      form.addEventListener('submit', function (e) { e.preventDefault(); runAnalysis(type); });
      $('.clear-btn', form).addEventListener('click', function () {
        input.value = '';
        clearFieldError(type);
        updateCount(type);
        if (state.view.name !== 'loading') { state.view = { name: 'empty' }; renderResultView(); }
        input.focus();
      });
      input.addEventListener('input', function () { updateCount(type); clearFieldError(type); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAnalysis(type); }
      });
    });

    $('#audioInput').addEventListener('change', onAudioChosen);
    $('#audioRemove').addEventListener('click', removeAudio);
    $('#micBtn').addEventListener('click', toggleMic);
    $('#historyClear').addEventListener('click', clearHistory);
    $('#callerForm').addEventListener('submit', runNumberCheck);
    $('#callerInput').addEventListener('input', function () { $('#callerInput').removeAttribute('aria-invalid'); });

    $$('[data-open-help]').forEach(function (b) { b.addEventListener('click', openHelp); });
    $$('[data-close-help]').forEach(function (b) { b.addEventListener('click', closeHelp); });
    $('#helpForm').addEventListener('submit', submitHelp);
    $('#copyBtn').addEventListener('click', copyNote);
    $('#helpDialog').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeHelp(); });

    initOnCall();
    initShot();
    initTrust();
    initEval();
    initNav();
    initMoreMenu();
    loadHistory();
    if (state.history.length) state.lastResult = state.history[0].result;

    applyTextSize(storeGet('localStorage', 'der3-size') === 'large' ? 'large' : 'normal');
    var saved = storeGet('localStorage', 'der3-lang');
    applyLanguage(saved || ((navigator.language || '').toLowerCase().indexOf('ar') === 0 ? 'ar' : 'en'));
    checkServer();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
