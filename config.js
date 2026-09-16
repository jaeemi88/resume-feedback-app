// 강사가 설정한 톤·평가기준 프리셋을 서버(Redis)에 저장 — 모든 기기가 공유
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const DEFAULT_CONFIG = {
  presets: [
    { id: 'default', name: '기본', prompt: '' }
  ],
  activePresetId: 'default'
};

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'GET') {
    const raw = await client.get('resume_app_config');
    const config = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    return res.status(200).json({ config });
  }

  if (req.method === 'POST') {
    await client.set('resume_app_config', JSON.stringify(req.body));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
}
