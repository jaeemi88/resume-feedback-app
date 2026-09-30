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
//
// [누구나 — 학생 입장]
//   POST { action:'verify', code }                → { ok, label, t } (t = 학생 제출이 갈 강사 코드)
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
function publicView(d) {
  return { code: d.code, label: d.label, t: d.t, ownerName: d.ownerName, createdAt: d.createdAt, expiresAt: d.expiresAt };
}

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
      return res.status(200).json({ ok: true, label: d.label, t: d.t });
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

    if (req.method === 'POST' && body.action === 'create') {
      let hours = parseInt(body.hours, 10);
      if (!(hours >= 1 && hours <= 168)) hours = 12;
      const label = cleanLabel(body.label) || '강의';
      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
        const data = { code, label, t: myT, owner: myT, ownerName: isMaster ? '원장님' : (who.name || who.code), createdAt: now, expiresAt: now + hours * 3600 * 1000 };
        // 같은 번호가 이미 쓰이고 있으면 다른 번호로 (NX = 없을 때만 저장)
        const ok = await client.set(PREFIX + code, JSON.stringify(data), 'EX', hours * 3600, 'NX');
        if (ok) {
          await client.hset(INDEX, code, myT);
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

    return res.status(400).json({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
  }
}
