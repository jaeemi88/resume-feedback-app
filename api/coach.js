// api/coach.js  ← 자소서·이력서 첨삭 앱 전용 (2026-09-26 추가)
// "재료 꺼내기 가이드": 학생이 4칸 뼈대에 적은 메모만으로 자소서 초안 3가지를 만들어 주는 서버 함수
// - 학생 메모에 없는 경험·수치·고유명사는 절대 만들지 않고 [대괄호 빈칸]으로 남김
// - 일반 채용: 메모 속 고유명사를 살림 / 블라인드 채용: 학교·지역·가족이 드러나는 이름은 일반 표현으로 바꿈
// - 학생 화면에서 버튼을 누를 때만 호출됨 (AI 비용 보호를 위해 입력 길이 제한)
// - mode 'defend' (2026-09-26 2단계): "내 문장 방어 테스트" — 학생이 말로 답한 내용이 자소서와 맞는지 한 줄 판정

export const config = { maxDuration: 300 }; // 긴 문항 초안 3개도 끊기지 않게 (2026-10-02)

const OPENER_GUIDE = `- 장면 묘사형: 그때의 한 장면을 사실 위주로 1~2문장만 쓰고 바로 행동으로 넘어감, 감정 과장 없이 (예: 마감 5일 전, 단체 대화방에는 아무도 답이 없었습니다.)
- 결론 먼저형: 나를 한 문장으로 정의하며 시작 (예: 저는 팀이 멈췄을 때 역할표부터 만드는 사람입니다.)
- 숫자 제시형: 메모 속 숫자로 시작 (예: 4명, 5일, 역할 분담 0개에서 시작한 과제였습니다.)
- 질문형: 스스로 던진 질문으로 시작
- 가치관 한 문장형: 내가 지키는 원칙 한 문장으로 시작`;

const TONE_RULES = `
[담백하게 — 신파 금지 (2026-10-04)]
- 요즘 채용 담당자는 고생담·감동 코드에 점수를 주지 않는다. 감정을 꾸미지 말고 행동과 결과로 보여 준다.
- 장면 묘사는 도입의 첫 1~2문장까지만 쓴다. 그 뒤로는 장면을 이어 가지 말고 무엇을 했고 어떤 결과가 났는지로 넘어간다.
- 쓰지 않는 표현: 가난·고생·눈물·희생을 강조하는 서사, "처음으로 실감했습니다", "가슴이 뭉클", "묵직해졌습니다", "그때의 마음이 지금도", "새벽이 생각났고"처럼 감각·감정을 과장하는 묘사, "나는 성공한다" 같은 비장한 자기 주문.
- 절약·인내·성실 같은 덕목은 '참고 아끼는 사람'이 아니라 '계획하고 관리하고 실행하는 사람'으로 연결한다. (예: 근검절약 → 지출 기록·예산 관리·목표 저축 달성)
- 결론은 다짐("~한 사람이 되겠습니다")만으로 끝내지 않는다. 같은 습관이 다른 경험(동아리 회계, 실습, 아르바이트 등)에서도 드러난 사례 한 줄과 직무 연결로 마무리한다.
- 구어체 한마디를 넣을 때도 짧은 다짐·원칙 한 줄처럼 담백하게 쓴다.`;

function sanitizeJsonString(raw) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { result += ch; escaped = false; }
      else if (ch === '\\') { result += ch; escaped = true; }
      else if (ch === '"') { result += ch; inString = false; }
      else if (ch === '\n') result += '\\n';
      else if (ch === '\r') result += '\\r';
      else if (ch === '\t') result += '\\t';
      else result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

function parseAIJson(raw) {
  let text = String(raw || '').replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try { return JSON.parse(text); } catch (e) {}
  try { return JSON.parse(sanitizeJsonString(text)); } catch (e) {}
  return null;
}

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);


