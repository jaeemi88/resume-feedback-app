// 강사 코드 "허가 등록" 관리자용 API — 세 앱(모의면접·자소서·트래커)이 같은 Redis의
// 같은 강사 목록/초대코드 목록을 공유합니다. 한 앱에서 등록/발급하면 나머지 앱에서도 그대로 인식됩니다.
//
// [원장님 전용 — MASTER_ADMIN_PASSWORD 필요]
//   GET  ?master=비밀번호               → 승인된 강사 전체 목록 조회
//   GET  ?master=비밀번호&list=invites  → 발급된 초대코드 전체 목록 조회 (사용여부·유효기간 포함)
//   GET  ?master=비밀번호&list=removed  → 삭제된 강사 목록 조회 (복구 가능)
//   POST { action:'generateInvite', master, expiryDays } → 새 일회용 초대코드 발급
//        expiryDays: 유효기간(일). 생략하거나 0이면 무제한.
//   POST { action:'cancelInvite', master, inviteCode } → 미사용 초대코드 취소
//   POST { action:'deleteTeacher', master, code }  → 강사 삭제(접속 차단, 기록은 보관)
//   POST { action:'restoreTeacher', master, code } → 삭제된 강사 복구
//
// [누구나 호출 가능]
//   GET  ?check=강사코드 → 삭제(차단)된 강사 코드인지 확인 { blocked: true/false }
//   POST { code, name, inviteCode } → 강사 등록. 이미 승인된 코드면 초대코드 없이도 통과.
//                                      새 코드면 초대코드가 유효+미사용+기간내여야 통과, 통과 즉시 그 초대코드는 사용 처리됨.
//
// ※ 차단은 "삭제 목록"에 있는 코드만 막습니다. 예전부터 쓰던 코드가 승인 목록에 없더라도 막히지 않아요.
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
const REMOVED_KEY = 'moa_removed_teachers';

function checkAdmin(password) {
  return !!process.env.MASTER_ADMIN_PASSWORD && password === process.env.MASTER_ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'GET') {
    const { master, list, check } = req.query;

    // 차단 여부 확인 (누구나) — 확인에 실패하면 막지 않고 통과시킴
    if (check !== undefined) {
      const c = safeCode(check);
      if (!c) return res.status(200).json({ blocked: false });
      try {
        const removed = await client.hexists(REMOVED_KEY, c);
        return res.status(200).json({ blocked: !!removed });
      } catch (err) {
        console.error(err);
        return res.status(200).json({ blocked: false });
      }
    }

    if (!process.env.MASTER_ADMIN_PASSWORD) {
      return res.status(500).json({ error: '관리자 비밀번호가 아직 서버에 설정되지 않았습니다.' });
    }
    if (!checkAdmin(master)) {
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }

    try {
      if (list === 'invites') {
        const hash = await client.hgetall(INVITES_KEY);
        const invites = Object.entries(hash).map(([code, raw]) => {
          const data = JSON.parse(raw);
          return { code, ...data, isExpired: !data.used && !!data.expiresAt && Date.now() > data.expiresAt };
        });
        invites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.status(200).json({ invites });
      }
      if (list === 'removed') {
        const hash = await client.hgetall(REMOVED_KEY);
        const teachers = Object.entries(hash).map(([code, raw]) => {
          const data = JSON.parse(raw);
          return { code, name: data.name || code, approvedAt: data.approvedAt, removedAt: data.removedAt, firstApp: data.firstApp || '' };
        });
        teachers.sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt));
        return res.status(200).json({ teachers });
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

    // 원장님이 새 초대코드 발급 — expiryDays를 직접 정할 수 있음 (생략·0이면 무제한)
    if (body.action === 'generateInvite') {
      if (!checkAdmin(body.master)) {
        return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      }
      try {
        const code = genInviteCode();
        const days = parseInt(body.expiryDays, 10);
        const expiresAt = (days && days > 0) ? (Date.now() + days * 24 * 60 * 60 * 1000) : null;
        await client.hset(INVITES_KEY, code, JSON.stringify({
          createdAt: new Date().toISOString(), used: false, usedBy: null, usedAt: null, expiresAt
        }));
        return res.status(200).json({ inviteCode: code, expiresAt });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '초대코드 발급 중 오류가 발생했습니다.' });
      }
    }

    // 원장님이 미사용 초대코드 취소
    if (body.action === 'cancelInvite') {
      if (!checkAdmin(body.master)) {
        return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      }
      try {
        const inv = String(body.inviteCode || '').trim().toUpperCase();
        const raw = await client.hget(INVITES_KEY, inv);
        if (!raw) return res.status(404).json({ error: '초대코드를 찾을 수 없어요.' });
        if (JSON.parse(raw).used) {
          return res.status(400).json({ error: '이미 사용된 초대코드는 취소할 수 없어요. 강사를 삭제하려면 승인된 강사 목록에서 삭제해 주세요.' });
        }
        await client.hdel(INVITES_KEY, inv);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '초대코드 취소 중 오류가 발생했습니다.' });
      }
    }

    // 원장님이 강사 삭제 — 승인 목록에서 빼고 삭제 목록으로 옮김 (프리셋·첨삭 기록은 그대로 보관)
    if (body.action === 'deleteTeacher') {
      if (!checkAdmin(body.master)) {
        return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      }
      try {
        const c = safeCode(body.code);
        const raw = await client.hget(TEACHERS_KEY, c);
        if (!raw) return res.status(404).json({ error: '승인된 강사 목록에서 찾을 수 없어요.' });
        const data = JSON.parse(raw);
        data.removedAt = new Date().toISOString();
        await client.hset(REMOVED_KEY, c, JSON.stringify(data));
        await client.hdel(TEACHERS_KEY, c);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '강사 삭제 중 오류가 발생했습니다.' });
      }
    }

    // 원장님이 삭제된 강사 복구
    if (body.action === 'restoreTeacher') {
      if (!checkAdmin(body.master)) {
        return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      }
      try {
        const c = safeCode(body.code);
        const raw = await client.hget(REMOVED_KEY, c);
        if (!raw) return res.status(404).json({ error: '삭제된 강사 목록에서 찾을 수 없어요.' });
        const data = JSON.parse(raw);
        delete data.removedAt;
        await client.hset(TEACHERS_KEY, c, JSON.stringify(data));
        await client.hdel(REMOVED_KEY, c);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '강사 복구 중 오류가 발생했습니다.' });
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
        const wasRemoved = await client.hexists(REMOVED_KEY, c);
        return res.status(403).json({
          error: wasRemoved
            ? '사용이 중지된 강사 코드예요. 원장님께 문의해 주세요.'
            : '처음 사용하는 강사 코드예요. 원장님께 받은 초대코드를 입력해 주세요.'
        });
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
      if (invite.expiresAt && Date.now() > invite.expiresAt) {
        return res.status(403).json({ error: '유효기간이 지난 초대코드예요. 원장님께 새 초대코드를 요청해 주세요.' });
      }

      invite.used = true;
      invite.usedBy = c;
      invite.usedAt = new Date().toISOString();
      await client.hset(INVITES_KEY, inv, JSON.stringify(invite));

      const record = { name: (name || c).trim(), approvedAt: new Date().toISOString(), firstApp: body.app || '' };
      await client.hset(TEACHERS_KEY, c, JSON.stringify(record));
      await client.hdel(REMOVED_KEY, c); // 삭제됐던 코드를 새 초대코드로 다시 등록한 경우 차단 해제
      return res.status(200).json({ ok: true, alreadyApproved: false });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '등록 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
