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

## 표현·어투 원칙 (2026-10-24 대표님 지시)
- 앱 화면 문구·문서·기관·학교에 드리는 글(제안서·계획서·메일·안내문): 세련되고 품격 있으며 정갈한 표현. 기관·학교는 보수적이어서 튀거나 독특한 표현·디자인을 꺼림
  - 내부 말투·날것 표현 대신 공식 문서 어투 (예: 돌렸습니다 → 재편성하였습니다, 납품 → 제출, 그대로인 것 → 변동 없는 사항)
  - 유행어·과장·감탄사·느낌표 연발·이모지는 쓰지 않음. 제목·안내는 긍정 표현 ('변경' → '개선안')
- 인스타·홍보(카드뉴스·릴스·캡션·광고 카피)는 예외: 마음껏 창의적이고 트렌디하게 (moa-sns-design 카피 톤 규칙)
- 대표 경력 표기 (2026-10-24 대표님 지시): 근무·경력 연수(예: 항공승무원 12년, 진로·취업교육 16년)는 앱 화면·문서·제안서·홍보물 어디에도 쓰지 않음 → '항공승무원 출신', '前 대기업 항공승무원'처럼 연수 없이 표기

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
- 배포 한도 절약 (2026-10-24): vercel.json의 git.deploymentEnabled로 claude/** 작업 브랜치는 배포하지 않음 (Vercel 무료 요금제 하루 100회 한도). 화면 확인은 로컬 브라우저 테스트 후 main 병합 → 실제 사이트에서

## 쓰임새 기록 (2026-10-24 대표님 승인 · 2단계 정리)
- 화면이 열릴 때 moaUse('화면키')로 운영보드 /api/usage에 {a:'rs', s:'화면키'}만 보냄 (이름·기기 정보 없음, 같은 화면은 10분에 한 번)
- 새 화면·기능을 만들면 그 자리에 moaUse('새키')를 넣고, 운영보드 public/index.html의 USE_LABELS.rs에 이름표를 함께 추가 (영문 소문자·숫자·_ 24자까지)
- 화면을 없애면 USE_LABELS에서도 지움. 운영보드 대시보드 '기능 쓰임새' 카드에서 30일 0회 화면이 '정리 후보'로 보임
- vercel.json의 ignoreCommand로 main 브랜치만 Vercel 배포 (작업용 브랜치는 빌드하지 않음 — 하루 배포 한도 절약)

## 문서 함께 갱신 (2026-10-24 대표님 지시)
- 기능을 추가·변경·삭제하면 같은 작업에서 아래 문서도 함께 고친다 (코드를 바꿔도 자동으로 바뀌지 않음)
  - 시스템 지도·시스템 리포트: jinromoa-board 저장소 public/map-data.js (앱별 화면·기능 목록 screens, 앱 사이 연결 links)
  - 강사 운영 매뉴얼: moa-hub 저장소 manual.html (파트너강사가 쓰는 기능일 때. 원장 전용 기능은 map-data.js만)
- 문서가 다른 저장소에 있으면 이어서 그 저장소에도 반영하고, 완료 보고 때 함께 알린다
- 매뉴얼 문구는 정갈한 표현으로, 화면의 버튼 이름을 그대로 쓴다

## 본부 공유: 작업 소식 남기기 (2026-10-26 대표님 승인)
- 본부 채팅은 코드 작업(GitHub) 기록을 볼 수 없음 → 코드 작업을 main에 반영하면 같은 작업에서 jinromoa-board 저장소 public/worklog.js 맨 위에 한 줄 추가
  - 형식: { d: "YYYY-MM-DD", app: "앱 이름(map-data.js의 name, 여러 앱이면 '공통')", t: "무엇이 바뀌었는지 한 줄(화면 말로)" } · 대표님 확인 대기면 wait: 1
  - 한 작업 = 한 줄, 결과만 (고친 과정·다시 올리기는 남기지 않음). 학생 개인정보·암호·열쇠·claude.ai 주소는 넣지 않음
- 가상 사무실(/office.html) '최근 작업 소식' 카드와 본부 채팅이 이 파일을 읽음 (https://jinromoa-board.vercel.app/worklog.js)
- 이 저장소가 jinromoa-board가 아니면 이어서 그 저장소에도 반영하고, 완료 보고 때 함께 알린다

## 대표 사진 (2026-10-29 대표님 지시)
- 대표님 사진이 필요한 곳(제안서·리플릿·강사 프로필·교안 표지·홍보물·앱 화면 등)에는 이 사진만 사용: https://jinromoa-board.vercel.app/brand/ceo.jpg (1080×1080 정사각) · 작은 크기 https://jinromoa-board.vercel.app/brand/ceo-600.jpg
- 원본 파일: jinromoa-board 저장소 public/brand/ (ceo.jpg, ceo-600.jpg). 다른 사진을 새로 만들거나 바꿔 넣지 않음
