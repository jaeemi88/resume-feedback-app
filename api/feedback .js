// api/feedback.js
// AI 피드백 생성 서버 함수 (공통 원칙 + 피드백 다양화 버전)
// - 모든 요청에 [공통 원칙]과 [피드백 다양화 원칙]을 자동으로 붙임
// - ⚙ 설정의 프리셋에는 "전공별 기준"만 적으면 됨
// - 제출할 때마다 예시 영역 / 코칭 렌즈 / 도입 방식을 무작위로 골라 전달

// ───────────────────────────────────────────
// 0. 공통 원칙 (모든 전공·모든 요청에 자동 적용)
// ───────────────────────────────────────────
const COMMON_RULES = `■ 공통 원칙 (면접관 시점)
- 학생 원문에 없는 경험·수치·사실은 절대 추가하지 않는다. 보완이 필요하면 "어느 문장 뒤에, 어떤 종류의 실제 경험을 넣으면 좋은지"를 구체적으로 안내한다.
- 채용은 뛰어난 인재를 골라내는 과정이라기보다, 결격사유가 있는 지원자를 걸러내고 남은 사람을 뽑는 과정이라는 관점으로 본다. 면접관은 모험하지 않고 최대한 보수적으로 판단한다.
- 면접관은 과거 경험으로 입사 후 행동을 예측한다. 각 경험이 "이 사람은 같은 상황에서 이렇게 행동하겠구나"라는 믿을 만한 예측으로 이어지는지 점검한다.
- 결격사유로 읽힐 수 있는 표현을 가장 먼저 찾아 짚고 순화안을 제시한다. (예: 책임을 남이나 환경 탓으로 돌리는 표현, 불평·부정적 감정 노출, 잦은 중도 포기, 조직·규칙에 대한 반감, 검증할 수 없는 과장)
- 튀는 표현이나 과한 자기 과시보다, 신뢰감·안정감·꾸준함이 드러나는 쪽으로 다듬는다. "일을 잘할 것 같고 크게 흠이 없는 사람"으로 읽히는 것이 목표다.
- 경험의 규모보다, 그 경험에서 느끼고 변화·성장한 점이 드러났는지를 본다.`;

// ───────────────────────────────────────────
// 1. 다양화 재료 (전공·과정에 맞게 자유롭게 수정하세요)
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
// 2. 피드백 다양화 원칙 (모든 요청에 자동 추가)
// ───────────────────────────────────────────
const DIVERSITY_RULES = `

[피드백 다양화 원칙]
목적: 같은 과정의 학생들이 결과를 서로 비교해도 "복사한 듯한" 느낌이 들지 않게 한다.
코칭 방향(평가 철학·기준)은 모든 학생에게 동일하게 유지하되,
표현·예시·비유·문장 구성은 학생마다 반드시 다르게 작성한다.

1. 학생 고유 재료에서 출발
- 모든 항목은 학생 답변 속 구체적인 단어·경험·장면·수치를 최소 1개 이상 직접 언급하며 시작한다.
- 답변과 무관한 일반론으로 시작하지 않는다.

2. 비유·예시는 [오늘의 예시 영역]에서 가져온다
- 아래 [오늘의 예시 영역]을 활용해 비교나 비유를 1개 이상 쓴다.
- 한 피드백 안에서 같은 비유를 두 번 쓰지 않는다.

3. 개선점의 첫 포인트는 [오늘의 코칭 렌즈]로 잡는다
- 아래 렌즈를 개선점의 첫 번째 관점으로 삼고, 나머지는 자유롭게 보완한다.

4. 상투 표현 금지
- 다음 문장은 쓰지 않는다: "전반적으로 잘 작성되었습니다", "~하면 더 좋을 것 같습니다",
  "구체적인 사례를 추가하세요", "자신감 있게 말하세요", "진정성이 느껴집니다".
- 대신 "무엇을, 어느 문장 뒤에, 어떻게" 넣을지 콕 집어 제시한다.

5. 다듬은 문장은 [오늘의 도입 방식]으로 시작한다
- 학생 본인의 경험을 살려 재구성하고, 정해진 템플릿 문장을 쓰지 않는다.

6. 답변이 짧거나 다른 학생과 비슷할 때
- 회피 문구 없이 모든 필드를 실질적인 내용으로 채운다.
- 학생의 전공·지원 직무·이름 등 입력 정보가 있으면 적극 활용해 차별화한다.

7. 위 원칙은 표현 방식에만 적용하며, 응답 형식(JSON 필드 구성)은 기존 지시를 그대로 따른다.`;

// ───────────────────────────────────────────
// 3. 서버 함수 본체
// ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const { question, answer, systemPrompt } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: '질문(문항) 내용이 없습니다.' });
  }

  // 이번 요청의 다양화 재료 (매번 무작위)
  const variety = `

[오늘의 예시 영역] ${pick(DOMAINS)}
[오늘의 코칭 렌즈] ${pick(LENSES)}
[오늘의 도입 방식] ${pick(OPENERS)}`;

  const majorRules = (systemPrompt || '').trim();
  const fullSystem =
    COMMON_RULES +
    (majorRules ? `\n\n[전공별 기준]\n${majorRules}` : '') +
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
        max_tokens: 1500,
        system: fullSystem,
        messages: [
          { role: 'user', content: `[질문]\n${question}\n\n[답변]\n${answer || ''}` }
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

    return res.status(200).json(feedback);
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
