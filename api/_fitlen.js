// 글자 수 맞추기 (2026-10-05) — AI는 한글 글자 수를 정확히 세지 못해서, 서버가 직접 세고 모자라거나 넘치면 다시 고쳐 쓰게 함
// 기준: {{ }} · ⟪ ⟫ 기호를 뺀 공백 포함 글자 수가 제한의 80% 이상 ~ 100% 이하 (목표 80~90%)
// 파일 이름이 _ 로 시작하므로 Vercel이 주소(API)로 만들지 않음. 자소서·모의면접 두 앱에 같은 파일.

export function plainLen(t) {
  return String(t || '').replace(/\{\{|\}\}|[⟪⟫]/g, '').length;
}

function parseJson(raw) {
  let s = String(raw || '').replace(/```json|```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) {}
  try { return JSON.parse(s.replace(/\n/g, '\\n')); } catch (e) {}
  return null;
}

// text: 지금 글, limit: 글자수 제한, opts.kind: 'essay'(자소서) | 'speech'(면접 답변), opts.slots: true면 exampleSlots도 다시 받음
export async function fitLength(text, limit, opts = {}) {
  const L = parseInt(limit, 10);
  if (!L || L < 100 || !text) return null;
  const lo = Math.ceil(L * 0.8), hi = Math.floor(L * 0.9);
  const ok = (n) => n >= lo && n <= L;
  let cur = String(text), best = null;
  if (ok(plainLen(cur))) return null; // 이미 맞음
  for (let round = 1; round <= 2; round++) {
    const n = plainLen(cur);
    const longer = n < lo;
    const goal = Math.round((lo + hi) / 2);
    const kindText = opts.kind === 'speech' ? '면접 답변(말로 하는 1인칭 답변)' : '자기소개서 본문(1인칭)';
    const system = `당신은 ${kindText}의 분량을 맞추는 편집자입니다.
지금 글은 기호를 뺀 공백 포함 ${n}자입니다. 목표는 ${lo}~${hi}자(약 ${goal}자)이며 ${L}자를 절대 넘으면 안 됩니다. ${longer ? `약 ${goal - n}자를 더 늘립니다.` : `약 ${n - goal}자를 줄입니다.`}
규칙:
- {{ }} 안은 AI 예시, ⟪ ⟫는 쓰지 않습니다. 기존 {{ }} 구절은 기호와 함께 그대로 둡니다(조사만 바꿀 수 있음).
- ${longer ? '늘릴 때는 이미 있는 경험의 장면·행동·결과·느낀 점(성찰)·직무 연결 문장을 더 구체적으로 펼칩니다. 글에 없는 새 사실(경험·숫자·이름·인용)이 필요하면 반드시 {{ }} 안에 짧게 넣습니다. 같은 말 반복, 상투어("귀사에 기여", "시너지", "역량을 함양" 등)로 채우지 않습니다.' : '줄일 때는 반복·수식어·덜 중요한 문장부터 줄이고, {{ }} 예시와 학생의 사실(숫자·이름)은 살립니다.'}
- 문단 구분(빈 줄)은 유지합니다. 담백한 문체를 유지합니다.
[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다. 아래 JSON 하나만 출력한다.
{"text": "고친 본문"${opts.slots ? ', "exampleSlots": [{"example": "본문 {{ }} 안 글과 똑같이", "hint": "학생이 넣을 것 15자 이내", "options": ["다른 흔한 표현 1", "2", "3"]}]' : ''}}${opts.slots ? '\nexampleSlots는 고친 본문에 {{ }}가 나오는 순서대로 하나씩 만든다. {{ }}가 없으면 빈 배열.' : ''}`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: Math.min(8000, 1500 + Math.round(L * 2)), system, messages: [{ role: 'user', content: cur }] })
      });
      if (!r.ok) { console.error('글자 수 맞추기 AI 오류', r.status); break; }
      const data = await r.json();
      const p = parseJson((data.content || []).map((c) => c.text || '').join(''));
      if (!p || !p.text) continue;
      const t = String(p.text).replace(/[⟪⟫]/g, '').trim();
      const m = plainLen(t);
      const cand = { text: t, exampleSlots: p.exampleSlots, len: m };
      // 제한을 넘지 않는 것 중 목표에 가장 가까운 것을 보관
      if (m <= L && (!best || Math.abs(m - goal) < Math.abs(best.len - goal))) best = cand;
      if (ok(m)) return cand;
      cur = t;
    } catch (e) { console.error('글자 수 맞추기 실패', e); break; }
  }
  // 원래 글보다 나아졌을 때만 바꿈
  const n0 = plainLen(text);
  if (best && (n0 > L || Math.abs(best.len - (lo + hi) / 2) < Math.abs(n0 - (lo + hi) / 2))) return best;
  return null;
}
