// 학생 제출 → AI 초안이 강사 승인 전까지 대기하는 "검수 대기함"
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'POST') {
    const id = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const item = { id, ...req.body, createdAt: Date.now() };
    await client.set(`resume_review:${id}`, JSON.stringify(item));

    const indexRaw = await client.get('resume_reviews_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(id);
    await client.set('resume_reviews_index', JSON.stringify(index));

    return res.status(200).json({ ok: true, id });
  }

  if (req.method === 'GET') {
    const indexRaw = await client.get('resume_reviews_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    const items = [];
    for (const id of index) {
      const raw = await client.get(`resume_review:${id}`);
      if (raw) items.push(JSON.parse(raw));
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return res.status(200).json({ items });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    await client.del(`resume_review:${id}`);
    const indexRaw = await client.get('resume_reviews_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    await client.set('resume_reviews_index', JSON.stringify(index.filter(x => x !== id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
