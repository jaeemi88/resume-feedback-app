// 강사용 암호 확인 공용 모듈 (2026-09-25 · 1단계 긴급 잠금)
// - Vercel 환경변수 STAFF_PIN 과 요청 헤더 x-staff-pin 을 비교
// - STAFF_PIN 이 없으면 무조건 "강사 아님"으로 처리 (암호 설정을 잊어도 열리지 않게)
// - 암호를 보냈는데 틀린 경우만 실패로 셈 → 같은 기기에서 10번 틀리면 15분 차단
// - 파일 이름이 _ 로 시작하므로 Vercel이 주소(API)로 만들지 않음 (다른 API에서 불러다 쓰는 용도)

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

export async function isStaff(req, client) {
  const PIN = process.env.STAFF_PIN || '';
  if (!PIN) return false;
  const given = String(req.headers['x-staff-pin'] || '');
  if (!given) return false; // 학생 요청(암호 없음)은 실패 횟수에 넣지 않음
  const key = 'moa_pinfail:' + ipOf(req);
  const fails = +(await client.get(key)) || 0;
  if (fails >= 10) return false;
  if (given !== PIN) {
    await client.incr(key);
    await client.expire(key, 900);
    return false;
  }
  return true;
}
