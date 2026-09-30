// 개인정보 자동 파기 (2026-09-30 · 개인정보처리방침 "보관 기간 30일" 이행)
// ─────────────────────────────────────────────
// 매일 새벽 3시(한국 시간)에 Vercel이 자동으로 호출합니다. (vercel.json 의 crons)
// 자소서·모의면접 두 앱이 같은 저장소(Redis)를 쓰므로 여기 한 곳에서 함께 정리해요.
//
// 지우는 대상 (강사 코드별)
//   자소서  검수 대기  resume_review:{t}:{id}       + resume_reviews_index:{t}   (id 배열)
//   자소서  승인 결과  resume_result:{t}:{id}       + resume_results_index:{t}   (요약 배열)
//   모의면접 검수 대기 interview_review:{t}:{id}    + interview_reviews_index:{t} (해시)
//   모의면접 승인 결과 interview_result:{t}:{id}    + interview_results_index:{t} (리스트)
//   ※ 실시간 면접방(live:*)은 원래부터 자동 만료라 여기서 건드리지 않음
//
// 기준: 아래 시각 중 "가장 늦은 때"로부터 30일이 지나면 삭제
//   제출(createdAt) · 승인(approvedAt) · 기간 연장(extendedAt) · 학생 조회 기간 끝(expiresAt)
//   → 강사가 조회 기간을 늘려주면 그 기간이 끝난 뒤 30일까지 보관
//   시각 정보가 하나도 없는 옛 자료는 지우지 않고 개수만 알려줌
//
// 호출 권한: Vercel 예약 실행, 또는 원장님 암호(x-staff-pin) — ?dry=1 이면 지우지 않고 개수만 확인
import Redis from 'ioredis';
import { whoIs } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const KEEP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const KINDS = [
  { prefix: 'resume_review:',    index: 'resume_reviews_index:',    indexType: 'idArray' },
  { prefix: 'resume_result:',    index: 'resume_results_index:',    indexType: 'metaArray' },
  { prefix: 'interview_review:', index: 'interview_reviews_index:', indexType: 'hash' },
  { prefix: 'interview_result:', index: 'interview_results_index:', indexType: 'list' }
];

function toMs(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (!isNaN(n) && n > 1e11) return n;
  const d = Date.parse(v);
  return isNaN(d) ? 0 : d;
}
function lastActivity(item) {
  return Math.max(toMs(item.createdAt), toMs(item.approvedAt), toMs(item.extendedAt), toMs(item.expiresAt));
}

async function scanKeys(client, pattern) {
  const out = [];
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    out.push(...keys);
  } while (cursor !== '0');
  return out;
}

// 삭제된 id를 목록(index)에서도 빼기
async function pruneIndex(client, kind, t, ids) {
  const key = kind.index + t;
  const gone = new Set(ids);
  if (kind.indexType === 'hash') {
    if (ids.length) await client.hdel(key, ...ids);
    return;
  }
  if (kind.indexType === 'list') {
    const all = await client.lrange(key, 0, -1);
    for (const raw of all) {
      let id = '';
      try { id = JSON.parse(raw).id; } catch (e) {}
      if (gone.has(id)) await client.lrem(key, 0, raw);
    }
    return;
  }
  const raw = await client.get(key);
  if (!raw) return;
  let arr = [];
  try { arr = JSON.parse(raw); } catch (e) { return; }
  const kept = arr.filter(x => !gone.has(kind.indexType === 'idArray' ? x : x && x.id));
  if (kept.length !== arr.length) await client.set(key, JSON.stringify(kept));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const client = getRedis();

  // 권한 확인
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const fromCron = secret ? auth === 'Bearer ' + secret : /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  let allowed = fromCron;
  if (!allowed) {
    try { const who = await whoIs(req, client); allowed = !!(who && who.role === 'master'); } catch (e) {}
  }
  if (!allowed) return res.status(401).json({ ok: false });

  const dry = req.query && req.query.dry === '1';
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  const report = { dryRun: dry, keepDays: KEEP_DAYS, deleted: {}, kept: {}, noDate: {} };

  try {
    for (const kind of KINDS) {
      const name = kind.prefix.replace(':', '');
      report.deleted[name] = 0; report.kept[name] = 0; report.noDate[name] = 0;
      const keys = await scanKeys(client, kind.prefix + '*');
      const byTeacher = {};
      for (const key of keys) {
        const rest = key.slice(kind.prefix.length);
        const cut = rest.lastIndexOf(':');
        if (cut < 1) continue;
        const t = rest.slice(0, cut), id = rest.slice(cut + 1);
        let item = null;
        try { item = JSON.parse(await client.get(key)); } catch (e) {}
        if (!item) continue;
        const last = lastActivity(item);
        if (!last) { report.noDate[name]++; continue; }
        if (last >= cutoff) { report.kept[name]++; continue; }
        report.deleted[name]++;
        if (!dry) {
          await client.del(key);
          (byTeacher[t] = byTeacher[t] || []).push(id);
        }
      }
      for (const t of Object.keys(byTeacher)) await pruneIndex(client, kind, t, byTeacher[t]);
    }
    console.log('개인정보 자동 파기', JSON.stringify(report));
    return res.status(200).json({ ok: true, ...report });
  } catch (err) {
    console.error('개인정보 자동 파기 실패', err);
    return res.status(500).json({ ok: false });
  }
}
