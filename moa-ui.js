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
  function applyShell() {
    if (!isStudent()) { document.body.classList.remove('moa-ui'); return; }
    document.body.classList.add('moa-ui');
    document.documentElement.style.setProperty('--moa-app', APP_COLOR);
    var header = document.querySelector('header');
    if (header && !header.querySelector('.moa-wordmark')) {
      header.insertBefore(el('div', { class: 'moa-wordmark', 'aria-label': 'MOA FORMULA' }, '<i></i>MOA FORMULA'), header.firstChild);
    }
    var h1 = document.getElementById('header-title');
    if (h1 && /자소서·이력서 첨삭/.test(h1.textContent)) h1.textContent = APP_NAME;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#FFFFFF');
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
      '<h2 class="moa-h1">문항과 써 둔 답을<br>붙여 넣어 주세요</h2><p class="moa-sub" style="margin:0">문항에 글자 수 제한이 적혀 있으면 분량도 맞춰 드려요. 문항이 여러 개면 모두 넣고 한 번에 제출하세요.</p>');
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
    var addBtn = document.getElementById('addItemBtn');
    if (addBtn) addBtn.textContent = '+ 문항 추가';

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
      coach.style.display = 'none';
      summary.style.display = '';
      write.style.display = '';
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
        startCoach();
      }, 80);
    })();

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
      if (!(compInput && compInput.value.trim())) steps.push({
        say: '어디에 지원하나요?',
        tip: '적어 주면 ‘입사 후 포부’ 첨삭을 그곳에 맞춰 드려요.',
        input: { placeholder: '기관·회사 이름 (예: OO복지관)', target: compInput },
        skip: '아직 정하지 않았어요'
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
      if (presetSelect && presetSelect.options.length > 1) steps.push({
        say: '전공이나 직군을 골라 주세요.',
        tip: '목록에 없으면 ‘기본’을 고르세요.',
        selectChips: presetSelect
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
      var history = [];

      function draw() {
        coach.innerHTML = '';
        var top = el('div', { style: 'display:flex;justify-content:space-between;align-items:center' });
        top.appendChild(el('div', { class: 'moa-coach-who' }, '<span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/></svg></span>자소서 코치'));
        var dots = el('div', { class: 'moa-steps', 'aria-label': total + '단계 중 ' + Math.min(idx + 1, total) + '단계' });
        for (var i = 0; i < total; i++) dots.appendChild(el('i', i <= idx ? { class: 'on' } : null));
        top.appendChild(dots);
        coach.appendChild(top);
        history.slice(-2).forEach(function (h) {
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
            advance(v, '');
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
      }

      function advance(me, reply) {
        history.push({ say: steps[idx].say, me: me, reply: reply });
        idx++;
        draw();
      }

      function done() {
        var nm = nameInput.value.trim();
        coach.appendChild(el('p', { class: 'moa-say' }, esc((nm ? nm + '님, ' : '') + '준비 끝났어요. 이제 문항을 써 볼게요.')));
        setTimeout(function () { finish(false); }, 700);
      }

      if (!total) { finish(true); return; }
      draw();
    }
  }

  /* ── 화면 변화 감시 ── */
  function scan() {
    applyShell();
    if (!document.body.classList.contains('moa-ui')) return;
    var nameInput = document.getElementById('studentNameInput');
    if (nameInput) {
      var card = nameInput.closest('.card');
      if (card && !card.dataset.moaDone && document.getElementById('itemsContainer')) enhanceForm(card);
    }
    document.querySelectorAll('.item-block').forEach(enhanceItem);
  }

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
