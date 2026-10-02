// 학생 진행 상황 API (2026-10-03 · 허브 '이어서 하기' 카드용)
// ─────────────────────────────────────────────
// 허브·모의면접 앱은 다른 주소라 서로의 저장공간을 못 읽어서, 진행 상황을 여기에 아주 짧게 맡겨 둡니다.
//
// · 학생 이름·숫자 4자리는 보내지 않아요. 브라우저에서 (강사코드|이름|숫자4자리)를 SHA-256으로
//   뒤섞은 64자리 열쇠(k)만 보내고, 서버는 그 열쇠로 진행 정보만 저장해요.
// · 저장 내용: 앱 이름, 연습 유형 이름, 몇 번까지 했는지, 시각 — 14일 뒤 자동 삭제
//
//   POST { action:'put', k, app:'interview'|'resume', data:{...} }   → { ok }
//   POST { action:'get', k }                                          → { ok, interview, resume }
import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const PREFIX = 'moa_progress:';
const TTL = 60 * 60 * 24 * 14; // 14일
const APPS = ['interview', 'resume'];

function isAllowedOrigin(origin) {
  return origin === 'https://moa-hub.vercel.app' ||
    origin === 'https://moa-interview-app.vercel.app' ||
    origin === 'https://resume-feedback-app-phi.vercel.app' ||
    /^https:\/\/(moa-|moa-interview-|resume-feedback-)[a-z0-9-]+-jaeemi88\.vercel\.app$/.test(origin);
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}
function txt(v, n) { return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n); }
function num(v) { const x = parseInt(v, 10); return Number.isFinite(x) && x >= 0 && x < 1000 ? x : 0; }

function clean(app, d) {
  d = d || {};
  if (app === 'interview') {
    return { cat: txt(d.cat, 30), catId: txt(d.catId, 30), done: num(d.done), total: num(d.total), next: num(d.next), at: Date.now() };
  }
  return { state: d.state === 'result' ? 'result' : 'submitted', items: num(d.items), at: Date.now() };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });

  const body = readBody(req);
  const k = String(body.k || '');
  if (!/^[a-f0-9]{64}$/.test(k)) return res.status(400).json({ error: '열쇠 형식이 맞지 않아요' });

  try {
    const r = getRedis();
    if (body.action === 'put') {
      const app = String(body.app || '');
      if (!APPS.includes(app)) return res.status(400).json({ error: '앱 이름이 맞지 않아요' });
      await r.set(PREFIX + k + ':' + app, JSON.stringify(clean(app, body.data)), 'EX', TTL);
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'get') {
      const [iv, rs] = await r.mget(PREFIX + k + ':interview', PREFIX + k + ':resume');
      const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
      return res.status(200).json({ ok: true, interview: parse(iv), resume: parse(rs) });
    }
    return res.status(400).json({ error: '알 수 없는 요청이에요' });
  } catch (e) {
    return res.status(500).json({ error: '잠시 후 다시 시도해 주세요' });
  }
}
