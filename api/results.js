// 강사가 승인한 최종 첨삭 결과 저장 + 학생 링크로 조회
// 강사별로 데이터가 섞이지 않도록 모든 키를 t(강사 코드)로 구분해서 저장함
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  const indexKey = `resume_results_index:${t}`;
  const itemKey = (id) => `resume_result:${t}:${id}`;

  if (req.method === 'POST') {
    const id = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const item = { id, teacherId: t, ...req.body, approvedAt: Date.now() };
    await client.set(itemKey(id), JSON.stringify(item));

    const indexRaw = await client.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push({ id, code: item.code || '', studentName: item.studentName || '', presetName: item.presetName || '기본', question: item.question, approvedAt: item.approvedAt });
    await client.set(indexKey, JSON.stringify(index));

    return res.status(200).json({ ok: true, id });
  }

  if (req.method === 'GET') {
    const { id, list, code } = req.query;

    if (code) {
      const indexRaw = await client.get(indexKey);
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      const match = index.find(it => it.code === String(code).toUpperCase());
      if (!match) return res.status(404).json({ error: '해당 코드의 결과를 찾을 수 없습니다.' });
      const raw = await client.get(itemKey(match.id));
      if (!raw) return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
      return res.status(200).json({ item: JSON.parse(raw) });
    }

    if (list) {
      const indexRaw = await client.get(indexKey);
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      return res.status(200).json({ items: index.reverse() });
    }

    if (id) {
      const raw = await client.get(itemKey(id));
      if (!raw) return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
      return res.status(200).json({ item: JSON.parse(raw) });
    }

    return res.status(400).json({ error: 'id 또는 list 파라미터가 필요합니다.' });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 파라미터가 필요합니다.' });
    await client.del(itemKey(id));
    const indexRaw = await client.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    await client.set(indexKey, JSON.stringify(index.filter(x => x.id !== id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
