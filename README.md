[README.md](https://github.com/user-attachments/files/32311773/README.md)
# 자소서·이력서 첨삭 앱 (1단계 MVP)

모의면접 시뮬레이터와 동일한 구조(Vercel + GitHub + Redis)로 배포합니다.
이번 1단계에서 반영된 기능: STAR 구조 진단, 첨삭 기준 프리셋, 강사 검수 큐, 학생 결과 링크 공유.

## 배포 절차 (모의면접 앱과 동일)

1. GitHub에 새 저장소 생성 (예: `resume-feedback-app`)
2. 이 폴더의 파일 전체를 "Add file → Upload files"로 드래그해서 업로드
   (복사-붙여넣기하면 코드가 중간에 잘릴 수 있으니 반드시 파일째로 업로드)
3. Vercel에서 해당 GitHub 저장소를 Import → Deploy
4. Vercel 프로젝트 Settings → Environment Variables에 `ANTHROPIC_API_KEY` 등록 → Redeploy
5. Vercel 프로젝트 Storage 탭 → Redis 데이터베이스 생성 → 프로젝트에 연결(Connect)
   → `REDIS_URL` 환경변수 자동 생성 → Redeploy
6. 완료되면
   - 학생용: `배포주소.vercel.app`
   - 강사용: `배포주소.vercel.app/?admin=1`

## 다음 단계 (2단계 이후 추가 예정)

- 채용공고 매칭 첨삭
- 직군별 프리셋 라이브러리 확장
- 학생 자가진단 체크리스트
- Before/After 버전 비교
- 이력서 전용 모듈
