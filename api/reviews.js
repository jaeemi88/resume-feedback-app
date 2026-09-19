// 학생 제출 → AI 초안이 강사 승인 전까지 대기하는 "검수 대기함"
// 강사별로 데이터가 섞이지 않도록 모든 키를 t(강사 코드)로 구분해서 저장함
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

// 학생이 카톡 친구가 아니어도 스스로 조회할 수 있도록 짧은 확인 코드 생성 (혼동되는 문자 제외)
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

// 검수 요청이 새로 들어오면, 강사가 설정해둔 이메일로 알림을 보냄.
// RESEND_API_KEY가 없거나 강사가 이메일을 설정하지 않았으면 조용히 건너뜀 (알림은 부가기능이라 실패해도 검수 요청 저장 자체는 막지 않음).
async function notifyByEmail(client, t, item) {
  try {
    if (!process.env.RESEND_API_KEY) { console.error('알림 건너뜀: RESEND_API_KEY 없음'); return; }
    const configRaw = await client.get(`resume_app_config:${t}`);
    const config = configRaw ? JSON.parse(configRaw) : null;
    const to = config && config.notifyEmail;
    if (!to) { console.error('알림 건너뜀: notifyEmail 미설정'); return; }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'MOA FORMULA <onboarding@resend.dev>',
        to: [to],
        subject: `[자소서 첨삭] ${item.studentName || '학생'}님의 검수 요청이 도착했어요`,
        text: `${item.studentName || '학생'}님이 자소서 첨삭 검수를 요청했어요.\n\n강사용 화면의 "검수 대기함" 탭에서 확인해 주세요.`
      })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend 발송 실패:', res.status, body);
    } else {
      console.log('Resend 발송 성공 (강사 알림):', to);
    }
  } catch (err) {
    console.error('알림 메일 발송 실패:', err);
  }
}

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  const indexKey = `resume_reviews_index:${t}`;
  const itemKey = (id) => `resume_review:${t}:${id}`;

  if (req.method === 'POST') {
    const id = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const code = genCode();
    const item = { id, code, teacherId: t, ...req.body, createdAt: Date.now() };
    await client.set(itemKey(id), JSON.stringify(item));

    const indexRaw = await client.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(id);
    await client.set(indexKey, JSON.stringify(index));

    notifyByEmail(client, t, item); // 응답을 기다리지 않고 백그라운드로 발송 시도

    return res.status(200).json({ ok: true, id, code });
  }

  if (req.method === 'GET') {
    const { code } = req.query;
    const indexRaw = await client.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    const items = [];
    for (const id of index) {
      const raw = await client.get(itemKey(id));
      if (raw) items.push(JSON.parse(raw));
    }

    if (code) {
      const match = items.find(it => it.code === String(code).toUpperCase());
      if (!match) return res.status(404).json({ error: '해당 코드를 찾을 수 없습니다.' });
      return res.status(200).json({ status: 'pending', studentName: match.studentName });
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    return res.status(200).json({ items });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    await client.del(itemKey(id));
    const indexRaw = await client.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    await client.set(indexKey, JSON.stringify(index.filter(x => x !== id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
