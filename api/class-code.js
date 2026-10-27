// 강의별 학생 입장 코드 API (2026-09-30 · 허브 학생 입장 강화)
// ─────────────────────────────────────────────
// 강사님이 강의 때 4자리 코드를 만들어 칠판·QR로 알려주면,
// 학생은 허브에서 이름 + 나만의 숫자 4자리 + 이 코드를 넣어야 입장할 수 있어요.
// 허브(moa-hub.vercel.app)는 서버가 없어서 이 API를 빌려 씀 → 허브 주소 허용
//
// [강사·원장님 — x-staff-pin(원장님 암호) 또는 x-staff-key(승인 링크) 필요]
//   GET  ?list=1                                  → 사용 중인 코드 목록 (강사는 본인 것만, 원장님은 전체)
//   POST { action:'create', label, hours }        → 새 4자리 코드 발급 (hours: 1~168, 기본 12)
//   POST { action:'delete', code }                → 코드 즉시 사용 종료
//   POST { action:'extend', code, hours }         → 사용 기간 연장 (2026-10-26). 번호·ci·학생 기록은 그대로,
//        끝나는 시각만 hours만큼 늘림. 지금부터 최대 168시간(7일)까지 · 이미 끝난 코드는 연장 불가
//   POST { action:'create', caseId, slotId }      → 운영보드에서 배정받은 센터 강의 코드 (2026-10-03)
//   create에 only: { interview: '질문 유형 id', resume: '문항 유형' } 를 함께 보내면 그 코드로 들어온 학생은
//   그 유형 하나만 씀 (2026-10-24 · 특강별 질문 유형). 비우면 전체. 허브가 앱 주소에 ?qt= 로 붙여 넘김
//   create에 once: true 를 보내면 그 코드로 들어온 학생은 AI 기능을 기능마다 한 번만 씀 (2026-10-27 · 학생당 1회,
//   api/_once.js가 moa_ci:{ci}.once를 보고 막음). 허브가 앱 주소에 ?once=1 을 붙여 화면 안내에 씀
//   GET  ?assign=1                                → 나에게 배정된 센터 강의 목록 + 사용 중인 코드
//
// [강의별 앱 기록 (2026-10-03)]
//   코드를 만들 때마다 1회분 이름표(ci)를 따로 만들어 400일 보관해요. 4자리 번호는 다시 쓰일 수 있지만
//   ci는 겹치지 않아서, 학생 기록 숫자는 ci로 쌓이고(api/lstat) 운영보드 강의는 ci 묶음으로 모아 봐요.
//   moa_ci:{ci} · moa_ci_by_t:{강사코드} · moa_lect:{강의id}(ci → 반/회차) · moa_assign:{강사코드}(운영보드가 씀)
//
// [누구나 — 학생 입장]
//   POST { action:'verify', code }                → { ok, label, t, ci, only, once, expiresAt }
//        expiresAt: 허브가 기억해 두고 조립기·STAR 경험카드를 코드 사용 기간에만 열어 줌 (2026-10-27) (t = 학생 제출이 갈 강사 코드)
//        같은 IP에서 30번 틀리면 15분 차단 (코드 추측 방지 · 학교는 한 반이 같은 IP라 넉넉히)
//
// ※ 학생 이름·휴대폰 번호는 이 API로 보내지 않아요. 코드만 확인합니다.
import Redis from 'ioredis';
import crypto from 'crypto';
import { whoIs } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const PREFIX = 'moa_classcode:';          // moa_classcode:1234 → JSON (만료 시간 지나면 자동 삭제)
const INDEX = 'moa_classcodes';           // 해시: 코드 → 만든 사람 코드 (목록용)
const DEFAULT_T = 'jinromoa';             // 원장님이 만든 코드 → 기존 허브 기본 코드로 연결

