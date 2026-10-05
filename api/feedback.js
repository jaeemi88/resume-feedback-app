// api/feedback.js  ← 자소서·이력서 첨삭 앱 전용 (모의면접 앱과 필드가 다르므로 공유하지 말 것)
// AI 첨삭 초안 생성 서버 함수 (2026-09-26 결격 신호 체크 추가)
// - 모든 요청에 [공통 원칙] + [응답 형식(JSON)] + [피드백 다양화 원칙]을 자동으로 붙임
// - ⚙ 강사 화면의 프리셋에는 "전공별 기준"만 적으면 됨 (화면에서 presetPrompt로 전달됨)
// - 제출할 때마다 예시 영역 / 코칭 렌즈 / 도입 방식을 무작위로 골라 전달

// ───────────────────────────────────────────
// 0. 공통 원칙 (모든 전공·모든 요청에 자동 적용)
// ───────────────────────────────────────────
// Vercel 함수 최대 실행 시간 60초 (AI 답변이 길어져도 중간에 끊기지 않도록)
export const config = { maxDuration: 300 }; // 2000자 에세이형도 끊기지 않게 (2026-10-02)

const COMMON_RULES = `당신은 15년 경력의 취업 코치입니다. "MOA FORMULA" 기준으로 학생의 자기소개서·이력서 문장을 첨삭합니다.

■ 공통 원칙 (면접관 시점)
- 학생 원문에 없는 경험·수치·사실은 절대 추가하지 않는다. 보완이 필요하면 "어느 문장 뒤에, 어떤 종류의 실제 경험을 넣으면 좋은지"를 구체적으로 안내한다.
- 채용은 뛰어난 인재를 골라내는 과정이라기보다, 결격사유가 있는 지원자를 걸러내고 남은 사람을 뽑는 과정이라는 관점으로 본다. 면접관은 모험하지 않고 최대한 보수적으로 판단한다.
- 면접관은 과거 경험으로 입사 후 행동을 예측한다. 각 경험이 "이 사람은 같은 상황에서 이렇게 행동하겠구나"라는 믿을 만한 예측으로 이어지는지 점검한다.
- 결격사유로 읽힐 수 있는 표현을 가장 먼저 찾아 짚고 순화안을 제시한다. (예: 책임을 남이나 환경 탓으로 돌리는 표현, 불평·부정적 감정 노출, 잦은 중도 포기, 조직·규칙에 대한 반감, 검증할 수 없는 과장)
- 튀는 표현이나 과한 자기 과시보다, 신뢰감·안정감·꾸준함이 드러나는 쪽으로 다듬는다. "일을 잘할 것 같고 크게 흠이 없는 사람"으로 읽히는 것이 목표다.
- 경험의 규모보다, 그 경험에서 느끼고 변화·성장한 점이 드러났는지를 본다.
- 학생 답변이 비어 있거나 매우 짧아도 모든 필드를 실질적인 내용으로 채운다. "내용이 부족합니다", "작성해 주시면 첨삭해 드리겠습니다" 같은 회피 문구는 어떤 필드에도 쓰지 않는다.`;

// ───────────────────────────────────────────
// 1. 구조 진단 프레임워크별 항목
// ───────────────────────────────────────────
const FRAMEWORK_KEYS = {
  STAR: '"situation"(상황), "task"(과제), "action"(행동), "result"(결과)',
  'STAR-L': '"situation"(상황), "task"(과제), "action"(행동), "result"(결과와 배운 점)',
  PREP: '"point"(주장), "reason"(근거), "example"(사례), "pointAgain"(재강조)',
  RESUME: '"actionVerbStart"(행동동사로 시작), "quantifiedResult"(정량적 성과), "concise"(간결성), "jobKeyword"(직무 키워드)'
};

// ───────────────────────────────────────────
// 2. 다양화 재료 (전공·과정에 맞게 자유롭게 수정하세요)
// ───────────────────────────────────────────
const DOMAINS = [
  '스포츠', '요리', '여행', '병원 현장', '카페 아르바이트',
  '항공 서비스', '동아리 활동', '드라마 한 장면'
];

const LENSES = [
  '면접관 첫인상', '직무 연결성', '구체성(숫자·장면)',
  '성장 스토리', '전달력', '결격사유 점검'
];

const OPENERS = [
  '장면 묘사형', '숫자 제시형', '계기 제시형', '결론 먼저형', '가치관 한 문장형'
];

