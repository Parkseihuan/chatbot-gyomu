/**
 * API 키 정보 확인 함수
 * Apps Script 편집기에서 실행하세요
 */
function checkCurrentAPIKeys() {
  const props = PropertiesService.getScriptProperties();

  Logger.log('=== 현재 설정된 API 키 정보 ===\n');

  // Gemini API 키 확인
  const geminiKey = props.getProperty('GEMINI_API_KEY');
  if (geminiKey) {
    Logger.log('✅ GEMINI_API_KEY 설정됨');
    Logger.log('   - 앞 10자: ' + geminiKey.substring(0, 10) + '...');
    Logger.log('   - 뒤 5자: ...' + geminiKey.substring(geminiKey.length - 5));
    Logger.log('   - 전체 길이: ' + geminiKey.length + '자');
    Logger.log('   - 형식: ' + (geminiKey.startsWith('AIza') ? '올바름 (AIza로 시작)' : '⚠️ 의심스러움'));
  } else {
    Logger.log('❌ GEMINI_API_KEY 없음\n');
  }

  Logger.log('\n=== 모든 스크립트 속성 ===');
  const allProps = props.getProperties();
  for (const [key, value] of Object.entries(allProps)) {
    if (key.includes('API') || key.includes('KEY')) {
      // API 키는 일부만 표시
      Logger.log(`${key}: ${value.substring(0, 10)}...${value.substring(value.length - 5)}`);
    } else {
      // 다른 속성은 전체 표시
      Logger.log(`${key}: ${value}`);
    }
  }

  Logger.log('\n=== Google AI Studio에서 키 확인 방법 ===');
  Logger.log('1. https://aistudio.google.com/app/apikey 접속');
  Logger.log('2. 생성된 API 키 목록 확인');
  Logger.log('3. 각 키의 사용량 및 할당량 확인');
  Logger.log('4. 현재 Apps Script 키와 비교');
}

/**
 * API 키 사용량 테스트
 * 어떤 계정의 키인지 확인하는 용도
 */
function testAPIKeyOwnership() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    Logger.log('❌ API 키가 설정되지 않음');
    return;
  }

  Logger.log('=== API 키 소유자 확인 ===\n');

  try {
    // 간단한 요청으로 에러 메시지 확인
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: 'test' }] }]
    };

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

    if (responseCode === 429) {
      Logger.log('❌ 할당량 초과 (429 Error)');
      Logger.log('이 키는 할당량이 모두 소진되었습니다.\n');
    } else if (responseCode === 403) {
      Logger.log('❌ 권한 없음 (403 Error)');
      Logger.log('API 키가 유효하지 않거나 비활성화되었습니다.\n');
    } else if (responseCode === 200) {
      Logger.log('✅ API 키 정상 작동');
      Logger.log('할당량이 남아있습니다.\n');
    }

    // 에러 메시지에서 프로젝트 정보 추출
    try {
      const result = JSON.parse(responseText);
      if (result.error) {
        Logger.log('에러 메시지: ' + result.error.message);
        Logger.log('에러 상태: ' + result.error.status);

        // 프로젝트 정보가 포함되어 있을 수 있음
        if (result.error.details) {
          Logger.log('상세 정보: ' + JSON.stringify(result.error.details));
        }
      }
    } catch (e) {
      // JSON 파싱 실패
    }

  } catch (error) {
    Logger.log('❌ 테스트 실패: ' + error.toString());
  }

  Logger.log('\n=== 다음 단계 ===');
  Logger.log('1. Google AI Studio (https://aistudio.google.com/app/apikey) 접속');
  Logger.log('2. 모든 Google 계정으로 로그인하여 각각 확인');
  Logger.log('3. 각 계정의 API 키 목록 및 할당량 확인');
  Logger.log('4. 새 API 키 생성 또는 기존 키 교체');
}
