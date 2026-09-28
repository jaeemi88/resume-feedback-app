// 잠금 화면(staff-guard.js)이 "들어온 사람이 누구인지" 확인하는 API
// 응답: { ok, role:'master'|'teacher', code, name }
// 허브(moa-hub.vercel.app)는 서버가 없어서 이 API를 빌려 씀 → 허브 주소 허용
import Redis from 'ioredis';
import { whoIs } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const ALLOWED = ['https://moa-hub.vercel.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-staff-pin, x-staff-key, content-type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const who = await whoIs(req, getRedis());
    if (!who) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, ...who });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
}