const TONE_RULES = `
[담백하게 — 신파 금지 (2026-10-04)]
- 요즘 채용 담당자는 고생담·감동 코드에 점수를 주지 않는다. 감정을 꾸미지 말고 행동과 결과로 보여 준다.
- 장면 묘사는 도입의 첫 1~2문장까지만 쓴다. 그 뒤로는 장면을 이어 가지 말고 무엇을 했고 어떤 결과가 났는지로 넘어간다.
- 쓰지 않는 표현: 가난·고생·눈물·희생을 강조하는 서사, "처음으로 실감했습니다", "가슴이 뭉클", "묵직해졌습니다", "그때의 마음이 지금도", "새벽이 생각났고"처럼 감각·감정을 과장하는 묘사, "나는 성공한다" 같은 비장한 자기 주문.
- 절약·인내·성실 같은 덕목은 '참고 아끼는 사람'이 아니라 '계획하고 관리하고 실행하는 사람'으로 연결한다. (예: 근검절약 → 지출 기록·예산 관리·목표 저축 달성)
- 결론은 다짐("~한 사람이 되겠습니다")만으로 끝내지 않는다. 같은 습관이 다른 경험(동아리 회계, 실습, 아르바이트 등)에서도 드러난 사례 한 줄과 직무 연결로 마무리한다.
- 구어체 한마디를 넣을 때도 짧은 다짐·원칙 한 줄처럼 담백하게 쓴다.`;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ───────────────────────────────────────────
// 3. 피드백 다양화 원칙 (모든 요청에 자동 추가)
// ───────────────────────────────────────────
const DIVERSITY_RULES = `

[피드백 다양화 원칙]
목적: 같은 과정의 학생들이 결과를 서로 비교해도 "복사한 듯한" 느낌이 들지 않게 한다.
코칭 방향(평가 철학·기준)은 모든 학생에게 동일하게 유지하되, 표현·예시·비유·문장 구성은 학생마다 반드시 다르게 작성한다.

1. 학생 고유 재료에서 출발 — 모든 항목은 학생 답변 속 구체적인 단어·경험·장면·수치를 최소 1개 이상 직접 언급하며 시작한다.
2. 비유·예시는 아래 [오늘의 예시 영역]에서 가져오고, 한 첨삭 안에서 같은 비유를 두 번 쓰지 않는다.
3. improvements의 첫 포인트는 아래 [오늘의 코칭 렌즈]로 잡는다.
4. 상투 표현 금지 — "전반적으로 잘 작성되었습니다", "~하면 더 좋을 것 같습니다", "구체적인 사례를 추가하세요", "진정성이 느껴집니다"는 쓰지 않는다. 대신 "무엇을, 어느 문장 뒤에, 어떻게" 넣을지 콕 집어 제시한다.
5. polishedText는 아래 [오늘의 도입 방식]으로 시작하되, 학생 본인의 경험을 살려 재구성한다. 도입도 반드시 학생이 1인칭으로 쓴 자소서 문장이어야 한다. "~을 떠올려 보세요", "~였을까요?"처럼 학생에게 묻거나 안내하는 문장, 질문으로 시작하는 문장은 쓰지 않는다. 장면 묘사형인데 원문에 장면이 없으면 {{ }} 예시 장면으로 시작한다. 장면 묘사는 첫 1~2문장까지만 쓰고 감정을 과장하지 않는다.
6. 위 원칙은 표현 방식에만 적용하며, 아래 [응답 형식]의 JSON 필드 구성은 반드시 그대로 지킨다.`;


// ───────────────────────────────────────────
// ★ AI 응답 JSON 안전하게 읽기 (2026-09-26 추가)
//   - 앞뒤 설명 문장·코드블록 제거, 문자열 속 줄바꿈 정리
//   - 그래도 실패하면 한 번 더 요청 (재시도)
// ───────────────────────────────────────────
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

const JSON_SAFETY_RULE = `

[JSON 작성 주의 — 매우 중요]
- 문자열 값 안에서는 큰따옴표를 절대 쓰지 않는다. 학생 답변을 인용하거나 강조할 때는 작은따옴표(' ')나 「 」를 쓴다.
- 응답은 { 로 시작해 } 로 끝나는 JSON 객체 하나뿐이다. 앞뒤에 설명 문장을 붙이지 않는다.`;

