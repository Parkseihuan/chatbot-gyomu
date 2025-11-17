/**
 * 용인대학교 교무지원과 AI 챗봇 - Apps Script
 * v2.1 - Hallucination 방지 및 FAQ 컬럼 구조 수정
 *
 * 주요 변경사항 (v2.1):
 * - FAQ 시트 컬럼 구조 수정: [순위, 질문, 답변, 카테고리, 조회수, 평균평점]
 * - getTopQuestionsFromHistory: QA_이력_상세 시트 지원 (15개 컬럼 구조)
 * - Hallucination 방지: temperature 0.7 → 0.3
 * - 모델 변경: gemini-2.5-pro → gemini-2.0-flash-exp (더 빠르고 효율적)
 * - RAG 컨텍스트 감지 및 엄격한 답변 규칙 적용
 * - 문서 기반 답변 시 "문서에 없으면 추측 금지" 명시적 지시
 *
 * 이전 버전 (v1.3):
 * - doGet(): FAQ 등 조회용 (preflight 없음)
 * - doPost(): 채팅, 피드백 등 (application/x-www-form-urlencoded)
 * - 상수 정의 및 매직 넘버 제거
 * - 에러 처리 개선
 */

// ==================== 상수 정의 ====================
const CONFIG = {
  // FAQ 설정
  DEFAULT_FAQ_LIMIT: 5,
  SAMPLE_FAQ_COUNT: 5,

  // 문서 검색 설정
  MAX_DOCUMENTS_PER_FOLDER: 3,
  MAX_SEARCH_KEYWORDS: 10,

  // Gemini API 설정
  GEMINI_MODEL: 'gemini-2.0-flash-exp',  // Hallucination 방지를 위해 gemini-2.5-pro에서 변경
  GEMINI_TEMPERATURE: 0.3,  // Hallucination 방지를 위해 0.7 → 0.3으로 낮춤
  GEMINI_MAX_TOKENS: 1500,  // 더 상세한 답변을 위해 1000 → 1500으로 증가

  // 기본 이메일
  DEFAULT_ADMIN_EMAIL: 'admin@university.ac.kr',
  DEFAULT_ESCALATION_EMAIL: 'support@university.ac.kr',

  // 로그 설정
  LOG_TEXT_MAX_LENGTH: 50,
  DEBUG_MODE: false,  // true로 설정하면 상세 로그 출력

  // 교무지원과 연락처 정보 (실제 정보로 수정 필요!)
  ORG_INFO: {
    NAME: '용인대학교 교무지원과',
    PHONE: '031-8020-2992 또는 031-8020-2544',  // TODO: 실제 전화번호로 수정
    EMAIL: 'psh@yongin.ac.kr',  // TODO: 실제 이메일로 수정
    LOCATION: '본관 3층 교무지원과',  // TODO: 실제 위치로 수정
    WORKING_HOURS: '평일 09:00~17:00 (점심시간 12:00~13:00)'
  }
};

// ==================== 설정 ====================
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    geminiApiKey: props.getProperty('GEMINI_API_KEY'),
    adminEmail: props.getProperty('ADMIN_EMAIL') || CONFIG.DEFAULT_ADMIN_EMAIL,
    escalationEmail: props.getProperty('ESCALATION_EMAIL') || CONFIG.DEFAULT_ESCALATION_EMAIL
    // 참고: 문서 검색은 Cloud Run RAG API가 담당 (Google Drive 폴더 설정 불필요)
  };
}

// 디버그 로그 함수 (DEBUG_MODE가 true일 때만 로그 출력)
function debugLog(message) {
  if (CONFIG.DEBUG_MODE) {
    Logger.log('[DEBUG] ' + message);
  }
}

// 정보 로그 함수 (항상 출력)
function infoLog(message) {
  Logger.log('[INFO] ' + message);
}

// 오류 로그 함수 (항상 출력)
function errorLog(message) {
  Logger.log('[ERROR] ' + message);
}

