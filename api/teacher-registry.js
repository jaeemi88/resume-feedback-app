// 강사 코드 "허가 등록" 관리자용 API — 세 앱(모의면접·자소서·트래커)이 같은 Redis의
// 같은 목록(moa_approved_teachers)을 공유합니다. 한 앱에서 승인받으면 나머지 앱에서도
// 같은 코드로 바로 인식됩니다.
//
// GET  ?master=관리자비밀번호        → 승인된 강사 전체 목록 조회 (원장님 전용)
// POST { code, name, password }     → 새 강사 코드 등록 시도. 이미 승인된 코드면 비밀번호 없이도 통과.
//                                      새 코드인데 비밀번호가 틀리면 거절.
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function safeCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

const REGISTRY_KEY = 'moa_approved_teachers';

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'GET') {
    const { master } = req.query;
    if (!process.env.MASTER_ADMIN_PASSWORD) {
      return res.status(500).json({ error: '관리자 비밀번호가 아직 서버에 설정되지 않았습니다.' });
    }
    if (!master || master !== process.env.MASTER_ADMIN_PASSWORD) {
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }
    try {
      const hash = await client.hgetall(REGISTRY_KEY);
      const teachers = Object.entries(hash).map(([code, raw]) => {
        const data = JSON.parse(raw);
        return { code, name: data.name || code, approvedAt: data.approvedAt, firstApp: data.firstApp || '' };
      });
      teachers.sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
      return res.status(200).json({ teachers });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '목록 조회 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'POST') {
    const { code, name, password, app: appLabel } = req.body || {};
    const c = safeCode(code);
    if (!c) return res.status(400).json({ error: '강사 코드가 필요합니다.' });

    try {
      const existingRaw = await client.hget(REGISTRY_KEY, c);
      if (existingRaw) {
        return res.status(200).json({ ok: true, alreadyApproved: true });
      }
      if (!process.env.MASTER_ADMIN_PASSWORD) {
        return res.status(500).json({ error: '관리자 비밀번호가 아직 서버에 설정되지 않았습니다. 원장님께 문의해 주세요.' });
      }
      if (!password || password !== process.env.MASTER_ADMIN_PASSWORD) {
        return res.status(403).json({ error: '처음 사용하는 강사 코드예요. 원장님께 받은 관리자 비밀번호를 함께 입력해 주세요.' });
      }
      const record = { name: (name || c).trim(), approvedAt: new Date().toISOString(), firstApp: appLabel || '' };
      await client.hset(REGISTRY_KEY, c, JSON.stringify(record));
      return res.status(200).json({ ok: true, alreadyApproved: false });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