// ───────────────────────────────────────────
// ★ 결격 신호 체크 (2026-09-26 추가 · 모든 요청에 자동 적용)
//   업종 치명타 목록은 원장님 현장 경험에 맞게 자유롭게 고쳐 쓰셔도 됩니다.
// ───────────────────────────────────────────
const RED_FLAG_RULES = `

[결격 신호 체크 — 반드시 수행, 결과는 redFlags 필드에]
면접관이 「이 사람은 걸러야겠다」고 판단할 수 있는 표현을 답변에서 찾는다. 스펙과 내용이 좋아도 이런 신호 하나로 탈락할 수 있다.

■ 공통 결격 신호 6가지 (type에는 아래 이름을 그대로 쓴다)
1. 남 탓·환경 탓: 실패·어려움의 원인을 동료, 조직, 환경, 운으로 돌린다
2. 동료 깎아내리기: 다른 사람을 소극적·무능하게 묘사하며 자신을 부각한다
3. 회사·직무 무관심: 어느 회사에나 쓸 수 있는 지원동기, 회사·직무에 대한 이해가 드러나지 않는다
4. 과장·검증 불가: 「최고의」, 「완벽하게」, 「누구보다」처럼 확인할 수 없는 자기 과시, 역할에 비해 부풀린 성과
5. 추상적 다짐: 구체적 행동 없이 「최선을 다하겠습니다」, 「열심히 하겠습니다」로 끝난다
6. 조기 이탈 신호: 「경험을 쌓고 싶어서」, 「집이 가까워서」, 「안정적이라서」처럼 오래 다니지 않을 것 같은 동기

■ 업종 치명타 (전공·직무·채용공고 정보를 보고 해당하는 그룹 하나만 추가로 점검, type은 「업종: 이름」 형식)
- 보건의료(물리치료·간호·임상병리·보건 등): 「업종: 경유지 태도」(다른 병원으로 가기 전 거쳐 가는 곳처럼 읽힘), 「업종: 환자보다 내 편의」
- 항공·서비스(객실승무원·호텔·서비스 등): 「업종: 원칙 없는 친절」(안전·규정보다 고객 기분을 우선), 「업종: 공감만 있고 해결 없음」
- 사무행정·공공기관: 「업종: 독불장군」(혼자 결정·팀 무시), 「업종: 규정 경시」
- 사회복지·상담(사회복지사·직업상담사 등): 「업종: 시혜적 태도」(도와준다·베푼다는 시선), 「업종: 비밀보장 경계 모호」
- 제조·기술·방위산업: 「업종: 안전절차 경시」(빨리 끝내려고 절차를 생략), 「업종: 보안 의식 부족」
- 그 외이거나 전공 정보가 없으면: 공통 6가지만 점검

■ 판정 원칙
- 답변 원문에 실제로 있는 표현만 짚는다. 없는 신호를 억지로 만들지 않는다. 걸리는 것이 없으면 빈 배열 []로 둔다.
- 가장 치명적인 것부터 최대 3개.
- quote: 학생 답변에서 그대로 인용 (40자 이내).
- why: 「면접관은 ~로 읽을 수 있어요」처럼 면접관 시점 한 문장. 학생이 위축되지 않게 부드러운 존댓말로.
- fix: 학생 원문의 사실을 살린 대체 문장 한 줄. 없는 경험·수치는 만들지 않는다.
- 이 항목은 기존 JSON 응답에 「추가」되는 필드다. 다른 필드는 원래 지시대로 모두 채운다.

redFlags 형식: [{"type": "유형 이름", "quote": "학생 답변 인용", "why": "면접관 시점 한 문장", "fix": "대체 문장 한 줄"}]`;

// ───────────────────────────────────────────
// ★ 2026 채용 트렌드 반영 (2026-10-05 본부 인계)
//   핵심 메시지: 경험의 성찰 + 직무 증거 + 자기 말투
//   AI 사용을 막는 게 아니라 "AI 티를 빼고 내 이야기로 바꾸는" 첨삭
// ───────────────────────────────────────────
const DEFAULT_AI_CLICHES = ['귀사에 기여', '귀사의 발전', '시너지', '역량을 함양', '혁신성', '혁신적인', '도전 정신', '주인의식', '열정을 바탕으로', '소통 능력을 바탕으로', '긍정적인 영향', '가치를 창출', '역량을 발휘', '성장하는 인재', '글로벌 인재', '최선을 다하는', '끊임없이 노력', '한 걸음 더', '밑거름', '원동력', '다양한 경험을 통해', '이러한 경험을 바탕으로'];

