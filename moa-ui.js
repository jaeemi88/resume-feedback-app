/* ─────────────────────────────────────────────
   MOA FORMULA 화면 개편 — 자소서·이력서 첨삭 학생 화면 (2026-10-03)
   · 기존 기능(제출·첨삭·개인 고객 자동 저장)은 그대로 두고, 화면만 바꿉니다.
   · 코치 대화는 기존 입력칸(이름·채용 방식·전공 등)에 값을 대신 채워 넣는 방식이에요.
   · 이 파일을 지우고 index.html의 두 줄을 빼면 예전 화면으로 돌아가요.
   ───────────────────────────────────────────── */
(function () {
  'use strict';
  var APP_COLOR = '#643DF2';
  var APP_NAME = '자소서 첨삭';

  /* 앱 전용 보조 스타일 */
  var css = [
    'body.moa-ui .item-block{border:1px solid var(--moa-line) !important;border-radius:18px !important;padding:18px !important;margin-bottom:14px !important}',
    'body.moa-ui .item-remove-btn{width:36px;height:36px;top:10px !important;right:10px !important;border-radius:10px !important;color:var(--moa-faint) !important;font-size:16px !important}',
    'body.moa-ui .item-remove-btn:hover{background:var(--moa-surface) !important;color:var(--moa-danger) !important}',
    'body.moa-ui .item-block details summary{color:var(--moa-ink-2) !important;min-height:40px;display:flex;align-items:center}',
    'body.moa-ui .sc-toggle-btn{background:var(--moa-lime-soft) !important;color:var(--moa-olive) !important;border:0 !important;border-radius:10px !important;min-height:40px;font-weight:700 !important}',
    'body.moa-ui .item-char-counter{display:none !important}',
    'body.moa-ui .status-msg{border-radius:12px !important}',
    'body.moa-ui .link-box{background:var(--moa-surface) !important;border-radius:12px !important}',
    'body.moa-ui .moa-basics{margin-bottom:8px}',
    'body.moa-ui .moa-write-head{margin:4px 0 16px}',
    'body.moa-ui #submitBtn{width:100%}',
    'body.moa-ui .card h2.moa-h1{font-size:24px !important;line-height:1.4}',
    'body.moa-ui .moa-write,body.moa-ui .moa-summary{scroll-margin-top:72px}',
    'body.moa-ui .item-block .moa-chips{flex-wrap:nowrap;overflow-x:auto;margin-right:-18px;padding-right:18px;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
    'body.moa-ui .item-block .moa-chips::-webkit-scrollbar{display:none}',
    'body.moa-ui .item-block .moa-chip{flex-shrink:0}'
  ].join('\n');

  function addStyle() {
    if (document.getElementById('moa-ui-app-css')) return;
    var s = document.createElement('style');
    s.id = 'moa-ui-app-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── 허브 '이어서 하기'용 진행 상황 보고 (2026-10-03) ──
     허브가 주소 끝에 붙여 준 #moa-s={이름, 숫자4자리}를 이 창(세션)에만 보관하고,
     (강사코드|이름|숫자4자리)를 SHA-256으로 뒤섞은 열쇠만 서버에 보냄 — 이름·숫자는 보내지 않음 */
  var PROGRESS_API = 'https://resume-feedback-app-phi.vercel.app/api/progress';
  function moaStudent() {
    var m = location.hash.match(/^#moa-s=(.+)$/);
    if (m) {
      try {
        var o = JSON.parse(decodeURIComponent(m[1]));
        if (o && o.n && /^\d{4}$/.test(o.p4)) sessionStorage.setItem('moa_s', JSON.stringify({ n: String(o.n).slice(0, 20), p4: o.p4 }));
      } catch (e) {}
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    }
    try { return JSON.parse(sessionStorage.getItem('moa_s') || 'null'); } catch (e) { return null; }
  }
  var MOA_S = moaStudent();
  function moaTeacherId() { try { return typeof TEACHER_ID !== 'undefined' ? TEACHER_ID : ''; } catch (e) { return ''; } }
  function moaKey() {
    var t = moaTeacherId();
    if (!MOA_S || !t || !(window.crypto && crypto.subtle)) return Promise.resolve('');
    var data = new TextEncoder().encode(t + '|' + MOA_S.n.trim() + '|' + MOA_S.p4);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return ''; });
  }
  function moaReport(app, data) {
    moaKey().then(function (k) {
      if (!k) return;
      fetch(PROGRESS_API, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'put', k: k, app: app, data: data }) }).catch(function () {});
    });
  }

  var MOA_APP = 'resume';
  /* ── 강의별 앱 기록 (2026-10-03) ──
     허브가 주소에 붙여 준 ci(입장 코드 1회분 이름표)를 이 창에만 보관하고, 제출·연습이 성공할 때마다
     그 강의의 숫자만 하나 올림 (이름·숫자 4자리는 보내지 않음 · 열쇠 k만). 운영보드 결과보고서가 이 숫자를 불러감 */
  var MOA_CI = (function () {
    try {
      var q = new URLSearchParams(location.search).get('ci') || '';
      if (/^ci_[a-z0-9]{8,24}$/.test(q)) sessionStorage.setItem('moa_ci', q);
      return sessionStorage.getItem('moa_ci') || '';
    } catch (e) { return ''; }
  })();
  function moaStat(app, extra) {
    if (!MOA_CI) return;
    moaKey().then(function (k) {
      var b = { action: 'stat', ci: MOA_CI, k: k || '', app: app };
      Object.keys(extra || {}).forEach(function (x) { b[x] = extra[x]; });
      fetch(PROGRESS_API, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).catch(function () {});
    });
  }
  // 자소서 점검 점수: 문항마다 경험 구조(STAR 등) 칸 + 구체성 3칸 중 채운 비율 → 100점, 구조를 모두 갖춘 문항 비율
  function moaEssayScore(bodyText) {
    try {
      var o = JSON.parse(bodyText || '{}'), its = Array.isArray(o.items) ? o.items : [];
      if (o.clientCode) return null; // 개인 고객은 강의 기록에서 뺌
      var sc = [], full = 0, n = 0;
      its.forEach(function (it) {
        var d = it && it.aiDraft; if (!d || !d.structure) return;
        var sv = Object.keys(d.structure).map(function (k) { return !!d.structure[k]; });
        var cv = d.concreteness ? Object.keys(d.concreteness).map(function (k) { return !!d.concreteness[k]; }) : [];
        var all = sv.concat(cv); if (!all.length) return;
        sc.push(all.filter(Boolean).length / all.length * 100);
        n++; if (sv.length && sv.every(Boolean)) full++;
      });
      if (!n) return {};
      return { score: Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / n * 10) / 10, star: Math.round(full / n * 1000) / 10 };
    } catch (e) { return {}; }
  }
  if (MOA_CI && window.fetch && !window.__moaStatWrap) {
    window.__moaStatWrap = true;
    var moaFetch = window.fetch;
    window.fetch = function (input, init) {
      var p = moaFetch.apply(this, arguments);
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = String((init && init.method) || 'GET').toUpperCase();
        if (method === 'POST' && !document.body.classList.contains('role-teacher')) {
          if (MOA_APP === 'resume' && /\/api\/reviews(\?|$)/.test(url)) {
            var info = moaEssayScore(init && init.body);
            if (info) p.then(function (r) { if (r && r.ok) moaStat('resume', info); }).catch(function () {});
          } else if (MOA_APP === 'interview' && /\/api\/feedback(\?|$)/.test(url)) {
            p.then(function (r) { if (r && r.ok) moaStat('interview', { n: 1 }); }).catch(function () {});
          }
        }
      } catch (e) {}
      return p;
    };
  }

  function isStudent() {
    var b = document.body;
    return b.classList.contains('role-student') && !b.classList.contains('role-teacher');
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fire(node, type) { node.dispatchEvent(new Event(type, { bubbles: true })); }
  function hasClient() { try { return typeof CLIENT !== 'undefined' && !!CLIENT; } catch (e) { return false; } }
  function clientObj() { try { return CLIENT; } catch (e) { return null; } }
  function hasDraft() { try { return typeof CLIENT_DRAFT !== 'undefined' && !!CLIENT_DRAFT; } catch (e) { return false; } }

  /* ── 상단 바 ── */
  function isTeacher() { return document.body.classList.contains('role-teacher'); }
  function applyShell() {
    var b = document.body;
    if (!b.classList.contains('role-student') && !b.classList.contains('role-teacher')) { b.classList.remove('moa-ui', 'moa-teacher'); return; }
    b.classList.add('moa-ui');
    b.classList.toggle('moa-teacher', isTeacher());
    document.documentElement.style.setProperty('--moa-app', APP_COLOR);
    var header = document.querySelector('header');
    if (header && !header.querySelector('.moa-wordmark')) {
      header.insertBefore(el('div', { class: 'moa-wordmark', 'aria-label': 'MOA FORMULA' }, '<i></i>MOA FORMULA'), header.firstChild);
    }
    // 강사 화면: 오른쪽에 테두리+자물쇠 '허브' 버튼 (허브 링크가 살아 있을 때만)
    if (header && isTeacher() && !header.querySelector('.moa-head-right')) {
      var hub = document.querySelector('.moa-hubbar a');
      var right = el('div', { class: 'moa-head-right' });
      if (hub && hub.style.display !== 'none') right.appendChild(el('a', { class: 'moa-lock', href: hub.getAttribute('href') }, '허브'));
      header.appendChild(right);
    }
    var h1 = document.getElementById('header-title');
    if (h1 && /자소서·이력서 첨삭/.test(h1.textContent)) h1.textContent = APP_NAME;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#FFFFFF');
  }

  /* ── 강사 화면 보강 ── */
  function enhanceTeacher() {
    var qr = document.getElementById('qrImage');
    if (qr) { var qc = qr.closest('.card'); if (qc && !qc.classList.contains('moa-qr')) qc.classList.add('moa-qr'); }
    var list = document.getElementById('reviewsList');
    if (list) {
      var h2 = list.closest('.card') && list.closest('.card').querySelector('h2');
      var loading = /불러오는 중|불러오기 실패/.test(list.textContent) && !list.querySelector('.review-item');
      if (h2 && !loading) {
        var n = list.querySelectorAll(':scope > .review-item').length;
        var txt = n ? '검토할 첨삭이 ' + n + '건 있어요' : '검토할 첨삭이 없어요';
        if (h2.textContent !== txt) h2.textContent = txt;
      }
    }
  }

  /* ── select → 칩 ── */
  function chipsFromSelect(select, onPick) {
    var wrap = el('div', { class: 'moa-chips', role: 'group' });
    Array.prototype.forEach.call(select.options, function (o) {
      if (o.hidden || o.disabled || o.style.display === 'none') return;
      var b = el('button', { type: 'button', class: 'moa-chip', 'aria-pressed': String(o.value === select.value) }, esc(o.textContent));
      b.addEventListener('click', function () {
        select.value = o.value;
        fire(select, 'change');
        wrap.querySelectorAll('.moa-chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        if (onPick) onPick(o);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ── 라디오 묶음 → 반반 버튼 ── */
  function segFromRadios(name, container) {
    var radios = document.querySelectorAll('input[name="' + name + '"]');
    if (!radios.length || container.querySelector('.moa-seg')) return;
    var seg = el('div', { class: 'moa-seg', role: 'group' });
    radios.forEach(function (r) {
      var text = (r.parentElement && r.parentElement.textContent || r.value).trim();
      var b = el('button', { type: 'button', 'aria-pressed': String(r.checked) }, esc(text));
      b.addEventListener('click', function () {
        r.checked = true; fire(r, 'change');
        seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      seg.appendChild(b);
    });
    var row = radios[0].closest('div');
    if (row) { row.style.display = 'none'; row.parentNode.insertBefore(seg, row); }
  }

  /* ── 분량 막대 ── */
  function wireMeter(block) {
    var q = block.querySelector('.item-question');
    var a = block.querySelector('.item-answer');
    var counter = block.querySelector('.item-char-counter');
    if (!q || !a || !counter || block.querySelector('.moa-meter')) return;
    var meter = el('div', { class: 'moa-meter', 'aria-live': 'polite' },
      '<div class="moa-meter-bar"><b></b><i style="width:0"></i></div><div class="moa-meter-txt"><span></span><span></span></div>');
    counter.parentNode.insertBefore(meter, counter.nextSibling);
    var bar = meter.querySelector('i'), band = meter.querySelector('b'), txt = meter.querySelectorAll('.moa-meter-txt span');
    function update() {
      var len = a.value.length;
      var limit = 0;
      try { limit = extractCharLimit(q.value) || 0; } catch (e) {}
      if (limit) {
        band.style.display = '';
        bar.style.width = Math.min(100, len / limit * 100) + '%';
        meter.classList.toggle('over', len > limit);
        txt[0].innerHTML = '<strong>' + len + '</strong> / ' + limit + '자';
        var lo = Math.round(limit * 0.8), hi = Math.round(limit * 0.9);
        txt[1].textContent = len > limit ? (len - limit) + '자 넘었어요' : (len >= lo ? '분량 딱 좋아요' : '라임 구간(' + lo + '~' + hi + '자)까지 쓰면 좋아요');
      } else {
        band.style.display = 'none';
        bar.style.width = Math.min(100, len / 10) + '%';
        meter.classList.remove('over');
        txt[0].innerHTML = '<strong>' + len + '</strong>자';
        txt[1].textContent = '문항에 글자 수를 적으면 분량을 맞춰 드려요';
      }
    }
    a.addEventListener('input', update);
    q.addEventListener('input', update);
    update();
  }

  function enhanceItem(block) {
    if (block.dataset.moaDone) return;
    block.dataset.moaDone = '1';
    var row = block.querySelector('.item-questionType-row');
    var sel = block.querySelector('.item-questionType');
    if (row && sel) {
      var lab = row.querySelector('label');
      if (lab) lab.textContent = '문항 유형';
      var chips = chipsFromSelect(sel);
      sel.style.display = 'none';
      sel.parentNode.insertBefore(chips, sel.nextSibling);
      sel.addEventListener('change', function () {
        chips.querySelectorAll('.moa-chip').forEach(function (c, i) { c.setAttribute('aria-pressed', String(sel.options[i] && sel.options[i].value === sel.value)); });
      });
    }
    var sc = block.querySelector('.sc-toggle-btn');
    if (sc) sc.textContent = '막막하면 눌러 보세요 · 재료 꺼내기';
    wireMeter(block);
  }

  /* ── 코치 대화 ── */
  function enhanceForm(card) {
    if (card.dataset.moaDone) return;
    card.dataset.moaDone = '1';
    card.classList.add('moa-flat');

    var nameInput = document.getElementById('studentNameInput');
    var itemsContainer = document.getElementById('itemsContainer');
    var h2 = card.querySelector('h2');
    var intro = h2 && h2.nextElementSibling && h2.nextElementSibling.tagName === 'P' ? h2.nextElementSibling : null;
    if (h2) h2.style.display = 'none';
    if (intro) intro.style.display = 'none';

    // 기본 정보 칸들을 한 묶음으로 (숨김) — 코치가 여기에 값을 채움
    var basics = el('div', { class: 'moa-basics' });
    basics.style.display = 'none';
    var firstLabel = nameInput.previousElementSibling;
    var node = firstLabel;
    card.insertBefore(basics, firstLabel);
    while (node && node !== itemsContainer) {
      var next = node.nextElementSibling;
      basics.appendChild(node);
      node = next;
    }
    segFromRadios('hiringType', basics);
    basics.querySelectorAll('label').forEach(function (l) {
      if (l.children.length) return; // 안에 선택 단추가 있는 label은 건드리지 않음
      l.textContent = l.textContent.replace(/\s*\((선택)[^)]*\)\s*$/, ' (선택)').replace('본인 전공(또는 직군)을 선택하세요', '전공·직군');
    });

    // 문항 쓰는 구역
    var write = el('div', { class: 'moa-write' });
    write.style.display = 'none';
    card.insertBefore(write, itemsContainer);
    var head = el('div', { class: 'moa-write-head' },
      '<h2 class="moa-h1">문항과 써 둔 답을<br>붙여 넣어 주세요</h2><p class="moa-sub" style="margin:0">문항에 글자 수 제한이 적혀 있으면 분량도 맞춰 드려요. 문항 유형을 눌러 칸마다 쓰면, 쓴 문항이 모두 한 번에 제출돼요.</p>');
    write.appendChild(head);
    var tail = [];
    var n = itemsContainer;
    while (n) { tail.push(n); n = n.nextElementSibling; }
    tail.forEach(function (x) { write.appendChild(x); });
    var btnRow = write.querySelector('.btn-row');
    var statusMsg = document.getElementById('statusMsg');
    if (btnRow) {
      var dock = el('div', { class: 'moa-dock' });
      btnRow.parentNode.insertBefore(dock, btnRow);
      dock.appendChild(btnRow);
      if (statusMsg) dock.appendChild(statusMsg);
      btnRow.style.marginTop = '0';
    }

    // 요약 줄
    var summary = el('div', { class: 'moa-summary' }, '<p></p><button type="button">고치기</button>');
    summary.style.display = 'none';
    card.insertBefore(summary, basics);
    summary.querySelector('button').addEventListener('click', function () {
      var open = basics.style.display !== 'none';
      basics.style.display = open ? 'none' : '';
      this.textContent = open ? '고치기' : '접기';
      if (!open) refreshPresetChips();
      else renderSummary();
    });

    var coach = el('div', { class: 'moa-coach' });
    card.insertBefore(coach, summary);

    var phase = 'start'; // intro → coach → write
    var coachCtl = null;  // 코치 질문을 진행했으면 되돌아가기 함수가 들어감
    var backToCoach = el('button', { type: 'button', class: 'moa-prev' }, '← 이전 질문으로');
    backToCoach.style.display = 'none';
    backToCoach.addEventListener('click', function () { NAV.back && NAV.back(); });
    head.insertBefore(backToCoach, head.firstChild);
    NAV.back = function () { return coachCtl ? coachCtl() : false; };
    var everAnswered = false; // 코치 질문에 한 번이라도 답했는지
    NAV.dirty = function () {
      if (hasClient()) return false; // 개인 고객은 서버에 자동 저장됨
      var typed = Array.prototype.some.call(document.querySelectorAll('.item-answer, .item-question'), function (t) { return t.value.trim(); });
      return typed || everAnswered;
    };
    setupNav();

    var presetSelect = document.getElementById('presetSelect');
    var presetChipsInBasics = null;
    function refreshPresetChips() {
      if (!presetSelect) return;
      if (presetChipsInBasics) presetChipsInBasics.remove();
      presetChipsInBasics = chipsFromSelect(presetSelect, renderSummary);
      presetSelect.style.display = 'none';
      presetSelect.parentNode.insertBefore(presetChipsInBasics, presetSelect.nextSibling);
    }

    function renderSummary() {
      var parts = [];
      var nm = nameInput.value.trim(); if (nm) parts.push(esc(nm));
      var co = (document.getElementById('targetCompanyInput') || {}).value; if (co && co.trim()) parts.push(esc(co.trim()));
      var hr = document.querySelector('input[name="hiringType"]:checked');
      parts.push(hr && hr.value === 'blind' ? '블라인드 채용' : '일반 채용');
      if (presetSelect && presetSelect.selectedOptions[0]) parts.push(esc(presetSelect.selectedOptions[0].textContent));
      summary.querySelector('p').innerHTML = parts.join(' · ');
    }

    function finish(instant) {
      phase = 'write';
      coach.style.display = 'none';
      summary.style.display = '';
      write.style.display = '';
      backToCoach.style.display = coachCtl ? '' : 'none';
      renderSummary();
      if (!instant) {
        var first = write.querySelector('.item-question');
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); summary.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
      }
    }

    // 전공 목록이 다 불러와진 뒤 시작 (개인 고객 임시 저장 불러오기도 끝난 뒤)
    var tries = 0;
    (function waitReady() {
      var ready = presetSelect && presetSelect.options.length && !/불러오는/.test(presetSelect.options[0].textContent);
      if (!ready && tries++ < 60) { setTimeout(waitReady, 100); return; }
      setTimeout(function () {
        var anyAnswer = Array.prototype.some.call(document.querySelectorAll('.item-answer'), function (t) { return t.value.trim(); });
        if (anyAnswer || hasDraft()) { finish(true); return; }
        if (MOA_S && MOA_S.n && !nameInput.value.trim()) { nameInput.value = MOA_S.n; fire(nameInput, 'input'); } // 허브에서 입력한 이름 이어받기
        startCoach();
      }, 80);
    })();

    // 시작 전 '전체 흐름' 안내 (2026-10-03) — 몇 단계·몇 분인지, 완성되면 어떤 모습인지 먼저 보여 줌
    function showIntro(total, C, go) {
      var OFF = 'moa_intro_cv_off';
      try { if (localStorage.getItem(OFF) === '1') { go(); return false; } } catch (e) {}
      var mins = 10 + Math.ceil(total / 2);
      phase = 'intro';
      coach.innerHTML = '';
      var box = el('div', { class: 'moa-intro', role: 'region', 'aria-label': '전체 흐름 안내' },
        '<span class="k">시작 전 1분 · 전체 흐름</span>' +
        '<h2>3단계면<br>내 자소서가 완성돼요</h2>' +
        '<p class="s">약 ' + mins + '분이면 끝나요. 지금 어디쯤인지 위에 계속 표시해 드려요.</p>' +
        '<ol>' +
        '<li><b>1</b><div><h3>코치 질문에 답하기</h3><p>이름·지원처·채용 방식 등 짧은 질문 ' + total + '개</p></div><em>1분</em></li>' +
        '<li><b>2</b><div><h3>문항과 내 답 쓰기</h3><p>초안은 직접, AI는 다듬기만 · 막막하면 ‘재료 꺼내기’</p></div><em>10분</em></li>' +
        '<li><b>3</b><div><h3>제출 → 완성된 글 받기</h3><p>' + (C ? '선생님 검토 후 이메일로 결과가 와요' : '선생님 검토 후 결과 링크가 와요') + '</p></div><em>제출 1~3분</em></li>' +
        '</ol>' +
        '<div class="pv" aria-label="완성 예시"><p class="pv-l"><span>이렇게 완성돼요</span><span>예시</span></p>' +
        '<div class="pv-h"><small>✓ 첨삭 완료 · 지원동기</small><p>예시 1곳만 내 경험으로 바꾸면 완성이에요</p><div class="pv-bar"><i></i></div></div>' +
        '<p class="pv-t">저는 <mark class="me">재활병원 실습 4주</mark> 동안 환자분의 작은 변화를 매일 기록했습니다. 그 기록으로 <mark>보행 속도가 빨라지는 변화</mark>를 먼저 말씀드려…</p>' +
        '<div class="pv-c"><span>구조 점검</span><span>예상 꼬리질문</span><span>워드·PDF 저장</span></div></div>' +
        '<div class="go-row"><button type="button" class="go">좋아요, 시작할게요 →</button><button type="button" class="skip">다음부터 바로 시작하기</button></div>');
      coach.appendChild(box);
      box.querySelector('.go').addEventListener('click', go);
      box.querySelector('.skip').addEventListener('click', function () { try { localStorage.setItem(OFF, '1'); } catch (e) {} go(); });
      setTimeout(function () { var g = box.querySelector('.go'); if (g) g.focus({ preventScroll: true }); }, 30);
      return true;
    }

    function startCoach() {
      var C = clientObj();
      var docSel = document.getElementById('docTypeSelect');
      var compInput = document.getElementById('targetCompanyInput');
      var postInput = document.getElementById('jobPostingInput');
      var emailInput = document.getElementById('studentEmailInput');
      var instSel = document.getElementById('institutionSelect');
      var steps = [];

      if (!nameInput.value.trim()) steps.push({
        say: '반가워요. 이름을 알려 주세요.',
        input: { placeholder: '이름', target: nameInput, required: true }
      });
      if (!C && docSel) steps.push({
        say: '오늘 다듬을 건 무엇인가요?',
        choices: [{ label: '자기소개서', value: 'resume' }, { label: '이력서 한 줄 소개', value: 'cv' }],
        pick: function (v) { docSel.value = v; fire(docSel, 'change'); }
      });
      if (presetSelect && presetSelect.options.length > 1) steps.push({
        say: '전공이나 직군을 골라 주세요.',
        tip: '목록에 없으면 ‘기본’을 고르세요.',
        selectChips: presetSelect
      });
      // 🔎 기업 심화 분석 (2026-10-05): 심화 수업·유료 고객이면 기업명을 받자마자 검색을 시작한다고 알려 줌
      var deepOn = typeof window.resumeDeepOn === 'function' && window.resumeDeepOn();
      var companyOff = typeof window.resumeCompanyOff === 'function' && window.resumeCompanyOff();
      if (!companyOff && !(compInput && compInput.value.trim())) steps.push({
        say: '어디에 지원하나요?',
        tip: deepOn ? '적어 주면 그 회사의 인재상·최근 소식을 찾아서 지원동기·포부 첨삭에 반영해 드려요.' : '적어 주면 ‘입사 후 포부’ 첨삭을 그곳에 맞춰 드려요.',
        input: { placeholder: '기관·회사 이름 (예: OO복지관)', target: compInput },
        skip: '아직 정하지 않았어요',
        reply: function (v) { return deepOn ? '🔎 ' + v + ' 정보를 찾아 둘게요. 문항 쓰는 화면 맨 위에서 볼 수 있어요.' : ''; }
      });
      steps.push({
        say: '채용공고에 ‘블라인드 채용’이라는 말이 있었나요?',
        tip: '블라인드 채용이면 학교·지역·가족이 드러나는 이름을 빼야 해요.',
        choices: [{ label: '있었어요', value: 'blind' }, { label: '없었어요', value: 'general' }, { label: '잘 모르겠어요', value: 'general', soft: true }],
        pick: function (v) {
          var r = document.querySelector('input[name="hiringType"][value="' + v + '"]');
          if (r) { r.checked = true; fire(r, 'change'); }
          var seg = basics.querySelector('.moa-seg');
          if (seg) seg.querySelectorAll('button').forEach(function (b, i) { b.setAttribute('aria-pressed', String((v === 'blind') === (i === 1))); });
        },
        reply: function (v, label) { return label === '잘 모르겠어요' ? '일반 채용으로 볼게요. 공고를 확인하면 위에서 바꿀 수 있어요.' : (v === 'blind' ? '학교·지역·가족 이름은 빼고 첨삭할게요.' : '과목명·기관명 같은 이름을 살려서 첨삭할게요.'); }
      });
      if (instSel && instSel.options.length > 1) steps.push({
        say: '소속 기관을 골라 주세요.',
        selectChips: instSel
      });
      if (!(postInput && postInput.value.trim()) && !(docSel && docSel.value === 'cv')) steps.push({
        say: '채용공고에서 중요해 보이는 내용이 있으면 붙여 넣어 주세요.',
        tip: '우대 사항이나 인재상 한두 줄이면 충분해요.',
        input: { placeholder: '예) 사례관리 경험자 우대, 공감·소통 역량 중시', target: postInput, multiline: true },
        skip: '없어요'
      });
      if (!(C && C.hasEmail)) steps.push({
        say: '첨삭이 끝나면 이메일로 알려 드릴까요?',
        input: { placeholder: '이메일 주소', target: emailInput, type: 'email' },
        skip: '괜찮아요'
      });

      var total = steps.length;
      var idx = 0;
      var log = [];        // 지금까지 한 대답 (화면 위쪽에 두 줄 보여 줌)
      var introShown = false;
      var doneTimer = null;

      function draw() {
        phase = 'coach';
        coach.style.display = '';
        coach.innerHTML = '';
        var top = el('div', { style: 'display:flex;justify-content:space-between;align-items:center' });
        top.appendChild(el('div', { class: 'moa-coach-who' }, '<span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/></svg></span>자소서 코치'));
        var dots = el('div', { class: 'moa-steps', 'aria-label': total + '단계 중 ' + Math.min(idx + 1, total) + '단계' });
        for (var i = 0; i < total; i++) dots.appendChild(el('i', i <= idx ? { class: 'on' } : null));
        var posWrap = el('div', { style: 'display:flex;align-items:center' });
        posWrap.appendChild(dots);
        posWrap.appendChild(el('span', { class: 'moa-coach-pos', 'aria-hidden': 'true' }, idx >= total ? '끝!' : (idx === total - 1 ? '마지막 질문' : '질문 ' + (idx + 1) + ' / ' + total)));
        top.appendChild(posWrap);
        coach.appendChild(top);
        log.slice(-2).forEach(function (h) {
          coach.appendChild(el('p', { class: 'moa-say past' }, esc(h.say)));
          if (h.me) coach.appendChild(el('div', { class: 'moa-me' }, esc(h.me)));
          if (h.reply) coach.appendChild(el('p', { class: 'moa-tip' }, esc(h.reply)));
        });
        if (idx >= total) { done(); return; }
        var s = steps[idx];
        coach.appendChild(el('p', { class: 'moa-say', 'aria-live': 'polite' }, esc(s.say)));
        if (s.tip) coach.appendChild(el('p', { class: 'moa-tip' }, esc(s.tip)));
        var ask = el('div', { class: 'moa-ask' });
        coach.appendChild(ask);

        if (s.choices) {
          var row = el('div', { class: 'moa-chips' });
          s.choices.forEach(function (c) {
            var b = el('button', { type: 'button', class: 'moa-chip' }, esc(c.label));
            b.addEventListener('click', function () { s.pick(c.value); advance(c.label, s.reply ? s.reply(c.value, c.label) : ''); });
            row.appendChild(b);
          });
          ask.appendChild(row);
          var fb = row.querySelector('button'); if (fb) setTimeout(function () { fb.focus({ preventScroll: true }); }, 30);
        } else if (s.selectChips) {
          ask.appendChild(chipsFromSelect(s.selectChips, function (o) { advance(o.textContent, ''); }));
        } else if (s.input) {
          var r2 = el('div', { class: 'moa-ask-row' });
          var inp = s.input.multiline ? el('textarea', { rows: '3', 'aria-label': s.say }) : el('input', { type: s.input.type || 'text', 'aria-label': s.say, autocomplete: s.input.type === 'email' ? 'email' : 'off' });
          inp.placeholder = s.input.placeholder || '';
          if (s.input.target && s.input.target.value) inp.value = s.input.target.value;
          var go = el('button', { type: 'button', class: 'moa-go', 'aria-label': '다음' }, '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>');
          function submit() {
            var v = inp.value.trim();
            if (!v && s.input.required) { inp.focus(); inp.style.borderColor = 'var(--moa-danger)'; return; }
            if (!v && s.skip) { advance(s.skip, ''); return; }
            if (s.input.target) { s.input.target.value = v; fire(s.input.target, 'input'); }
            advance(v, s.reply ? s.reply(v) : '');
          }
          go.addEventListener('click', submit);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
          r2.appendChild(inp); r2.appendChild(go);
          ask.appendChild(r2);
          setTimeout(function () { inp.focus({ preventScroll: true }); }, 30);
        }
        if (s.skip) {
          var sk = el('button', { type: 'button', class: 'moa-skip' }, esc(s.skip));
          sk.addEventListener('click', function () { advance(s.skip, ''); });
          ask.appendChild(sk);
        }
        if (idx > 0 || introShown) {
          var pv = el('button', { type: 'button', class: 'moa-prev' }, idx > 0 ? '← 이전 질문' : '← 전체 흐름 다시 보기');
          pv.addEventListener('click', function () { back(); });
          coach.appendChild(el('div', null)).appendChild(pv);
        }
      }

      // 한 단계 뒤로: 문항 쓰기 → 마지막 질문 → 그 전 질문 → 전체 흐름 안내
      function back() {
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
        if (phase === 'write') {
          summary.style.display = 'none';
          basics.style.display = 'none';
          summary.querySelector('button').textContent = '고치기';
          write.style.display = 'none';
          idx = total - 1; log.pop();
          draw();
          coach.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }
        if (phase === 'coach') {
          if (idx >= total) { idx = total - 1; log.pop(); draw(); return true; }
          if (idx > 0) { idx--; log.pop(); draw(); return true; }
          if (introShown) { showIntro(total, C, draw); return true; }
        }
        return false;
      }
      coachCtl = back;

      function advance(me, reply) {
        log.push({ say: steps[idx].say, me: me, reply: reply });
        everAnswered = true;
        idx++;
        draw();
      }

      function done() {
        var nm = nameInput.value.trim();
        coach.appendChild(el('p', { class: 'moa-say' }, esc((nm ? nm + '님, ' : '') + '준비 끝났어요. 이제 문항을 써 볼게요.')));
        doneTimer = setTimeout(function () { doneTimer = null; finish(false); }, 700);
      }

      if (!total) { coachCtl = null; finish(true); return; }
      introShown = showIntro(total, C, draw);
    }
  }


  /* ── 뒤로가기·나가기 확인 (2026-10-03) ── */
  var NAV_CSS = [
    '.moa-confirm-wrap{position:fixed;inset:0;z-index:10000;background:rgba(20,26,46,.48);display:flex;align-items:flex-end;justify-content:center;padding:16px;font-family:"Noto Sans KR",sans-serif}',
    '@media(min-width:560px){.moa-confirm-wrap{align-items:center}}',
    '.moa-confirm{background:#fff;border-radius:var(--moa-r-lg,18px);width:100%;max-width:380px;padding:24px 20px 16px;box-shadow:0 18px 50px rgba(20,26,46,.25)}',
    '.moa-confirm h3{margin:0 0 8px;font-size:18px;font-weight:700;color:var(--moa-ink,#141A2E);line-height:1.4}',
    '.moa-confirm p{margin:0 0 20px;font-size:14px;color:var(--moa-muted,#5F6678);line-height:1.6}',
    '.moa-confirm button{display:block;width:100%;border:0;font:inherit;font-size:15px;font-weight:700;border-radius:var(--moa-r-md,14px);padding:14px;cursor:pointer}',
    '.moa-confirm .stay{background:var(--moa-ink,#141A2E);color:#fff}',
    '.moa-confirm .leave{background:none;color:var(--moa-muted,#5F6678);font-weight:500;margin-top:6px}',
    '.moa-prev{display:inline-flex;align-items:center;gap:4px;background:none;border:0;padding:8px 2px;margin-top:6px;font:inherit;font-size:13px;font-weight:600;color:var(--moa-muted,#5F6678);cursor:pointer}',
    '.moa-prev:hover{color:var(--moa-ink,#141A2E)}'
  ].join('\n');
  function addNavStyle() {
    if (document.getElementById('moa-nav-css')) return;
    var st = document.createElement('style'); st.id = 'moa-nav-css'; st.textContent = NAV_CSS; document.head.appendChild(st);
  }
  function moaConfirm(o) {
    addNavStyle();
    return new Promise(function (resolve) {
      var wrap = el('div', { class: 'moa-confirm-wrap', role: 'dialog', 'aria-modal': 'true' },
        '<div class="moa-confirm"><h3>' + esc(o.title) + '</h3><p>' + esc(o.body) + '</p>' +
        '<button type="button" class="stay">' + esc(o.stay || '계속 쓰기') + '</button>' +
        '<button type="button" class="leave">' + esc(o.leave || '나가기') + '</button></div>');
      function close(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      wrap.querySelector('.stay').addEventListener('click', function () { close(false); });
      wrap.querySelector('.leave').addEventListener('click', function () { close(true); });
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(false); });
      document.body.appendChild(wrap);
      setTimeout(function () { var b = wrap.querySelector('.stay'); if (b) b.focus({ preventScroll: true }); }, 30);
    });
  }
  window.moaConfirm = moaConfirm;

  /* 휴대폰 뒤로가기를 앱 안에서 처리: 화면 위에 '보초' 기록을 하나 올려 두고,
     뒤로가기로 그 기록이 빠지면 앱 안에서 한 단계 뒤로 간 뒤 보초를 다시 올림 */
  var NAV = { back: null, dirty: null, armed: false };
  function armGuard() {
    try { if (!(window.history.state && window.history.state.moaGuard)) window.history.pushState({ moaGuard: 1 }, ''); } catch (e) {}
  }
  function setupNav() {
    if (NAV.armed) return;
    NAV.armed = true;
    addNavStyle();
    armGuard();
    window.addEventListener('popstate', function (e) {
      if (e.state && e.state.moaGuard) return;
      if (location.hash || isTeacher() || !document.getElementById('studentNameInput')) return;
      if (document.querySelector('.moa-confirm-wrap')) { armGuard(); return; }
      if (NAV.back && NAV.back()) { armGuard(); return; }
      if (!(NAV.dirty && NAV.dirty())) { window.history.back(); return; }
      moaConfirm({ title: '지금 나가면 쓴 내용이 사라져요', body: '아직 제출하지 않았어요. 이 화면에 계속 있으면 쓴 내용이 그대로 남아 있어요.', stay: '계속 쓰기', leave: '나가기' })
        .then(function (leave) { if (leave) window.history.back(); else armGuard(); });
    });
    window.addEventListener('beforeunload', function (e) {
      if (NAV.dirty && NAV.dirty() && document.getElementById('studentNameInput')) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ── 화면 변화 감시 ── */
  function scan() {
    applyShell();
    if (!document.body.classList.contains('moa-ui')) return;
    if (isTeacher()) { enhanceTeacher(); return; }
    var nameInput = document.getElementById('studentNameInput');
    if (nameInput) {
      var card = nameInput.closest('.card');
      if (card && !card.dataset.moaDone && document.getElementById('itemsContainer')) enhanceForm(card);
    }
    document.querySelectorAll('.item-block').forEach(enhanceItem);
  }

  // 제출 성공(/api/reviews POST)을 지켜보다가 허브에 '검토 중' 표시
  (function watchSubmit() {
    if (!window.fetch || !MOA_S) return;
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = orig.apply(this, arguments);
      if (/\/api\/reviews/.test(url) && init && String(init.method || '').toUpperCase() === 'POST') {
        p.then(function (r) {
          if (!r.ok) return;
          var n = 0; try { n = (JSON.parse(init.body).items || []).length; } catch (e) {}
          moaReport('resume', { state: 'submitted', items: n });
        }).catch(function () {});
      }
      return p;
    };
  })();

  function start() {
    addStyle();
    scan();
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; scan(); });
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
