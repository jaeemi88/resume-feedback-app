// 학생당 1회 강의 코드 (2026-10-27 대표님 승인)
// 허브에서 강의 입장 코드를 만들 때 [학생당 1회]를 체크하면 class-code.js가 moa_ci:{ci}에 once:true를 남김.
// 그 코드로 들어온 학생의 AI 기능(첨삭·도움 기능)은 기능마다 한 번만 통과시킴.
//   · 학생 화면(moa-ui.js)이 x-moa-ci(강의 이름표)와 x-moa-k(강사코드|이름|숫자4자리의 SHA-256 열쇠)를 붙여 보냄
//   · moa_once:{ci}:{앱}:{기능}:{열쇠} 를 SET NX로 잡고, AI 처리가 실패하면(응답 400 이상) 다시 풀어 줌
//   · ci가 없거나 1회 코드가 아니면 지금과 똑같이 동작. Redis 오류 때는 수업이 멈추지 않도록 그냥 통과
// ※ 이 파일은 자소서·모의면접 두 앱에 같은 내용으로 있음 (같은 Redis 사용). 고칠 때 함께 맞출 것
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}
const TTL = 60 * 60 * 24 * 30; // 입장 코드는 연장해도 길어야 2주 안팎 → 30일 보관

async function take(req, app, feature) {
  const ci = String(req.headers['x-moa-ci'] || '');
  if (!/^ci_[a-z0-9]{8,24}$/.test(ci)) return null;
  let d = null;
  try { d = JSON.parse((await getRedis().get('moa_ci:' + ci)) || 'null'); } catch (e) { return null; }
  if (!d || !d.once) return null;
  const k = String(req.headers['x-moa-k'] || '');
  if (!/^[0-9a-f]{64}$/.test(k)) return { blocked: '허브에서 이름과 숫자 4자리로 입장한 뒤 이용해 주세요.' };
  const key = 'moa_once:' + ci + ':' + app + ':' + feature + ':' + k;
  try {
    const ok = await getRedis().set(key, String(Date.now()), 'EX', TTL, 'NX');
    if (!ok) return { blocked: '이번 강의에서는 이 기능을 한 번만 이용할 수 있습니다. 이미 이용하셨습니다.' };
  } catch (e) { return null; }
  return { key };
}

// featureOf(req) → 기능 이름(1회로 셀 것) 또는 '' (세지 않음)
export function withOnce(app, featureOf, handler) {
  return async function (req, res) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const feature = req.method === 'POST' && !body.clientCode ? featureOf(body, req) : '';
    const got = feature ? await take(req, app, feature) : null;
    if (got && got.blocked) return res.status(403).json({ error: got.blocked, once: true });
    try {
      return await handler(req, res);
    } finally {
      if (got && got.key && !(res.statusCode < 400)) await getRedis().del(got.key).catch(() => {});
    }
  };
}
