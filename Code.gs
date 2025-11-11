/**
 * 용인대학교 교무지원과 AI 챗봇 - Apps Script
 * v2.1 - Hallucination 방지 및 실제 사용자 질문 기반 FAQ
 *
 * 주요 변경사항 (v2.1):
 * - getTopQuestionsFromHistory: QA_이력_상세에서 실제 질문 빈도 집계하여 Top 5 생성
 * - Hallucination 방지: temperature 0.7 → 0.3, 강화된 프롬프트
 * - RAG 컨텍스트 감지 및 엄격한 답변 규칙 적용
 * - 모델 변경: gemini-2.5-flash → gemini-2.0-flash-exp (더 빠르고 효율적)
 * - 문서 기반 답변 시 "문서에 없으면 추측 금지" 명시적 지시
 *
 * 이전 버전 (v2.0):
 * - 의도(intent) 자동 추출 및 분류 (재임용, 휴직, 연구년 등 30+ 패턴)
 * - 엔티티 자동 추출 (기간, 날짜, 저널유형, 직급, 학과, 금액 등)
 * - 향상된 신뢰도(confidence) 계산 (문서 기반, finishReason 고려)
 * - QA_이력_상세 시트에 15개 컬럼 구조화된 로깅
 * - 검색_문서_매핑 시트에 문서 사용 추적
 * - 응답 시간 측정 및 기록
 * - 사용자 이메일 및 역할 추적
 * - 호환성: 기존 QA_이력 시트도 지원
 */

// ==================== 상수 정의 ====================
const CONFIG = {
  // FAQ 설정
  DEFAULT_FAQ_LIMIT: 5,
  SAMPLE_FAQ_COUNT: 5,

  // 문서 검색 설정
  MAX_DOCUMENTS_PER_FOLDER: 3,
  MAX_SEARCH_KEYWORDS: 10,
  MAX_DOCUMENT_CONTENT_LENGTH: 5000,  // 문서 내용 최대 길이 (토큰 제한 고려)

  // Gemini API 설정
  GEMINI_MODEL: 'gemini-2.0-flash-exp',  // Hallucination 방지를 위해 2.0-flash-exp 사용
  GEMINI_TEMPERATURE: 0.3,  // Hallucination 방지를 위해 0.7 → 0.3으로 낮춤
  GEMINI_MAX_TOKENS: 1500,  // 더 상세한 답변을 위해 증가

  // 기본 이메일
  DEFAULT_ADMIN_EMAIL: 'admin@university.ac.kr',
  DEFAULT_ESCALATION_EMAIL: 'support@university.ac.kr',

  // 로그 설정
  LOG_TEXT_MAX_LENGTH: 50,
  DEBUG_MODE: false  // true로 설정하면 상세 로그 출력
};

// ==================== 설정 ====================
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    geminiApiKey: props.getProperty('GEMINI_API_KEY'),
    adminEmail: props.getProperty('ADMIN_EMAIL') || CONFIG.DEFAULT_ADMIN_EMAIL,
    escalationEmail: props.getProperty('ESCALATION_EMAIL') || CONFIG.DEFAULT_ESCALATION_EMAIL,
    folders: {
      '규정집': props.getProperty('FOLDER_규정집'),
      '상위법': props.getProperty('FOLDER_상위법'),
      '내부결재문서': props.getProperty('FOLDER_내부결재문서'),
      'QA이력': props.getProperty('FOLDER_QA이력')
    }
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
        source: 'sample',
        debug: 'SPREADSHEET_ID not configured'
      };
    }

    const ss = SpreadsheetApp.openById(config.spreadsheetId);

    // 1단계: QA_이력_상세에서 실제 질문 빈도 집계
    const topQuestions = getTopQuestionsFromHistory(ss, limit);

    if (topQuestions && topQuestions.length > 0) {
      Logger.log('✅ 실제 질문 빈도 기반 Top ' + topQuestions.length + '개 반환');
      return {
        success: true,
        faqs: topQuestions,
        source: 'real-data'
      };
    }

    // 2단계: QA_이력_상세가 없으면 자주묻는질문_FAQ 시트에서 가져오기
    const sheet = ss.getSheetByName('자주묻는질문_FAQ');

    if (!sheet) {
      Logger.log('⚠️ FAQ 시트를 찾을 수 없음');
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (시트 없음)',
        source: 'sample',
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
        source: 'sample',
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
      source: 'sample',
      debug: error.toString()
    };
  }
}