function isAllowedOrigin(origin) {
  return origin === 'https://moa-hub.vercel.app' ||
    /^https:\/\/moa-[a-z0-9-]+-jaeemi88\.vercel\.app$/.test(origin); // 허브 미리보기 주소
}
function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
function cleanLabel(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 40);
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}
// 특강 질문 유형 (2026-10-24) — 모의면접은 질문 유형 id(강사가 만든 유형 포함), 자소서는 정해진 문항 유형 중 하나
const RESUME_QTYPES = ['성장과정', '성격장단점', '지원동기', '협업갈등', '도전경험', '실패경험', '경력활동', '입사후포부', '에세이'];
function cleanOnly(o) {
  o = o && typeof o === 'object' ? o : {};
  const iv = String(o.interview || '').trim();
  const rs = String(o.resume || '').trim();
  const out = {};
  if (/^[a-z0-9-]{1,30}$/.test(iv)) out.interview = iv;
  if (RESUME_QTYPES.includes(rs)) out.resume = rs;
  return Object.keys(out).length ? out : null;
}
function publicView(d) {
  return { code: d.code, label: d.label, t: d.t, ownerName: d.ownerName, createdAt: d.createdAt, expiresAt: d.expiresAt, only: d.only || null, once: !!d.once,
    lect: d.lect ? { caseId: d.lect.caseId, slotId: d.lect.slotId, title: d.lect.title, slot: d.lect.slot } : null };
}
const CI_TTL = 60 * 60 * 24 * 400;
function kstDay(ms) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-staff-pin, x-staff-key, content-type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');

  const client = getRedis();
  try {
    const body = req.method === 'POST' ? readBody(req) : {};

    // ── 학생 입장 확인 (누구나) ──
    if (req.method === 'POST' && body.action === 'verify') {
      const failKey = 'moa_ccfail:' + ipOf(req);
      const fails = +(await client.get(failKey)) || 0;
      if (fails >= 30) return res.status(429).json({ ok: false, error: '여러 번 틀려서 15분 동안 입장이 잠겼어요. 잠시 후 다시 해 주세요.' });
      const code = String(body.code || '').replace(/\D/g, '');
      const raw = code.length === 4 ? await client.get(PREFIX + code) : null;
      if (!raw) {
        await client.incr(failKey);
        await client.expire(failKey, 900);
        return res.status(404).json({ ok: false, error: '입장 코드가 맞지 않거나 사용 기간이 끝났어요. 강사님께 확인해 주세요.' });
      }
      const d = JSON.parse(raw);
      return res.status(200).json({ ok: true, label: d.label, t: d.t, ci: d.ci || '', only: d.only || null, once: !!d.once, expiresAt: d.expiresAt || 0 });
    }

    // ── 여기부터 강사·원장님만 ──
    const who = await whoIs(req, client);
    if (!who) return res.status(401).json({ ok: false, error: '강사 확인이 필요해요.' });
    const isMaster = who.role === 'master';
    const myT = isMaster ? DEFAULT_T : who.code;

    if (req.method === 'GET' && req.query.list) {
      const all = await client.hgetall(INDEX);
      const codes = Object.keys(all).filter(c => isMaster || all[c] === myT);
      const items = [];
      for (const c of codes) {
        const raw = await client.get(PREFIX + c);
        if (!raw) { await client.hdel(INDEX, c); continue; } // 기간 끝난 코드 정리
        items.push(publicView(JSON.parse(raw)));
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ ok: true, items });
    }

    // 나에게 배정된 센터 강의 (운영보드가 moa_assign:{강사코드}에 써 둠)
    if (req.method === 'GET' && req.query.assign) {
      const all = await client.hgetall('moa_assign:' + myT);
      const hasCases = (await client.exists('jm:cases')) === 1; // 운영보드 강의 목록을 못 읽으면 지우지 않음
      const today = kstDay(Date.now()), now = Date.now();
      const lo = kstDay(now - 86400000), hi = kstDay(now + 14 * 86400000);
      const items = [];
      for (const [field, raw] of Object.entries(all || {})) {
        let a; try { a = JSON.parse(raw); } catch (e) { continue; }
        // 운영보드에서 이미 지운 강의면 카드도 정리 (예전에 지워서 남아 있던 카드 포함, 2026-10-09)
        if (hasCases && a.caseId && !(await client.hexists('jm:cases', a.caseId))) { await client.hdel('moa_assign:' + myT, field); continue; }
        const dates = Array.isArray(a.dates) ? a.dates.filter(Boolean) : [];
        if (dates.length && !dates.some(d => d >= lo && d <= hi)) continue; // 지난 강의·먼 강의는 숨김
        let live = null;
        const lect = await client.hgetall('moa_lect:' + a.caseId);
        for (const [ci, lr] of Object.entries(lect || {})) {
          let l; try { l = JSON.parse(lr); } catch (e) { continue; }
          if (l.slotId !== a.slotId || !(l.expiresAt > now)) continue;
          const cr = await client.get(PREFIX + l.code);
          if (cr && JSON.parse(cr).ci === ci && (!live || l.createdAt > live.createdAt)) live = { code: l.code, expiresAt: l.expiresAt, createdAt: l.createdAt, ownerName: l.ownerName };
        }
        items.push({ caseId: a.caseId, slotId: a.slotId, title: a.title, slot: a.slot, dates, today: dates.includes(today), live });
      }
      items.sort((x, y) => (y.today - x.today) || String(x.dates[0] || '').localeCompare(String(y.dates[0] || '')));
      return res.status(200).json({ ok: true, items });
    }

    if (req.method === 'POST' && body.action === 'create') {
      let hours = parseInt(body.hours, 10);
      if (!(hours >= 1 && hours <= 168)) hours = 12;
      let label = cleanLabel(body.label) || '강의';
      // 운영보드에서 배정받은 센터 강의로 만들기
      let lect = null;
      if (body.caseId && body.slotId) {
        const field = String(body.caseId).slice(0, 60) + '|' + String(body.slotId).slice(0, 40);
        const ar = await client.hget('moa_assign:' + myT, field);
        if (!ar) return res.status(403).json({ ok: false, error: '배정되지 않은 강의예요. 원장님께 확인해 주세요.' });
        const a = JSON.parse(ar);
        lect = { caseId: a.caseId, slotId: a.slotId, title: a.title, slot: a.slot };
        label = cleanLabel([a.title, a.slot].filter(Boolean).join(' · ')) || label;
      }
      const now = Date.now();
      const only = cleanOnly(body.only);
      const once = body.once === true || body.once === 1 || body.once === '1';
      const ownerName = isMaster ? '원장님' : (who.name || who.code);
      for (let i = 0; i < 30; i++) {
        const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
        const ci = 'ci_' + crypto.randomBytes(8).toString('hex');
        const data = { code, label, t: myT, owner: myT, ownerName, createdAt: now, expiresAt: now + hours * 3600 * 1000, ci, lect, only, once };
        // 같은 번호가 이미 쓰이고 있으면 다른 번호로 (NX = 없을 때만 저장)
        const ok = await client.set(PREFIX + code, JSON.stringify(data), 'EX', hours * 3600, 'NX');
        if (ok) {
          await client.hset(INDEX, code, myT);
          await client.set('moa_ci:' + ci, JSON.stringify({ ci, code, t: myT, ownerName, label, createdAt: now, expiresAt: data.expiresAt, lect, only, once }), 'EX', CI_TTL);
          await client.hset('moa_ci_by_t:' + myT, ci, String(now));
          await client.expire('moa_ci_by_t:' + myT, CI_TTL);
          if (lect) {
            await client.hset('moa_lect:' + lect.caseId, ci, JSON.stringify({ slotId: lect.slotId, slot: lect.slot, t: myT, ownerName, code, createdAt: now, expiresAt: data.expiresAt }));
            await client.expire('moa_lect:' + lect.caseId, CI_TTL);
          }
          return res.status(200).json({ ok: true, item: publicView(data) });
        }
      }
      return res.status(503).json({ ok: false, error: '지금 쓸 수 있는 번호가 부족해요. 잠시 후 다시 시도해 주세요.' });
    }

    if (req.method === 'POST' && body.action === 'delete') {
      const code = String(body.code || '').replace(/\D/g, '');
      const raw = await client.get(PREFIX + code);
      if (raw) {
        const d = JSON.parse(raw);
        if (!isMaster && d.owner !== myT) return res.status(403).json({ ok: false, error: '본인이 만든 코드만 끝낼 수 있어요.' });
        await client.del(PREFIX + code);
      }
      await client.hdel(INDEX, code);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST' && body.action === 'extend') {
      const code = String(body.code || '').replace(/\D/g, '');
      let add = parseInt(body.hours, 10);
      if (!(add >= 1 && add <= 168)) return res.status(400).json({ ok: false, error: '연장할 기간을 다시 골라 주세요.' });
      const raw = code.length === 4 ? await client.get(PREFIX + code) : null;
      if (!raw) return res.status(404).json({ ok: false, error: '이미 사용 기간이 끝난 코드예요. 새 코드를 만들어 주세요.' });
      const d = JSON.parse(raw);
      if (!isMaster && d.owner !== myT) return res.status(403).json({ ok: false, error: '본인이 만든 코드만 연장할 수 있어요.' });
      const now = Date.now();
      const cap = now + 168 * 3600 * 1000;
      const expiresAt = Math.min(Math.max(d.expiresAt, now) + add * 3600 * 1000, cap);
      if (expiresAt <= d.expiresAt) return res.status(200).json({ ok: true, capped: true, item: publicView(d) });
      d.expiresAt = expiresAt;
      const ttl = Math.ceil((expiresAt - now) / 1000);
      // XX = 그 사이 끝나서 지워졌으면 되살리지 않음
      const ok = await client.set(PREFIX + code, JSON.stringify(d), 'EX', ttl, 'XX');
      if (!ok) return res.status(404).json({ ok: false, error: '이미 사용 기간이 끝난 코드예요. 새 코드를 만들어 주세요.' });
      // 강의 1회분 기록(ci)·운영보드 강의 카드의 끝나는 시각도 함께
      if (d.ci) {
        const cr = await client.get('moa_ci:' + d.ci);
        if (cr) { const c = JSON.parse(cr); c.expiresAt = expiresAt; const left = await client.ttl('moa_ci:' + d.ci); await client.set('moa_ci:' + d.ci, JSON.stringify(c), 'EX', left > 0 ? left : CI_TTL); }
        if (d.lect && d.lect.caseId) {
          const lr = await client.hget('moa_lect:' + d.lect.caseId, d.ci);
          if (lr) { const l = JSON.parse(lr); l.expiresAt = expiresAt; await client.hset('moa_lect:' + d.lect.caseId, d.ci, JSON.stringify(l)); }
        }
      }
      return res.status(200).json({ ok: true, capped: expiresAt === cap, item: publicView(d) });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
  }
}
