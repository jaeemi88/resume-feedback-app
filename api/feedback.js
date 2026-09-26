// api/feedback.js  ← 자소서·이력서 첨삭 앱 전용 (모의면접 앱과 필드가 다르므로 공유하지 말 것)
// AI 첨삭 초안 생성 서버 함수 (2026-09-26 결격 신호 체크 추가)
// - 모든 요청에 [공통 원칙] + [응답 형식(JSON)] + [피드백 다양화 원칙]을 자동으로 붙임
// - ⚙ 강사 화면의 프리셋에는 "전공별 기준"만 적으면 됨 (화면에서 presetPrompt로 전달됨)
// - 제출할 때마다 예시 영역 / 코칭 렌즈 / 도입 방식을 무작위로 골라 전달

// ───────────────────────────────────────────
// 0. 공통 원칙 (모든 전공·모든 요청에 자동 적용)
// ───────────────────────────────────────────
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
  '장면 묘사형', '숫자 제시형', '질문형', '결론 먼저형', '가치관 한 문장형'
];

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
5. polishedText는 아래 [오늘의 도입 방식]으로 시작하되, 학생 본인의 경험을 살려 재구성한다.
6. 위 원칙은 표현 방식에만 적용하며, 아래 [응답 형식]의 JSON 필드 구성은 반드시 그대로 지킨다.`;


// ───────────────────────────────────────────
// ★ 결격 신호 체크 (2026-09-26 추가 · 모든 요청에 자동 적용)
//   업종 치명타 목록은 원장님 현장 경험에 맞게 자유롭게 고쳐 쓰셔도 됩니다.
// ───────────────────────────────────────────
const RED_FLAG_RULES = `

[결격 신호 체크 — 반드시 수행, 결과는 redFlags 필드에]
면접관이 "이 사람은 걸러야겠다"고 판단할 수 있는 표현을 답변에서 찾는다. 스펙과 내용이 좋아도 이런 신호 하나로 탈락할 수 있다.

■ 공통 결격 신호 6가지 (type에는 아래 이름을 그대로 쓴다)
1. 남 탓·환경 탓: 실패·어려움의 원인을 동료, 조직, 환경, 운으로 돌린다
2. 동료 깎아내리기: 다른 사람을 소극적·무능하게 묘사하며 자신을 부각한다
3. 회사·직무 무관심: 어느 회사에나 쓸 수 있는 지원동기, 회사·직무에 대한 이해가 드러나지 않는다
4. 과장·검증 불가: "최고의", "완벽하게", "누구보다"처럼 확인할 수 없는 자기 과시, 역할에 비해 부풀린 성과
5. 추상적 다짐: 구체적 행동 없이 "최선을 다하겠습니다", "열심히 하겠습니다"로 끝난다
6. 조기 이탈 신호: "경험을 쌓고 싶어서", "집이 가까워서", "안정적이라서"처럼 오래 다니지 않을 것 같은 동기

■ 업종 치명타 (전공·직무·채용공고 정보를 보고 해당하는 그룹 하나만 추가로 점검, type은 "업종: 이름" 형식)
- 보건의료(물리치료·간호·임상병리·보건 등): "업종: 경유지 태도"(다른 병원으로 가기 전 거쳐 가는 곳처럼 읽힘), "업종: 환자보다 내 편의"
- 항공·서비스(객실승무원·호텔·서비스 등): "업종: 원칙 없는 친절"(안전·규정보다 고객 기분을 우선), "업종: 공감만 있고 해결 없음"
- 사무행정·공공기관: "업종: 독불장군"(혼자 결정·팀 무시), "업종: 규정 경시"
- 사회복지·상담(사회복지사·직업상담사 등): "업종: 시혜적 태도"(도와준다·베푼다는 시선), "업종: 비밀보장 경계 모호"
- 제조·기술·방위산업: "업종: 안전절차 경시"(빨리 끝내려고 절차를 생략), "업종: 보안 의식 부족"
- 그 외이거나 전공 정보가 없으면: 공통 6가지만 점검