// AI 오류를 쉬운 말로 바꿔 줌 (2026-10-05) — 원인을 화면에서 바로 알 수 있게 (비밀값은 보내지 않음)
function aiErrorText(status, data) {
  const t = (data && data.error && (data.error.type || '')) || '';
  const m = String((data && data.error && data.error.message) || '');
  if (/credit balance|billing|purchase credits/i.test(m)) return `AI 사용 크레딧이 부족해요. 원장님이 Anthropic 콘솔(Plans & Billing)에서 충전해 주세요. (${status})`;
  if (status === 401 || t === 'authentication_error') return `AI 열쇠(ANTHROPIC_API_KEY)가 맞지 않아요. Vercel 환경변수를 확인해 주세요. (${status})`;
  if (status === 429 || t === 'rate_limit_error') return `AI 사용량 한도에 잠시 걸렸어요. 1분 뒤 다시 눌러 주세요. (${status})`;
  if (status === 529 || t === 'overloaded_error' || status >= 500) return `AI 서버가 잠시 붐벼요. 잠시 뒤 다시 눌러 주세요. (${status})`;
  if (t === 'not_found_error' || /model/i.test(m)) return `AI 모델 설정에 문제가 있어요: ${m.slice(0, 120)} (${status})`;
  return `AI 호출 중 오류가 발생했습니다. (${status} ${t} ${m.slice(0, 120)})`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const body = req.body || {};
  if (body.mode === 'defend') return defend(body, res);
  if (body.mode === 'finish') return finish(body, res);
  if (body.mode !== 'draft') {
    return res.status(400).json({ error: '지원하지 않는 요청입니다.' });
  }

  const questionType = clip(body.questionType, 20) || '미지정';
  const question = clip(body.question, 500);
  const hiringType = body.hiringType === 'blind' ? 'blind' : 'general';
  const charLimit = parseInt(body.charLimit, 10) || null;
  const memo = (Array.isArray(body.memo) ? body.memo : [])
    .slice(0, 6)
    .map((m) => ({ label: clip(m && m.label, 20), value: clip(m && m.value, 150) }))
    .filter((m) => m.value);

  if (memo.length < 2) {
    return res.status(400).json({ error: '메모를 2칸 이상 채워주세요.' });
  }

  const hiringRule = hiringType === 'blind'
    ? `[채용 방식: 블라인드 채용]
- 학교명, 출신 지역이 드러나는 지명·지점명, 가족 관계·부모 직업은 쓰지 않는다. 메모에 있으면 일반 표현으로 바꾼다. (예: ○○대학교 물리치료학과 → 재학 중인 학과, ○○대학병원 실습 → 상급종합병원 임상실습, ○○카페 ○○점 → ○○카페)
- 과목명·프로젝트명·활동명·자격증명처럼 학교가 드러나지 않는 고유명사는 그대로 살린다.`
    : `[채용 방식: 일반 채용]
- 메모에 있는 고유명사(과목명·프로젝트명·기관명·매장명·부서명·회사 사업명)는 한 글자도 바꾸지 말고 반드시 초안에 넣는다. 고유명사는 신뢰도를 높인다.
- 메모에 고유명사가 없으면 [여기에 프로젝트 이름]처럼 빈칸으로 남겨, 학생이 실제 이름을 채우게 한다.`;

  const systemPrompt = `당신은 15년 경력의 취업 코치입니다. 학생이 자기소개서 문항에 대해 적은 짧은 메모를 이어서, 학생 본인의 초안을 만들어 줍니다.

[절대 원칙]
- 학생 메모에 없는 경험·수치·사람·감정·고유명사를 절대 지어내지 않는다. 문장을 잇기 위해 꼭 필요한 정보가 없으면 [여기에 팀원 반응 한 줄]처럼 대괄호 빈칸으로 남긴다.
- 학생이 쓴 단어를 최대한 그대로 쓴다. 화려한 수식어, "최고의", "누구보다", "완벽하게", "최선을 다하겠습니다" 같은 표현은 쓰지 않는다.
- 남 탓·동료 비하로 읽힐 표현은 상황 설명으로 순화한다.
- 대학생이 직접 쓴 것처럼 담백한 존댓말(~습니다)로 쓴다. AI가 쓴 듯한 매끈한 연결어(나아가, 이를 통해, 뿐만 아니라)를 반복하지 않는다.
- 초안 3개는 도입 방식만 다르게 하고, 내용(사실)은 모두 같게 한다.

${hiringRule}
${TONE_RULES}

[스토리텔링 — 생생한 경험담 만들기]
- 목적: 했던 일을 나열하는 글이 아니라, 읽는 사람이 지원자의 행동을 머릿속에 그리며 따라가게 되는 경험담으로 만든다. 소설처럼 꾸미지는 않는다.
- 이야기에 전환점(계기, 막힌 순간, 결심, 인정받은 순간)이 있고 그 자리에 누군가의 말이나 스스로의 다짐이 자연스럽게 어울릴 때만, 짧은 구어체 한마디를 「 」로 넣는다. 기계적으로 모든 답변에 넣지 않는다. 어울리지 않거나 전환점이 없으면 넣지 않는 것이 맞다.
- 넣더라도 한 문항에 최대 2개, 한 마디는 한 줄 이내로 짧게 쓴다.
- 학생이 실제로 들었거나 한 말이 원문·메모에 있으면 그 표현을 그대로 살린다.
- 원문·메모에 그런 말이 없는데 어울리는 자리가 있으면, 말을 지어내지 말고 「[그때 들은 말 한마디]」, 「[스스로 한 다짐]」처럼 대괄호 빈칸으로만 남긴다. 누가 한 말인지(선생님, 팀원, 손님 등)는 원문에 나온 인물로만 쓴다.
- 학생이 「한마디」 칸을 채웠으면 그 말을 그대로 「 」 안에 넣고, 이야기 흐름에서 가장 자연스러운 자리(계기·전환점·다짐)에 둔다. 3개 초안에서 위치는 달라도 된다.

[문항 유형] ${questionType}${questionType === '성격장단점' ? `
[성격 장단점 작성 규칙]
- 장점이 전체 분량의 70% 이상, 단점(보완 노력과 마무리 교훈 문장 포함, 단점이 시작되는 문장부터 끝까지)은 30% 이하로 쓴다. 초안마다 장점은 최소 4문장, 단점(보완 노력 포함)은 최대 2문장으로 쓴다. 단점은 문항에 있어서 쓰는 것일 뿐 강조하지 않는다.
- 단점은 "다소", "조금", "때때로", "~한 편입니다", "~할 때가 있었습니다"처럼 정도가 크지 않게 느껴지는 완곡한 표현으로 쓴다. "매우", "항상" 같은 강한 표현은 쓰지 않는다.
- 단점은 지금 하고 있는 보완 노력 한두 문장으로 짧게 마무리한다.` : ''}
[문항 우선] 고른 문항 유형과 [문항] 내용이 다르면 [문항]이 묻는 것을 기준으로 쓴다.${questionType === '에세이' ? `
[에세이(자유 문항) 작성 규칙]
- 먼저 [문항]이 묻는 것을 파악하고 그 질문에 정면으로 답한다.
- 첫 문단에 핵심 메시지(나의 답)를 한 문장으로 드러내고, 장면 1~2개를 깊게 쓴 뒤 느낀 점·바뀐 생각, 마지막 문단은 지원 직무 연결로 마무리한다.` : ''}
[문항] ${question || '(문항 미입력)'}
[분량] ${charLimit ? `공백 포함 ${charLimit}자의 80~90%(${Math.round(charLimit*0.8)}~${Math.round(charLimit*0.9)}자)를 초안마다 반드시 채운다. 메모가 짧아도 분량을 맞추되 없는 사실은 [빈칸]으로 둔다.${charLimit >= 1000 ? ' 1000자 이상이므로 2~4개 문단(빈 줄로 구분)으로 나눈다.' : ''}` : '400~600자'}

[도입 방식 — 메모에 가장 잘 맞는 3가지를 골라 하나씩 사용]
${OPENER_GUIDE}

[JSON 작성 주의]
- 문자열 값 안에서는 큰따옴표를 쓰지 않는다. 필요하면 작은따옴표나 「 」를 쓴다.
- 아래 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 없이 순수 JSON만.
{"drafts": [{"opener": "도입 방식 이름", "text": "초안 전문"}, {"opener": "...", "text": "..."}, {"opener": "...", "text": "..."}]}`;

  const userMsg = memo.map((m) => `${m.label} ${m.value}`).join('\n');

  try {
    let parsed = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: Math.min(16000, 2500 + Math.round((charLimit || 0) * 4)), // 초안 3개 분량
          system: systemPrompt,
          messages: [{ role: 'user', content: `[학생 메모]\n${userMsg}` }]
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Anthropic API 오류:', data);
        return res.status(500).json({ error: aiErrorText(response.status, data) });
      }
      const raw = (data.content || []).map((c) => c.text || '').join('').trim();
      parsed = parseAIJson(raw);
      if (!parsed || !Array.isArray(parsed.drafts) || !parsed.drafts.length) {
        console.error(`초안 JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 500));
        parsed = null;
      }
    }

    if (!parsed) {
      return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
    }

    const drafts = parsed.drafts
      .map((d) => ({ opener: clip(d && d.opener, 20), text: String((d && d.text) || '').trim() }))
      .filter((d) => d.text)
      .slice(0, 3);

    return res.status(200).json({ drafts });
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}

// ---------- 내 글로 완성하기 (mode: 'finish', 2026-10-02) ----------
// 학생이 결과 화면에서 예시 자리를 자기 경험으로 바꾼 뒤, 문장이 자연스럽게 이어지도록 다듬기만 함
async function finish(body, res) {
  const text = clip(body.text, 4000);
  const charLimit = parseInt(body.charLimit, 10) || null;
  if (!text || !/⟪[^⟫]+⟫/.test(text)) {
    return res.status(400).json({ error: '내 경험으로 바꾼 곳이 한 곳 이상 있어야 해요.' });
  }
  const systemPrompt = `당신은 자기소개서 첨삭 코치입니다. 학생이 첨삭 완성본의 예시 자리 일부를 자기 실제 경험으로 바꿨습니다.
- ⟪ ⟫ 안은 학생이 직접 넣은 자기 경험입니다. 그 내용(단어·숫자·이름)을 빠짐없이 살리고 ⟪ ⟫ 기호만 지웁니다. 학생이 단어만 적었으면 앞뒤 문장과 이어지는 자연스러운 구절로 풀어 씁니다.
- {{ }} 안은 아직 바꾸지 않은 AI 예시입니다. 내용과 {{ }} 기호를 그대로 둡니다(문장 연결을 위해 조사만 바꿀 수 있음).
- 학생이 넣은 내용과 예시가 어긋나 문장이 어색해지면, 그 주변 문장만 학생 내용에 맞게 고칩니다. 새로운 사실·숫자·이름은 만들지 않습니다.
- 학생 1인칭 자소서 본문만 씁니다.${charLimit ? ` 기호를 뺀 분량은 공백 포함 ${charLimit}자의 80~90%(${Math.round(charLimit * 0.8)}~${Math.round(charLimit * 0.9)}자)로 맞춥니다.` : ''}
[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다. 아래 JSON 하나만 출력한다.
{"text": "완성된 자소서 본문"}`;
  try {
    let parsed = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: Math.min(8000, 1500 + Math.round((charLimit || 600) * 1.6)),
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Anthropic API 오류:', data);
        return res.status(500).json({ error: aiErrorText(response.status, data) });
      }
      const raw = (data.content || []).map((c) => c.text || '').join('').trim();
      parsed = parseAIJson(raw);
      if (!parsed || !parsed.text) { console.error(`완성하기 JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 300)); parsed = null; }
    }
    if (!parsed) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
    return res.status(200).json({ text: String(parsed.text).replace(/[⟪⟫]/g, '').trim() });
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}

