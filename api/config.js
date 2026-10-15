// 강사가 설정한 톤·평가기준 프리셋을 서버(Redis)에 저장 — 같은 강사의 모든 기기가 공유
// 강사별로 데이터가 섞이지 않도록 t(강사 코드)로 구분해서 저장함
// 원장님이 삭제(사용 중지)한 강사 코드는 설정 조회·저장을 막음 (데이터 자체는 지우지 않고 보관)
// 보안 (2026-09-25): 조회는 학생 제출 화면에도 필요해서 공개, 저장(POST)은 강사용 암호가 있어야 가능
import Redis from 'ioredis';
import { isStaff } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

const REMOVED_KEY = 'moa_removed_teachers';

const DEFAULT_CONFIG = {
  presets: [
    { id: 'default', name: '기본', prompt: '' }
  ],
  activePresetId: 'default'
};

// AI 상투어 목록 (2026-10-05) — 원장님이 원장 화면에서 추가·삭제, 모든 강사·학생 화면이 같은 목록 사용
//   GET  /api/config?scope=cliches                → { cliches: [{w, alt:[]}] | null }  (null = 앱 기본 목록 사용)
//   POST /api/config?scope=cliches {master, cliches} → 원장님 비밀번호(MASTER_ADMIN_PASSWORD) 필요
const CLICHE_KEY = 'moa_ai_cliches';
function cleanCliches(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({
    w: String((x && x.w) || '').trim().slice(0, 20),
    alt: (Array.isArray(x && x.alt) ? x.alt : []).map((a) => String(a || '').trim().slice(0, 40)).filter(Boolean).slice(0, 3)
  })).filter((x) => x.w).slice(0, 80);
}

// 무료 체험 현황 (2026-10-15) — 블랙박스(/blackbox)·1문항 진단(/free)·AI 티 검사기(/check)
//   날짜별 숫자만 해시 'moa_free_stats'에 '<이벤트>:YYYY-MM-DD'로 쌓음 (글·이름·IP는 저장 안 함, 보관 기한 없음)
//   POST /api/config?scope=freestats {ev}       → 화면 열기(_view)·예약 버튼(_cta)·검사기 실행(check_use) 기록 (공개)
//   POST /api/config?scope=freestats {master}   → 전체 숫자 조회 (원장님 비밀번호 필요)
//   사용(_use)·30회 마감(_full)은 api/coach.js가 AI 진단을 마친 뒤 직접 기록
const FREE_STAT_KEY = 'moa_free_stats';
const FREE_STAT_EV = ['free_view', 'free_cta', 'box_view', 'box_cta', 'check_view', 'check_use', 'check_cta'];
function kstDay() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

export default async function handler(req, res) {
  const client = getRedis();
  if (req.query.scope === 'freestats') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (body.master !== undefined) {
      const ok = !!process.env.MASTER_ADMIN_PASSWORD && body.master === process.env.MASTER_ADMIN_PASSWORD;
      if (!ok) return res.status(401).json({ error: '원장님 비밀번호가 필요합니다.' });
      return res.status(200).json({ stats: (await client.hgetall(FREE_STAT_KEY)) || {} });
    }
    const ev = String(body.ev || '');
    if (!FREE_STAT_EV.includes(ev)) return res.status(400).json({ error: '모르는 기록이에요.' });
    try { await client.hincrby(FREE_STAT_KEY, ev + ':' + kstDay(), 1); } catch (e) { console.error('무료 체험 기록 실패:', e); }
    return res.status(200).json({ ok: true });
  }
  if (req.query.scope === 'cliches') {
    if (req.method === 'GET') {
      const raw = await client.get(CLICHE_KEY);
      return res.status(200).json({ cliches: raw ? JSON.parse(raw) : null });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const ok = !!process.env.MASTER_ADMIN_PASSWORD && body.master === process.env.MASTER_ADMIN_PASSWORD;
      if (!ok) return res.status(401).json({ error: '원장님 비밀번호가 필요합니다.' });
      if (body.reset) { await client.del(CLICHE_KEY); return res.status(200).json({ ok: true, cliches: null }); }
      const list = cleanCliches(body.cliches);
      await client.set(CLICHE_KEY, JSON.stringify(list));
      return res.status(200).json({ ok: true, cliches: list });
    }
    return res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
  }
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  try {
    if (await client.hexists(REMOVED_KEY, t)) {
      return res.status(403).json({ error: '사용이 중지된 강사 코드예요. 원장님께 문의해 주세요.', blocked: true });
    }
  } catch (err) {
    console.error('차단 여부 확인 실패(통과 처리):', err);
  }

  const key = `resume_app_config:${t}`;

  if (req.method === 'GET') {
    const raw = await client.get(key);
    const config = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    return res.status(200).json({ config });
  }

  if (req.method === 'POST') {
    try {
      if (!(await isStaff(req, client))) return res.status(401).json({ error: '강사용 암호가 필요합니다.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '확인 중 오류가 발생했습니다.' });
    }
    await client.set(key, JSON.stringify(req.body));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
}
