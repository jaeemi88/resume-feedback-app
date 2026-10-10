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
//   POST { action:'verify', code, part }        → 위 정보 + 그 단계의 임시 저장 내용(draft)
//   POST { action:'saveDraft', code, part, data } → 제출 전 작성 중인 내용 자동 저장 (2026-10-01)
//        기간 안·제출 전에는 몇 번이든 나갔다 들어와도 이어서 쓸 수 있어요 (다른 기기에서도)
//
// [네이버 예약 자동 입장 링크 — 2026-10-02]
//   상품별 고정 링크(?shop=키)를 네이버 예약 안내 문구에 넣어두면, 고객이 결제 후 스스로
//   이름·이메일·예약번호를 넣고 바로 개인 코드를 받아 시작해요. (원장님 확인 없이 즉시)
//   POST { action:'shopInfo', key }                       → 링크 정보 (누구나)
//   POST { action:'shopList' }                            → 사용 중인 링크 목록 (누구나, go.jinromoa.co.kr 첫 화면 상품 고르기용)
//   POST { action:'shopJoin', key, name, email, bookingNo, job, company, source } → 코드 발급 + 입장 링크 메일 (누구나)
//        source: 어디서 알게 됐는지 (선택, SOURCES 중 하나) — 채널별 결제 수를 보려고 (2026-10-10)
//        referrer: source가 '지인 소개'일 때 소개해 준 분 이름 (선택) — 감사 선물(AI 모의면접 1회) 보낼 대상
//   GET  ?shops=1&master=비밀번호                          → 링크 목록 (원장님)
//   POST { action:'shopCreate'|'shopRotate'|'shopToggle'|'shopDelete'|'shopPrice', master, ... } (원장님)
//   POST { action:'setPrice', master, code, price } / { action:'refund', master, code, refunded } → 정산용 (원장님)
//
// [예약번호 대조 · 하루 등록 상한 — 2026-10-02 수익화 랩 인계]
//   네이버 예약 하루 상한과 같은 숫자로 맞춰두면, 그보다 많이 들어온 등록은 결제 안 한 사람일 가능성이 높아요.
//   → 상한을 넘은 고객은 작성·자동 저장은 그대로 되지만 "최종 제출"(= AI 첨삭 실행)은 원장님 확인 전까지 보류.
//   GET  ?limits=1&master=비밀번호                          → 상품별 하루 상한 + 오늘 등록 수
//   POST { action:'setLimits', master, limits:{resume,interview,set} }
//   POST { action:'setHold', master, code, hold }        → hold:false = 예약 확인 완료(보류 풀기, 고객에게 메일) / true = 보류로 표시
//
// [취소·환불 규정 — 2026-10-02 수익화 랩 확정]
//   등록 때 환불 규정 동의 필수(agreeRefund → refundAgreedAt 기록), 최종 제출 확인 창에서도 동의 후 제출.
//   환불로 표시하면(refund) 금액(부분 환불 가능, 세트 40,000원 등) 기록 + 작성 중 저장 내용 삭제 + 고객 링크 막힘.
//
// [5년 정산 장부 · 오류 알림 — 2026-10-02 수익화 랩 확정]
//   개인정보처리방침: 계약·결제·환불 기록 5년 / 작성 내용·결과물은 이용 기간 끝나고 30일 뒤 삭제.
//   → 고객 코드(moa_client:*)는 지금처럼 30일 뒤 사라지고, 정산에 필요한 항목만 장부(moa_client_ledger)에 5년 보관.
//     장부 항목: 코드·이름·이메일·예약번호·상품·금액·환불(금액·일시)·등록/동의/제출 시각·대조 기록 (작성 내용은 넣지 않음)
//   GET ?ledger=1&master=비밀번호 → 장부 전체 (5년 지난 줄은 이때 자동 삭제)
//   오류가 나면(입장 메일 실패·고객 제출 실패 등) 원장님 메일로 자동 알림 (같은 종류는 1시간에 1번만)
//   POST { action:'reportError', code, where, message } → 고객 화면에서 제출 실패 알림 (누구나 · 코드가 있어야 함)
//
// [다른 서버 파일에서 사용] useClientPart(client, code, part) → 제출 1회 사용 처리 (reviews.js)
// ※ 자소서 앱·모의면접 앱에 같은 파일이 들어 있어요. 고칠 때는 두 앱 모두 똑같이 바꿔 주세요.
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
const DRAFT = (code, part) => `moa_client_draft:${code}:${part}`; // 제출 전 임시 저장
const DRAFT_MAX = 300 * 1024;                  // 임시 저장 최대 300KB
const KEEP_AFTER_END = 30 * 24 * 3600;         // 기간 끝난 뒤 30일 지나면 Redis에서 자동 삭제 (개인정보처리방침 30일)
export const SOURCES = ['네이버 검색', '네이버 지도·플레이스', '인스타그램', '블로그', '강의·특강', '지인 소개', '기타']; // 입장 화면 '어디서 알게 되셨어요?' (2026-10-10)
const SHOPS = 'moa_client_shops';              // 해시: 링크 id → JSON (네이버 예약 자동 입장 링크)
const BOOKINGS = 'moa_client_bookings';        // 해시: 네이버 예약번호 → 코드 (같은 번호 두 번 등록 막기)
const LIMITS = 'moa_client_limits';            // JSON: 상품별 하루 자동 등록 상한
const DAILY = (ymd, product) => `moa_client_daily:${ymd}:${product}`; // 그날 자동 등록 수
const DEFAULT_LIMITS = { resume: 2, interview: 2, set: 1 };
const LEDGER = 'moa_client_ledger';            // 해시: 코드 → 정산 기록 JSON (5년 보관)
const LEDGER_KEEP = 5 * 365 * 24 * 3600 * 1000;
const ADMIN_FALLBACK = 'jinromoa@naver.com';
// 상품별 기본 이용 기간 (2026-10-08 원장님 결정: 자소서 7일 · 모의면접 7일 · 세트 10일)
export const DEFAULT_DAYS = { resume: 7, interview: 7, set: 10 };
const daysOf = (raw, product) => { const n = parseInt(raw, 10); return n >= 1 && n <= 180 ? n : (DEFAULT_DAYS[product] || 7); };
export const RESUME_APP_URL = 'https://resume-feedback-app-phi.vercel.app/';
export const INTERVIEW_APP_URL = 'https://moa-interview-app.vercel.app/';

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
// ── 5년 정산 장부 ──
export async function ledgerSync(client, d, patch) {
  try {
    if (!d || !d.code) return;
    const raw = await client.hget(LEDGER, d.code);
    const old = raw ? JSON.parse(raw) : {};
    const row = {
      ...old,
      code: d.code, product: d.product, auto: !!d.auto, name: d.name || old.name || '', email: d.email || old.email || '',
      bookingNo: d.bookingNo || old.bookingNo || '', memo: d.memo || '', shopLabel: d.shopLabel || '', source: d.source || old.source || '', referrer: d.referrer || old.referrer || '',
      price: d.price || 0, createdAt: d.createdAt || old.createdAt || Date.now(), expiresAt: d.expiresAt,
      refundAgreedAt: d.refundAgreedAt || old.refundAgreedAt || null,
      refundedAt: d.refundedAt || null, refundAmount: d.refundedAt ? (d.refundAmount != null ? d.refundAmount : (d.price || 0)) : null,
      checkedAt: d.checkedAt || old.checkedAt || null, holdReason: d.hold ? d.hold.reason : (old.holdReason || ''),
      submitted: { ...(old.submitted || {}) }, errors: old.errors || [],
      ...(patch || {})
    };
    if (patch && patch.submitted) row.submitted = { ...(old.submitted || {}), ...patch.submitted };
    if (patch && patch.error) { row.errors = [...(old.errors || []), patch.error].slice(-10); delete row.error; }
    await client.hset(LEDGER, d.code, JSON.stringify(row));
  } catch (e) { console.error('장부 기록 실패:', e); }
}
async function adminEmail(client) {
  try { const raw = await client.get('resume_app_config:' + CLIENT_T); const c = raw ? JSON.parse(raw) : {}; if (c.notifyEmail) return c.notifyEmail; } catch (e) {}
  return process.env.ADMIN_EMAIL || ADMIN_FALLBACK;
}
// 원장님께 오류 알림 메일 (같은 kind는 1시간에 1번)
export async function alertAdmin(client, kind, subject, text) {
  try {
    if (!process.env.RESEND_API_KEY) return false;
    const k = 'moa_alert:' + kind;
    if (!(await client.set(k, '1', 'EX', 3600, 'NX'))) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MOA FORMULA <moaformula@jinromoa.co.kr>', to: [await adminEmail(client)], subject: '[취업스킬 알림] ' + subject, text: text + '\n\n원장 화면: ' + RESUME_APP_URL + '?master=1' })
    });
    return r.ok;
  } catch (e) { console.error('알림 실패:', e); return false; }
}
export async function getAdminEmail(client) { return adminEmail(client); }
export async function readLedger(client) {
  const all = await client.hgetall(LEDGER);
  const out = [], cut = Date.now() - LEDGER_KEEP;
  for (const [code, raw] of Object.entries(all)) {
    try { const r = JSON.parse(raw); if ((r.createdAt || 0) < cut) { await client.hdel(LEDGER, code); continue; } out.push(r); } catch (e) {}
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function kstYmd(ms) {
  const d = new Date((ms || Date.now()) + 9 * 3600 * 1000);
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}
async function getLimits(client) {
  try { const raw = await client.get(LIMITS); if (raw) return { ...DEFAULT_LIMITS, ...JSON.parse(raw) }; } catch (e) {}
  return { ...DEFAULT_LIMITS };
}
async function todayCounts(client) {
  const ymd = kstYmd(), out = {};
  for (const p of Object.keys(PRODUCTS)) out[p] = +(await client.get(DAILY(ymd, p))) || 0;
  return out;
}
export const REFUND_MSG = '환불 처리된 예약이에요. 궁금한 점은 jinromoa@naver.com 으로 문의해 주세요.';
export const HOLD_MSG = '예약 확인이 끝나면 제출할 수 있어요. 작성한 내용은 자동 저장되니 그대로 두시면 돼요. (보통 하루 안에 확인돼요)';
function partsOf(product) {
  return product === 'set' ? ['resume', 'interview'] : [product];
}
async function save(client, d) {
  const ttl = Math.max(3600, Math.ceil((d.expiresAt - Date.now()) / 1000) + KEEP_AFTER_END);
  await client.set(PREFIX + d.code, JSON.stringify(d), 'EX', ttl);
  await ledgerSync(client, d);
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
    items: d.items, maxItems: d.maxItems || d.items.length, interviewCats: d.interviewCats || [],
    job: d.job || '', company: d.company || '', presetId: d.presetId || '',
    name: d.name || '', hasEmail: !!d.email, expiresAt: d.expiresAt, t: CLIENT_T, hold: !!d.hold,
    used: Object.fromEntries(Object.entries(d.used || {}).map(([k, v]) => [k, v ? { at: v.at, reviewCode: v.reviewCode || '' } : null]))
  };
}

// 고객 입장 링크 — 자소서·세트 상품은 짧은 주소(go.jinromoa.co.kr)로 (2026-10-07)
export const RESUME_SHORT_URL = 'https://go.jinromoa.co.kr/';
function entryLink(d) {
  return (d.product === 'interview' ? INTERVIEW_APP_URL : RESUME_SHORT_URL) + '?c=' + d.code;
}
async function createClient(client, base, days) {
  for (let i = 0; i < 20; i++) {
    const code = genCode();
    const ok = await client.set(PREFIX + code, JSON.stringify({ code, ...base }), 'EX', days * 24 * 3600 + KEEP_AFTER_END, 'NX');
    if (ok) { await client.hset(INDEX, code, String(base.createdAt)); await ledgerSync(client, { code, ...base }); return { code, ...base }; }
  }
  return null;
}
// 지원 직무와 이름이 겹치는 자소서 프리셋 고르기 (원장님 jinromoa 프리셋 목록)
async function matchPreset(client, job) {
  try {
    const j = String(job || '').replace(/\s/g, '');
    if (!j) return '';
    const raw = await client.get('resume_app_config:' + CLIENT_T);
    const presets = raw ? (JSON.parse(raw).presets || []) : [];
    const hit = presets.find(p => { const n = String(p.name || '').replace(/\s|과$/g, ''); return p.id !== 'default' && n && (j.includes(n) || n.includes(j)); });
    return hit ? hit.id : '';
  } catch (e) { return ''; }
}
async function mailEntryLink(d) {
  try {
    if (!process.env.RESEND_API_KEY || !d.email) return false;
    const link = entryLink(d);
    const end = new Date(d.expiresAt - 1 + 9 * 3600 * 1000);
    const endText = `${end.getUTCFullYear()}년 ${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MOA FORMULA <moaformula@jinromoa.co.kr>',
        to: [d.email],
        subject: `[진로모아커리어센터] ${PRODUCTS[d.product]} 입장 링크를 보내드려요`,
        text: `${d.name || '고객'}님, 예약해 주셔서 감사합니다.\n\n아래 링크로 언제든 다시 들어와 이어서 작성할 수 있어요.\n${link}\n\n· 이용 기간: ${endText}까지\n${d.product === 'set' ? '· 세트 상품은 ① 자기소개서를 먼저 제출한 뒤, 같은 링크(코드)로 ② 모의면접을 이어서 진행해요.\n' : ''}· 작성 내용은 자동 저장돼요. 다 마치면 "최종 제출"을 눌러 주세요 (제출은 한 번만 가능해요).\n· 제출 후 강사가 직접 검토해 결과를 이 이메일로 보내드려요 (보통 2일 안).\n· 최종 제출 전에는 전액 환불, 제출 후에는 환불이 어려워요. 문의: jinromoa@naver.com\n\n진로모아커리어센터`
      })
    });
    if (!r.ok) console.error('입장 링크 메일 실패:', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('입장 링크 메일 실패:', e); return false; }
}
async function mailEntryLinkOrAlert(client, d) {
  const ok = await mailEntryLink(d);
  if (!ok && d.email) {
    await ledgerSync(client, d, { error: { at: Date.now(), where: '입장 메일', message: '입장 링크 메일 발송 실패' } });
    await alertAdmin(client, 'entrymail', '입장 링크 메일이 안 나갔어요', `고객 코드 ${d.code} (${d.name || ''} · 예약 ${d.bookingNo || '-'})에게 입장 링크 메일을 보내지 못했어요.\n고객 화면에는 링크가 바로 열려 있어 작성은 할 수 있어요. 원장 화면에서 링크 보내기로 다시 안내해 주세요.`);
  }
  return ok;
}
async function mailHoldReleased(d) {
  try {
    if (!process.env.RESEND_API_KEY || !d.email) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MOA FORMULA <moaformula@jinromoa.co.kr>',
        to: [d.email],
        subject: `[진로모아커리어센터] 예약 확인이 끝났어요 — 이제 제출할 수 있어요`,
        text: `${d.name || '고객'}님, 기다려 주셔서 감사합니다.\n\n예약 확인이 끝났어요. 아래 링크로 들어가 작성한 내용을 확인하고 "최종 제출"을 눌러 주세요.\n${entryLink(d)}\n\n진로모아커리어센터`
      })
    });
    return r.ok;
  } catch (e) { console.error('보류 해제 메일 실패:', e); return false; }
}
function cleanPrice(v) {
  const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
  return n >= 0 && n <= 10000000 ? n : 0;
}
function genShopKey() {
  return crypto.randomBytes(9).toString('base64url'); // 12자리
}
async function findShop(client, key) {
  const all = await client.hgetall(SHOPS);
  for (const raw of Object.values(all)) { try { const s = JSON.parse(raw); if (s.key === key) return s; } catch (e) {} }
  return null;
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
  if (d.refundedAt) return { error: REFUND_MSG, status: 410 };
  if (d.hold) return { error: HOLD_MSG, status: 423 };
  const ok = await client.set(USED(d.code, part), JSON.stringify({ at: Date.now(), reviewCode: reviewCode || '' }), 'NX');
  if (!ok) return { error: '이미 제출을 마친 코드예요. 제출 후에는 수정할 수 없어요.', status: 409 };
  try { await client.del(DRAFT(d.code, part)); } catch (e) {} // 제출했으니 임시 저장은 지움
  await client.expire(USED(d.code, part), Math.max(3600, Math.ceil((d.expiresAt - Date.now()) / 1000) + KEEP_AFTER_END));
  await ledgerSync(client, d, { submitted: { [part]: Date.now() } });
  return { data: d };
}
// 이미 제출했는지 확인 (세트 상품: 자소서를 먼저 내야 면접 제출 가능)
export async function isPartUsed(client, code, part) {
  return !!(await client.get(USED(normCode(code), part)));
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
      if (d.refundedAt) return res.status(410).json({ ok: false, error: REFUND_MSG });
      if (Date.now() > d.expiresAt) return res.status(410).json({ ok: false, expired: true, error: '이용 기간이 끝났어요. 진로모아로 문의해 주세요.' });
      const out = { ok: true, client: publicView(await withUsed(client, d)) };
      if (body.part === 'resume' || body.part === 'interview') {
        const raw = await client.get(DRAFT(d.code, body.part));
        if (raw) { try { out.draft = JSON.parse(raw); } catch (e) {} }
      }
      return res.status(200).json(out);
    }

    // ── 작성 중 자동 저장 (코드를 가진 고객) ──
    if (req.method === 'POST' && body.action === 'saveDraft') {
      const part = body.part === 'interview' ? 'interview' : body.part === 'resume' ? 'resume' : '';
      const d = await getClient(client, body.code);
      if (!d || !part) return res.status(404).json({ ok: false, error: '코드를 찾을 수 없어요.' });
      if (Date.now() > d.expiresAt) return res.status(410).json({ ok: false, error: '이용 기간이 끝났어요.' });
      if (d.refundedAt) return res.status(410).json({ ok: false, error: REFUND_MSG });
      if (await client.get(USED(d.code, part))) return res.status(409).json({ ok: false, error: '이미 제출을 마쳤어요.' });
      const json = JSON.stringify({ data: body.data || null, savedAt: Date.now() });
      if (json.length > DRAFT_MAX) return res.status(413).json({ ok: false, error: '내용이 너무 길어 저장하지 못했어요.' });
      const ttl = Math.max(3600, Math.ceil((d.expiresAt - Date.now()) / 1000) + 7 * 24 * 3600);
      await client.set(DRAFT(d.code, part), json, 'EX', ttl);
      return res.status(200).json({ ok: true, savedAt: Date.now() });
    }

    // ── 고객 화면 오류 알림 (코드를 가진 고객) ──
    if (req.method === 'POST' && body.action === 'reportError') {
      const d = await getClient(client, body.code);
      if (!d) return res.status(404).json({ ok: false });
      const where = clean(body.where, 30) || '고객 화면', message = clean(body.message, 300);
      await ledgerSync(client, d, { error: { at: Date.now(), where, message } });
      await alertAdmin(client, 'client:' + d.code, `${d.name || d.code} 고객 ${where} 오류`, `고객 코드 ${d.code} (${PRODUCTS[d.product]} · 예약 ${d.bookingNo || '-'})\n위치: ${where}\n내용: ${message || '(없음)'}\n\n고객이 다시 시도하면 해결될 수 있어요. 계속되면 "시스템 오류 시 전액 환불" 대상인지 확인해 주세요.`);
      return res.status(200).json({ ok: true });
    }

    // ── 네이버 예약 자동 입장 (누구나) ──
    // 주소만 입력하고 들어온 고객에게 상품을 고르게 함 (링크 키는 네이버 안내 문구에 이미 공개된 값)
    if (req.method === 'POST' && body.action === 'shopList') {
      const all = await client.hgetall(SHOPS);
      const items = Object.values(all).map(r => { try { return JSON.parse(r); } catch (e) { return null; } })
        .filter(s => s && s.active).sort((a, b) => a.createdAt - b.createdAt)
        .map(s => ({ key: s.key, label: s.label, product: s.product, productName: PRODUCTS[s.product], days: s.days || DEFAULT_DAYS[s.product] || 7 }));
      return res.status(200).json({ ok: true, items });
    }
    if (req.method === 'POST' && (body.action === 'shopInfo' || body.action === 'shopJoin')) {
      const shop = await findShop(client, String(body.key || '').slice(0, 40));
      if (!shop || !shop.active) return res.status(404).json({ ok: false, error: '사용할 수 없는 링크예요. 진로모아로 문의해 주세요.' });
      const info = { label: shop.label, product: shop.product, productName: PRODUCTS[shop.product], days: shop.days, maxItems: shop.maxItems || RESUME_ITEMS.length };
      if (body.action === 'shopInfo') return res.status(200).json({ ok: true, shop: info });

      const ipKey = 'moa_shopjoin:' + ipOf(req);
      const n = await client.incr(ipKey); if (n === 1) await client.expire(ipKey, 3600);
      if (n > 10) return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
      const name = clean(body.name, 30), email = clean(body.email, 120).toLowerCase();
      const bookingNo = String(body.bookingNo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
      if (!name) return res.status(400).json({ ok: false, error: '이름을 입력해 주세요.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: '이메일 주소를 다시 확인해 주세요.' });
      if (bookingNo.replace(/-/g, '').length < 4) return res.status(400).json({ ok: false, error: '네이버 예약번호를 정확히 입력해 주세요.' });
      if (!body.agreeRefund) return res.status(400).json({ ok: false, error: '취소·환불 규정을 확인하고 동의해 주세요.' });

      // 같은 예약번호로 이미 받은 코드가 있으면 새로 만들지 않고 그 링크를 다시 메일로 보내줌
      const existing = await client.hget(BOOKINGS, bookingNo);
      if (existing) {
        const d0 = await getClient(client, existing);
        if (d0) {
          if (d0.email === email) { await mailEntryLinkOrAlert(client, d0); return res.status(200).json({ ok: true, again: true, code: d0.code, link: entryLink(d0) }); }
          return res.status(409).json({ ok: false, error: '이미 등록된 예약번호예요. 처음 등록한 이메일의 안내 메일을 확인하시거나 진로모아로 문의해 주세요.' });
        }
      }
      const days = shop.days || DEFAULT_DAYS[shop.product] || 7;
      const now = Date.now();
      // 하루 등록 상한 (네이버 하루 예약 수와 같게) — 넘으면 등록은 받되 제출은 원장님 확인 후
      const dayKey = DAILY(kstYmd(now), shop.product);
      const nToday = await client.incr(dayKey); if (nToday === 1) await client.expire(dayKey, 3 * 24 * 3600);
      const limit = (await getLimits(client))[shop.product];
      const job = clean(body.job, 60);
      const base = {
        product: shop.product, items: RESUME_ITEMS.slice(), maxItems: shop.maxItems || RESUME_ITEMS.length, interviewCats: [],
        memo: `예약 ${bookingNo}`, name, bookingNo, shopId: shop.id, shopLabel: shop.label, auto: true, price: shop.price || 0,
        job, company: clean(body.company, 40), presetId: await matchPreset(client, job), email,
        source: SOURCES.includes(body.source) ? body.source : '',
        referrer: body.source === '지인 소개' ? clean(body.referrer, 30) : '', // 친구 추천: 소개해 준 분 이름 (2026-10-10)
        createdAt: now, expiresAt: now + days * 24 * 3600 * 1000, refundAgreedAt: now,
        ...(limit > 0 && nToday > limit ? { hold: { reason: `하루 상한 초과 (오늘 ${nToday}번째 · 상한 ${limit})`, at: now } } : {})
      };
      const d = await createClient(client, base, days);
      if (!d) return res.status(503).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
      const okB = await client.hsetnx(BOOKINGS, bookingNo, d.code);
      if (!okB) { await client.del(PREFIX + d.code); await client.hdel(INDEX, d.code); await client.hdel(LEDGER, d.code); return res.status(409).json({ ok: false, error: '이미 등록된 예약번호예요.' }); }
      const mailed = await mailEntryLinkOrAlert(client, d);
      return res.status(200).json({ ok: true, code: d.code, link: entryLink(d), mailed, hold: !!d.hold });
    }

    // ── 여기부터 원장님만 ──
    const pw = req.method === 'GET' ? req.query.master : body.master;
    if (!process.env.MASTER_ADMIN_PASSWORD) return res.status(500).json({ ok: false, error: '서버에 관리자 비밀번호가 설정되지 않았어요.' });
    if (!checkAdmin(pw)) return res.status(401).json({ ok: false, error: '관리자 비밀번호가 맞지 않아요.' });

    if (req.method === 'GET' && req.query.ledger) {
      return res.status(200).json({ ok: true, items: await readLedger(client) });
    }
    if (req.method === 'GET' && req.query.limits) {
      return res.status(200).json({ ok: true, limits: await getLimits(client), today: await todayCounts(client) });
    }
    if (req.method === 'POST' && body.action === 'setLimits') {
      const lim = {};
      for (const p of Object.keys(PRODUCTS)) {
        const n = parseInt((body.limits || {})[p], 10);
        lim[p] = n >= 0 && n <= 999 ? n : DEFAULT_LIMITS[p]; // 0 = 상한 없음
      }
      await client.set(LIMITS, JSON.stringify(lim));
      return res.status(200).json({ ok: true, limits: lim, today: await todayCounts(client) });
    }

    if (req.method === 'GET' && req.query.shops) {
      const all = await client.hgetall(SHOPS);
      const items = Object.values(all).map(r => { try { return JSON.parse(r); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
      return res.status(200).json({ ok: true, items });
    }
    if (req.method === 'POST' && body.action === 'shopCreate') {
      const product = PRODUCTS[body.product] ? body.product : 'set';
      const days = daysOf(body.days, product);
      let maxItems = parseInt(body.maxItems, 10); if (!(maxItems >= 1 && maxItems <= RESUME_ITEMS.length)) maxItems = RESUME_ITEMS.length;
      const id = 'shop_' + Date.now().toString(36);
      const shop = { id, key: genShopKey(), label: clean(body.label, 30) || PRODUCTS[product], product, days, maxItems, price: cleanPrice(body.price), active: true, createdAt: Date.now() };
      await client.hset(SHOPS, id, JSON.stringify(shop));
      return res.status(200).json({ ok: true, item: shop });
    }
    if (req.method === 'POST' && ['shopRotate', 'shopToggle', 'shopDelete', 'shopPrice', 'shopDays'].includes(body.action)) {
      const raw = await client.hget(SHOPS, String(body.id || ''));
      if (!raw) return res.status(404).json({ ok: false, error: '링크를 찾을 수 없어요.' });
      const shop = JSON.parse(raw);
      if (body.action === 'shopDelete') { await client.hdel(SHOPS, shop.id); return res.status(200).json({ ok: true }); }
      if (body.action === 'shopRotate') shop.key = genShopKey();   // 옛 링크는 바로 막힘 (이미 받은 고객 코드는 그대로)
      if (body.action === 'shopToggle') shop.active = !shop.active;
      if (body.action === 'shopPrice') shop.price = cleanPrice(body.price); // 앞으로 등록하는 고객부터 적용
      if (body.action === 'shopDays') shop.days = daysOf(body.days, shop.product); // 링크 주소는 그대로, 앞으로 등록하는 고객부터 적용
      await client.hset(SHOPS, shop.id, JSON.stringify(shop));
      return res.status(200).json({ ok: true, item: shop });
    }

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
      const days = daysOf(body.days, product);
      let items = Array.isArray(body.items) ? body.items.filter(x => RESUME_ITEMS.includes(x)) : [];
      if (!items.length) items = RESUME_ITEMS.slice();
      const interviewCats = Array.isArray(body.interviewCats) ? body.interviewCats.map(x => clean(x, 40)).filter(Boolean).slice(0, 12) : [];
      const now = Date.now();
      const base = {
        product, items, interviewCats,
        memo: clean(body.memo, 40), job: clean(body.job, 60), company: clean(body.company, 40),
        presetId: clean(body.presetId, 60), email: clean(body.email, 120), price: cleanPrice(body.price),
        createdAt: now, expiresAt: now + days * 24 * 3600 * 1000
      };
      const made = await createClient(client, base, days);
      if (made) return res.status(200).json({ ok: true, item: await withUsed(client, made) });
      return res.status(503).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
    }

    const d = await getClient(client, body.code);
    if (!d) return res.status(404).json({ ok: false, error: '코드를 찾을 수 없어요.' });

    // 입장 링크 메일 다시 보내기 — 원장님 화면에서 버튼 하나로 (카톡에서 고객을 찾지 않아도 되게, 2026-10-08)
    if (req.method === 'POST' && body.action === 'resendMail') {
      if (!d.email) return res.status(400).json({ ok: false, error: '이 고객은 이메일이 없어요. 안내문을 복사해서 톡톡·문자로 보내 주세요.' });
      const ok = await mailEntryLink(d);
      if (!ok) return res.status(502).json({ ok: false, error: '메일을 보내지 못했어요. 잠시 후 다시 눌러 주세요.' });
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    if (req.method === 'POST' && body.action === 'extend') {
      let days = parseInt(body.days, 10);
      if (!(days >= 1 && days <= 180)) days = 7;
      d.expiresAt = Math.max(d.expiresAt, Date.now()) + days * 24 * 3600 * 1000;
      await save(client, d);
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    // 정산용: 판매 금액 바꾸기 / 환불 표시 (2026-10-02)
    if (req.method === 'POST' && body.action === 'setPrice') {
      d.price = cleanPrice(body.price);
      await save(client, d);
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }
    if (req.method === 'POST' && body.action === 'refund') {
      if (body.refunded) {
        d.refundedAt = Date.now();
        d.refundAmount = body.amount == null || body.amount === '' ? (d.price || 0) : cleanPrice(body.amount);
        await client.del(DRAFT(d.code, 'resume'), DRAFT(d.code, 'interview')); // 규정: 자동 저장 내용은 환불과 함께 삭제
      } else {
        d.refundedAt = null; d.refundAmount = null;
      }
      await save(client, d);
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    // 예약번호 대조: hold:false = 확인 완료(보류 풀기) / hold:true = 보류로 표시
    if (req.method === 'POST' && body.action === 'setHold') {
      let mailed = false;
      if (body.hold) {
        d.hold = { reason: '원장님이 보류로 표시', at: Date.now() };
      } else {
        const wasHeld = !!d.hold;
        d.hold = null;
        d.checkedAt = Date.now();
        if (wasHeld) mailed = await mailHoldReleased(d);
      }
      await save(client, d);
      return res.status(200).json({ ok: true, mailed, item: await withUsed(client, d) });
    }

    if (req.method === 'POST' && body.action === 'reopen') {
      const part = body.part === 'interview' ? 'interview' : 'resume';
      await client.del(USED(d.code, part));
      return res.status(200).json({ ok: true, item: await withUsed(client, d) });
    }

    if (req.method === 'POST' && body.action === 'delete') {
      await client.del(PREFIX + d.code, USED(d.code, 'resume'), USED(d.code, 'interview'), DRAFT(d.code, 'resume'), DRAFT(d.code, 'interview'));
      await client.hdel(INDEX, d.code);
      if (d.bookingNo) await client.hdel(BOOKINGS, d.bookingNo);
      await ledgerSync(client, d, { deletedAt: Date.now() }); // 코드는 지워도 정산 기록은 5년 보관
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
  }
}
