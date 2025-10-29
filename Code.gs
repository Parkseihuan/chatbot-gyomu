/**
 * 용인대학교 교무지원과 AI 챗봇 - Apps Script
 * v2.0 - 향상된 구조화된 로깅 및 분석 기능
 *
 * 주요 변경사항 (v2.0):
 * - 의도(intent) 자동 추출 및 분류 (재임용, 휴직, 연구년 등 30+ 패턴)
 * - 엔티티 자동 추출 (기간, 날짜, 저널유형, 직급, 학과, 금액 등)
 * - 향상된 신뢰도(confidence) 계산 (문서 기반, finishReason 고려)
 * - QA_이력_상세 시트에 15개 컬럼 구조화된 로깅
 * - 검색_문서_매핑 시트에 문서 사용 추적
 * - 응답 시간 측정 및 기록
 * - 사용자 이메일 및 역할 추적
 * - 호환성: 기존 QA_이력 시트도 지원
 *
 * 이전 버전 (v1.3):
 * - doGet(): FAQ 등 조회용 (preflight 없음)
 * - doPost(): 채팅, 피드백 등 (application/x-www-form-urlencoded)
 * - 상수 정의 및 매직 넘버 제거
 * - 에러 처리 개선
 * - 문서 내용 읽기 (RAG 구현)
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
  GEMINI_MODEL: 'gemini-2.5-flash',  // fast and efficient
  GEMINI_TEMPERATURE: 0.7,
  GEMINI_MAX_TOKENS: 8000,  // gemini-2.5-flash는 thinking 토큰 사용량이 적음

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
  const startTime = new Date();

  try {
    const question = params.question || '';
    const sessionId = params.sessionId || '';
    const userRole = params.userRole || 'student';
    const userEmail = params.userEmail || '';

    Logger.log('=== handleChat 시작 ===');
    Logger.log('Question: ' + question);
    Logger.log('SessionId: ' + sessionId);
    Logger.log('UserEmail: ' + userEmail);
    Logger.log('UserRole: ' + userRole);

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

    // 2. 문서 검색
    const documents = searchDocuments(question, config);

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

          // 문서 내용 읽기
          const content = readDocumentContent(file);

          documents.push({
            filename: file.getName(),
            category: category,
            url: file.getUrl(),
            id: file.getId(),
            content: content  // 실제 문서 내용 추가!
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

// ==================== 의도 추출 ====================
function extractIntent(text) {
  // 의도 분류 규칙 정의 (우선순위 순)
  const intentPatterns = [
    // 재임용 관련
    { pattern: /(재임용).*(연구|실적|논문|저널|SSCI|SCIE|KCI)/i, intent: '재임용_연구실적문의' },
    { pattern: /(재임용).*(교육|강의|수업)/i, intent: '재임용_교육실적문의' },
    { pattern: /(재임용).*(기준|요건|조건)/i, intent: '재임용_기준문의' },
    { pattern: /재임용/i, intent: '재임용_일반문의' },

    // 휴직/복직 관련
    { pattern: /(휴직).*(신청|절차|방법)/i, intent: '휴직신청' },
    { pattern: /(출산|육아|간병).*(휴직)/i, intent: '휴직_출산육아' },
    { pattern: /(복직).*(신청|절차)/i, intent: '복직신청' },
    { pattern: /휴직/i, intent: '휴직_일반문의' },

    // 연구년 관련
    { pattern: /(연구년).*(신청|자격|조건)/i, intent: '연구년신청' },
    { pattern: /연구년/i, intent: '연구년_일반문의' },

    // 승진/임용 관련
    { pattern: /(승진).*(임용|심사|기준)/i, intent: '승진임용문의' },
    { pattern: /(정년보장).*(심사|트랙)/i, intent: '정년보장심사문의' },
    { pattern: /(비전임|겸임|초빙).*(임용)/i, intent: '비전임교원임용' },

    // 출장 관련
    { pattern: /(출장).*(신청|절차)/i, intent: '출장신청' },
    { pattern: /(출장).*(복명|보고)/i, intent: '출장복명서' },
    { pattern: /출장/i, intent: '출장_일반문의' },

    // 연구비 관련
    { pattern: /(연구비).*(집행|사용|정산)/i, intent: '연구비집행' },
    { pattern: /(연구비).*(신청|지원)/i, intent: '연구비신청' },
    { pattern: /연구비/i, intent: '연구비_일반문의' },

    // 강의 관련
    { pattern: /(강의).*(시수|부담|배정)/i, intent: '강의시수문의' },
    { pattern: /(강의).*(평가|결과)/i, intent: '강의평가문의' },
    { pattern: /강의/i, intent: '강의_일반문의' },

    // 급여/복지 관련
    { pattern: /(급여|봉급|연봉).*(지급|명세)/i, intent: '급여문의' },
    { pattern: /(4대보험|건강보험|국민연금)/i, intent: '복지문의' },

    // 학사 관련
    { pattern: /(학생).*(상담|지도)/i, intent: '학생지도' },
    { pattern: /(성적).*(입력|수정|정정)/i, intent: '성적처리' },

    // 인사 관련
    { pattern: /(근무시간|출퇴근|근태)/i, intent: '근무시간문의' },
    { pattern: /(증명서).*(발급|신청)/i, intent: '증명서발급' },

    // 일반 문의
    { pattern: /(규정|규칙|지침)/i, intent: '규정문의' },
    { pattern: /(서식|양식|서류)/i, intent: '서식문의' }
  ];

  // 패턴 매칭을 통한 의도 추출
  for (const item of intentPatterns) {
    if (item.pattern.test(text)) {
      debugLog('의도 추출 성공: ' + item.intent);
      return item.intent;
    }
  }

  // 매칭되는 의도가 없으면 일반 문의
  debugLog('의도 추출 실패, 기본값 사용: 일반문의');
  return '일반문의';
}

// ==================== 엔티티 추출 ====================
function extractEntities(text) {
  const entities = {};

  // 기간 추출 (N년, N개월, N학기 등)
  const periodPatterns = [
    { pattern: /(\d+)\s*년/g, key: '기간_년' },
    { pattern: /(\d+)\s*개월/g, key: '기간_개월' },
    { pattern: /(\d+)\s*학기/g, key: '기간_학기' },
    { pattern: /(\d+)\s*주/g, key: '기간_주' }
  ];

  for (const item of periodPatterns) {
    const matches = text.match(item.pattern);
    if (matches && matches.length > 0) {
      entities[item.key] = matches[0];
    }
  }

  // 날짜 추출 (YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD)
  const datePattern = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/g;
  const dateMatches = text.match(datePattern);
  if (dateMatches && dateMatches.length > 0) {
    entities['날짜'] = dateMatches;
  }

  // 저널/학술지 유형 추출
  const journalPatterns = ['SSCI', 'SCIE', 'SCI', 'KCI', 'A&HCI', 'SCOPUS'];
  const foundJournals = [];
  for (const journal of journalPatterns) {
    if (text.toUpperCase().includes(journal)) {
      foundJournals.push(journal);
    }
  }
  if (foundJournals.length > 0) {
    entities['저널유형'] = foundJournals.join(',');
  }

  // 교원 직급 추출
  const rankPatterns = ['교수', '부교수', '조교수', '전임강사', '겸임교수', '초빙교수', '명예교수'];
  for (const rank of rankPatterns) {
    if (text.includes(rank)) {
      entities['직급'] = rank;
      break;
    }
  }

  // 학과/전공 추출 (간단한 패턴, 실제로는 학과 목록과 매칭 필요)
  const deptPattern = /([가-힣]+)(과|학과|전공|학부)/g;
  const deptMatches = text.match(deptPattern);
  if (deptMatches && deptMatches.length > 0) {
    entities['학과'] = deptMatches[0];
  }

  // 금액 추출
  const amountPattern = /(\d{1,3}(,?\d{3})*)\s*(원|만원|억)/g;
  const amountMatches = text.match(amountPattern);
  if (amountMatches && amountMatches.length > 0) {
    entities['금액'] = amountMatches;
  }

  // 학점 추출
  const creditPattern = /(\d+)\s*학점/g;
  const creditMatches = text.match(creditPattern);
  if (creditMatches && creditMatches.length > 0) {
    entities['학점'] = creditMatches[0];
  }

  // 시수 추출
  const hourPattern = /(\d+)\s*시간/g;
  const hourMatches = text.match(hourPattern);
  if (hourMatches && hourMatches.length > 0) {
    entities['시수'] = hourMatches[0];
  }

  debugLog('추출된 엔티티: ' + JSON.stringify(entities));
  return entities;
}

// ==================== 문서 내용 읽기 ====================
function readDocumentContent(file) {
  try {
    const mimeType = file.getMimeType();
    const fileId = file.getId();
    let content = '';

    infoLog('문서 읽기 시작: ' + file.getName() + ' (' + mimeType + ')');

    // Google Docs
    if (mimeType === MimeType.GOOGLE_DOCS) {
      const doc = DocumentApp.openById(fileId);
      content = doc.getBody().getText();
      infoLog('Google Docs 내용 읽기 성공: ' + content.length + '자');
    }
    // Google Sheets
    else if (mimeType === MimeType.GOOGLE_SHEETS) {
      const sheet = SpreadsheetApp.openById(fileId);
      const sheets = sheet.getSheets();

      // 첫 번째 시트만 읽기
      if (sheets.length > 0) {
        const data = sheets[0].getDataRange().getValues();
        content = data.map(row => row.join('\t')).join('\n');
        infoLog('Google Sheets 내용 읽기 성공: ' + content.length + '자');
      }
    }
    // PDF
    else if (mimeType === MimeType.PDF) {
      // PDF는 OCR 없이 텍스트 추출 불가능
      // Drive API로 export는 가능하지만 복잡함
      content = '[PDF 파일 - 직접 확인 필요: ' + file.getUrl() + ']';
      infoLog('PDF 파일: 내용 추출 불가');
    }
    // 일반 텍스트
    else if (mimeType === MimeType.PLAIN_TEXT) {
      const blob = file.getBlob();
      content = blob.getDataAsString();
      infoLog('텍스트 파일 읽기 성공: ' + content.length + '자');
    }
    // 지원하지 않는 형식
    else {
      content = '[지원하지 않는 파일 형식: ' + mimeType + ']';
      infoLog('지원하지 않는 파일 형식: ' + mimeType);
    }

    // 내용이 너무 길면 자르기 (토큰 제한 고려)
    if (content.length > CONFIG.MAX_DOCUMENT_CONTENT_LENGTH) {
      content = content.substring(0, CONFIG.MAX_DOCUMENT_CONTENT_LENGTH) + '\n...(내용 생략)...';
      infoLog('내용이 길어서 ' + CONFIG.MAX_DOCUMENT_CONTENT_LENGTH + '자로 제한');
    }

    return content;

  } catch (error) {
    errorLog('문서 읽기 오류: ' + error.toString());
    return '[문서 읽기 오류: ' + error.message + ']';
  }
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

    // 문서 컨텍스트 구성 (실제 내용 포함!)
    let context = '';
    if (documents.length > 0) {
      context = '\n\n=== 참고 자료 ===\n';
      context += '다음 문서들을 참고하여 답변해주세요. 문서에 명시된 내용을 우선적으로 사용하세요.\n\n';

      documents.forEach((doc, i) => {
        context += `--- 문서 ${i + 1}: [${doc.category}] ${doc.filename} ---\n`;

        if (doc.content) {
          context += doc.content + '\n';
        } else {
          context += '[내용 없음]\n';
        }

        context += '\n';
      });

      context += '=== 참고 자료 끝 ===\n\n';
    }

    // Gemini API 호출
    const prompt = `당신은 용인대학교 교무지원과의 AI 상담 챗봇입니다.
다음 질문에 친절하고 정확하게 답변해주세요.

질문: ${question}
${context}

**중요 지침**:
1. 위에 제공된 참고 자료의 내용을 우선적으로 사용하세요
2. 참고 자료에 명시된 내용이 있다면 반드시 그것을 기반으로 답변하세요
3. 참고 자료에 없는 내용은 추측하지 말고 "제공된 자료에는 해당 내용이 없습니다"라고 알려주세요
4. 답변 시 관련 규정이나 근거를 명시해주세요

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

      // Confidence 계산 (다양한 요소 고려)
      let confidence = 0.5; // 기본값

      // 문서 기반 답변인 경우 높은 신뢰도
      if (documents.length > 0) {
        confidence = 0.75 + (documents.length * 0.05); // 문서 1개당 +0.05
        confidence = Math.min(confidence, 0.95); // 최대 0.95
      } else {
        confidence = 0.60; // 문서 없이 일반 지식으로 답변
      }

      // finishReason이 STOP이면 완전한 답변 (신뢰도 유지)
      // MAX_TOKENS나 SAFETY 등이면 신뢰도 감소
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        infoLog('비정상 종료: ' + candidate.finishReason);
        confidence *= 0.8; // 20% 감소
      }

      // 답변이 너무 짧으면 불완전할 수 있음
      if (text.length < 50) {
        confidence *= 0.9;
      }

      // 소수점 2자리로 반올림
      confidence = Math.round(confidence * 100) / 100;

      infoLog('✅ Gemini 응답 성공 (길이: ' + text.length + ', 신뢰도: ' + confidence + ')');
      return {
        text: text,
        sources: documents,
        confidence: confidence
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

// ==================== QA 로그 저장 (향상된 버전) ====================
function logQA(logData, config) {
  try {
    if (!config.spreadsheetId) {
      infoLog('SPREADSHEET_ID 미설정, 로그 저장 생략');
      return;
    }

    const ss = SpreadsheetApp.openById(config.spreadsheetId);

    // 새로운 상세 로그 시트 사용 (없으면 구 형식 시트 사용)
    let sheet = ss.getSheetByName('QA_이력_상세');

    if (!sheet) {
      // 상세 시트가 없으면 기존 QA_이력 시트에 기록
      infoLog('QA_이력_상세 시트 없음, QA_이력 시트 사용');
      sheet = ss.getSheetByName('QA_이력');

      if (!sheet) {
        errorLog('QA 로그 시트를 찾을 수 없음');
        return;
      }

      // 구 형식으로 저장 (호환성)
      const sourcesText = logData.documents ? logData.documents.map(s => s.filename).join(', ') : '';
      sheet.appendRow([
        new Date(),
        logData.sessionId,
        logData.question,
        logData.answer,
        sourcesText,
        logData.documents ? logData.documents.length : 0
      ]);

      infoLog('✅ QA 로그 저장 완료 (구 형식)');
      return;
    }

    // 새 형식: QA_이력_상세에 15개 컬럼 저장
    // 1. 타임스탬프
    // 2. 세션ID
    // 3. 사용자이메일
    // 4. 사용자역할
    // 5. 질문
    // 6. 의도
    // 7. 엔티티(JSON)
    // 8. 검색된문서(JSON)
    // 9. 답변
    // 10. Confidence
    // 11. 피드백평점 (초기값 빈칸)
    // 12. 피드백코멘트 (초기값 빈칸)
    // 13. 에스컬레이션여부
    // 14. 응답시간(초)
    // 15. MessageID

    // 엔티티를 JSON 문자열로 변환
    const entitiesJson = JSON.stringify(logData.entities || {});

    // 검색된 문서를 JSON 문자열로 변환 (중요 정보만)
    const documentsJson = JSON.stringify(
      (logData.documents || []).map(doc => ({
        filename: doc.filename,
        category: doc.category,
        url: doc.url
      }))
    );

    sheet.appendRow([
      new Date(),                           // 타임스탬프
      logData.sessionId || '',              // 세션ID
      logData.userEmail || '',              // 사용자이메일
      logData.userRole || 'guest',          // 사용자역할
      logData.question || '',               // 질문
      logData.intent || '일반문의',        // 의도
      entitiesJson,                          // 엔티티(JSON)
      documentsJson,                         // 검색된문서(JSON)
      logData.answer || '',                 // 답변
      logData.confidence || 0.5,            // Confidence
      '',                                    // 피드백평점 (초기값 빈칸)
      '',                                    // 피드백코멘트 (초기값 빈칸)
      logData.escalation || 'N',            // 에스컬레이션여부
      logData.responseTime || 0,            // 응답시간(초)
      logData.messageId || ''               // MessageID
    ]);

    infoLog('✅ QA 로그 저장 완료 (상세 형식): ' + logData.messageId);

    // 검색_문서_매핑 시트에도 문서 사용 기록 저장
    if (logData.documents && logData.documents.length > 0) {
      logDocumentUsage(logData.sessionId, logData.messageId, logData.documents, config);
    }

  } catch (error) {
    errorLog('QA 로그 저장 실패: ' + error.toString());
  }
}

// ==================== 문서 사용 로그 ====================
function logDocumentUsage(sessionId, messageId, documents, config) {
  try {
    if (!config.spreadsheetId) return;

    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName('검색_문서_매핑');

    if (!sheet) {
      debugLog('검색_문서_매핑 시트 없음, 문서 사용 로그 생략');
      return;
    }

    // 각 문서별로 행 추가
    documents.forEach(doc => {
      sheet.appendRow([
        new Date(),              // 타임스탬프
        messageId,               // MessageID
        sessionId,               // 세션ID
        doc.filename,            // 문서명
        doc.category,            // 카테고리
        doc.id,                  // 문서ID
        doc.url                  // 문서URL
      ]);
    });

    debugLog('문서 사용 로그 저장 완료: ' + documents.length + '개');

  } catch (error) {
    errorLog('문서 사용 로그 저장 실패: ' + error.toString());
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
        maxOutputTokens: 500  // 100 → 500 (thinking 토큰 고려)
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
