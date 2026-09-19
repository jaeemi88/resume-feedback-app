// 강사가 설정한 톤·평가기준 프리셋을 서버(Redis)에 저장 — 같은 강사의 모든 기기가 공유
// 강사별로 데이터가 섞이지 않도록 t(강사 코드)로 구분해서 저장함
// 원장님이 삭제(사용 중지)한 강사 코드는 설정 조회·저장을 막음 (데이터 자체는 지우지 않고 보관)
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

const REMOVED_KEY = 'moa_removed_teachers';

const DEFAULT_CONFIG = {
  presets: [
    { id: 'default', name: '기본', prompt: '' }
  ],
  activePresetId: 'default'
};

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  try {
    if (await client.hexists(REMOVED_KEY, t)) {
      return res.status(403).json({ error: '사용이 중지된 강사 코드예요. 원장님께 문의해 주세요.', blocked: true });
    }
  } catch (err) {
    console.error('차단 여부 확인 실패(통과 처리):', err);
  }

  const key = `resume_app_config:${t}`;

  if (req.method === 'GET') {
    const raw = await client.get(key);
    const config = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    return res.status(200).json({ config });
  }

  if (req.method === 'POST') {
    await client.set(key, JSON.stringify(req.body));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
}
