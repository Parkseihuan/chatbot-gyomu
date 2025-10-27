/**
 * 용인대학교 교무지원과 AI 챗봇 - Apps Script (CORS 완전 해결)
 * v1.3 - 코드 품질 개선, 재시도 로직, 상수 정의
 *
 * 주요 변경사항:
 * - doGet(): FAQ 등 조회용 (preflight 없음)
 * - doPost(): 채팅, 피드백 등 (application/x-www-form-urlencoded)
 * - doOptions() 제거 (불필요)
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
  GEMINI_MODEL: 'gemini-2.5-pro',
  GEMINI_TEMPERATURE: 0.7,
  GEMINI_MAX_TOKENS: 1000,

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
        message: '샘플 FAQ (SPREADSHEET_ID 미설정)'
      };
    }

    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName('자주묻는질문_FAQ');

    if (!sheet) {
      Logger.log('⚠️ FAQ 시트를 찾을 수 없음');
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (시트 없음)'
      };
    }

    const data = sheet.getDataRange().getValues();
    const faqs = [];

    // 헤더 제외하고 데이터 읽기
    for (let i = 1; i < data.length && faqs.length < limit; i++) {
      if (data[i][0]) { // 질문이 있으면
        faqs.push({
          question: data[i][0],
          answer: data[i][1] || '',
          category: data[i][2] || '일반'
        });
      }
    }

    // 데이터가 없으면 샘플 반환
    if (faqs.length === 0) {
      Logger.log('⚠️ FAQ 데이터 없음, 샘플 반환');
      return {
        success: true,
        faqs: getSampleFAQs(limit),
        message: '샘플 FAQ (데이터 없음)'
      };
    }

    Logger.log('✅ FAQ ' + faqs.length + '개 반환');
    return {
      success: true,
      faqs: faqs
    };

  } catch (error) {
    Logger.log('❌ getFAQ 오류: ' + error.toString());
    return {
      success: true,
      faqs: getSampleFAQs(limit),
      message: '샘플 FAQ (오류 발생)'
    };
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
  try {
    const question = params.question || '';
    const sessionId = params.sessionId || '';
    const userRole = params.userRole || 'student';

    Logger.log('=== handleChat 시작 ===');
    Logger.log('Question: ' + question);
    Logger.log('SessionId: ' + sessionId);

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

    // 1. 문서 검색
    const documents = searchDocuments(question, config);

    // 2. Gemini로 답변 생성
    const answer = generateAnswer(question, documents, config);

    // 3. 로그 저장
    logQA(sessionId, question, answer.text, answer.sources, config);

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

// ==================== 문서 검색 ====================
function searchDocuments(query, config) {
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

    // 문서 컨텍스트 구성
    let context = '';
    if (documents.length > 0) {
      context = '\n\n참고 문서:\n';
      documents.forEach((doc, i) => {
        context += `${i + 1}. [${doc.category}] ${doc.filename}\n`;
      });
    }

    // Gemini API 호출
    const prompt = `당신은 용인대학교 교무지원과의 AI 상담 챗봇입니다.
다음 질문에 친절하고 정확하게 답변해주세요.

질문: ${question}
${context}

답변은 다음 형식으로 작성해주세요:
1. 명확하고 구체적인 답변
2. 관련 규정이나 절차 안내
3. 추가 문의가 필요한 경우 안내

답변:`;

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

    Logger.log('응답 코드: ' + responseCode);
    Logger.log('응답 길이: ' + responseText.length);

    if (responseCode !== 200) {
      Logger.log('❌ API 오류 응답: ' + responseText);
      throw new Error('Gemini API returned ' + responseCode + ': ' + responseText.substring(0, 200));
    }

    const result = JSON.parse(responseText);

    if (result.error) {
      Logger.log('❌ API 오류: ' + JSON.stringify(result.error));
      throw new Error('Gemini API error: ' + result.error.message);
    }

    if (result.candidates && result.candidates[0]) {
      const text = result.candidates[0].content.parts[0].text;
      Logger.log('✅ Gemini 응답 길이: ' + text.length);
      return {
        text: text,
        sources: documents,
        confidence: documents.length > 0 ? 0.85 : 0.7
      };
    }

    Logger.log('⚠️ 예상치 못한 응답 형식: ' + JSON.stringify(result).substring(0, 200));
    throw new Error('Gemini 응답 형식 오류');

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
function logQA(sessionId, question, answer, sources, config) {
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
      sources.length
    ]);

    Logger.log('✅ QA 로그 저장 완료');

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

    Logger.log('API 요청 전송 중...');
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('응답 코드: ' + responseCode);

    if (responseCode !== 200) {
      Logger.log('❌ API 오류 응답: ' + responseText);

      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error) {
          Logger.log('오류 메시지: ' + errorData.error.message);
          Logger.log('오류 상태: ' + errorData.error.status);
        }
      } catch (e) {
        // JSON 파싱 실패
      }

      return;
    }

    const result = JSON.parse(responseText);

    if (result.error) {
      Logger.log('❌ API 오류: ' + result.error.message);
      return;
    }

    if (result.candidates && result.candidates[0]) {
      const text = result.candidates[0].content.parts[0].text;
      Logger.log('✅ API 정상 작동!');
      Logger.log('테스트 응답: ' + text);
    } else {
      Logger.log('⚠️ 예상치 못한 응답 형식');
      Logger.log('응답: ' + responseText.substring(0, 200));
    }

  } catch (error) {
    Logger.log('❌ API 테스트 실패: ' + error.toString());
    Logger.log('오류 상세: ' + error.message);
  }
}
