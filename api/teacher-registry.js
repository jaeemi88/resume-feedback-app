// 강사 코드 "허가 등록" 관리자용 API — 세 앱(모의면접·자소서·트래커)이 같은 Redis의
// 같은 강사 목록/초대코드 목록을 공유합니다. 한 앱에서 등록/발급하면 나머지 앱에서도 그대로 인식됩니다.
//
// [원장님 전용 — MASTER_ADMIN_PASSWORD 필요]
//   GET  ?master=비밀번호               → 승인된 강사 전체 목록 조회
//   GET  ?master=비밀번호&list=invites  → 발급된 초대코드 전체 목록 조회 (사용여부 포함)
//   POST { action:'generateInvite', master:비밀번호 } → 새 일회용 초대코드 발급
//
// [강사 등록 — 누구나 호출 가능, 대신 새 코드는 유효한 미사용 초대코드가 있어야 함]
//   POST { code, name, inviteCode } → 이미 승인된 코드면 초대코드 없이도 통과.
//                                      새 코드면 초대코드가 유효+미사용이어야 통과, 통과 즉시 그 초대코드는 사용 처리됨.
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function safeCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 글자(0,O,1,I) 제외
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const TEACHERS_KEY = 'moa_approved_teachers';
const INVITES_KEY = 'moa_invite_codes';

function checkAdmin(password) {
  return !!process.env.MASTER_ADMIN_PASSWORD && password === process.env.MASTER_ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'GET') {
    const { master, list } = req.query;
    if (!process.env.MASTER_ADMIN_PASSWORD) {
      return res.status(500).json({ error: '관리자 비밀번호가 아직 서버에 설정되지 않았습니다.' });
    }
    if (!checkAdmin(master)) {
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }

    try {
      if (list === 'invites') {
        const hash = await client.hgetall(INVITES_KEY);
        const invites = Object.entries(hash).map(([code, raw]) => ({ code, ...JSON.parse(raw) }));
        invites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.status(200).json({ invites });
      }
      const hash = await client.hgetall(TEACHERS_KEY);
      const teachers = Object.entries(hash).map(([code, raw]) => {
        const data = JSON.parse(raw);
        return { code, name: data.name || code, approvedAt: data.approvedAt, firstApp: data.firstApp || '' };
      });
      teachers.sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
      return res.status(200).json({ teachers });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // 원장님이 새 초대코드 발급
    if (body.action === 'generateInvite') {
      if (!checkAdmin(body.master)) {
        return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      }
      try {
        const code = genInviteCode();
        await client.hset(INVITES_KEY, code, JSON.stringify({
          createdAt: new Date().toISOString(), used: false, usedBy: null, usedAt: null
        }));
        return res.status(200).json({ inviteCode: code });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '초대코드 발급 중 오류가 발생했습니다.' });
      }
    }

    // 강사 등록
    const { code, name, inviteCode } = body;
    const c = safeCode(code);
    if (!c) return res.status(400).json({ error: '강사 코드가 필요합니다.' });

    try {
      const existingRaw = await client.hget(TEACHERS_KEY, c);
      if (existingRaw) {
        return res.status(200).json({ ok: true, alreadyApproved: true });
      }

      if (!inviteCode) {
        return res.status(403).json({ error: '처음 사용하는 강사 코드예요. 원장님께 받은 초대코드를 입력해 주세요.' });
      }
      const inv = String(inviteCode).trim().toUpperCase();
      const inviteRaw = await client.hget(INVITES_KEY, inv);
      if (!inviteRaw) {
        return res.status(403).json({ error: '초대코드를 찾을 수 없어요. 다시 확인해 주세요.' });
      }
      const invite = JSON.parse(inviteRaw);
      if (invite.used) {
        return res.status(403).json({ error: '이미 사용된 초대코드예요. 원장님께 새 초대코드를 요청해 주세요.' });
      }

      invite.used = true;
      invite.usedBy = c;
      invite.usedAt = new Date().toISOString();
      await client.hset(INVITES_KEY, inv, JSON.stringify(invite));

      const record = { name: (name || c).trim(), approvedAt: new Date().toISOString(), firstApp: body.app || '' };
      await client.hset(TEACHERS_KEY, c, JSON.stringify(record));
      return res.status(200).json({ ok: true, alreadyApproved: false });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