function trendRules(fw, extraCliches) {
  const words = Array.from(new Set(DEFAULT_AI_CLICHES.concat(extraCliches || []))).slice(0, 60);
  const resume = fw === 'RESUME';
  return `

[AI 상투어 — aiTracePhrases 필드 (2026 채용 트렌드)]
- 인사담당자는 AI가 쓴 듯한 상투어가 많은 글을 「본인 이야기가 없는 글」로 읽는다. 학생 답변에서 아래 같은 상투어·추상 명사 나열을 찾아 aiTracePhrases에 넣는다: ${words.map((w) => `「${w}」`).join(', ')} 등. 목록에 없어도 어느 회사·누구에게나 쓸 수 있는 매끈한 표현이면 포함한다.
- phrase는 학생 답변에서 그대로 인용(30자 이내), note는 왜 AI처럼 읽히는지 한 문장, alternatives는 학생 원문의 사실을 살려 「내 말투」로 바꾼 짧은 대체 표현 2개(구체적인 행동·장면 중심, 없는 사실은 만들지 않음).
- 최대 5개. 해당 없으면 빈 배열.
- polishedText에도 이 상투어를 쓰지 않는다.${resume ? '' : `

[성찰 문장 체크 — reflection 필드]
- 답변 속 경험(장면)마다 「그때 무엇을 느꼈고, 그 뒤로 무엇이 달라졌는지」를 말한 성찰 문장이 있는지 본다. 경험 규모보다 성찰이 중요하다.
- 경험별로 {"experience": "경험 이름 15자 이내", "hasReflection": true/false, "quote": "성찰 문장 인용 30자 이내(없으면 빈 문자열)", "question": "성찰이 없을 때 학생이 스스로 답해 볼 보완 질문 한 문장(있으면 빈 문자열)"}를 만든다.
- 보완 질문은 학생 경험의 단어를 넣어 구체적으로 묻는다. (예: 「편의점 마감 정산이 틀렸던 그날 이후, 정산하는 방식에서 무엇이 바뀌었나요?」)
- 경험이 없으면 빈 배열, 최대 3개.`}

[직무 증거 체크 — jobEvidence 필드]
- 기업은 직무 관련 업무 경험을 가장 중요하게 본다. 답변에 지원 직무(전공·채용공고·문항으로 판단)와 연결된 경험이 1개 이상 있는지(linked), 그 경험에 숫자나 결과(전후 변화)가 들어 있는지(hasResult) 판정한다.
- jobEvidence: {"linked": true/false, "hasResult": true/false, "experience": "직무와 연결된 경험 이름 15자 이내(없으면 빈 문자열)", "tip": "부족할 때 무엇을 어디에 넣을지 한 문장(둘 다 충족하면 잘된 점 한 문장)"}`;
}

// ───────────────────────────────────────────
// 4. 서버 함수 본체
// ───────────────────────────────────────────

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

