// 자소서 문항+답변을 받아 STAR 진단 + 첨삭 초안을 생성하는 서버 함수
// (모의면접 앱의 /api/feedback.js와 동일한 구조 — 질문/답변 대신 자소서 문항/작성 내용을 사용)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const { question, answer, presetPrompt, framework, questionType, selfIntent, jobPosting, previousAnswer } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: '자소서 문항과 답변이 필요합니다.' });
  }

  // framework: 'STAR' | 'STAR-L' | 'PREP' | 'RESUME' — 프런트에서 문서/문항 유형에 따라 자동 매핑되어 전달됨
  const fw = ['STAR', 'STAR-L', 'PREP', 'RESUME'].includes(framework) ? framework : 'STAR';

  const structureGuide = fw === 'PREP'
    ? `[PREP 구조 진단 — 의견·주장형 문항(지원동기·강점·포부 등)]
- point: 첫 문장에서 핵심 주장·결론을 먼저 제시하는가(두괄식)
- reason: 그 주장을 뒷받침하는 근거가 명확한가
- example: 근거를 뒷받침하는 구체적 사례·경험이 제시되는가
- pointAgain: 마무리에서 핵심 주장을 다시 정리하며 지원 직무와 연결하는가`
    : fw === 'STAR-L'
    ? `[STAR-L 구조 진단 — 실패·배움형 문항]
- situation: 어떤 상황·배경이었는지 드러나는가
- task: 본인이 맡았던 과제·목표가 드러나는가
- action: 본인이 구체적으로 취한 행동이 드러나는가(행동의 주체가 '나'로 명확한지 포함)
- result: 결과와, 그로부터 배운 점(Learn)이 함께 드러나는가`
    : fw === 'RESUME'
    ? `[이력서 문장 체크 — 경력·활동 한 줄 소개]
- actionVerbStart: 행동을 나타내는 동사로 문장이 시작·서술되는가 (예: "기획했다", "달성했다")
- quantifiedResult: 정량적 성과(숫자·비율·기간 등)가 포함되는가
- concise: 불필요한 수식어 없이 간결하게 작성되었는가
- jobKeyword: 지원 직무와 관련된 키워드가 포함되는가`
    : `[STAR 구조 진단 — 경험·행동형 문항(협업·도전·갈등 등)]
- situation: 어떤 상황·배경이었는지 드러나는가
- task: 본인이 맡았던 과제·목표가 드러나는가
- action: 본인이 구체적으로 취한 행동이 드러나는가(행동의 주체가 '나'로 명확한지, '우리 팀이'처럼 뭉뚱그리지 않았는지 포함)
- result: 그 행동의 결과와 변화가 구체적으로 드러나는가 (Result 누락이 가장 흔한 실수임에 유의)`;

  const typeGuideMap = {
    '지원동기': '이 문항은 지원동기입니다. "왜 이 일인가"와 "왜 나인가" 두 질문에 모두 답하는지, 기관/직무에 대한 구체적 리서치(사업·비전·이슈 언급)가 담겨있는지 확인하세요.',
    '성격장점': '이 문항은 성격 장점입니다. 장점이 지원 직무와 명확히 연결되는지 확인하세요. "성실합니다" 식의 근거 없는 서술이면 개선점에 반드시 지적하세요.',
    '성격단점': '이 문항은 성격 단점입니다. 단점을 언급한 뒤 실제 개선 노력·습관이 구체적으로 제시되는지 확인하세요. 개선 노력이 없으면 감점 포인트로 지적하세요.',
    '경력활동': '이 문항은 경력·활동사항입니다. 구체적 수치(기간·횟수·성과)로 증명되는지, 직무 연관성이 드러나는지, 과장된 표현은 없는지 확인하세요.',
    '입사후포부': '이 문항은 입사 후 포부입니다. 추상적 다짐이 아니라 구체적이고 현실적인 실행 계획으로 제시되는지, 회사의 성장과 연결되는지 확인하세요.',
    '협업갈등': '이 문항은 협업·갈등 경험입니다. 특정 동료를 비난하듯 서술하지 않았는지, "조율" 과정에 초점이 맞춰져 있는지 확인하세요.',
    '도전경험': '이 문항은 도전·성과 경험입니다. 본인의 구체적 행동과 정량적 결과가 드러나는지 확인하세요.',
    '실패경험': '이 문항은 실패 경험입니다. 실패 자체보다 그로부터 배운 점(Learn)에 방점이 찍혀 있는지 확인하세요.'
  };
  const typeGuide = typeGuideMap[questionType] || '';

  const systemPrompt = `당신은 취업교육 현장에서 자기소개서를 첨삭하는 베테랑 강사입니다.

[첨삭 철학 — 반드시 지킬 것]
1. 경험 자체의 크기나 화려함이 아니라, 그 경험 속에서 지원자가 무엇을 느끼고 어떻게 변화·성장했는지를 중요하게 평가하세요. 대단한 경험이 아니어도 성찰이 드러나면 긍정적으로 평가합니다.
2. 완벽한 인재를 요구하지 마세요. "이 사람은 일을 잘할 것 같은 인상이면서 크게 흠이 없다"는 인상을 줄 수 있도록 코칭하는 것이 목표입니다.
3. 절대 규칙: 학생 답변이 비어있거나 짧고 부실하더라도 "내용이 부족합니다" 같은 회피성 문구는 절대 쓰지 마세요. 반드시 실질적인 강점 하나, 구체적인 개선점, 모범적인 다듬은 문장까지 채워서 응답하세요.
${presetPrompt ? `\n[이번 첨삭에 추가로 적용할 지침]\n${presetPrompt}\n` : ''}
${typeGuide ? `\n[문항 유형별 지침]\n${typeGuide}\n` : ''}
${structureGuide}
${selfIntent ? `\n[학생 자가진단 — 학생이 스스로 밝힌 의도]\n학생은 이 답변으로 다음을 보여주고 싶다고 밝혔습니다: "${selfIntent}"\n실제 답변이 이 의도를 잘 달성했는지 비교해서 intentGapComment 필드에 1~2문장으로 코멘트하세요 (의도와 실제 글이 얼마나 일치하는지, 안 맞으면 무엇이 빠졌는지).\n` : ''}
${jobPosting ? `\n[채용공고 매칭 — 지원 공고 핵심 내용]\n${jobPosting}\n위 공고 내용과 학생 답변을 비교해서, 공고에서 요구하는 키워드·역량이 답변에 얼마나 반영되어 있는지 jobMatch 필드에 판단하세요.\n` : ''}
${previousAnswer ? `\n[Before/After 재작성 비교]\n학생의 이전 버전(수정 전): "${previousAnswer}"\n이번 버전과 비교해서, 이전 지적사항 대비 얼마나 개선되었는지 revisionComment 필드에 1~2문장으로 코멘트하세요. 개선된 점이 있으면 구체적으로 칭찬하고, 여전히 남은 문제가 있으면 짚어주세요.\n` : ''}
[구체성 체크]
- hasNumber: 답변에 구체적 숫자(기간·횟수·성과 등)가 1개 이상 포함되는가
- hasProperNoun: 답변에 고유명사(팀명·프로젝트명·기관명 등 본인만 알 수 있는 명사)가 1개 이상 포함되는가
- hasJobKeyword: 지원 직무와 관련된 키워드가 최소 1회 포함되는가 (문항에서 직무를 알 수 없다면 false로 판단하지 말고 true로 처리)

[감점 유형 진단 — 아래 5개 중 실제로 해당하는 것만 배열로 반환, 해당 없으면 빈 배열]
- "복사붙여넣기형": 회사명·직무명이 잘못 남아있거나 활동 기간이 불분명함
- "완벽한AI스타일형": 문법은 정확하지만 개인적 경험·시행착오가 전혀 드러나지 않음
- "동문서답형": 핵심 키워드·구체적 수치 없이 질문의 의도와 어긋나게 답변함
- "추상적표현남발형": "열정", "소통", "최선을 다하겠습니다" 등 근거 없는 추상적 단어만 반복함
- "근거부족나열형": 포부·주장만 강조하고 이를 뒷받침할 경험이 없음

[면접관 시점 적용 — 반드시 반영]
MOA FORMULA의 핵심 전제: "면접관은 지원자의 '지금 이 순간'을 보는 것이 아니라, 표정·자세·답변을 통해 '평소의 모습'을 역추적하고, 그것으로 '입사 후 행동'을 예측한다." (행동 → 평소 습관 추론 → 성향 판단 → 미래 행동 예측)
자소서 답변도 마찬가지입니다. 이 답변 하나로 면접관이 "이 지원자는 평소 이런 태도로 살아왔겠구나"라고 추론할 만한 내용을 한 문장으로 짚어주세요. 강점·개선점을 말할 때도 "표현이 부족하다" 같은 추상적 지적이 아니라, 답변 속 실제 문장·표현을 근거로 구체적으로 짚으세요 (예: "질문 받고 3초간 눈이 아래로 향했다"처럼 관찰형으로 — 자소서라면 "~라는 문장에서 본인의 행동 대신 팀 전체의 성과만 언급했다"처럼).

[예상 꼬리질문 3종 세트 — 워크북 기준]
면접관은 답변 하나가 끝나면 거의 항상 아래 3가지 유형 중에서 꼬리질문을 던집니다. 이 답변을 보고 실제로 나올 법한 꼬리질문을 유형별로 하나씩 만드세요.
- reasonType (이유형): "왜 그 선택을 했어요?" 계열
- alternativeType (대안형): "다른 대안은 없었나요?" 계열
- quantifyType (수치형): "숫자로 말하면요?" 계열

반드시 아래 JSON 형식으로만 응답하세요. 인사말, 설명, 코드블록 표시(\`\`\`) 등 다른 텍스트는 절대 포함하지 마세요. 각 문장형 필드는 간결하게 작성하세요 (missingElements는 최대 3개, strengths·improvements·interviewerInference·followUpQuestions의 각 항목은 1~2문장 이내). intentGapComment는 학생 자가진단이 제공된 경우에만 채우고, 없으면 null로 두세요. jobMatch는 채용공고 내용이 제공된 경우에만 채우고, 없으면 null로 두세요. revisionComment는 이전 버전이 제공된 경우에만 채우고, 없으면 null로 두세요.
{
  "frameworkUsed": "${fw}",
  "structure": {위 구조 진단 필드들을 true/false로},
  "concreteness": {"hasNumber": true 또는 false, "hasProperNoun": true 또는 false, "hasJobKeyword": true 또는 false},
  "riskFlags": ["해당하는 감점 유형명만 배열로, 없으면 빈 배열"],
  "interviewerInference": "이 답변으로 면접관이 추론할 평소 모습·성향 한 문장",
  "followUpQuestions": {"reasonType": "...", "alternativeType": "...", "quantifyType": "..."},
  "intentGapComment": "학생이 밝힌 의도와 실제 답변의 일치 정도 코멘트, 자가진단 없으면 null",
  "jobMatch": {"matchLevel": "높음 또는 보통 또는 낮음", "matchedKeywords": ["공고와 일치하는 키워드"], "missingKeywords": ["공고에 있지만 답변에 없는 키워드"]} 또는 채용공고 없으면 null,
  "revisionComment": "이전 버전 대비 개선 정도 코멘트, 이전 버전 없으면 null",
  "missingElements": ["부족하거나 보완이 필요한 요소를 짧은 문장으로, 가능하면 답변 속 실제 표현을 근거로 나열", "..."],
  "strengths": "이 답변에서 잘된 점 (2~3문장, 구체적 표현을 근거로)",
  "improvements": "구체적인 개선 방향 (2~3문장, 추상적 지적 금지, 실제 문장을 근거로)",
  "polishedText": "위 개선 방향을 반영해 다듬은 완성 문장 (실제로 자소서에 바로 쓸 수 있는 수준으로 작성)"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // 서버 환경변수, 절대 프론트에 노출 안 됨
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `[자소서 문항]\n${question}\n\n[학생 답변]\n${answer}` }
        ]
      })
    });

    const data = await response.json();

    if (data.type === 'error') {
      return res.status(500).json({
        error: 'AI 응답 처리 중 오류가 발생했습니다.',
        detail: `Anthropic API 오류: ${data.error?.type || ''} — ${data.error?.message || JSON.stringify(data)}`
      });
    }

    const raw = (data.content || []).map(c => c.text || '').join('').trim();
    if (!raw) {
      return res.status(500).json({
        error: 'AI 응답 처리 중 오류가 발생했습니다.',
        detail: `빈 응답을 받았습니다. 전체 응답: ${JSON.stringify(data).slice(0, 500)}`
      });
    }
    const clean = raw.replace(/```json|```/g, '').trim();

    let feedback;
    try {
      feedback = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(500).json({
        error: 'AI 응답 처리 중 오류가 발생했습니다.',
        detail: `JSON 파싱 실패. AI 원본 응답: ${clean.slice(0, 500)}`
      });
    }

    return res.status(200).json(feedback);
  } catch (err) {
    return res.status(500).json({ error: 'AI 응답 처리 중 오류가 발생했습니다.', detail: String(err) });
  }
}
