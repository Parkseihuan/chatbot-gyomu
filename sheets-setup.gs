/**
 * ============================================
 * 교무지원과 챗봇 데이터 스프레드시트 자동 생성 스크립트 v2.0
 * ============================================
 *
 * 개선사항:
 * - 요구사항 문서 기반 상세 로그 구조
 * - 문서 위치 정보 (페이지, 문단) 추가
 * - Confidence 점수 추적
 * - 의도/엔티티 JSON 저장
 *
 * 사용 방법:
 * 1. Google Sheets에서 새 스프레드시트 생성
 * 2. 확장 프로그램 > Apps Script
 * 3. 이 코드를 붙여넣기
 * 4. 함수 실행: createChatbotSheets()
 */

function createChatbotSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 스프레드시트 이름 변경
  ss.rename('교무지원과_챗봇_데이터_v2');

  // 기존 "시트1" 삭제 (있으면)
  const defaultSheet = ss.getSheetByName('시트1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('=== 교무지원과 챗봇 스프레드시트 생성 시작 ===');

  // 1. 자주묻는질문_FAQ 시트
  createFAQSheet(ss);

  // 2. QA_이력 시트 (FAQ 복합 점수용)
  createQAHistorySheet(ss);

  // 3. QA_이력_상세 시트 (상세 로그)
  createQAHistoryDetailSheet(ss);

  // 4. 피드백_상세 시트
  createFeedbackDetailSheet(ss);

  // 5. 에스컬레이션_티켓 시트
  createEscalationTicketSheet(ss);

  // 6. 민감정보_로그 시트
  createSensitiveInfoLogSheet(ss);

  // 7. 일별_통계 시트
  createDailyStatsSheet(ss);

  // 8. 대시보드_통계 시트
  createDashboardSheet(ss);

  // 참고: 문서_메타데이터, 검색_문서_매핑은 Cloud Run RAG 사용으로 불필요

  Logger.log('=== 스프레드시트 생성 완료 ===');

  // 완료 메시지
  SpreadsheetApp.getUi().alert(
    '✅ 생성 완료!\n\n' +
    '다음 시트들이 생성되었습니다:\n' +
    '1. 자주묻는질문_FAQ\n' +
    '2. QA_이력 (FAQ 복합 점수용)\n' +
    '3. QA_이력_상세 (상세 로그)\n' +
    '4. 피드백_상세\n' +
    '5. 에스컬레이션_티켓\n' +
    '6. 민감정보_로그\n' +
    '7. 일별_통계\n' +
    '8. 대시보드_통계\n\n' +
    '※ 문서 검색은 Cloud Run RAG 사용\n\n' +
    '⚠️ 중요: Code.gs의 CONFIG.ORG_INFO에서\n' +
    '교무지원과 연락처를 실제 정보로 수정하세요!'
  );
}