// ==================== GET 요청 핸들러 ====================
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';

    Logger.log('=== doGet 시작 ===');
    Logger.log('Action: ' + action);
    Logger.log('Params: ' + JSON.stringify(params));

    // CORS 헤더 설정
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);

    // 액션별 처리
    if (action === 'getFAQ') {
      const limit = parseInt(params.limit) || 5;
      const result = getFAQ(limit);
      return output.setContent(JSON.stringify(result));
    }

    if (action === 'test') {
      return output.setContent(JSON.stringify({
        success: true,
        message: '🎓 용인대학교 교무지원과 AI 챗봇 API\n\n✅ API 상태: 정상 작동 중',
        timestamp: new Date().toISOString()
      }));
    }

    // 기본 응답 (루트 접근)
    return output.setContent(JSON.stringify({
      success: true,
      message: '🎓 용인대학교 교무지원과 AI 챗봇 API\n\n✅ API 상태: 정상 작동 중',
      endpoints: {
        'GET ?action=getFAQ&limit=5': 'FAQ 조회',
        'POST action=chat': '챗봇 질문',
        'POST action=feedback': '피드백 전송',
        'POST action=escalate': '담당자 연결'
      }
    }));

  } catch (error) {
    Logger.log('doGet 오류: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== POST 요청 핸들러 ====================
function doPost(e) {
  try {
    // application/x-www-form-urlencoded 파라미터 추출
    let params = e.parameter || {};

    // 만약 JSON으로 보낸 경우도 처리 (호환성)
    if ((!params || Object.keys(params).length === 0) && e.postData) {
      if (e.postData.type === 'application/json') {
        try {
          params = JSON.parse(e.postData.contents);
        } catch (err) {
          Logger.log('JSON 파싱 실패: ' + err);
        }
      }
    }

    const action = params.action || '';

    Logger.log('=== doPost 시작 ===');
    Logger.log('Action: ' + action);
    Logger.log('Params: ' + JSON.stringify(params));

    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);

    // 액션별 처리
    if (action === 'chat') {
      const result = handleChat(params);
      return output.setContent(JSON.stringify(result));
    }

    if (action === 'feedback') {
      const result = handleFeedback(params);
      return output.setContent(JSON.stringify(result));
    }

    if (action === 'escalate') {
      const result = handleEscalation(params);
      return output.setContent(JSON.stringify(result));
    }

    // 알 수 없는 액션
    return output.setContent(JSON.stringify({
      success: false,
      error: 'Unknown action: ' + action
    }));

  } catch (error) {
    Logger.log('doPost 오류: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== FAQ 조회 ====================
function getFAQ(limit = CONFIG.DEFAULT_FAQ_LIMIT) {
  try {
    Logger.log('=== getFAQ 시작 ===');
    Logger.log('Limit: ' + limit);

    const config = getConfig();

    if (!config.spreadsheetId) {
      Logger.log('⚠️ SPREADSHEET_ID가 설정되지 않음');
      // 샘플 데이터 반환
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (SPREADSHEET_ID 미설정)',
        debug: 'SPREADSHEET_ID not configured'
      };
    }

    const ss = SpreadsheetApp.openById(config.spreadsheetId);

    // 1단계: QA_이력에서 실제 질문 빈도 집계
    const topQuestions = getTopQuestionsFromHistory(ss, limit);

    if (topQuestions && topQuestions.length > 0) {
      Logger.log('✅ 실제 질문 빈도 기반 Top ' + topQuestions.length + '개 반환');
      return {
        success: true,
        faqs: topQuestions,
        source: 'real-data'
      };
    }

    // 2단계: QA_이력이 없으면 FAQ 시트에서 가져오기
    const sheet = ss.getSheetByName('자주묻는질문_FAQ');

    if (!sheet) {
      Logger.log('⚠️ FAQ 시트를 찾을 수 없음');
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (시트 없음)',
        debug: 'Sheet not found'
      };
    }

    const data = sheet.getDataRange().getValues();
    const faqs = [];

    // 헤더 제외하고 데이터 읽기
    // 컬럼 구조: [순위, 질문, 답변, 카테고리, 조회수, 평균평점]
    for (let i = 1; i < data.length && faqs.length < limit; i++) {
      if (data[i][1]) { // 질문 컬럼 (두 번째 컬럼)이 있으면
        faqs.push({
          question: data[i][1],  // 두 번째 컬럼: 질문
          answer: data[i][2] || '',  // 세 번째 컬럼: 답변
          category: data[i][3] || '일반'  // 네 번째 컬럼: 카테고리
        });
      }
    }

    // 데이터가 없으면 샘플 반환
    if (faqs.length === 0) {
      Logger.log('⚠️ FAQ 데이터 없음, 샘플 반환');
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (데이터 없음)',
        debug: 'No data in sheet'
      };
    }

    Logger.log('✅ FAQ 시트에서 ' + faqs.length + '개 반환');
    return {
      success: true,
      faqs: faqs,
      source: 'faq-sheet'
    };

  } catch (error) {
    Logger.log('❌ getFAQ 오류: ' + error.toString());
    return {
      success: true,
      faqs: getSampleFAQs(limit),
      message: '샘플 FAQ (오류 발생)',
      debug: error.toString()
    };
  }
}

// QA_이력에서 질문 빈도 + 신뢰도를 복합 집계하여 Top N 추출
function getTopQuestionsFromHistory(spreadsheet, limit = CONFIG.DEFAULT_FAQ_LIMIT) {
  try {
    // QA_이력 시트 사용 (신뢰도 포함)
    const qaSheet = spreadsheet.getSheetByName('QA_이력');

    if (!qaSheet) {
      Logger.log('QA_이력 시트 없음');
      return null;
    }

    const data = qaSheet.getDataRange().getValues();

    // 최소 2행 이상 있어야 함 (헤더 + 데이터 1개 이상)
    if (data.length < 2) {
      Logger.log('QA_이력에 데이터 없음');
      return null;
    }

    // 질문별 빈도 및 신뢰도 집계
    const questionStats = {};
    const questionDetails = {};

    // 헤더 제외하고 집계 (1행부터)
    // QA_이력 컬럼: [타임스탬프, 세션ID, 질문, 답변, 출처, 출처수, 신뢰도]
    for (let i = 1; i < data.length; i++) {
      const question = data[i][2]; // 3번째 컬럼: 질문
      const answer = data[i][3];   // 4번째 컬럼: 답변
      const confidence = parseFloat(data[i][6]) || 0.5;  // 7번째 컬럼: 신뢰도

      if (!question || typeof question !== 'string') continue;

      // 질문 정규화 (대소문자 통일, 앞뒤 공백 제거)
      const normalizedQuestion = question.trim().toLowerCase();

      // ========== FAQ 필터링 규칙 ==========
      // 1. 너무 짧은 질문 제외 (5자 미만)
      if (normalizedQuestion.length < 5) continue;

      // 2. 너무 긴 질문 제외 (RAG 컨텍스트 포함 가능성)
      if (normalizedQuestion.length > 200) continue;

      // 3. RAG 컨텍스트가 포함된 질문 제외
      if (normalizedQuestion.includes('다음 문서를 참고') ||
          normalizedQuestion.includes('[문서 1]') ||
          normalizedQuestion.includes('[문서 2]')) continue;

      // 4. 교무/학사 관련 키워드가 없는 질문 제외
      const validKeywords = ['재임용', '휴직', '출장', '복명', '승진', '임용', '연구년',
                             '강의', '학점', '성적', '규정', '절차', '신청', '제출',
                             '심사', '평가', '기준', '자격', '요건', '서류', '양식',
                             '교원', '교수', '학과', '학부', '대학원', '학기', '학년',
                             '정년', '퇴직', '비전임', '전임', '채용'];

      const hasValidKeyword = validKeywords.some(keyword => normalizedQuestion.includes(keyword));

      // 5. 일반적인 질문 형태인지 확인 (물음표 또는 ~요, ~까요 등으로 끝남)
      const isQuestionFormat = normalizedQuestion.includes('?') ||
                               normalizedQuestion.endsWith('요') ||
                               normalizedQuestion.endsWith('까요') ||
                               normalizedQuestion.endsWith('나요') ||
                               normalizedQuestion.endsWith('습니다');

      // 유효한 키워드가 있거나 질문 형태인 경우만 포함
      if (!hasValidKeyword && !isQuestionFormat) continue;

      // ========== FAQ 필터링 끝 ==========

      // 통계 집계
      if (!questionStats[normalizedQuestion]) {
        questionStats[normalizedQuestion] = {
          count: 0,
          totalConfidence: 0
        };
        questionDetails[normalizedQuestion] = {
          original: question.trim(),
          answer: answer || '답변 준비 중입니다.'
        };
      }
      questionStats[normalizedQuestion].count++;
      questionStats[normalizedQuestion].totalConfidence += confidence;
    }

    // 복합 점수 계산 및 정렬
    // 점수 = 빈도 * 평균신뢰도 (빈도와 신뢰도 모두 고려)
    const scoredQuestions = Object.keys(questionStats).map(function(q) {
      const stats = questionStats[q];
      const avgConfidence = stats.totalConfidence / stats.count;
      const compositeScore = stats.count * avgConfidence;

      return {
        normalized: q,
        count: stats.count,
        avgConfidence: avgConfidence,
        score: compositeScore
      };
    });

    // 복합 점수순으로 정렬
    scoredQuestions.sort(function(a, b) {
      return b.score - a.score;
    });

    // 상위 N개 추출
    const topFAQs = [];
    for (let i = 0; i < Math.min(limit, scoredQuestions.length); i++) {
      const scored = scoredQuestions[i];
      const details = questionDetails[scored.normalized];

      topFAQs.push({
        question: details.original,
        answer: details.answer,
        category: '자주 묻는 질문',
        count: scored.count,
        avgConfidence: Math.round(scored.avgConfidence * 100) / 100,
        score: Math.round(scored.score * 100) / 100
      });
    }

    Logger.log('✅ QA_이력에서 Top ' + topFAQs.length + '개 추출 완료 (빈도+신뢰도 복합 기준)');
    return topFAQs;

  } catch (error) {
    Logger.log('getTopQuestionsFromHistory 오류: ' + error.toString());
    return null;
  }
}

// 샘플 FAQ 데이터 (교원인사규정 기반)
function getSampleFAQs(limit = CONFIG.SAMPLE_FAQ_COUNT) {
  const allFaqs = [
    {
      question: '승진임용에 필요한 최소 재직 기간은 어떻게 되나요?',
      answer: '교원인사규정에 따른 승진임용 최소 재직 기간:\n\n• 조교수 → 부교수: 4~6년 (임용 시기에 따라 상이)\n• 부교수 → 교수: 5~7년 (임용 시기에 따라 상이)\n\n※ 징계처분 또는 직위해제 기간 중에는 승진심사 대상에서 제외됩니다.',
      category: '인사'
    },
    {
      question: '재임용 심사는 언제, 어떻게 진행되나요?',
      answer: '재임용 심사 절차:\n\n1. 임용기간 만료 4개월 전: 대학에서 교원에게 통보\n2. 통보 후 15일 이내: 교원이 재임용 심사 신청\n3. 심사 기준: 교육, 연구, 학생지도, 관련 법규 준수 여부\n\n※ 재임용 거부 시 이의신청 절차가 있습니다.',
      category: '인사'
    },
    {
      question: '신규 교원 채용 절차는 어떻게 되나요?',
      answer: '신규 교원 임용은 3단계 심사를 거칩니다:\n\n1. 기초심사: 자격요건 확인\n2. 전공심사: 학문적 우수성 평가\n3. 대면심사: 자격 적합성 평가\n\n※ 모집공고는 임용 15일 전에 공고되며, 학기 초에 임용됩니다.\n※ 동일 대학 학사 출신자가 채용단위의 2/3를 초과할 수 없습니다.',
      category: '인사'
    },
    {
      question: '교원의 정년은 몇 세인가요?',
      answer: '교원인사규정에 따른 정년:\n\n• 정년 나이: 만 65세\n• 명예퇴직: 20년 이상 재직 시 신청 가능\n\n정년퇴직은 정년이 도래하는 학기말에 시행됩니다.',
      category: '인사'
    },
    {
      question: '비전임교원의 종류는 무엇이 있나요?',
      answer: '교원인사규정상 비전임교원 종류:\n\n• 연구강의교원\n• 강의중심교원\n• 실기교원\n• 연구중심교원\n• 산학협력교원\n\n각 직종별 임용 자격과 계약 조건이 다르며, 세부사항은 교원인사규정을 참고하시기 바랍니다.',
      category: '인사'
    }
  ];

  return allFaqs.slice(0, limit);
}

// ==================== 채팅 처리 ====================
function handleChat(params) {
  try {
    const question = params.question || '';
    const originalQuestion = params.originalQuestion || question;  // 원본 질문 (RAG 컨텍스트 없는 버전)
    const sessionId = params.sessionId || '';
    const userRole = params.userRole || 'student';
    const useRAG = params.useRAG === 'true';  // RAG 사용 여부 확인

    Logger.log('=== handleChat 시작 ===');
    Logger.log('Question: ' + question.substring(0, 100) + (question.length > 100 ? '...' : ''));
    Logger.log('Original Question: ' + originalQuestion);
    Logger.log('SessionId: ' + sessionId);
    Logger.log('useRAG: ' + useRAG);

    if (!question) {
      return {
        success: false,
        error: '질문을 입력해주세요.'
      };
    }

    // 민감정보 필터링 (원본 질문 기준)
    const sensitiveCheck = checkSensitiveInfo(originalQuestion);
    if (!sensitiveCheck.safe) {
      return {
        success: false,
        error: '⚠️ ' + sensitiveCheck.message,
        filtered: true
      };
    }

    const config = getConfig();

    // 1. 문서 검색은 Cloud Run RAG API가 담당
    // 프론트엔드에서 RAG 컨텍스트를 question에 포함하여 전송
    const documents = [];  // RAG API가 이미 문서를 검색했으므로 빈 배열
    Logger.log('문서 검색: Cloud Run RAG API 사용 (useRAG=' + useRAG + ')');

    // 2. Gemini로 답변 생성
    const answer = generateAnswer(question, documents, config);

    // 3. 로그 저장 (원본 질문만 저장 - FAQ 오염 방지, 신뢰도 포함)
    logQA(sessionId, originalQuestion, answer.text, answer.sources, config, answer.confidence);

    return {
      success: true,
      answer: answer.text,
      sources: answer.sources,
      confidence: answer.confidence,
      messageId: generateMessageId()
    };

  } catch (error) {
    Logger.log('❌ handleChat 오류: ' + error.toString());
    return {
      success: false,
      error: '답변 생성 중 오류가 발생했습니다: ' + error.message
    };
  }
}

// ==================== 문서 검색 (DEPRECATED) ====================
// ⚠️ 이 함수는 더 이상 사용되지 않습니다.
// 문서 검색은 Cloud Run RAG API가 담당합니다.
// 향후 버전에서 제거될 예정입니다.
function searchDocuments(query, config) {
  Logger.log('⚠️ searchDocuments는 deprecated됨. Cloud Run RAG API를 사용하세요.');
  const documents = [];

  try {
    if (!config.folders || Object.keys(config.folders).length === 0) {
      Logger.log('⚠️ 폴더 ID가 설정되지 않음');
      return documents;
    }

    const keywords = extractKeywords(query);
    Logger.log('검색 키워드: ' + keywords.join(', '));

    // 각 폴더에서 검색
    for (const [category, folderId] of Object.entries(config.folders)) {
      if (!folderId) continue;

      try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.searchFiles(
          keywords.map(k => `fullText contains "${k}"`).join(' or ')
        );

        let count = 0;
        while (files.hasNext() && count < CONFIG.MAX_DOCUMENTS_PER_FOLDER) {
          const file = files.next();
          documents.push({
            filename: file.getName(),
            category: category,
            url: file.getUrl(),
            id: file.getId()
          });
          count++;
        }
      } catch (err) {
        Logger.log('폴더 검색 오류 (' + category + '): ' + err);
      }
    }

    Logger.log('검색된 문서: ' + documents.length + '개');

  } catch (error) {
    Logger.log('문서 검색 오류: ' + error.toString());
  }

  return documents;
}

