// 잠금 화면(staff-guard.js)이 "이 암호가 맞는지"만 확인하는 API
import Redis from 'ioredis';
import { isStaff } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ok = await isStaff(req, getRedis());
    return res.status(ok ? 200 : 401).json({ ok });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
}