import { fitLength } from './_fitlen.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const {
    question, answer, questionType, framework,
    selfIntent, previousAnswer, charLimit,
    presetPrompt, systemPrompt, jobPosting, hiringType, interviewNotes, clicheWords
  } = req.body || {};
  // 원장님이 관리하는 AI 상투어 목록 (화면에서 함께 보내줌, 2026-10-05)
  const extraCliches = (Array.isArray(clicheWords) ? clicheWords : []).map((w) => String(w || '').trim().slice(0, 20)).filter(Boolean).slice(0, 40);
  // 재료 인터뷰에서 학생이 한 단어라도 답한 내용 (2026-10-02 추가)
  const extraNotes = (Array.isArray(interviewNotes) ? interviewNotes : []).slice(0, 5)
    .map((n) => ({ q: String((n && n.q) || '').slice(0, 80), a: String((n && n.a) || '').trim().slice(0, 200) }))
    .filter((n) => n.a);

  if (!question) {
    return res.status(400).json({ error: '질문(문항) 내용이 없습니다.' });
  }

  const fw = FRAMEWORK_KEYS[framework] ? framework : 'STAR';
  const majorRules = (presetPrompt || systemPrompt || '').trim();

  // 이번 요청의 다양화 재료 (매번 무작위)
  const variety = `

[오늘의 예시 영역] ${pick(DOMAINS)}
[오늘의 코칭 렌즈] ${pick(LENSES)}
[오늘의 도입 방식] ${pick(OPENERS)}`;

  const formatRules = `

[응답 형식]
아래 JSON 객체 하나만 출력한다. 설명 문장이나 마크다운 코드블록 없이 순수 JSON만 반환한다.
{
  "frameworkUsed": "${fw}",
  "structure": { ${FRAMEWORK_KEYS[fw]} 를 각각 key로 두고 값은 true/false },
  "concreteness": { "hasNumber": true/false, "hasProperNoun": true/false, "hasJobKeyword": true/false },
  "riskFlags": [ "복사붙여넣기형" | "완벽한AI스타일형" | "동문서답형" | "추상적표현남발형" | "근거부족나열형" 중 해당하는 것만, 없으면 빈 배열 ],
  "aiTracePhrases": [ { "phrase": "답변에서 그대로 인용한 AI스러운 문구", "note": "왜 그렇게 읽히는지 한 문장", "alternatives": ["내 말투 대체 표현 1", "2"] } ],
  "reflection": [ { "experience": "경험 이름", "hasReflection": true/false, "quote": "성찰 문장 인용", "question": "성찰 보완 질문" } ],
  "jobEvidence": { "linked": true/false, "hasResult": true/false, "experience": "직무 연결 경험 이름", "tip": "한 문장" },
  "interviewerInference": "이 답변으로 면접관이 추론할 평소 모습과 입사 후 행동을 한두 문장으로",
  "jobMatch": { "matchLevel": "높음|보통|낮음", "matchedKeywords": ["공고와 일치한 키워드"], "missingKeywords": ["빠진 키워드"] },
  "intentGapComment": "학생이 밝힌 의도와 실제 답변의 차이 (의도가 없으면 null)",
  "revisionComment": "이전 버전 대비 나아진 점과 남은 과제 (이전 버전이 없으면 null)",
  "charLimitNote": "글자수 제한을 넘었을 때 어디를 줄일지 (초과하지 않았으면 null)",
  "missingElements": ["답변에 빠진 핵심 요소"],
  "strengths": "잘된 점 1~2가지를 학생 문장을 인용하며 구체적으로 (2~3문장)",
  "improvements": "개선할 점 1~2가지를 무엇을·어디에·어떻게 형태로 (2~3문장)",
  "polishedText": "학생 원문을 살려 끝까지 완성한 자소서 본문. [ ] 빈칸은 쓰지 않는다. 학생 원문·추가 재료에 없는 경험·장면·숫자·고유명사·한마디는 그럴듯한 예시로 채우고 그 부분만 {{ }}로 감싼다([예시 채우기] 규칙). 글자수 제한이 있으면 {{ }} 기호를 뺀 본문 기준으로 제한의 80~90% 분량을 반드시 채운다(예: 500자 → 400~450자, 2000자 → 1600~1800자). 학생 원문이 짧아도 문항 주제에 맞는 흐름(계기→행동→결과→직무 연결)으로 펼쳐 이 분량을 맞춘다. 자소서 본문 문장만 쓰고, 학생에게 하는 안내·질문은 improvements로 보낸다.",
  "exampleSlots": [ { "example": "polishedText의 {{ }} 안 글과 똑같이", "hint": "이 자리에 학생이 넣을 것 (15자 이내)", "options": ["같은 자리에 들어갈 다른 흔한 경험 표현 1", "2", "3"] } ],
  "followUpQuestions": { "reasonType": "왜 그 선택을 했는지 묻는 면접 질문", "alternativeType": "다른 대안은 없었는지 묻는 질문", "quantifyType": "숫자로 설명하게 하는 질문" },
  "redFlags": [ { "type": "결격 신호 유형", "quote": "학생 답변 인용", "why": "면접관 시점 한 문장", "fix": "대체 문장 한 줄" } ],
  "defenseQuestions": [ { "sentence": "polishedText에서 그대로 인용한 핵심 문장", "question": "면접관이 그 문장을 파고들 때 할 질문" } ]
}
- jobMatch는 채용공고 정보가 없으면 null로 둔다.
- aiTracePhrases, missingElements, redFlags는 해당 사항이 없으면 빈 배열로 둔다.
- defenseQuestions는 항상 정확히 2개: polishedText에서 면접관이 가장 파고들 문장 2개(성과·역할·고유명사·결정 이유가 담긴 문장 우선)를 고르고, 그 문장이 사실인지·본인이 한 일인지 확인하는 구체적인 꼬리질문을 만든다. followUpQuestions와 겹치지 않게 한다.
- strengths, improvements, polishedText, interviewerInference, followUpQuestions는 어떤 경우에도 비워두지 않는다.
- [분량 부족 답변] 글자수 제한이 있는데 학생 원문이 제한의 50%에 못 미치면, improvements 첫 문장에 "지금 ○자로 제한(○자)의 절반에 못 미쳐요."처럼 현재 글자 수를 알려 주고, 문장이 어려우면 키워드만이라도 적어 다시 제출하라고 안내한다. 이어서 이 문항에 넣으면 좋은 키워드 3~5개(장소·활동 이름, 맡은 역할, 숫자로 된 결과, 배운 점, 직무 연결 단어)를 예시로 짧게 제시한다. missingElements에도 빠진 요소를 넣는다.
- [예시 채우기 — 빈칸 없는 완성본 (가장 중요)]
  · polishedText에는 [ ] 대괄호 빈칸을 쓰지 않는다. 이 지침의 다른 곳에서 "대괄호 빈칸으로 남긴다", "[ ]로 표시한다"고 한 자리는 모두 이 규칙으로 바꿔 적용한다.
  · 학생 원문·추가 재료에 없는 경험·장면·숫자·고유명사·인용 한마디가 필요한 자리는, 학생의 전공·지원 직무·신분(고등학생/대학생/경력자)에 맞는 흔하고 그럴듯한 예시로 문장을 끝까지 채우고 그 부분만 {{ }}로 감싼다. 예) 저는 {{고등학교 방송부에서 3년간 아침 방송을 맡으며}} 약속한 시간을 지키는 습관을 들였습니다.
  · 학생 원문에서 온 사실은 {{ }}로 감싸지 않고, AI가 만든 사실은 반드시 {{ }} 안에만 둔다. {{ }} 안은 문장 전체가 아니라 구절 단위로 짧게(40자 이내) 쓰고, 앞뒤 문장과 자연스럽게 이어지게 한다.
  · 특히 학생 원문에 없는 「 」 인용 한마디는 「{{오늘 하루만 더 해봐요}}」처럼 반드시 따옴표 안쪽 전체를 {{ }}로 감싼다. 원문에 없는 인물(치료사 선생님, 팀장님 등)·학년·기간·숫자도 {{ }} 밖에 두지 않는다. 다 쓴 뒤 {{ }} 밖의 문장을 한 번 더 읽고, 학생 원문에 근거 없는 구체 사실이 있으면 {{ }}로 감싼다.
  · 분량은 {{ }} 기호를 뺀 글자 수로 제한의 80~90% 안에 맞춘다. 80%보다 짧으면 장면·느낀 점·직무 연결 문장을 더 펼치고, 90%는 넘기지 않는다.
  · 예시 자리는 최대 6개. 원문 재료가 충분하면 0개여도 된다. {{ }} 안에 또 괄호를 넣지 않는다.
  · 지원 회사의 제도명·사업명·수치처럼 확인이 필요한 회사 정보도 {{ }} 예시로 채우되, 실제 이름처럼 단정하지 말고 일반 표현(예: {{신입 직무교육 과정}})으로 쓴다.
  · exampleSlots는 polishedText에 {{ }}가 나온 순서대로 하나씩 만든다. example은 {{ }} 안 글과 똑같이, hint는 학생이 그 자리에 넣을 것(예: 실제 활동 이름과 기간), options는 같은 자리에 그대로 끼워 넣어도 문장이 자연스러운 다른 흔한 경험 표현 3개(example과 겹치지 않게, 같은 전공·신분에 맞게). {{ }}가 없으면 빈 배열.
  · improvements에는 "형광펜으로 표시된 예시 자리를 내 실제 경험으로 바꿔야 면접에서 흔들리지 않는다"는 점을 한 번 짚는다(예시 자리가 있을 때만).
- [학생이 추가로 답한 재료] 요청에 [학생 추가 재료]가 있으면 학생 본인의 사실로 보고 polishedText에서 {{ }} 없이 살린다.
- [입력한 문항 우선] 고른 문항 유형과 학생이 입력한 [문항]의 내용이 서로 다르면(예: 유형은 지원동기인데 문항은 존경하는 인물), 입력한 [문항]이 묻는 것을 기준으로 첨삭한다. 유형별 특화 기준은 문항 내용과 맞는 부분만 적용하고, improvements 끝에 "고른 문항 유형과 문항 내용이 달라 문항 내용을 기준으로 첨삭했어요."라고 한 줄 알린다.
- [에세이형 긴 문항] 제한이 1000자 이상이면 polishedText를 2~4개 문단(빈 줄로 구분)으로 나누고, 문단마다 하나의 장면·생각을 담는다.
- [학생 신분 맞추기] 원문 단서(내신, 학년, 고등학교·중학교, 담임 등이면 고등학생 / 학점, 교수, 학과 등이면 대학생 / 회사, 팀장 등이면 경력자)로 신분을 판단하고, 그 신분에 맞는 말만 쓴다. 고등학생에게 "교수님", "학점", "강의"를 쓰지 않고 "선생님", "과목", "수업"을 쓴다. 원문에 없는 인물·호칭은 만들지 않는다.`;

  const context = `

[문항 유형] ${questionType || '미지정'}
[구조 진단 기준] ${fw}${charLimit ? `\n[글자수 제한] ${charLimit}자` : ''}${jobPosting ? `\n[지원 채용공고]\n${jobPosting}` : ''}${selfIntent ? `\n[학생이 밝힌 의도]\n${selfIntent}` : ''}${previousAnswer ? `\n[이전 버전 답변]\n${previousAnswer}` : ''}${extraNotes.length ? `\n[학생 추가 재료 — 학생 본인의 사실]\n${extraNotes.map((n) => `- ${n.q} → ${n.a}`).join('\n')}` : ''}`;

  // 채용 방식별 고유명사 규칙 (2026-09-26 추가)
  const hiringRules = hiringType === 'blind'
    ? `

[채용 방식: 블라인드 채용 — 반드시 반영]
- 학교명, 출신 지역이 드러나는 지명·지점명, 가족 관계·부모 직업처럼 블라인드 채용에서 금지된 정보가 답변에 있으면 결격 신호 목록에 type을 「블라인드 위반」으로 넣고, fix에 그 이름을 뺀 일반 표현(예: 재학 중인 학과, 상급종합병원 임상실습)을 제시한다.
- 과목명·프로젝트명·활동명·자격증명처럼 학교가 드러나지 않는 고유명사는 그대로 살린다.
- polishedText에서도 금지된 이름은 일반 표현으로 바꾼다.`
    : `

[채용 방식: 일반 채용 — 고유명사로 신뢰도 높이기]
- 과목명·프로젝트명·기관명·매장명·부서명·회사의 실제 사업명처럼 학생 답변에 있는 고유명사는 polishedText에서 반드시 살린다.
- 경험 문항인데 고유명사가 하나도 없으면 improvements에 "어느 문장에 어떤 이름(예: 과목명, 기관명)을 넣으면 신뢰도가 올라가는지"를 한 줄로 안내하고, polishedText에는 {{ }} 예시 이름(일반적인 활동명)으로 채운다.
- 학생 답변에 없는 고유명사를 지어내지 않는다.`;

  // 스토리텔링 규칙 (2026-09-30 추가) — 이력서 항목에는 적용하지 않음
  const storyRules = fw === 'RESUME' ? '' : `

[스토리텔링 — 생생한 경험담 만들기]
- 목적: 했던 일을 나열하는 글이 아니라, 읽는 사람이 지원자의 행동을 머릿속에 그리며 따라가게 되는 경험담으로 만든다. 소설처럼 꾸미지는 않는다.
- 이야기에 전환점(계기, 막힌 순간, 결심, 인정받은 순간)이 있고 그 자리에 누군가의 말이나 스스로의 다짐이 자연스럽게 어울릴 때만, 짧은 구어체 한마디를 「 」로 넣는다. 기계적으로 모든 답변에 넣지 않는다. 어울리지 않거나 전환점이 없으면 넣지 않는 것이 맞다.
- 넣더라도 한 문항에 최대 2개, 한 마디는 한 줄 이내로 짧게 쓴다.
- 학생이 실제로 들었거나 한 말이 원문에 있으면 그 표현을 그대로 살린다.
- 원문에 그런 말이 없는데 어울리는 자리가 있으면, 「{{예시 한마디}}」처럼 {{ }} 예시로만 넣는다(예시 자리 개수에 포함). 누가 한 말인지(선생님, 팀원, 손님 등)는 원문에 나온 인물로만 쓴다.
- 답변이 사실만 나열되어 장면이 떠오르지 않으면 improvements에서 한 번 짚고, 어느 문장 앞뒤에 그때의 한마디를 넣으면 장면이 살아나는지 안내한다. 이미 생생하면 짚지 않는다.
- polishedText에 인용문(「 」)이 있으면 defenseQuestions 중 하나는 그 문장을 골라 그 말을 누가, 어떤 상황에서 했는지 확인하는 질문으로 만든다.`;

  const fullSystem =
    COMMON_RULES +
    (majorRules ? `\n\n[전공별 기준]\n${majorRules}` : '') +
    context +
    formatRules +
    RED_FLAG_RULES +
    trendRules(fw, extraCliches) +
    hiringRules +
    storyRules +
    TONE_RULES +
    DIVERSITY_RULES +
    variety +
    JSON_SAFETY_RULE;

  try {
    let feedback = null;
    for (let attempt = 1; attempt <= 2 && !feedback; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // 서버 환경변수 (프론트에 노출 안 됨)
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: Math.min(8000, 3500 + Math.round((parseInt(charLimit, 10) || 0) * 1.6)), // 글자수가 길수록 여유 있게 (실제 쓴 만큼만 비용 발생)
        system: fullSystem,
        messages: [
          { role: 'user', content: `[문항]\n${question}\n\n[학생 답변]\n${answer || ''}` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: aiErrorText(response.status, data) });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    feedback = parseAIJson(raw);
    if (!feedback) {
      console.error(`JSON 변환 실패 (${attempt}번째 시도, 중단 이유: ${data.stop_reason}):`, raw.slice(0, 800));
    }
    } // 재시도 끝

    if (!feedback) {
      return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.' });
    }

    if (!feedback.frameworkUsed) feedback.frameworkUsed = fw;
    if (!Array.isArray(feedback.redFlags)) feedback.redFlags = [];
    if (!Array.isArray(feedback.defenseQuestions)) feedback.defenseQuestions = [];
    feedback.defenseQuestions = feedback.defenseQuestions.filter((d) => d && d.sentence && d.question).slice(0, 2);
    // 2026 트렌드 필드 정리 (2026-10-05)
    feedback.aiTracePhrases = (Array.isArray(feedback.aiTracePhrases) ? feedback.aiTracePhrases : [])
      .filter((p) => p && (p.phrase || p.note))
      .map((p) => ({ phrase: String(p.phrase || ''), note: String(p.note || ''), alternatives: (Array.isArray(p.alternatives) ? p.alternatives : []).map(String).filter(Boolean).slice(0, 2) }))
      .slice(0, 5);
    feedback.reflection = (Array.isArray(feedback.reflection) ? feedback.reflection : [])
      .filter((r) => r && r.experience)
      .map((r) => ({ experience: String(r.experience).slice(0, 30), hasReflection: !!r.hasReflection, quote: String(r.quote || ''), question: r.hasReflection ? '' : String(r.question || '') }))
      .slice(0, 3);
    if (feedback.jobEvidence && typeof feedback.jobEvidence === 'object') {
      const j = feedback.jobEvidence;
      feedback.jobEvidence = { linked: !!j.linked, hasResult: !!j.hasResult, experience: String(j.experience || ''), tip: String(j.tip || '') };
    } else feedback.jobEvidence = null;
    feedback.exampleSlots = (Array.isArray(feedback.exampleSlots) ? feedback.exampleSlots : [])
      .filter((s) => s && s.example)
      .map((s) => ({ example: String(s.example), hint: String(s.hint || ''), options: (Array.isArray(s.options) ? s.options : []).map(String).filter(Boolean).slice(0, 3) }))
      .slice(0, 8);

    // 글자 수 맞추기: 다듬은 글이 제한의 80% 미만이거나 넘치면 서버가 세어 보고 다시 고쳐 씀 (2026-10-05)
    if (fw !== 'RESUME' && charLimit && feedback.polishedText) {
      const fx = await fitLength(feedback.polishedText, charLimit, { kind: 'essay', slots: true });
      if (fx) {
        feedback.polishedText = fx.text;
        feedback.exampleSlots = (Array.isArray(fx.exampleSlots) ? fx.exampleSlots : []).filter((s) => s && s.example).map((s) => ({ example: String(s.example), hint: String(s.hint || ''), options: (Array.isArray(s.options) ? s.options : []).map(String).filter(Boolean).slice(0, 3) })).slice(0, 8);
      }
    }
    return res.status(200).json(feedback);
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
