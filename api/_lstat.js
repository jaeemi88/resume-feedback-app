// 강의별 앱 기록 쌓기 API (2026-10-03 · 결과보고서 '앱 기록 불러오기'용)
// ─────────────────────────────────────────────
// 학생이 자소서를 제출하거나 모의면접 답변을 연습할 때마다, 그 학생이 들어온 입장 코드(1회분 = ci)의
// 숫자만 하나씩 올려요. 학생 결과가 만료돼도 강의 숫자는 남아요 (400일 보관).
//
// · 학생 이름·숫자 4자리는 받지 않아요. 허브·앱이 (강사코드|이름|숫자4자리)를 SHA-256으로 뒤섞은
//   64자리 열쇠(k)만 보내고, 서버는 '같은 학생인지'만 구분해요.
// · 저장 내용: 앱별 건수, 날짜별 건수, 학생별 첫 제출·마지막 제출의 자소서 점검 점수와 STAR 비율
//
//   api/progress 로 POST { action:'stat', ci, k, app:'resume'|'interview', n, score, star } → { ok }
// (Vercel 무료 요금제 함수 12개 제한 때문에 progress.js 안에서 처리 · 파일 이름이 _ 로 시작해 주소가 되지 않음)

const TTL = 60 * 60 * 24 * 400;
function kstDay(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function pct(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null; }

export async function lstatAdd(client, b) {
  const ci = String(b.ci || '');
  const k = String(b.k || '');
  const app = b.app === 'interview' ? 'interview' : (b.app === 'resume' ? 'resume' : '');
  if (!/^ci_[a-z0-9]{8,24}$/.test(ci) || !app) return { status: 400, error: '형식이 맞지 않아요' };
  const n = Math.max(1, Math.min(50, parseInt(b.n, 10) || 1));
  if (!(await client.exists('moa_ci:' + ci))) return { status: 404, error: '모르는 입장 코드예요' };
  const day = kstDay(Date.now());
  const sKey = 'moa_cistat:' + ci;
  await client.hincrby(sKey, app, n);
  await client.hincrby(sKey, 'd:' + day + ':' + app, n);
  await client.expire(sKey, TTL);
  if (/^[a-f0-9]{64}$/.test(k)) {
    const uKey = 'moa_cistu:' + ci;
    const raw = await client.hget(uKey, k);
    const u = raw ? JSON.parse(raw) : { r: 0, i: 0 };
    if (app === 'interview') u.i = (u.i || 0) + n;
    else {
      u.r = (u.r || 0) + 1;
      const sc = pct(b.score), st = pct(b.star);
      if (sc !== null) { if (u.fs == null) u.fs = sc; u.ls = sc; }
      if (st !== null) { if (u.ft == null) u.ft = st; u.lt = st; }
    }
    await client.hset(uKey, k, JSON.stringify(u));
    await client.expire(uKey, TTL);
  }
  return { status: 200 };
}
