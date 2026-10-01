// 개인 고객(네이버 예약) 입장 코드 API (2026-10-01 · 수익화 랩 인계)
// ─────────────────────────────────────────────
// 원장님이 고객마다 코드를 만들어 링크를 보내면, 고객은 링크(?c=코드)로 바로 들어와
// 열어준 항목만 모아서 "한 번" 제출해요. (세트 상품은 자소서 1번 + 모의면접 1번)
//
// ※ 강사 명단·초대코드(teacher-registry.js)와는 완전히 따로 저장해요.
//   → 트래커·제안서·운영보드·허브에는 영향이 없어요.
//
// [원장님 전용 — MASTER_ADMIN_PASSWORD(강사 명부 비밀번호) 필요]
//   GET  ?list=1&master=비밀번호                         → 고객 코드 목록
//   POST { action:'create', master, memo, product, days, items, interviewCats, job, company, presetId, email }
//   POST { action:'extend', master, code, days }         → 이용 기간 연장(오늘부터 days일)
//   POST { action:'reopen', master, code, part }          → 제출 1회 다시 열어주기 (part: resume | interview)
//   POST { action:'delete', master, code }                → 코드 삭제(링크 즉시 막힘)
//
// [누구나 — 고객 입장]
//   POST { action:'verify', code }  → 고객 화면에 필요한 정보만 (이메일·메모는 돌려주지 않음)
//        같은 IP에서 20번 틀리면 15분 차단
//
// [다른 서버 파일에서 사용] useClientPart(client, code, part) → 제출 1회 사용 처리 (reviews.js)
import Redis from 'ioredis';
import crypto from 'crypto';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

export const CLIENT_T = 'jinromoa';            // 고객 제출물은 원장님 검수 대기함으로
const PREFIX = 'moa_client:';                  // moa_client:ABC234 → JSON
const INDEX = 'moa_clients';                   // 해시: 코드 → 만든 시각 (목록용)
const USED = (code, part) => `moa_client_used:${code}:${part}`; // 제출 1회 잠금 (있으면 이미 제출)
const KEEP_AFTER_END = 60 * 24 * 3600;         // 기간 끝난 뒤 60일 지나면 Redis에서 자동 삭제

export const RESUME_ITEMS = ['성장과정', '성격장단점', '지원동기', '협업갈등', '도전경험', '실패경험', '경력활동', '입사후포부'];
const PRODUCTS = { resume: '자소서 첨삭', interview: '모의면접', set: '세트(자소서→면접)' };

function checkAdmin(pw) {
  return !!process.env.MASTER_ADMIN_PASSWORD && String(pw || '') === process.env.MASTER_ADMIN_PASSWORD;
}
function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
function clean(s, n) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
}
function normCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0·O·1·I 제외
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[crypto.randomInt(0, chars.length)];
  return c;
}
function partsOf(product) {
  return product === 'set' ? ['resume', 'interview'] : [product];
}
async function save(client, d) {
  const ttl = Math.max(3600, Math.ceil((d.expiresAt - Date.now()) / 1000) + KEEP_AFTER_END);
  await client.set(PREFIX + d.code, JSON.stringify(d), 'EX', ttl);
}
async function withUsed(client, d) {
  const used = {};
  for (const p of partsOf(d.product)) {
    const raw = await client.get(USED(d.code, p));
    used[p] = raw ? JSON.parse(raw) : null; // { at, reviewCode }
  }
  return { ...d, used };
}

// 고객 화면용 (이메일·메모 같은 개인정보는 빼고)
function publicView(d) {
  return {
    code: d.code, product: d.product, productName: PRODUCTS[d.product],
    items: d.items, interviewCats: d.interviewCats || [],
    job: d.job || '', company: d.company || '', presetId: d.presetId || '',
    hasEmail: !!d.email, expiresAt: d.expiresAt, t: CLIENT_T,
    used: Object.fromEntries(Object.entries(d.used || {}).map(([k, v]) => [k, v ? { at: v.at, reviewCode: v.reviewCode || '' } : null]))
  };
}

export async function getClient(client, code) {
  const raw = await client.get(PREFIX + normCode(code));
  return raw ? JSON.parse(raw) : null;
}