// ============================================
// 1. 문서_메타데이터 시트
// ============================================
function createDocumentMetadataSheet(ss) {
  let sheet = ss.getSheetByName('문서_메타데이터');

  if (sheet) {
    Logger.log('문서_메타데이터 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('문서_메타데이터');
    Logger.log('문서_메타데이터 시트 생성 완료');
  }

  // 헤더 설정 (문단 위치 정보 추가)
  const headers = [
    '문서ID',
    '파일명',
    '카테고리',
    'Drive파일ID',
    '파일URL',
    '파일타입',
    '전체문자수',
    '문단수',
    '생성일시',
    '마지막수정',
    '키워드',
    '사용횟수',
    '평균Confidence'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // 헤더 스타일
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#4285f4');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  // 열 너비 조정
  sheet.setColumnWidth(1, 120);  // 문서ID
  sheet.setColumnWidth(2, 250);  // 파일명
  sheet.setColumnWidth(3, 100);  // 카테고리
  sheet.setColumnWidth(4, 200);  // Drive파일ID
  sheet.setColumnWidth(5, 250);  // 파일URL
  sheet.setColumnWidth(6, 150);  // 파일타입
  sheet.setColumnWidth(7, 100);  // 전체문자수
  sheet.setColumnWidth(8, 80);   // 문단수
  sheet.setColumnWidth(9, 150);  // 생성일시
  sheet.setColumnWidth(10, 150); // 마지막수정
  sheet.setColumnWidth(11, 200); // 키워드
  sheet.setColumnWidth(12, 100); // 사용횟수
  sheet.setColumnWidth(13, 120); // 평균Confidence

  // 행 고정
  sheet.setFrozenRows(1);

  // 샘플 데이터 추가
  const sampleData = [
    [
      'DOC0001',
      '교원임용규정.pdf',
      '규정집',
      'SAMPLE_FILE_ID',
      'https://drive.google.com/file/d/SAMPLE_FILE_ID',
      'application/pdf',
      5240,
      25,
      new Date(),
      new Date(),
      '임용, 채용, 신규교원, 전임교원',
      0,
      0
    ]
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues(sampleData);
  sheet.getRange(2, 1, 1, headers.length).setBackground('#f3f3f3');

  Logger.log('  - 헤더 및 샘플 데이터 설정 완료');
}

// ============================================
// 2. 자주묻는질문_FAQ 시트
// ============================================
function createFAQSheet(ss) {
  let sheet = ss.getSheetByName('자주묻는질문_FAQ');

  if (sheet) {
    Logger.log('자주묻는질문_FAQ 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('자주묻는질문_FAQ');
    Logger.log('자주묻는질문_FAQ 시트 생성 완료');
  }

  const headers = [
    '순위',
    '질문',
    '답변',
    '카테고리',
    '조회수',
    '평균평점'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#34a853');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 60);   // 순위
  sheet.setColumnWidth(2, 400);  // 질문
  sheet.setColumnWidth(3, 500);  // 답변
  sheet.setColumnWidth(4, 100);  // 카테고리
  sheet.setColumnWidth(5, 80);   // 조회수
  sheet.setColumnWidth(6, 100);  // 평균평점

  sheet.setFrozenRows(1);

  // 샘플 FAQ 데이터
  const sampleFAQs = [
    [1, '재임용 심사 기준은 무엇인가요?', '재임용 심사는 교육, 연구, 봉사 3개 영역을 평가합니다. 교육 영역은 강의평가 및 강의시수, 연구 영역은 논문 및 저서 실적, 봉사 영역은 대학 및 사회봉사 활동을 평가합니다. 구체적인 기준은 교원재임용규정 제5조를 참고하세요.', '인사', 0, 0],
    [2, '휴직 신청은 어떻게 하나요?', '휴직 신청은 희망 휴직일 1개월 전까지 휴직신청서를 작성하여 소속 학과장의 승인을 받은 후 교무지원과에 제출하셔야 합니다. 병가 휴직의 경우 진단서(병가 사유가 명시된)를 첨부해야 합니다.', '인사', 0, 0],
    [3, '연구년 신청 자격은 어떻게 되나요?', '연구년은 재직 6년 이상의 전임교원이 신청 가능합니다. 신청 시기는 매년 12월이며, 연구계획서와 함께 신청서를 제출하셔야 합니다. 선발은 교원연구년운영위원회의 심의를 거쳐 결정됩니다.', '연구', 0, 0],
    [4, '승진임용 절차가 궁금합니다.', '승진임용은 재직연수, 교육·연구·봉사 실적을 종합 평가합니다. 조교수는 재직 4년 이상, 부교수는 재직 4년 이상이면 승진 심사를 받을 수 있습니다. 매년 6월에 신청 공고가 나가며, 교원인사위원회의 심의를 거쳐 결정됩니다.', '인사', 0, 0],
    [5, '출장 복명서는 언제까지 제출하나요?', '출장 복명서는 출장 종료 후 7일 이내에 제출하셔야 합니다. 국외출장의 경우 출장보고서와 함께 관련 증빙자료(항공권, 숙박비 영수증 등)를 첨부해 주세요.', '행정', 0, 0]
  ];

  sheet.getRange(2, 1, sampleFAQs.length, headers.length).setValues(sampleFAQs);

  Logger.log('  - 헤더 및 샘플 FAQ 5개 설정 완료');
}

// ============================================
// FAQ 데이터만 업데이트하는 함수
// 기존 FAQ 시트가 있고 데이터가 잘못되었을 때 사용
// ============================================
function updateFAQData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('자주묻는질문_FAQ');

  if (!sheet) {
    Logger.log('❌ 자주묻는질문_FAQ 시트를 찾을 수 없습니다. createChatbotSheets()를 먼저 실행하세요.');
    SpreadsheetApp.getUi().alert('❌ 오류\n\n자주묻는질문_FAQ 시트를 찾을 수 없습니다.\n\ncreateChatbotSheets() 함수를 먼저 실행하세요.');
    return;
  }

  // 샘플 FAQ 데이터
  const sampleFAQs = [
    [1, '재임용 심사 기준은 무엇인가요?', '재임용 심사는 교육, 연구, 봉사 3개 영역을 평가합니다. 교육 영역은 강의평가 및 강의시수, 연구 영역은 논문 및 저서 실적, 봉사 영역은 대학 및 사회봉사 활동을 평가합니다. 구체적인 기준은 교원재임용규정 제5조를 참고하세요.', '인사', 0, 0],
    [2, '휴직 신청은 어떻게 하나요?', '휴직 신청은 희망 휴직일 1개월 전까지 휴직신청서를 작성하여 소속 학과장의 승인을 받은 후 교무지원과에 제출하셔야 합니다. 병가 휴직의 경우 진단서(병가 사유가 명시된)를 첨부해야 합니다.', '인사', 0, 0],
    [3, '연구년 신청 자격은 어떻게 되나요?', '연구년은 재직 6년 이상의 전임교원이 신청 가능합니다. 신청 시기는 매년 12월이며, 연구계획서와 함께 신청서를 제출하셔야 합니다. 선발은 교원연구년운영위원회의 심의를 거쳐 결정됩니다.', '연구', 0, 0],
    [4, '승진임용 절차가 궁금합니다.', '승진임용은 재직연수, 교육·연구·봉사 실적을 종합 평가합니다. 조교수는 재직 4년 이상, 부교수는 재직 4년 이상이면 승진 심사를 받을 수 있습니다. 매년 6월에 신청 공고가 나가며, 교원인사위원회의 심의를 거쳐 결정됩니다.', '인사', 0, 0],
    [5, '출장 복명서는 언제까지 제출하나요?', '출장 복명서는 출장 종료 후 7일 이내에 제출하셔야 합니다. 국외출장의 경우 출장보고서와 함께 관련 증빙자료(항공권, 숙박비 영수증 등)를 첨부해 주세요.', '행정', 0, 0]
  ];

  // 기존 데이터 삭제 (헤더 제외)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    Logger.log('기존 FAQ 데이터 삭제 완료');
  }

  // 새 샘플 데이터 추가
  sheet.getRange(2, 1, sampleFAQs.length, 6).setValues(sampleFAQs);

  Logger.log('✅ FAQ 샘플 데이터 업데이트 완료: ' + sampleFAQs.length + '개');

  SpreadsheetApp.getUi().alert(
    '✅ 완료!\n\n' +
    'FAQ 샘플 데이터 ' + sampleFAQs.length + '개가 추가되었습니다.\n\n' +
    '이제 챗봇 웹페이지를 새로고침하여 확인하세요!'
  );
}

// ============================================
// 3. QA_이력_상세 시트 (개선됨)
// ============================================
function createQAHistoryDetailSheet(ss) {
  let sheet = ss.getSheetByName('QA_이력_상세');

  if (sheet) {
    Logger.log('QA_이력_상세 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('QA_이력_상세');
    Logger.log('QA_이력_상세 시트 생성 완료');
  }

  // 요구사항 문서의 샘플 스키마 기반
  const headers = [
    '타임스탬프',
    '세션ID',
    '사용자이메일',
    '사용자역할',
    '질문',
    '의도',
    '엔티티(JSON)',
    '검색된문서(JSON)',
    '답변',
    'Confidence',
    '피드백평점',
    '피드백코멘트',
    '에스컬레이션여부',
    '응답시간(초)',
    'MessageID'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#fbbc04');
  headerRange.setFontColor('#000000');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 150);  // 타임스탬프
  sheet.setColumnWidth(2, 200);  // 세션ID
  sheet.setColumnWidth(3, 200);  // 사용자이메일
  sheet.setColumnWidth(4, 100);  // 사용자역할
  sheet.setColumnWidth(5, 350);  // 질문
  sheet.setColumnWidth(6, 150);  // 의도
  sheet.setColumnWidth(7, 250);  // 엔티티(JSON)
  sheet.setColumnWidth(8, 350);  // 검색된문서(JSON)
  sheet.setColumnWidth(9, 450);  // 답변
  sheet.setColumnWidth(10, 100); // Confidence
  sheet.setColumnWidth(11, 80);  // 피드백평점
  sheet.setColumnWidth(12, 250); // 피드백코멘트
  sheet.setColumnWidth(13, 120); // 에스컬레이션여부
  sheet.setColumnWidth(14, 100); // 응답시간
  sheet.setColumnWidth(15, 200); // MessageID

  sheet.setFrozenRows(1);

  // 샘플 데이터
  const sampleData = [
    [
      new Date(),
      'sess_20251024_0001',
      'prof.example@yongin.ac.kr',
      '교수',
      '재임용 심사에 필요한 연구실적 기준이 어떻게 되나요?',
      '재임용_연구실적문의',
      '{"기간":"4년","저널":"SSCI/SCIE"}',
      '[{"file_id":"DOC0001","filename":"교원재임용규정.pdf","category":"규정집","score":0.93}]',
      '재임용 기준은 교원재임용규정 제5조에 따라 교육, 연구, 봉사 영역을 평가합니다...',
      0.84,
      4,
      '대체로 정확한 답변이었습니다',
      'N',
      2.3,
      'msg_1729760000_abc123'
    ]
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues(sampleData);
  sheet.getRange(2, 1, 1, headers.length).setBackground('#fff3cd');

  Logger.log('  - 헤더 및 샘플 데이터 설정 완료');
}

// ============================================
// 3.5. QA_이력 시트 (FAQ 복합 점수 계산용)
// ============================================
function createQAHistorySheet(ss) {
  let sheet = ss.getSheetByName('QA_이력');

  if (sheet) {
    Logger.log('QA_이력 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('QA_이력');
    Logger.log('QA_이력 시트 생성 완료');
  }

  // Code.gs의 logQA 함수에서 사용하는 컬럼 구조
  const headers = [
    '타임스탬프',
    '세션ID',
    '질문',
    '답변',
    '출처',
    '출처수',
    '신뢰도'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#ff9800');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 150);  // 타임스탬프
  sheet.setColumnWidth(2, 200);  // 세션ID
  sheet.setColumnWidth(3, 400);  // 질문
  sheet.setColumnWidth(4, 500);  // 답변
  sheet.setColumnWidth(5, 250);  // 출처
  sheet.setColumnWidth(6, 80);   // 출처수
  sheet.setColumnWidth(7, 80);   // 신뢰도

  sheet.setFrozenRows(1);

  // 샘플 데이터
  const sampleData = [
    [
      new Date(),
      'sess_sample_001',
      '재임용 심사 기준은 무엇인가요?',
      '재임용 심사는 교육, 연구, 봉사 영역을 종합적으로 평가합니다...',
      '교원인사규정.md',
      1,
      0.85
    ]
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues(sampleData);
  sheet.getRange(2, 1, 1, headers.length).setBackground('#fff3e0');

  Logger.log('  - QA_이력 헤더 및 샘플 데이터 설정 완료');
}

// ============================================
// 4. 피드백_상세 시트
// ============================================
function createFeedbackDetailSheet(ss) {
  let sheet = ss.getSheetByName('피드백_상세');

  if (sheet) {
    Logger.log('피드백_상세 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('피드백_상세');
    Logger.log('피드백_상세 시트 생성 완료');
  }

  const headers = [
    '타임스탬프',
    '세션ID',
    'MessageID',
    '피드백유형',
    '평점',
    '상세코멘트',
    '처리상태',
    '처리일시'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#ea4335');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 150);  // 타임스탬프
  sheet.setColumnWidth(2, 200);  // 세션ID
  sheet.setColumnWidth(3, 200);  // MessageID
  sheet.setColumnWidth(4, 100);  // 피드백유형
  sheet.setColumnWidth(5, 60);   // 평점
  sheet.setColumnWidth(6, 400);  // 상세코멘트
  sheet.setColumnWidth(7, 100);  // 처리상태
  sheet.setColumnWidth(8, 150);  // 처리일시

  sheet.setFrozenRows(1);

  Logger.log('  - 헤더 설정 완료');
}

// ============================================
// 5. 에스컬레이션_티켓 시트
// ============================================
function createEscalationTicketSheet(ss) {
  let sheet = ss.getSheetByName('에스컬레이션_티켓');

  if (sheet) {
    Logger.log('에스컬레이션_티켓 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('에스컬레이션_티켓');
    Logger.log('에스컬레이션_티켓 시트 생성 완료');
  }

  const headers = [
    '티켓ID',
    '생성시각',
    '세션ID',
    '질문',
    '사용자이메일',
    '사용자전화',
    '에스컬레이션사유',
    '우선순위',
    '상태',
    '담당자',
    '처리완료시각',
    '처리내용',
    'SLA준수여부'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#9c27b0');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 150);  // 티켓ID
  sheet.setColumnWidth(2, 150);  // 생성시각
  sheet.setColumnWidth(3, 200);  // 세션ID
  sheet.setColumnWidth(4, 350);  // 질문
  sheet.setColumnWidth(5, 200);  // 사용자이메일
  sheet.setColumnWidth(6, 130);  // 사용자전화
  sheet.setColumnWidth(7, 150);  // 에스컬레이션사유
  sheet.setColumnWidth(8, 80);   // 우선순위
  sheet.setColumnWidth(9, 80);   // 상태
  sheet.setColumnWidth(10, 100); // 담당자
  sheet.setColumnWidth(11, 150); // 처리완료시각
  sheet.setColumnWidth(12, 350); // 처리내용
  sheet.setColumnWidth(13, 100); // SLA준수여부

  sheet.setFrozenRows(1);

  Logger.log('  - 헤더 설정 완료');
}

// ============================================
// 6. 민감정보_로그 시트
// ============================================
function createSensitiveInfoLogSheet(ss) {
  let sheet = ss.getSheetByName('민감정보_로그');

  if (sheet) {
    Logger.log('민감정보_로그 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('민감정보_로그');
    Logger.log('민감정보_로그 시트 생성 완료');
  }

  const headers = [
    '타임스탬프',
    '세션ID',
    '감지유형',
    '처리결과',
    '질문(일부마스킹)'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#ff5722');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 150);  // 타임스탬프
  sheet.setColumnWidth(2, 200);  // 세션ID
  sheet.setColumnWidth(3, 150);  // 감지유형
  sheet.setColumnWidth(4, 100);  // 처리결과
  sheet.setColumnWidth(5, 350);  // 질문(일부마스킹)

  sheet.setFrozenRows(1);

  // 보호 설정 (읽기 전용)
  const protection = sheet.protect().setDescription('민감정보 로그 보호');
  protection.setWarningOnly(true);

  Logger.log('  - 헤더 설정 및 시트 보호 완료');
}

// ============================================
// 7. 검색_문서_매핑 시트 (신규)
// ============================================
function createDocumentMappingSheet(ss) {
  let sheet = ss.getSheetByName('검색_문서_매핑');

  if (sheet) {
    Logger.log('검색_문서_매핑 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('검색_문서_매핑');
    Logger.log('검색_문서_매핑 시트 생성 완료');
  }

  const headers = [
    '문서ID',
    '파일명',
    '카테고리',
    '사용횟수',
    '마지막사용일',
    '평균Confidence',
    '평균평점',
    '인기질의TOP3'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#00bcd4');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 120);  // 문서ID
  sheet.setColumnWidth(2, 250);  // 파일명
  sheet.setColumnWidth(3, 100);  // 카테고리
  sheet.setColumnWidth(4, 100);  // 사용횟수
  sheet.setColumnWidth(5, 150);  // 마지막사용일
  sheet.setColumnWidth(6, 120);  // 평균Confidence
  sheet.setColumnWidth(7, 100);  // 평균평점
  sheet.setColumnWidth(8, 350);  // 인기질의TOP3

  sheet.setFrozenRows(1);

  Logger.log('  - 헤더 설정 완료');
}

// ============================================
// 8. 일별_통계 시트 (신규)
// ============================================
function createDailyStatsSheet(ss) {
  let sheet = ss.getSheetByName('일별_통계');

  if (sheet) {
    Logger.log('일별_통계 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('일별_통계');
    Logger.log('일별_통계 시트 생성 완료');
  }

  const headers = [
    '날짜',
    '총상담수',
    '평균Confidence',
    '에스컬레이션수',
    '에스컬레이션비율(%)',
    '평균만족도',
    '민감정보감지수',
    '평균응답시간(초)',
    '인기의도TOP3'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#673ab7');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 100);  // 날짜
  sheet.setColumnWidth(2, 100);  // 총상담수
  sheet.setColumnWidth(3, 130);  // 평균Confidence
  sheet.setColumnWidth(4, 120);  // 에스컬레이션수
  sheet.setColumnWidth(5, 150);  // 에스컬레이션비율
  sheet.setColumnWidth(6, 120);  // 평균만족도
  sheet.setColumnWidth(7, 130);  // 민감정보감지수
  sheet.setColumnWidth(8, 150);  // 평균응답시간
  sheet.setColumnWidth(9, 350);  // 인기의도TOP3

  sheet.setFrozenRows(1);

  Logger.log('  - 헤더 설정 완료');
}

// ============================================
// 9. 대시보드_통계 시트
// ============================================
function createDashboardSheet(ss) {
  let sheet = ss.getSheetByName('대시보드_통계');

  if (sheet) {
    Logger.log('대시보드_통계 시트가 이미 존재합니다.');
  } else {
    sheet = ss.insertSheet('대시보드_통계');
    Logger.log('대시보드_통계 시트 생성 완료');
  }

  // 대시보드 레이아웃
  sheet.getRange('A1').setValue('📊 교무지원과 챗봇 대시보드 v2.0');
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor('#4285f4');
  sheet.getRange('A1:H1').merge();
  sheet.getRange('A1:H1').setHorizontalAlignment('center');

  sheet.getRange('A3').setValue('📅 기간:');
  sheet.getRange('B3').setValue('최근 30일');
  sheet.getRange('B3').setFontWeight('bold');

  // 주요 KPI
  sheet.getRange('A5').setValue('🎯 핵심 성과 지표 (KPI)');
  sheet.getRange('A5').setFontSize(14).setFontWeight('bold');

  const metrics = [
    ['지표명', '현재값', '목표', '달성률', '단위'],
    ['총 질의 수', '=COUNTA(QA_이력_상세!A:A)-1', 500, '=B7/C7*100', '건'],
    ['평균 Confidence', '=AVERAGE(QA_이력_상세!J:J)', 0.8, '=B8/C8*100', '점'],
    ['에스컬레이션율', '=COUNTIF(QA_이력_상세!M:M,"Y")/COUNTA(QA_이력_상세!A:A)*100', 10, '=IF(B9<C9,"초과달성","미달")', '%'],
    ['평균 사용자 만족도', '=AVERAGE(QA_이력_상세!K:K)', 4.0, '=B10/C10*100', '점'],
    ['평균 응답시간', '=AVERAGE(QA_이력_상세!N:N)', 3.0, '=IF(B11<C11,"달성","미달")', '초'],
    ['민감정보 감지', '=COUNTA(민감정보_로그!A:A)-1', 0, '', '건']
  ];

  sheet.getRange(6, 1, metrics.length, 5).setValues(metrics);

  const metricsHeaderRange = sheet.getRange(6, 1, 1, 5);
  metricsHeaderRange.setBackground('#4285f4');
  metricsHeaderRange.setFontColor('#ffffff');
  metricsHeaderRange.setFontWeight('bold');

  // 데이터 범위 서식
  sheet.getRange(7, 1, metrics.length - 1, 5).setBorder(true, true, true, true, true, true);

  // 열 너비
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 80);

  // 추가 섹션
  sheet.getRange('A14').setValue('🔥 인기 의도 Top 5');
  sheet.getRange('A14').setFontWeight('bold').setFontSize(12);

  sheet.getRange('A16').setValue('📈 최근 7일 트렌드');
  sheet.getRange('A16').setFontWeight('bold').setFontSize(12);

  sheet.getRange('E14').setValue('💡 사용 안내');
  sheet.getRange('E14').setFontWeight('bold').setFontColor('#ea4335');
  sheet.getRange('E15').setValue('• 이 시트는 참고용 대시보드입니다.');
  sheet.getRange('E16').setValue('• 실시간 통계는 API를 통해 조회하세요.');
  sheet.getRange('E17').setValue('• 수식은 자동 업데이트됩니다.');

  Logger.log('  - 대시보드 레이아웃 설정 완료');
}

// ============================================
// 유틸리티 함수들
// ============================================

function listAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  Logger.log('=== 현재 스프레드시트의 시트 목록 ===');
  sheets.forEach((sheet, index) => {
    Logger.log(`${index + 1}. ${sheet.getName()}`);
  });
}

function deleteSheetByName(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (sheet) {
    ss.deleteSheet(sheet);
    Logger.log(`"${sheetName}" 시트가 삭제되었습니다.`);
  } else {
    Logger.log(`"${sheetName}" 시트를 찾을 수 없습니다.`);
  }
}

function resetAllSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ 경고',
    '모든 시트를 삭제하고 다시 생성하시겠습니까?\n이 작업은 되돌릴 수 없습니다!',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    // 첫 번째 시트 제외 모두 삭제
    for (let i = sheets.length - 1; i > 0; i--) {
      ss.deleteSheet(sheets[i]);
    }

    // 첫 번째 시트도 클리어
    sheets[0].clear();
    sheets[0].setName('임시');

    // 재생성
    createChatbotSheets();

    // 임시 시트 삭제
    const tempSheet = ss.getSheetByName('임시');
    if (tempSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(tempSheet);
    }

    ui.alert('✅ 완료', '모든 시트가 초기화되었습니다.', ui.ButtonSet.OK);
  }
}
