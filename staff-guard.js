/* MOA FORMULA 강사용 잠금 (2026-09-25 · 1단계 긴급 잠금)
   ─────────────────────────────────────────────
   index.html의 메인 스크립트보다 "먼저" 불러와야 합니다.
     <script src="/staff-guard.js" data-mode="admin" data-color="#295BF2"></script>

   data-mode="admin"  : 주소에 admin=1 이 있을 때만 강사용 (모의면접·자소서)
   data-mode="always" : 학생 설문(survey=1)만 빼고 전부 강사용 (트래커)
   data-color         : 앱 대표색 (잠금 화면 버튼 테두리 색)
   data-check         : 암호 확인 주소 (생략하면 같은 앱의 /api/staff-check)
                        허브처럼 서버가 없는 곳은 트래커의 확인 주소를 빌려 씀

   하는 일
   1) 강사용 화면: 강사용 암호가 확인될 때까지 화면을 가림
   2) 강사용 화면의 모든 /api/ 요청에 암호를 자동으로 붙임 (서버가 확인)
   3) 학생용 화면: 상단 "← 허브" 버튼을 숨김
   ※ 원장님 화면(master=1)은 관리자 비밀번호로 따로 보호되므로 건드리지 않음 */
(function () {
  var me = document.currentScript;
  var mode = (me && me.getAttribute('data-mode')) || 'admin';
  var color = (me && me.getAttribute('data-color')) || '#11308C';
  var checkUrl = (me && me.getAttribute('data-check')) || '/api/staff-check';
  var p = new URLSearchParams(location.search);
  var KEY = 'moa_staff_pin';

  if (p.get('master') === '1') return;

  var isStaff = mode === 'always' ? p.get('survey') !== '1' : p.get('admin') === '1';

  // ── 학생 화면: 허브 버튼 숨김 ──
  if (!isStaff) {
    var st = document.createElement('style');
    st.textContent = '.moa-hubbar{display:none!important}';
    document.head.appendChild(st);
    return;
  }

  function getPin() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  var origFetch = window.fetch.bind(window);

  // ── 강사용 화면: 모든 /api/ 요청에 암호 첨부 ──
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isApi = url.indexOf('/api/') === 0 || url.indexOf(location.origin + '/api/') === 0;
    if (!isApi) return origFetch(input, init);
    init = init || {};
    var h = new Headers(init.headers || {});
    h.set('x-staff-pin', getPin());
    init.headers = h;
    return origFetch(input, init).then(function (res) {
      if (res.status === 401 && url.indexOf('/api/teacher-registry') < 0) {
        showGate('암호가 맞지 않거나 바뀌었어요. 다시 입력해 주세요.');
      }
      return res;
    });
  };

  function check(pin) {
    return origFetch(checkUrl, { method: 'POST', headers: { 'x-staff-pin': pin } })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  // ── 잠금 화면 ──
  var gate = null;
  function cover() {
    if (!gate) {
      gate = document.createElement('div');
      gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:"Noto Sans KR","맑은 고딕","Malgun Gothic",sans-serif;word-break:keep-all';
      document.body.appendChild(gate);
    }
    return gate;
  }
  function showGate(msg) {
    var g = cover();
    g.innerHTML =
      '<div style="max-width:340px;width:100%;text-align:center">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:' + color + ';margin-bottom:18px">MOA FORMULA</div>' +
      '<div style="font-size:30px;margin-bottom:6px">🔒</div>' +
      '<h2 style="margin:0 0 6px;font-size:18px;color:#1F2430">강사용 암호</h2>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#6B7280;line-height:1.6">' + msg + '</p>' +
      '<input id="moa-gate-pin" type="password" autocomplete="current-password" autocapitalize="none" placeholder="암호" ' +
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
      check(v).then(function (ok) {
        if (ok) { try { localStorage.setItem(KEY, v); } catch (e) {} location.reload(); }
        else { err.textContent = '암호가 맞지 않아요. 여러 번 틀리면 15분 동안 잠겨요.'; btn.disabled = false; btn.textContent = '🔒 들어가기'; }
      });
    }
    btn.onclick = go;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  // ── 처음 열 때: 저장된 암호가 맞는지 확인할 때까지 화면을 가림 ──
  cover().innerHTML = '<p style="color:#6B7280;font-size:14px">확인 중...</p>';
  var saved = getPin();
  if (!saved) {
    showGate('수강생 정보를 보호하기 위해 강사용 암호가 필요해요. 원장님께 받은 암호를 입력해 주세요. 이 기기에서는 한 번만 입력하면 돼요.');
  } else {
    check(saved).then(function (ok) {
      if (ok) { if (gate) { gate.remove(); gate = null; } }
      else { try { localStorage.removeItem(KEY); } catch (e) {} showGate('암호가 바뀌었어요. 새 암호를 입력해 주세요.'); }
    });
  }
})();