// 제출 1회 사용 처리 — 성공하면 고객 정보, 실패하면 { error, status }
export async function useClientPart(client, code, part, reviewCode) {
  const d = await getClient(client, code);
  if (!d) return { error: '입장 코드를 찾을 수 없어요.', status: 404 };
  if (Date.now() > d.expiresAt) return { error: '이용 기간이 끝난 코드예요. 진로모아로 문의해 주세요.', status: 410 };
  if (!partsOf(d.product).includes(part)) return { error: '이 상품에 포함되지 않은 항목이에요.', status: 403 };
  const ok = await client.set(USED(d.code, part), JSON.stringify({ at: Date.now(), reviewCode: reviewCode || '' }), 'NX');
  if (!ok) return { error: '이미 제출을 마친 코드예요. 제출 후에는 수정할 수 없어요.', status: 409 };
  await client.expire(USED(d.code, part), Math.max(3600, Math.ceil((d.expiresAt - Date.now()) / 1000) + KEEP_AFTER_END));
  return { data: d };
}
// 제출 저장이 실패했을 때 잠금을 되돌림
export async function releaseClientPart(client, code, part) {
  await client.del(USED(normCode(code), part));
}
// 저장 후 확인코드를 잠금 기록에 붙여둠 (고객이 링크를 다시 열면 결과 조회로 안내)
export async function attachReviewCode(client, code, part, reviewCode) {
  const key = USED(normCode(code), part);
  const raw = await client.get(key);
  if (!raw) return;
  const v = JSON.parse(raw);
  v.reviewCode = reviewCode;
  const ttl = await client.ttl(key);
  await client.set(key, JSON.stringify(v), 'EX', ttl > 0 ? ttl : 3600 * 24 * 90);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const client = getRedis();
  try {
    const body = req.method === 'POST' ? readBody(req) : {};

    // ── 고객 입장 확인 (누구나) ──
    if (req.method === 'POST' && body.action === 'verify') {
      const failKey = 'moa_clfail:' + ipOf(req);
      const fails = +(await client.get(failKey)) || 0;
      if (fails >= 20) return res.status(429).json({ ok: false, error: '여러 번 틀려서 15분 동안 입장이 잠겼어요. 잠시 후 다시 해 주세요.' });
      const d = await getClient(client, body.code);
      if (!d) {
        await client.incr(failKey);
        await client.expire(failKey, 900);
        return res.status(404).json({ ok: false, error: '입장 코드가 맞지 않아요. 받으신 링크를 다시 눌러 주세요.' });
      }
      if (Date.now() > d.expiresAt) return res.status(410).json({ ok: false, expired: true, error: '이용 기간이 끝났어요. 진로모아로 문의해 주세요.' });
      return res.status(200).json({ ok: true, client: publicView(await withUsed(client, d)) });
    }

    // ── 여기부터 원장님만 ──
    const pw = req.method === 'GET' ? req.query.master : body.master;
    if (!process.env.MASTER_ADMIN_PASSWORD) return res.status(500).json({ ok: false, error: '서버에 관리자 비밀번호가 설정되지 않았어요.' });
    if (!checkAdmin(pw)) return res.status(401).json({ ok: false, error: '관리자 비밀번호가 맞지 않아요.' });

    if (req.method === 'GET' && req.query.list) {
      const all = await client.hgetall(INDEX);
      const items = [];
      for (const c of Object.keys(all)) {
        const d = await getClient(client, c);
        if (!d) { await client.hdel(INDEX, c); continue; } // 보관 기간 지나 자동 삭제된 코드 정리
        items.push(await withUsed(client, d));
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method === 'POST' && body.action === 'create') {
      const product = PRODUCTS[body.product] ? body.product : 'set';
      let days = parseInt(body.days, 10);
      if (!(days >= 1 && days <= 180)) days = 14;
      let items = Array.isArray(body.items) ? body.items.filter(x => RESUME_ITEMS.includes(x)) : [];
      if (!items.length) items = RESUME_ITEMS.slice();
      const interviewCats = Array.isArray(body.interviewCats) ? body.interviewCats.map(x => clean(x, 40)).filter(Boolean).slice(0, 12) : [];
      const now = Date.now();
      const base = {
        product, items, interviewCats,
        memo: clean(body.memo, 40), job: clean(body.job, 60), company: clean(body.company, 40),
        presetId: clean(body.presetId, 60), email: clean(body.email, 120),
        createdAt: now, expiresAt: now + days * 24 * 3600 * 1000
      };
      for (let i = 0; i < 20; i++) {
        const code = genCode();
        const ok = await client.set(PREFIX + code, JSON.stringify({ code, ...base }), 'EX', days * 24 * 3600 + KEEP_AFTER_END, 'NX');
        if (ok) {
          await client.hset(INDEX, code, String(now));
          return res.status(200).json({ ok: true, item: await withUsed(client, { code, ...base }) });
        }
      }
      return res.status(503).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
    }

    const d = await getClient(client, body.code);
    if (!d) return res.status(404).json({ ok: false, error: '코드를 찾을 수 없어요.' });

    if (req.method === 'POST' && body.action === 'extend') {
      let days = parseInt(body.days, 10);
      if (!(days >= 1 && days <= 180)) days = 7;
      d.expiresAt = Math.max(d.expiresAt, Date.now()) + days * 24 * 3600 * 1000;
      await save(client, d);
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    if (req.method === 'POST' && body.action === 'reopen') {
      const part = body.part === 'interview' ? 'interview' : 'resume';
      await client.del(USED(d.code, part));
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    if (req.method === 'POST' && body.action === 'delete') {
      await client.del(PREFIX + d.code, USED(d.code, 'resume'), USED(d.code, 'interview'));
      await client.hdel(INDEX, d.code);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
  }
}
