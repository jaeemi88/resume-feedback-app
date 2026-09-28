/* MOA FORMULA 강사용 잠금 (2026-09-28 · 강사 개인 승인 링크 추가)
   ─────────────────────────────────────────────
   index.html의 메인 스크립트보다 "먼저" 불러와야 합니다.
     <script src="/staff-guard.js" data-mode="admin" data-color="#295BF2"></script>

   data-mode="admin"  : 주소에 admin=1 이 있을 때만 강사용 (모의면접·자소서)
   data-mode="always" : 학생 설문(survey=1)만 빼고 전부 강사용 (트래커·허브)
   data-color         : 앱 대표색 (잠금 화면 버튼 테두리 색)
   data-check         : 확인 주소 (생략하면 같은 앱의 /api/staff-check)
                        허브처럼 서버가 없는 곳은 자소서 앱의 확인 주소를 빌려 씀

   들어오는 방법 2가지
   1) 원장님 암호(STAFF_PIN) → 모든 앱
   2) 강사 개인 승인 링크(주소의 ?k=키) → 암호 없이, 자소서·모의면접 강사용만
      키는 이 기기에 저장되고 주소창에서는 바로 지워짐

   하는 일
   1) 강사용 화면: 확인될 때까지 화면을 가림
   2) 강사용 화면의 모든 /api/ 요청에 암호·키를 자동으로 붙임 (서버가 확인)
   3) 학생용 화면: 상단 "← 허브" 버튼을 숨김
   4) 확인 결과를 window.MOA_STAFF = {role:'master'|'teacher', code, name} 로 알려주고
      'moa-staff' 이벤트를 보냄 (허브가 강사에게 보여줄 카드를 고를 때 사용)
   ※ 원장님 화면(master=1)은 관리자 비밀번호로 따로 보호되므로 건드리지 않음 */