// QA_이력_상세에서 질문 빈도를 집계하여 Top N 추출
function getTopQuestionsFromHistory(spreadsheet, limit = CONFIG.DEFAULT_FAQ_LIMIT) {
  try {
    const qaSheet = spreadsheet.getSheetByName('QA_이력_상세');

    if (!qaSheet) {
      Logger.log('QA_이력_상세 시트 없음');
      return null;
    }

    const data = qaSheet.getDataRange().getValues();

    // 최소 2행 이상 있어야 함 (헤더 + 데이터 1개 이상)
    if (data.length < 2) {
      Logger.log('QA_이력_상세에 데이터 없음');
      return null;
    }

    // 질문별 빈도 집계 (질문 정규화: 소문자, 공백 제거)
    const questionCounts = {};
    const questionDetails = {}; // 원본 질문과 답변 저장

    // 헤더 제외하고 집계 (1행부터)
    // QA_이력_상세 컬럼: [타임스탬프, 세션ID, 이메일, 역할, 질문, 의도, 엔티티, 문서, 답변, ...]
    for (let i = 1; i < data.length; i++) {
      const question = data[i][4]; // 5번째 컬럼: 질문
      const answer = data[i][8];   // 9번째 컬럼: 답변

      if (!question || typeof question !== 'string') continue;

      // 질문 정규화 (대소문자 통일, 앞뒤 공백 제거)
      const normalizedQuestion = question.trim().toLowerCase();

      if (normalizedQuestion.length < 2) continue; // 너무 짧은 질문 제외

      // 빈도 증가
      if (!questionCounts[normalizedQuestion]) {
        questionCounts[normalizedQuestion] = 0;
        questionDetails[normalizedQuestion] = {
          original: question.trim(),
          answer: answer || '답변 준비 중입니다.'
        };
      }
      questionCounts[normalizedQuestion]++;
    }

    // 빈도순으로 정렬
    const sortedQuestions = Object.keys(questionCounts).sort(function(a, b) {
      return questionCounts[b] - questionCounts[a];
    });

    // 상위 N개 추출
    const topFAQs = [];
    for (let i = 0; i < Math.min(limit, sortedQuestions.length); i++) {
      const normalizedQ = sortedQuestions[i];
      const details = questionDetails[normalizedQ];

      topFAQs.push({
        question: details.original,
        answer: details.answer,
        category: '자주 묻는 질문',
        count: questionCounts[normalizedQ]  // 질문 횟수 포함
      });
    }

    Logger.log('✅ QA_이력_상세에서 Top ' + topFAQs.length + '개 추출 완료');
    return topFAQs;

  } catch (error) {
    Logger.log('getTopQuestionsFromHistory 오류: ' + error.toString());
    return null;
  }
}

// 샘플 FAQ 데이터
function getSampleFAQs(limit = CONFIG.SAMPLE_FAQ_COUNT) {
  const allFaqs = [
    {
      question: '재임용 심사 기준은 무엇인가요?',
      answer: '재임용 심사는 교육, 연구, 봉사 영역을 종합적으로 평가합니다.',
      category: '인사'
    },
    {
      question: '휴직 신청은 어떻게 하나요?',
      answer: '휴직 신청서를 작성하여 소속 학과를 거쳐 교무처에 제출하시면 됩니다.',
      category: '인사'
    },
    {
      question: '연구년 신청 자격은 어떻게 되나요?',
      answer: '전임교원으로 6년 이상 재직하신 경우 신청 가능합니다.',
      category: '연구'
    },
    {
      question: '승진임용 절차가 궁금합니다',
      answer: '승진임용은 연구, 교육, 봉사 실적을 기반으로 심사위원회에서 평가합니다.',
      category: '인사'
    },
    {
      question: '출장 복명서는 언제까지 제출하나요?',
      answer: '출장 종료 후 7일 이내에 복명서를 제출해주시기 바랍니다.',
      category: '행정'
    }
  ];

  return allFaqs.slice(0, limit);
}

// ==================== 채팅 처리 ====================
function handleChat(params) {
  const startTime = new Date();

  try {
    const question = params.question || '';
    const sessionId = params.sessionId || '';
    const userRole = params.userRole || 'student';
    const userEmail = params.userEmail || '';
    const useRAG = params.useRAG === 'true';  // RAG 사용 여부 확인

    Logger.log('=== handleChat 시작 ===');
    Logger.log('Question: ' + question);
    Logger.log('SessionId: ' + sessionId);
    Logger.log('UserEmail: ' + userEmail);
    Logger.log('UserRole: ' + userRole);
    Logger.log('useRAG: ' + useRAG);

    if (!question) {
      return {
        success: false,
        error: '질문을 입력해주세요.'
      };
    }

    // 민감정보 필터링
    const sensitiveCheck = checkSensitiveInfo(question);
    if (!sensitiveCheck.safe) {
      return {
        success: false,
        error: '⚠️ ' + sensitiveCheck.message,
        filtered: true
      };
    }

    const config = getConfig();

    // 1. 의도 및 엔티티 추출
    const intent = extractIntent(question);
    const entities = extractEntities(question);
    infoLog('추출된 의도: ' + intent);
    infoLog('추출된 엔티티: ' + JSON.stringify(entities));

    // 2. 문서 검색 (RAG 사용 시 건너뜀 - 중복 방지)
    const documents = useRAG ? [] : searchDocuments(question, config);
    if (useRAG) {
      Logger.log('RAG 사용 중 - Apps Script 문서 검색 건너뜀');
    } else {
      Logger.log('일반 모드 - Apps Script 문서 검색 수행: ' + documents.length + '개');
    }

    // 3. Gemini로 답변 생성
    const answer = generateAnswer(question, documents, config);

    // 4. 응답 시간 계산
    const endTime = new Date();
    const responseTimeSeconds = (endTime - startTime) / 1000;
    infoLog('응답 시간: ' + responseTimeSeconds.toFixed(2) + '초');

    // 5. 메시지 ID 생성
    const messageId = generateMessageId();

    // 6. 로그 저장 (모든 메타데이터 포함)
    logQA({
      sessionId: sessionId,
      userEmail: userEmail,
      userRole: userRole,
      question: question,
      intent: intent,
      entities: entities,
      documents: documents,
      answer: answer.text,
      confidence: answer.confidence,
      responseTime: responseTimeSeconds,
      messageId: messageId,
      escalation: 'N'
    }, config);

    return {
      success: true,
      answer: answer.text,
      sources: answer.sources,
      confidence: answer.confidence,
      messageId: messageId,
      intent: intent,
      responseTime: responseTimeSeconds
    };

  } catch (error) {
    Logger.log('❌ handleChat 오류: ' + error.toString());

    // 오류 발생 시에도 응답 시간 계산
    const endTime = new Date();
    const responseTimeSeconds = (endTime - startTime) / 1000;

    return {
      success: false,
      error: '답변 생성 중 오류가 발생했습니다: ' + error.message,
      responseTime: responseTimeSeconds
    };
  }
}

// [이하 코드 계속 - 다음 부분]
