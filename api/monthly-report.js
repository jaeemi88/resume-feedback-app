// 매달 1일 아침 정산 메일 (2026-10-02 · 수익화 랩 인계 "매달 1일 정산 메일")
// ─────────────────────────────────────────────
// Vercel 예약 실행(vercel.json crons)이 매달 1일 오전 9시쯤(한국 시간) 호출해요.
// 5년 정산 장부(moa_client_ledger)를 읽어 원장님 메일로 보내요 — 엑셀에서 바로 열리는 CSV 2개 첨부.
//   ① 정산장부_전체.csv  ② 월별요약.csv   (+ 본문에 지난달 요약)
// 원장님이 직접 받아보고 싶으면: /api/monthly-report?master=비밀번호  (그 자리에서 한 번 발송)
// ※ 작성 내용·결과물은 장부에 없어요(개인정보처리방침 30일 삭제 그대로).
import Redis from 'ioredis';
import { readLedger, getAdminEmail, alertAdmin } from './client-code.js';

let redis;
function getRedis() { if (!redis) redis = new Redis(process.env.REDIS_URL); return redis; }

const PRODUCTS = { resume: '자소서 첨삭', interview: '모의면접', set: '세트(자소서→면접)' };
const kst = ms => ms ? new Date(ms + 9 * 3600 * 1000) : null;
const ymd = ms => { const d = kst(ms); return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : ''; };
const ymdhm = ms => { const d = kst(ms); return d ? ymd(ms) + ` ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''; };
const ym = ms => ymd(ms).slice(0, 7);
const esc = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csv = rows => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n'); // BOM → 엑셀 한글 깨짐 방지
const b64 = t => Buffer.from(t, 'utf8').toString('base64');

function netOf(r) {
  if (r.deletedAt && !r.refundedAt) return { price: 0, rf: 0, net: 0 }; // 삭제한 코드(가짜 등록 등)는 매출에서 제외
  const price = r.price || 0;
  const rf = r.refundedAt ? Math.min(price, r.refundAmount != null ? r.refundAmount : price) : 0;
  return { price, rf, net: price - rf };
}

export function buildReport(rows, now) {
  const head = ['등록일시', '경로', '알게 된 경로', '소개한 분', '이름', '이메일', '네이버 예약번호', '상품', '판매 금액', '환불 금액', '환불일', '실매출', '환불 규정 동의', '자소서 제출', '면접 제출', '예약번호 대조', '오류 기록', '코드 삭제', '고객 코드'];
  const ledger = [head, ...rows.map(r => {
    const { price, rf, net } = netOf(r);
    const sub = r.submitted || {};
    return [ymdhm(r.createdAt), r.auto ? '네이버 자동' : '직접 발급', r.source || '', r.referrer || '', r.name, r.email, r.bookingNo, PRODUCTS[r.product] || r.product,
      price, r.refundedAt ? rf : '', ymd(r.refundedAt), net, ymdhm(r.refundAgreedAt),
      sub.resume ? ymdhm(sub.resume) : '', sub.interview ? ymdhm(sub.interview) : '',
      r.checkedAt ? '확인 완료 ' + ymd(r.checkedAt) : (r.holdReason ? '대조 필요' : ''),
      (r.errors || []).map(e => ymd(e.at) + ' ' + e.where).join(' / '), ymd(r.deletedAt), r.code];
  })];
  const sum = {};
  rows.forEach(r => {
    const k = ym(r.createdAt) + '|' + (PRODUCTS[r.product] || r.product);
    const s = sum[k] = sum[k] || { m: ym(r.createdAt), p: PRODUCTS[r.product] || r.product, n: 0, gross: 0, rn: 0, rf: 0, net: 0, del: 0 };
    if (r.deletedAt && !r.refundedAt) { s.del++; return; }
    const { price, rf, net } = netOf(r);
    s.n++; s.gross += price; s.net += net; if (r.refundedAt) { s.rn++; s.rf += rf; }
  });
  const srows = Object.values(sum).sort((a, b) => (b.m + b.p).localeCompare(a.m + a.p));
  const summary = [['월', '상품', '등록 건수', '판매 금액 합계', '환불 건수', '환불 금액', '실매출(네이버 수수료 전)', '코드 삭제(매출 제외)'], ...srows.map(s => [s.m, s.p, s.n, s.gross, s.rn, s.rf, s.net, s.del])];
  // 지난달
  const t = kst(now); const lm = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
  const lastYm = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, '0')}`;
  const last = srows.filter(s => s.m === lastYm);
  const tot = last.reduce((a, s) => ({ n: a.n + s.n, rn: a.rn + s.rn, rf: a.rf + s.rf, net: a.net + s.net }), { n: 0, rn: 0, rf: 0, net: 0 });
  const holds = rows.filter(r => r.holdReason && !r.checkedAt && !r.refundedAt && !r.deletedAt).length;
  const errs = rows.filter(r => (r.errors || []).some(e => ym(e.at) === lastYm)).length;
  // 지난달 '알게 된 경로'별 등록 수 (2026-10-10, 홍보 채널 효과 보기 — 삭제한 코드는 빼고)
  const bySource = {};
  rows.filter(r => ym(r.createdAt) === lastYm && !(r.deletedAt && !r.refundedAt) && r.auto)
    .forEach(r => { const k = r.source || '응답 없음'; bySource[k] = (bySource[k] || 0) + 1; });
  // 지난달 친구 소개 (2026-10-10): 소개한 분께 AI 모의면접 1회를 보내 드려야 하는 목록
  const referrals = rows.filter(r => ym(r.createdAt) === lastYm && r.referrer && !(r.deletedAt && !r.refundedAt) && !r.refundedAt)
    .map(r => `${r.referrer} ← ${r.name} (${ymd(r.createdAt)})`);
  return { ledger: csv(ledger), summary: csv(summary), lastYm, tot, last, holds, errs, bySource, referrals };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const fromCron = secret ? auth === 'Bearer ' + secret : /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  const byMaster = !!process.env.MASTER_ADMIN_PASSWORD && String(req.query.master || '') === process.env.MASTER_ADMIN_PASSWORD;
  if (!fromCron && !byMaster) return res.status(401).json({ ok: false, error: '권한이 없어요.' });
  const client = getRedis();
  try {
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ ok: false, error: '메일 설정(RESEND_API_KEY)이 없어요.' });
    const rows = await readLedger(client);
    const now = Date.now();
    const r = buildReport(rows, now);
    const won = n => (n || 0).toLocaleString('ko-KR') + '원';
    const text = `원장님, ${r.lastYm} 개인 고객 정산 요약이에요.\n\n` +
      `· 등록 ${r.tot.n}건 / 환불 ${r.tot.rn}건(${won(r.tot.rf)})\n· 실매출 ${won(r.tot.net)} (네이버 수수료 전)\n` +
      (r.last.length ? r.last.map(s => `   - ${s.p}: ${s.n}건, 실매출 ${won(s.net)}`).join('\n') + '\n' : '') +
      (r.referrals.length ? `\n· 친구 소개 ${r.referrals.length}건 — 소개한 분께 AI 모의면접 1회를 보내 주세요\n` + r.referrals.map(x => `   - ${x}`).join('\n') + '\n' : '') +
      (Object.keys(r.bySource).length ? `\n· 알게 된 경로 (네이버 예약 등록 기준)\n` + Object.entries(r.bySource).sort((a, b) => b[1] - a[1]).map(([k, n]) => `   - ${k}: ${n}건`).join('\n') + '\n' : '') +
      `\n· 예약번호 대조 대기: ${r.holds}건\n· 지난달 오류 기록 고객: ${r.errs}건\n\n` +
      `첨부 ① 정산장부_전체(5년 보관분) ② 월별요약 — 엑셀에서 바로 열려요.\n네이버 정산 내역과 실매출을 맞춰 보시고, 이 메일은 그대로 보관해 주세요.`;
    const tag = r.lastYm.replace('-', '');
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MOA FORMULA <moaformula@jinromoa.co.kr>', to: [await getAdminEmail(client)],
        subject: `[취업스킬] ${r.lastYm} 개인 고객 정산 (실매출 ${won(r.tot.net)})`, text,
        attachments: [{ filename: `진로모아_정산장부_${tag}.csv`, content: b64(r.ledger) }, { filename: `진로모아_월별요약_${tag}.csv`, content: b64(r.summary) }]
      })
    });
    if (!send.ok) {
      const msg = await send.text();
      console.error('정산 메일 실패:', send.status, msg);
      await alertAdmin(client, 'monthly', '매달 정산 메일 발송 실패', `${r.lastYm} 정산 메일을 보내지 못했어요 (${send.status}). 원장 화면의 📥 엑셀로 받기로 대신 받아 주세요.`);
      return res.status(502).json({ ok: false, error: '메일을 보내지 못했어요.' });
    }
    return res.status(200).json({ ok: true, month: r.lastYm, rows: rows.length });
  } catch (e) {
    console.error(e);
    await alertAdmin(client, 'monthly', '매달 정산 메일 오류', '정산 메일을 만드는 중 오류가 났어요. 원장 화면의 📥 엑셀로 받기로 대신 받아 주세요.');
    return res.status(500).json({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
  }
}