// ---------- 내 문장 방어 테스트 (mode: 'defend') ----------
async function defend(body, res) {
  const sentence = clip(body.sentence, 300);
  const question = clip(body.question, 300);
  const essay = clip(body.essay, 2500);
  const reply = clip(body.reply, 800);
  if (!sentence || !question || reply.length < 10) {
    return res.status(400).json({ error: '답변을 10자 이상 적어주세요.' });
  }

  const systemPrompt = `당신은 15년 경력의 면접관 겸 취업 코치입니다. 학생이 자기소개서에 쓴 문장에 대해 면접관이 꼬리질문을 했고, 학생이 말로 답했습니다.
이 답변을 면접관 시점에서 판정하세요. 면접관은 자소서와 면접 답변이 어긋나거나, 자소서보다 부풀리거나, 본인이 설명하지 못하면 신뢰를 잃습니다.

[판정 기준 — verdict는 아래 셋 중 하나]
- ok: 자소서 내용과 일치하고, 본인이 한 일이 구체적으로 설명됨
- caution: 자소서에 없던 새 사실·숫자가 나오거나, 자소서보다 부풀려짐 → 자소서에 반영하거나 답변을 맞춰야 함
- weak: 질문에 답하지 못했거나, 추상적이어서 본인 경험인지 확인이 안 됨 → 이 문장은 빼거나 경험을 보충해야 함

[comment 작성]
- 학생에게 직접 말하듯 부드러운 존댓말 2문장 이내. 첫 문장은 판정 이유, 둘째 문장은 바로 할 수 있는 한 가지 행동.
- 학생 답변의 단어를 1개 이상 인용한다. 없는 사실을 지어내지 않는다.

[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다. 아래 JSON 하나만 출력한다.
{"verdict": "ok|caution|weak", "comment": "판정 설명"}`;

  const userMsg = `[자소서 전문]\n${essay || '(없음)'}\n\n[면접관이 짚은 문장]\n${sentence}\n\n[면접관 질문]\n${question}\n\n[학생의 말로 한 답변]\n${reply}`;

  try {
    let parsed = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }]
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Anthropic API 오류:', data);
        return res.status(500).json({ error: aiErrorText(response.status, data) });
      }
      const raw = (data.content || []).map((c) => c.text || '').join('').trim();
      parsed = parseAIJson(raw);
      if (!parsed || !parsed.comment) {
        console.error(`방어 판정 JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 300));
        parsed = null;
      }
    }
    if (!parsed) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
    const verdict = ['ok', 'caution', 'weak'].includes(parsed.verdict) ? parsed.verdict : 'caution';
    return res.status(200).json({ verdict, comment: String(parsed.comment).trim() });
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