■ 판정 원칙
- 답변 원문에 실제로 있는 표현만 짚는다. 없는 신호를 억지로 만들지 않는다. 걸리는 것이 없으면 빈 배열 []로 둔다.
- 가장 치명적인 것부터 최대 3개.
- quote: 학생 답변에서 그대로 인용 (40자 이내).
- why: "면접관은 ~로 읽을 수 있어요"처럼 면접관 시점 한 문장. 학생이 위축되지 않게 부드러운 존댓말로.
- fix: 학생 원문의 사실을 살린 대체 문장 한 줄. 없는 경험·수치는 만들지 않는다.
- 이 항목은 기존 JSON 응답에 "추가"되는 필드다. 다른 필드는 원래 지시대로 모두 채운다.

redFlags 형식: [{"type": "유형 이름", "quote": "학생 답변 인용", "why": "면접관 시점 한 문장", "fix": "대체 문장 한 줄"}]`;

// ───────────────────────────────────────────
// 4. 서버 함수 본체
// ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const {
    question, answer, questionType, framework,
    selfIntent, previousAnswer, charLimit,
    presetPrompt, systemPrompt, jobPosting
  } = req.body || {};

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
  "aiTracePhrases": [ { "phrase": "답변에서 그대로 인용한 AI스러운 문구", "note": "왜 그렇게 읽히는지와 대안 한 문장" } ],
  "interviewerInference": "이 답변으로 면접관이 추론할 평소 모습과 입사 후 행동을 한두 문장으로",
  "jobMatch": { "matchLevel": "높음|보통|낮음", "matchedKeywords": ["공고와 일치한 키워드"], "missingKeywords": ["빠진 키워드"] },
  "intentGapComment": "학생이 밝힌 의도와 실제 답변의 차이 (의도가 없으면 null)",
  "revisionComment": "이전 버전 대비 나아진 점과 남은 과제 (이전 버전이 없으면 null)",
  "charLimitNote": "글자수 제한을 넘었을 때 어디를 줄일지 (초과하지 않았으면 null)",
  "missingElements": ["답변에 빠진 핵심 요소"],
  "strengths": "잘된 점 1~2가지를 학생 문장을 인용하며 구체적으로 (2~3문장)",
  "improvements": "개선할 점 1~2가지를 무엇을·어디에·어떻게 형태로 (2~3문장)",
  "polishedText": "학생 원문을 살려 다듬은 완성 문장. 없는 사실은 만들지 말고, 보완이 필요한 자리는 [여기에 ○○ 경험 한 줄]처럼 표시한다. 글자수 제한이 있으면 그 안에서 작성한다.",
  "followUpQuestions": { "reasonType": "왜 그 선택을 했는지 묻는 면접 질문", "alternativeType": "다른 대안은 없었는지 묻는 질문", "quantifyType": "숫자로 설명하게 하는 질문" },
  "redFlags": [ { "type": "결격 신호 유형", "quote": "학생 답변 인용", "why": "면접관 시점 한 문장", "fix": "대체 문장 한 줄" } ]
}
- jobMatch는 채용공고 정보가 없으면 null로 둔다.
- aiTracePhrases, missingElements, redFlags는 해당 사항이 없으면 빈 배열로 둔다.
- strengths, improvements, polishedText, interviewerInference, followUpQuestions는 어떤 경우에도 비워두지 않는다.`;

  const context = `

[문항 유형] ${questionType || '미지정'}
[구조 진단 기준] ${fw}${charLimit ? `\n[글자수 제한] ${charLimit}자` : ''}${jobPosting ? `\n[지원 채용공고]\n${jobPosting}` : ''}${selfIntent ? `\n[학생이 밝힌 의도]\n${selfIntent}` : ''}${previousAnswer ? `\n[이전 버전 답변]\n${previousAnswer}` : ''}`;

  const fullSystem =
    COMMON_RULES +
    (majorRules ? `\n\n[전공별 기준]\n${majorRules}` : '') +
    context +
    formatRules +
    RED_FLAG_RULES +
    DIVERSITY_RULES +
    variety;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // 서버 환경변수 (프론트에 노출 안 됨)
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500 // 결격 신호 항목이 추가되어 2000 → 2500,
        system: fullSystem,
        messages: [
          { role: 'user', content: `[문항]\n${question}\n\n[학생 답변]\n${answer || ''}` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: 'AI 호출 중 오류가 발생했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();

    let feedback;
    try {
      feedback = JSON.parse(clean);
    } catch (e) {
      console.error('JSON 변환 실패:', clean);
      return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.' });
    }

    if (!feedback.frameworkUsed) feedback.frameworkUsed = fw;
    if (!Array.isArray(feedback.redFlags)) feedback.redFlags = [];

    return res.status(200).json(feedback);
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
