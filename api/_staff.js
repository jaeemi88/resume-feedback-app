// 강사용 확인 공용 모듈 (2026-09-28 · 강사 개인 승인 링크 추가)
// 두 가지 방법 중 하나만 맞으면 통과
//  1) 원장님 암호: Vercel 환경변수 STAFF_PIN 과 요청 헤더 x-staff-pin 비교 → 모든 강사 자료 가능
//  2) 강사 승인 링크: 요청 헤더 x-staff-key 가 승인된 강사의 개인 키 → "본인 코드(t)" 자료만 가능
// - STAFF_PIN 이 없으면 1)은 무조건 실패 (암호 설정을 잊어도 열리지 않게)
// - 암호를 보냈는데 틀린 경우만 실패로 셈 → 같은 기기에서 10번 틀리면 15분 차단
// - 파일 이름이 _ 로 시작하므로 Vercel이 주소(API)로 만들지 않음
// ※ 승인 링크 키는 모의면접·자소서 앱만 인정합니다. (트래커·제안서는 원장님 암호만 통과)

export const HUB_KEYS = 'moa_hub_keys';        // 키 → 강사 코드
const TEACHERS_KEY = 'moa_approved_teachers';

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function safeCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

// 누가 들어왔는지 알려줌: { role:'master' } / { role:'teacher', code, name } / null
export async function whoIs(req, client) {
  const PIN = process.env.STAFF_PIN || '';
  const given = String(req.headers['x-staff-pin'] || '');
  if (PIN && given) {
    const failKey = 'moa_pinfail:' + ipOf(req);
    const fails = +(await client.get(failKey)) || 0;
    if (fails < 10) {
      if (given === PIN) return { role: 'master' };
      await client.incr(failKey);
      await client.expire(failKey, 900);
    }
  }
  const key = String(req.headers['x-staff-key'] || '').trim();
  if (key && key.length >= 20) {
    const code = await client.hget(HUB_KEYS, key);
    if (code) {
      const raw = await client.hget(TEACHERS_KEY, code);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.hubKey === key) return { role: 'teacher', code, name: data.name || code };
      }
    }
  }
  return null;
}

export async function isStaff(req, client) {
  const who = await whoIs(req, client);
  if (!who) return false;
  if (who.role === 'master') return true;
  // 강사는 자기 코드 자료만 (주소에 t가 있으면 반드시 본인 코드여야 함)
  const t = req.query && req.query.t !== undefined ? safeCode(req.query.t) : '';
  return !t || t === who.code;
}
