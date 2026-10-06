# MOA FORMULA 자소서·이력서 첨삭 (resume-feedback-app)

## 앱 정보
- 진로모아커리어센터 "면접스킬" 앱 묶음의 하나. 학생이 자소서·이력서를 내면 AI 진단 + 강사 검수 후 결과 전달
- Vercel 프로젝트: resume-feedback-app (https://resume-feedback-app-phi.vercel.app) / GitHub: jaeemi88
- 파일은 저장소 최상위에 바로 있음 (public 폴더 아님)
  - index.html: 학생·강사·원장님 화면 전체 / api/: 서버 함수 / moa-ui.css·moa-ui.js: 공용 디자인 키트
  - vercel.json: /go/:키 → index.html (네이버 예약 자동 입장 링크) + 예약 실행 2개
    - api/cleanup.js: 매일 새벽 3시 개인정보 30일 자동 파기 (자소서·모의면접 함께 정리)
    - api/monthly-report.js: 매달 1일 아침 원장님께 정산 메일 (CSV 첨부)
- 화면 구분
  - 학생: ?t=강사코드 (허브에서 들어오면 #moa-s=로 이름·숫자 4자리 전달)
  - 강사: ?admin=1 → staff-guard.js(admin 모드) 잠금. 원장님 암호(STAFF_PIN) 또는 강사 개인 승인 링크(?k=)
  - 원장님: ?master=1 (관리자 비밀번호 MASTER_ADMIN_PASSWORD)
  - 유료 개인 고객: ?shop=키 또는 /go/키 (네이버 예약)
- 허브의 서버 역할도 함께 함: 허브가 이 앱의 /api/staff-check, /api/class-code, /api/progress를 빌려 씀
  → 이 세 파일의 주소·응답 모양을 바꾸면 허브가 멈춤
- AI: Anthropic API (api/feedback.js, coach.js, _company.js, _fitlen.js)
- 환경변수: ANTHROPIC_API_KEY, REDIS_URL, STAFF_PIN, MASTER_ADMIN_PASSWORD, RESEND_API_KEY, ADMIN_EMAIL, CRON_SECRET

## 디자인 규칙
- 대표색: 퍼플 #643DF2 (잠금 화면·앱 구분용). 화면 톤은 공용 디자인 키트(남색 #141A2E + 라임 #C0D904)
- 폰트: Noto Sans KR / 흰 배경 / 상단 "MOA FORMULA" 로고
- 버튼·카드 모양은 다른 면접스킬 앱과 통일
- 학생용 버튼은 대표색 채움, 강사용은 같은 색 테두리 + 자물쇠 아이콘
- 소속 강사 명칭은 "파트너강사" ("파견강사" 사용 금지)

## 반드시 유지할 기능 (2026-10-06 기준, index.html 약 4,319줄 — 이보다 크게 줄면 옛 버전으로 돌아간 것)
- 학생: 자소서 작성 도우미(스캐폴드) → 제출 → 결과 조회 (renderStudentView, renderStudentSubmitForm, renderStudentLookup)
- 강사: 검수 큐·프리셋·결과·알림·안내 탭 (renderTeacherView, renderReviewsTab, renderPresetsTab, renderResultsTab)
- 결과 화면 + Word·PDF 내려받기 (renderResultView, downloadResultAsWord, downloadResultAsPdf)
- 모의면접 앱으로 넘기기 (interviewHandoffHtml)
- 원장님: 강사 명단·AI 상투어 목록·유료 고객 관리 (renderMasterTeacherList, initClicheManager, initClientManager)
- 유료 고객 모드: 입장·제출·환불 (renderClientEntry, renderClientDone, refundSubmitConfirm)

## 작업 원칙
- 수정 전 항상 현재 저장소의 최신 index.html을 기준으로 작업 (예전 버전 덮어쓰기 금지)
- 수정본은 저장소 최상위에 저장 (이 앱은 public 폴더를 쓰지 않음)
- 수정 후 줄 수가 크게 줄었거나 위 기능이 사라졌으면 작업 중단하고 알릴 것
- api/teacher-registry.js는 모의면접·자소서·트래커 공용 최신 버전 유지 (같은 Redis 강사 명단·초대코드 공유)
- staff-guard.js, moa-ui.css, moa-ui.js도 여러 앱 공용 파일. 고칠 때는 다른 앱의 같은 파일과 함께 맞출 것
- 큰 변경은 먼저 계획을 보여주고 승인받은 뒤 진행
- 결과물은 모바일에서도 정상 표시되어야 함