(function () {
  var me = document.currentScript;
  var mode = (me && me.getAttribute('data-mode')) || 'admin';
  var color = (me && me.getAttribute('data-color')) || '#11308C';
  var checkUrl = (me && me.getAttribute('data-check')) || '/api/staff-check';
  var p = new URLSearchParams(location.search);
  var KEY = 'moa_staff_pin';
  var HKEY = 'moa_staff_key';

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ── 승인 링크(?k=)로 들어오면 키를 저장하고 주소창에서 지움 ──
  var urlKey = p.get('k');
  if (urlKey) {
    lsSet(HKEY, urlKey.trim());
    p.delete('k');
    var q = p.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) {}
  }

  if (p.get('master') === '1') return;

  var isStaff = mode === 'always' ? p.get('survey') !== '1' : p.get('admin') === '1';

  // ── 학생 화면: 허브 버튼 숨김 ──
  if (!isStaff) {
    var st = document.createElement('style');
    st.textContent = '.moa-hubbar{display:none!important}';
    document.head.appendChild(st);
    return;
  }

  var origFetch = window.fetch.bind(window);
  function creds(h) {
    var pin = lsGet(KEY), key = lsGet(HKEY);
    if (pin) h.set('x-staff-pin', pin);
    if (key) h.set('x-staff-key', key);
    return h;
  }

  // ── 강사용 화면: 모든 /api/ 요청에 암호·키 첨부 ──
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = url.indexOf('/api/') === 0 || url.indexOf(location.origin + '/api/') === 0;
    if (!isApi) return origFetch(input, init);
    init = init || {};
    init.headers = creds(new Headers(init.headers || {}));
    return origFetch(input, init).then(function (res) {
      if (res.status === 401 && url.indexOf('/api/teacher-registry') < 0) {
        showGate(lsGet(HKEY) && !lsGet(KEY)
          ? '이 화면은 열 수 없어요. 승인 링크로 들어오신 강사님은 본인 강사 코드 화면만 볼 수 있어요. 허브에서 다시 들어와 주세요.'
          : '암호가 맞지 않거나 바뀌었어요. 다시 입력해 주세요.');
      }
      return res;
    });
  };

  // 결과: {role, code, name} 또는 null
  function check(pin, key) {
    var h = new Headers();
    if (pin) h.set('x-staff-pin', pin);
    if (key) h.set('x-staff-key', key);
    return origFetch(checkUrl, { method: 'POST', headers: h })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (d) { return d && d.ok ? d : { ok: true, role: 'master' }; })
          .catch(function () { return { ok: true, role: 'master' }; });
      })
      .catch(function () { return null; });
  }

  function announce(who) {
    window.MOA_STAFF = { role: who.role || 'master', code: who.code || '', name: who.name || '', key: who.role === 'teacher' ? lsGet(HKEY) : '' };
    try { document.dispatchEvent(new CustomEvent('moa-staff', { detail: window.MOA_STAFF })); } catch (e) {}
  }

  // ── 잠금 화면 ──
  var gate = null;
  function cover() {
    if (!gate) {
      gate = document.createElement('div');
      gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:"Noto Sans KR","맑은 고딕","Malgun Gothic",sans-serif;word-break:keep-all';
      (document.body || document.documentElement).appendChild(gate);
    }
    return gate;
  }
  function showGate(msg) {
    var g = cover();
    g.innerHTML =
      '<div style="max-width:340px;width:100%;text-align:center">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:' + color + ';margin-bottom:18px">MOA FORMULA</div>' +
      '<div style="font-size:30px;margin-bottom:6px">🔒</div>' +
      '<h2 style="margin:0 0 6px;font-size:18px;color:#1F2430">강사용 화면</h2>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#6B7280;line-height:1.6">' + msg + '</p>' +
      '<div style="background:#F4F6FB;border-radius:10px;padding:12px;font-size:12.5px;color:#374151;line-height:1.6;margin-bottom:16px;text-align:left">👩‍🏫 <b>강사님</b>은 원장님께 받은 <b>승인 링크</b>를 누르면 암호 없이 바로 열려요.</div>' +
      '<input id="moa-gate-pin" type="password" autocomplete="current-password" autocapitalize="none" placeholder="원장님 암호" ' +
      'style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #DDE1E9;border-radius:10px;margin-bottom:10px;font-family:inherit">' +
      '<button id="moa-gate-go" type="button" style="width:100%;padding:12px;font-size:15px;font-weight:700;border-radius:10px;background:#fff;color:' + color + ';border:2px solid ' + color + ';cursor:pointer;font-family:inherit">🔒 들어가기</button>' +
      '<p id="moa-gate-err" style="color:#B42318;font-size:13px;margin:10px 0 0;min-height:18px"></p>' +
      '</div>';
    var inp = g.querySelector('#moa-gate-pin');
    var btn = g.querySelector('#moa-gate-go');
    var err = g.querySelector('#moa-gate-err');
    function go() {
      var v = inp.value.trim();
      if (!v) { err.textContent = '암호를 입력해 주세요.'; return; }
      btn.disabled = true; btn.textContent = '확인 중...';
      check(v, '').then(function (who) {
        if (who && who.role === 'master') { lsSet(KEY, v); location.reload(); }
        else { err.textContent = '암호가 맞지 않아요. 여러 번 틀리면 15분 동안 잠겨요.'; btn.disabled = false; btn.textContent = '🔒 들어가기'; }
      });
    }
    btn.onclick = go;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  function start() {
    var savedPin = lsGet(KEY), savedKey = lsGet(HKEY);
    // 초대 링크(?invite=)로 처음 등록하는 강사님: 등록 화면은 그대로 보여줌 (등록되면 승인 키가 저장됨)
    if (!savedPin && !savedKey && p.get('invite')) return;
    cover().innerHTML = '<p style="color:#6B7280;font-size:14px">확인 중...</p>';
    if (!savedPin && !savedKey) {
      showGate('수강생 정보를 보호하기 위해 확인이 필요해요.');
      return;
    }
    check(savedPin, savedKey).then(function (who) {
      if (who) {
        if (gate) { gate.remove(); gate = null; }
        announce(who);
        return;
      }
      // 저장된 것이 더 이상 맞지 않음 → 지우고 다시 안내
      if (savedPin) lsDel(KEY);
      if (savedKey) lsDel(HKEY);
      showGate(savedKey && !savedPin
        ? '승인 링크가 바뀌었거나 사용이 중지됐어요. 원장님께 새 승인 링크를 받아 주세요.'
        : '암호가 바뀌었어요. 새 암호를 입력해 주세요.');
    });
  }

  start(); // 화면이 그려지기 전에 바로 가림 (body가 아직 없으면 html에 붙임)
})();