// 키워드 추출
function extractKeywords(text) {
  // 간단한 키워드 추출 (실제로는 더 정교한 방법 사용 가능)
  const keywords = [];
  const terms = ['재임용', '휴직', '연구년', '승진', '임용', '복직', '출장', '연구비', '강의'];

  for (const term of terms) {
    if (text.includes(term)) {
      keywords.push(term);
    }
  }

  return keywords.length > 0 ? keywords : ['일반'];
}

// ==================== Gemini 답변 생성 ====================
function generateAnswer(question, documents, config) {
  try {
    if (!config.geminiApiKey) {
      Logger.log('⚠️ Gemini API 키가 없음, 기본 답변 반환');
      return {
        text: '죄송합니다. 현재 AI 답변 생성 기능이 설정되지 않았습니다.\n\n담당자에게 문의하시거나 관련 규정을 확인해주세요.',
        sources: documents,
        confidence: 0.5
      };
    }

    // RAG 컨텍스트 감지 (프론트엔드가 RAG 컨텍스트를 질문에 포함시킴)
    const hasRAGContext = question.includes('다음 문서를 참고하여');

    // 문서 컨텍스트 구성
    let context = '';
    if (documents.length > 0) {
      context = '\n\n참고 문서:\n';
      documents.forEach((doc, i) => {
        context += `${i + 1}. [${doc.category}] ${doc.filename}\n`;
      });
    }

    // Gemini API 호출 - Hallucination 방지를 위한 강화된 프롬프트
    let prompt;

    // 연락처 정보 문자열 생성
    const contactInfo = `
📞 교무지원과 연락처:
- 전화: ${CONFIG.ORG_INFO.PHONE}
- 이메일: ${CONFIG.ORG_INFO.EMAIL}
- 위치: ${CONFIG.ORG_INFO.LOCATION}
- 업무시간: ${CONFIG.ORG_INFO.WORKING_HOURS}`;

    if (hasRAGContext) {
      // RAG 컨텍스트가 있는 경우: 반드시 문서 내용만 사용
      prompt = `당신은 ${CONFIG.ORG_INFO.NAME}의 AI 상담 챗봇입니다.

⚠️ **중요 지침**:
1. 아래 제공된 문서 내용만을 기반으로 답변하세요
2. 문서에 없는 내용은 절대 추측하거나 만들어내지 마세요
3. 확실하지 않으면 "제공된 문서에서 해당 정보를 찾을 수 없습니다"라고 답변하세요
4. 답변할 때 문서의 구체적인 내용을 인용하세요
5. 추가 문의 안내 시 아래 연락처를 정확히 사용하세요:
${contactInfo}

${question}

답변 형식:
- 문서 내용을 기반으로 한 명확한 답변
- 관련 절차나 규정이 있다면 구체적으로 명시
- 추가 문의 시 위의 연락처 정보를 포함

답변:`;
    } else {
      // 일반 모드: 기본 프롬프트
      prompt = `당신은 ${CONFIG.ORG_INFO.NAME}의 AI 상담 챗봇입니다.
다음 질문에 친절하고 정확하게 답변해주세요.

📌 교무지원과 연락처 (추가 문의 시 안내):
${contactInfo}

질문: ${question}
${context}

답변은 다음 형식으로 작성해주세요:
1. 명확하고 구체적인 답변
2. 관련 규정이나 절차 안내
3. 추가 문의 시 위의 연락처 정보를 정확히 포함

**주의**: 확실하지 않은 내용은 추측하지 말고, 위의 연락처로 문의하도록 안내하세요.

답변:`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`;

    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: CONFIG.GEMINI_TEMPERATURE,
        maxOutputTokens: CONFIG.GEMINI_MAX_TOKENS
      }
    };

    Logger.log('=== Gemini API 호출 ===');
    Logger.log('URL: ' + url.substring(0, 80) + '...');
    Logger.log('Prompt 길이: ' + prompt.length);

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    infoLog('응답 코드: ' + responseCode);
    infoLog('응답 길이: ' + responseText.length);

    if (responseCode !== 200) {
      errorLog('API 오류 응답: ' + responseText);
      throw new Error('Gemini API returned ' + responseCode + ': ' + responseText.substring(0, 200));
    }

    const result = JSON.parse(responseText);

    // 디버그: 전체 응답 구조 로깅
    debugLog('전체 응답: ' + JSON.stringify(result));
    infoLog('응답 구조: candidates=' + (result.candidates ? '존재' : '없음') +
            ', promptFeedback=' + (result.promptFeedback ? '존재' : '없음'));

    // 에러 체크
    if (result.error) {
      errorLog('API 오류: ' + JSON.stringify(result.error));
      throw new Error('Gemini API error: ' + result.error.message);
    }

    // promptFeedback이 있으면 차단된 것일 수 있음
    if (result.promptFeedback && result.promptFeedback.blockReason) {
      errorLog('프롬프트 차단됨: ' + result.promptFeedback.blockReason);
      throw new Error('프롬프트가 차단되었습니다: ' + result.promptFeedback.blockReason);
    }

    // candidates 체크 및 안전한 접근
    if (result.candidates && Array.isArray(result.candidates) && result.candidates.length > 0) {
      const candidate = result.candidates[0];

      // content 체크
      if (!candidate.content) {
        errorLog('candidate에 content가 없음: ' + JSON.stringify(candidate));
        throw new Error('응답에 content가 없습니다. finishReason: ' + (candidate.finishReason || 'unknown'));
      }

      // parts 체크
      if (!candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        errorLog('content에 parts가 없음: ' + JSON.stringify(candidate.content));
        throw new Error('응답에 parts가 없습니다');
      }

      // text 추출
      const text = candidate.content.parts[0].text;

      if (!text) {
        errorLog('parts[0]에 text가 없음: ' + JSON.stringify(candidate.content.parts[0]));
        throw new Error('응답에 텍스트가 없습니다');
      }

      infoLog('✅ Gemini 응답 성공 (길이: ' + text.length + ')');
      return {
        text: text,
        sources: documents,
        confidence: documents.length > 0 ? 0.85 : 0.7
      };
    }

    // 예상치 못한 응답 형식
    errorLog('예상치 못한 응답 형식: ' + JSON.stringify(result));
    throw new Error('Gemini 응답 형식 오류: candidates가 없거나 비어있음');

  } catch (error) {
    Logger.log('❌ Gemini API 오류: ' + error.toString());
    Logger.log('오류 상세: ' + JSON.stringify(error));

    // 기본 답변 반환 (오류 정보 포함)
    return {
      text: `질문을 확인했습니다.\n\n현재 AI 답변 생성에 문제가 있습니다.\n\n가능한 원인:\n1. Gemini API 키가 설정되지 않았거나 유효하지 않음\n2. API 할당량 초과\n3. 네트워크 오류\n\n담당자에게 문의하시거나 관련 문서를 참고해주세요.\n\n[디버깅 정보: ${error.message || error.toString()}]`,
      sources: documents,
      confidence: 0.5
    };
  }
}

// ==================== 피드백 처리 ====================
function handleFeedback(params) {
  try {
    const sessionId = params.sessionId || '';
    const messageId = params.messageId || '';
    const feedback = params.feedback || ''; // 'positive' or 'negative'
    const rating = parseInt(params.rating) || 0;
    const comment = params.comment || '';

    Logger.log('=== handleFeedback 시작 ===');
    Logger.log('Feedback: ' + feedback);
    Logger.log('Rating: ' + rating);

    const config = getConfig();

    if (!config.spreadsheetId) {
      return { success: true, message: '피드백이 저장되었습니다.' };
    }

    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName('피드백_상세');

    if (sheet) {
      sheet.appendRow([
        new Date(),
        sessionId,
        messageId,
        feedback,
        rating,
        comment
      ]);
    }

    Logger.log('✅ 피드백 저장 완료');

    return {
      success: true,
      message: '피드백을 주셔서 감사합니다!'
    };

  } catch (error) {
    Logger.log('❌ handleFeedback 오류: ' + error.toString());
    return {
      success: false,
      error: '피드백 저장 중 오류가 발생했습니다.'
    };
  }
}

// ==================== 에스컬레이션 처리 ====================
function handleEscalation(params) {
  try {
    const sessionId = params.sessionId || '';
    const question = params.question || '';
    const userEmail = params.userEmail || '';
    const userPhone = params.userPhone || '';

    Logger.log('=== handleEscalation 시작 ===');
    Logger.log('Question: ' + question);

    const config = getConfig();

    // 에스컬레이션 로그 저장
    if (config.spreadsheetId) {
      const ss = SpreadsheetApp.openById(config.spreadsheetId);
      const sheet = ss.getSheetByName('에스컬레이션_티켓');

      if (sheet) {
        const ticketId = 'T' + Date.now();
        sheet.appendRow([
          new Date(),
          ticketId,
          sessionId,
          question,
          userEmail,
          userPhone,
          '접수',
          ''
        ]);

        Logger.log('✅ 에스컬레이션 티켓 생성: ' + ticketId);
      }
    }

    // 담당자에게 이메일 발송 (선택사항)
    try {
      if (config.escalationEmail) {
        MailApp.sendEmail({
          to: config.escalationEmail,
          subject: '[용인대학교 교무지원과 챗봇] 새로운 상담 요청',
          body: `새로운 상담 요청이 접수되었습니다.\n\n질문: ${question}\n연락처: ${userEmail}\n전화: ${userPhone}\n세션: ${sessionId}`
        });
      }
    } catch (err) {
      Logger.log('이메일 발송 실패: ' + err);
    }

    return {
      success: true,
      message: '담당자에게 연결 요청이 전송되었습니다. 곧 연락드리겠습니다.'
    };

  } catch (error) {
    Logger.log('❌ handleEscalation 오류: ' + error.toString());
    return {
      success: false,
      error: '담당자 연결 요청 중 오류가 발생했습니다.'
    };
  }
}

// ==================== 민감정보 필터링 ====================
function checkSensitiveInfo(text) {
  const patterns = [
    // 주민등록번호 (6자리-7자리 또는 13자리 연속)
    { regex: /\d{6}[- ]?\d{7}/, name: '주민등록번호' },

    // 신용카드번호 (4자리씩 4그룹)
    { regex: /\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}/, name: '카드번호' },

    // 한국 휴대폰 번호 (010, 011, 016, 017, 018, 019로 시작)
    { regex: /\b01[0-9][- ]?\d{3,4}[- ]?\d{4}\b/, name: '휴대폰번호' },

    // 계좌번호 (10자리 이상 연속 숫자)
    { regex: /\b\d{10,14}\b/, name: '계좌번호 (의심)' },

    // 여권번호 (M 또는 S로 시작하는 8-9자리)
    { regex: /\b[MS]\d{8}\b/, name: '여권번호' },

    // 이메일 주소 (단, 담당자 연결 시에는 필요하므로 컨텍스트 고려 필요)
    // 일반 질문에서는 차단하지만, 에스컬레이션에서는 허용
    // { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, name: '이메일 주소' },

    // 학번/사번 (8-10자리 숫자, 단 전화번호와 중복 가능하므로 주의)
    { regex: /\b(20\d{6}|19\d{6})\b/, name: '학번/사번 (의심)' }
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      Logger.log('⚠️ 민감정보 감지: ' + pattern.name);

      // 민감정보 로그 저장
      try {
        const config = getConfig();
        if (config.spreadsheetId) {
          const ss = SpreadsheetApp.openById(config.spreadsheetId);
          const sheet = ss.getSheetByName('민감정보_로그');
          if (sheet) {
            sheet.appendRow([
              new Date(),
              pattern.name,
              '질문 차단',
              text.substring(0, CONFIG.LOG_TEXT_MAX_LENGTH) + '...'
            ]);
          }
        }
      } catch (err) {
        Logger.log('민감정보 로그 저장 실패: ' + err);
      }

      return {
        safe: false,
        message: `${pattern.name}와 같은 민감한 개인정보는 입력하지 말아주세요.`
      };
    }
  }

  return { safe: true };
}

// ==================== QA 로그 저장 ====================
function logQA(sessionId, question, answer, sources, config, confidence = 0.5) {
  try {
    if (!config.spreadsheetId) return;

    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName('QA_이력');

    if (!sheet) return;

    const sourcesText = sources.map(s => s.filename).join(', ');

    sheet.appendRow([
      new Date(),
      sessionId,
      question,
      answer,
      sourcesText,
      sources.length,
      confidence  // 신뢰도 추가
    ]);

    Logger.log('✅ QA 로그 저장 완료 (신뢰도: ' + confidence + ')');

  } catch (error) {
    Logger.log('QA 로그 저장 실패: ' + error.toString());
  }
}

// ==================== 유틸리티 ====================
function generateMessageId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== 테스트 함수들 ====================
function testConfig() {
  const config = getConfig();
  Logger.log('=== 설정 확인 ===');
  Logger.log('SPREADSHEET_ID: ' + (config.spreadsheetId ? '✅ 설정됨' : '❌ 없음'));
  Logger.log('GEMINI_API_KEY: ' + (config.geminiApiKey ? '✅ 설정됨' : '❌ 없음'));
  Logger.log('ADMIN_EMAIL: ' + config.adminEmail);
  Logger.log('Folders: ' + JSON.stringify(config.folders));
}

function testFAQ() {
  Logger.log('=== FAQ 테스트 ===');
  const result = getFAQ(5);
  Logger.log('FAQ 반환: ' + result.faqs.length + '개');
  if (result.success) {
    Logger.log('✅ FAQ 테스트 성공: ' + result.faqs.length + '개 반환');
  } else {
    Logger.log('❌ FAQ 테스트 실패');
  }
}

function testChatbot() {
  Logger.log('=== 챗봇 테스트 ===');
  const result = handleChat({
    question: '재임용 심사 기준은 무엇인가요?',
    sessionId: 'test_session_' + Date.now(),
    userRole: 'faculty'
  });

  if (result.success) {
    Logger.log('✅ 챗봇 테스트 성공');
    Logger.log('답변: ' + result.answer);
  } else {
    Logger.log('❌ 챗봇 테스트 실패: ' + result.error);
  }
}

// Gemini API 키 테스트
function testGeminiKey() {
  const config = getConfig();

  Logger.log('=== Gemini API 키 확인 ===');
  Logger.log('API 키 존재: ' + (config.geminiApiKey ? 'YES' : 'NO'));

  if (!config.geminiApiKey) {
    Logger.log('❌ GEMINI_API_KEY가 스크립트 속성에 설정되지 않았습니다!');
    Logger.log('');
    Logger.log('설정 방법:');
    Logger.log('1. 프로젝트 설정 (톱니바퀴 아이콘)');
    Logger.log('2. 스크립트 속성 섹션');
    Logger.log('3. "속성 추가" 클릭');
    Logger.log('4. 속성: GEMINI_API_KEY');
    Logger.log('5. 값: [Gemini API 키]');
    Logger.log('6. "스크립트 속성 저장"');
    return;
  }

  Logger.log('API 키 형식: ' + config.geminiApiKey.substring(0, 10) + '...');
  Logger.log('API 키 길이: ' + config.geminiApiKey.length);

  // 간단한 테스트 요청
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`;

    const payload = {
      contents: [{
        parts: [{
          text: '안녕하세요. 간단히 인사해주세요.'
        }]
      }],
      generationConfig: {
        temperature: CONFIG.GEMINI_TEMPERATURE,
        maxOutputTokens: 100
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    infoLog('API 요청 전송 중...');
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    infoLog('응답 코드: ' + responseCode);
    infoLog('응답 길이: ' + responseText.length);

    if (responseCode !== 200) {
      errorLog('API 오류 응답: ' + responseText);

      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error) {
          errorLog('오류 메시지: ' + errorData.error.message);
          errorLog('오류 상태: ' + errorData.error.status);
        }
      } catch (e) {
        // JSON 파싱 실패
      }

      return;
    }

    const result = JSON.parse(responseText);

    // 디버그: 전체 응답 로깅
    debugLog('전체 응답: ' + JSON.stringify(result));
    infoLog('응답 구조: candidates=' + (result.candidates ? '존재' : '없음') +
            ', promptFeedback=' + (result.promptFeedback ? '존재' : '없음'));

    if (result.error) {
      errorLog('API 오류: ' + result.error.message);
      return;
    }

    // promptFeedback 체크
    if (result.promptFeedback && result.promptFeedback.blockReason) {
      errorLog('프롬프트 차단됨: ' + result.promptFeedback.blockReason);
      errorLog('전체 promptFeedback: ' + JSON.stringify(result.promptFeedback));
      return;
    }

    // candidates 안전 체크
    if (result.candidates && Array.isArray(result.candidates) && result.candidates.length > 0) {
      const candidate = result.candidates[0];

      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        errorLog('응답 형식 오류: ' + JSON.stringify(candidate));
        return;
      }

      const text = candidate.content.parts[0].text;
      infoLog('✅ API 정상 작동!');
      infoLog('테스트 응답: ' + text);
    } else {
      errorLog('예상치 못한 응답 형식');
      errorLog('전체 응답: ' + responseText);
    }

  } catch (error) {
    Logger.log('❌ API 테스트 실패: ' + error.toString());
    Logger.log('오류 상세: ' + error.message);
  }
}
