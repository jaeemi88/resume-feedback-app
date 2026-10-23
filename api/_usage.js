// AI 사용 기록 (2026-10-24) — 어느 강사·기능에서 AI를 얼마나 썼는지 하루 단위로 모아 둠
// ─────────────────────────────────────────────
// - API 파일의 handler를 withUsage(앱, 파일, handler)로 감싸면, 그 요청 안에서 부르는 Anthropic API 응답의
//   사용량(usage)을 자동으로 기록함 (_fitlen·_company 처럼 함께 부르는 호출도 같은 기능으로 묶임)
// - 저장: Redis 해시 moa_ai_usage:YYYY-MM-DD(한국 날짜), 칸 이름 "누구|앱|기능|항목"
//     누구: t:강사코드(그 강사의 강사 화면·학생 링크) / master(원장님) / client(유료 개인 고객) / free(무료 체험) / etc(구분 불가)
//     항목: n 횟수, in·out·cw·cr 토큰(입력·출력·캐시 저장·캐시 읽기), ws 웹 검색 횟수
// - 학생 이름·글 내용은 남기지 않음. 400일 뒤 자동 삭제
// - 강사 구분: 강사 화면은 staff-guard.js가 붙이는 승인 링크 키(x-staff-key)로, 학생 화면은 주소의 t(x-moa-t)로
// - 운영보드가 읽는 주소: 자소서 앱 /api/teacher-registry?usage=1&days=31 (헤더 x-usage-key = 환경변수 MOA_USAGE_KEY)
// 파일 이름이 _ 로 시작하므로 Vercel이 주소(API)로 만들지 않음. 자소서·모의면접 두 앱에 같은 파일.
import Redis from 'ioredis';
import { AsyncLocalStorage } from 'node:async_hooks';

const KEEP_SEC = 60 * 60 * 24 * 400;
const FREE_MODES = ['freeCheck', 'blackboxCheck', 'freeInterview'];
// claude-sonnet-4-6 기준 1백만 토큰당 달러 (캐시 저장 1.25배, 캐시 읽기 0.1배) · 웹 검색 1회 $0.01
const PRICE = { in: 3, out: 15, cw: 3.75, cr: 0.3, ws: 0.01 };

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const als = new AsyncLocalStorage();

function kstDay(ms) {
  return new Date((ms || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function safeCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

async function whoOf(req) {
  const h = req.headers || {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (FREE_MODES.includes(body.mode)) return 'free';
  if (h['x-staff-pin']) return 'master';
  const key = String(h['x-staff-key'] || '').trim();
  if (key.length >= 20) {
    try { const code = await getRedis().hget('moa_hub_keys', key); if (code) return 't:' + code; } catch (e) {}
  }
  if (h['x-moa-who'] === 'client') return 'client';
  let t = '';
  try { t = decodeURIComponent(String(h['x-moa-t'] || '')); } catch (e) {}
  t = safeCode(t || (req.query || {}).t || body.t);
  if (t) return 't:' + t;
  if (h['x-moa-who'] === 'master') return 'master';
  return 'etc';
}

async function record(ctx, data) {
  const u = data && data.usage;
  if (!u) return;
  if (!ctx.who) ctx.who = whoOf(ctx.req);
  const base = `${await ctx.who}|${ctx.app}|${ctx.route}|`;
  const k = 'moa_ai_usage:' + kstDay();
  const m = getRedis().multi()
    .hincrby(k, base + 'n', 1)
    .hincrby(k, base + 'in', u.input_tokens || 0)
    .hincrby(k, base + 'out', u.output_tokens || 0)
    .hincrby(k, base + 'cw', u.cache_creation_input_tokens || 0)
    .hincrby(k, base + 'cr', u.cache_read_input_tokens || 0);
  const ws = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  if (ws) m.hincrby(k, base + 'ws', ws);
  m.expire(k, KEEP_SEC);
  await m.exec();
}

// 서버의 fetch를 한 번 감싸서, withUsage 안에서 부른 Anthropic API 응답만 사용량을 기록
if (!globalThis.__moaUsageFetch && typeof globalThis.fetch === 'function') {
  globalThis.__moaUsageFetch = true;
  const orig = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const res = await orig(input, init);
    try {
      const ctx = als.getStore();
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (ctx && res.ok && url.indexOf('https://api.anthropic.com/') === 0) {
        ctx.jobs.push(res.clone().json().then((d) => record(ctx, d)).catch((e) => console.error('AI 사용 기록 실패', e)));
      }
    } catch (e) {}
    return res;
  };
}

export function withUsage(app, file, handler) {
  return async function (req, res) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = String(body.mode || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30);
    const ctx = { req, app, route: file + (mode ? ':' + mode : ''), jobs: [], who: null };
    try {
      return await als.run(ctx, () => handler(req, res));
    } finally {
      if (ctx.jobs.length) await Promise.allSettled(ctx.jobs); // 기록이 끝난 뒤에 함수가 멈추도록
    }
  };
}

// 운영보드용 집계 — 최근 days일(한국 날짜)의 기록 + 강사 이름
export async function usageReport(req, res) {
  const KEY = process.env.MOA_USAGE_KEY || '';
  if (!KEY || req.headers['x-usage-key'] !== KEY) return res.status(401).json({ error: 'unauthorized' });
  const days = Math.min(93, Math.max(1, parseInt(req.query.days, 10) || 31));
  const now = Date.now();
  const list = [];
  for (let i = 0; i < days; i++) list.push(kstDay(now - i * 86400000));
  const p = getRedis().pipeline();
  list.forEach((d) => p.hgetall('moa_ai_usage:' + d));
  p.hgetall('moa_approved_teachers');
  p.hgetall('moa_removed_teachers');
  const out = await p.exec();
  const rows = [];
  list.forEach((day, i) => {
    const h = (out[i] && out[i][1]) || {};
    const agg = {};
    for (const [f, v] of Object.entries(h)) {
      const j = f.lastIndexOf('|');
      const base = f.slice(0, j);
      (agg[base] = agg[base] || {})[f.slice(j + 1)] = +v || 0;
    }
    for (const [base, v] of Object.entries(agg)) {
      const [who, app, route] = base.split('|');
      const usd = ((v.in || 0) * PRICE.in + (v.out || 0) * PRICE.out + (v.cw || 0) * PRICE.cw + (v.cr || 0) * PRICE.cr) / 1e6 + (v.ws || 0) * PRICE.ws;
      rows.push({ day, who, app, route, n: v.n || 0, usd: Math.round(usd * 10000) / 10000 });
    }
  });
  const names = {};
  [out[days + 1], out[days]].forEach((r) => {
    for (const [code, raw] of Object.entries((r && r[1]) || {})) {
      try { names[code] = JSON.parse(raw).name || code; } catch (e) {}
    }
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ rows, names, from: list[list.length - 1], to: list[0] });
}
