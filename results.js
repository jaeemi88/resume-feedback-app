// 강사가 승인한 최종 첨삭 결과 저장 + 학생 링크로 조회
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'POST') {
    const id = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const item = { id, ...req.body, approvedAt: Date.now() };
    await client.set(`resume_result:${id}`, JSON.stringify(item));

    const indexRaw = await client.get('resume_results_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push({ id, question: item.question, approvedAt: item.approvedAt });
    await client.set('resume_results_index', JSON.stringify(index));

    return res.status(200).json({ ok: true, id });
  }

  if (req.method === 'GET') {
    const { id, list } = req.query;

    if (list) {
      const indexRaw = await client.get('resume_results_index');
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      return res.status(200).json({ items: index.reverse() });
    }

    if (id) {
      const raw = await client.get(`resume_result:${id}`);
      if (!raw) return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
      return res.status(200).json({ item: JSON.parse(raw) });
    }

    return res.status(400).json({ error: 'id 또는 list 파라미터가 필요합니다.' });
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
