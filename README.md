# 용인대학교 교무지원과 AI 챗봇 시스템

## 📋 프로젝트 개요

이 프로젝트는 용인대학교 교무지원과를 위한 RAG(Retrieval-Augmented Generation) 기반 AI 챗봇 시스템입니다. 교직원들의 질문에 대해 관련 문서를 검색하고 Google Gemini API를 활용하여 정확한 답변을 제공합니다.

**배포 URL**: https://parkseihuan.github.io/chatbot-gyomu/

---

## 🏗️ 시스템 아키텍처

### 두 개의 저장소 구조

1. **chatbot-gyomu** (현재 저장소)
   - 위치: `D:\Github\chatbot-gyomu`
   - 역할: 프론트엔드 웹 인터페이스 및 Google Apps Script 백엔드
   - 배포: GitHub Pages

2. **RAG** (백엔드 서버)
   - 위치: `D:\RAG`
   - GitHub: https://github.com/Parkseihuan/RAG
   - 역할: FastAPI 기반 RAG 검색 서버 + ChromaDB 벡터 데이터베이스
   - 데이터: 7,190개 문서 청크 저장

### 주요 구성 요소

```
교직원 (사용자)
  ↓
index.html (프론트엔드)
  ↓
┌─────────────┬────────────────┐
│ RAG 서버    │ Apps Script    │
│ (Flask)     │ (Code.gs)      │
└─────────────┴────────────────┘
  ↓              ↓
ChromaDB    Google Sheets
  ↓              ↓
Gemini API ←─────┘
  ↓
답변 생성
```

---

## 🔄 데이터 흐름

1. **교직원 질문 입력** → `index.html`
2. **RAG 검색** → `https://mom-watch-foot-portions.trycloudflare.com/chat`
   - Cloudflare Tunnel을 통해 로컬 RAG 서버 접근
   - ChromaDB에서 관련 문서 검색 (Gemini 768차원 임베딩)
   - Quality Checker로 결과 필터링
3. **Apps Script 호출** → `Code.gs`
   - RAG 컨텍스트와 함께 질문 전달
   - Google Sheets에서 FAQ 확인
4. **Gemini API 호출**
   - RAG 컨텍스트 + 시스템 프롬프트 + 사용자 질문
   - 최종 답변 생성
5. **답변 표시** → `index.html`

---

## 🚀 설치 및 설정

### 사전 요구사항

- Python 3.8 이상
- Google Cloud Platform 계정
- Gemini API 키
- Git

### RAG 서버 설정

1. **저장소 클론** (이미 완료됨)
   ```bash
   # D:\RAG에 이미 설정되어 있음
   cd D:\RAG
   ```

2. **환경 변수 설정**
   - `.env` 파일에 `GEMINI_API_KEY` 설정

3. **벡터 DB 확인**
   - 위치: `D:\RAG\data\vector_db`
   - 문서 수: 7,190개 청크

---

## 🖥️ RAG 서버 운영

### 서버 시작

```bash
cd D:\RAG
start_rag_with_tunnel.bat
```

이 배치 파일은:
1. Flask 서버를 포트 8080에서 시작
2. 8초 대기 (서버 초기화)
3. Cloudflare Tunnel 시작 → 공개 HTTPS URL 생성

### 서버 확인

터미널에서 Cloudflare Tunnel URL 확인:
```
https://[랜덤문자열].trycloudflare.com
```

예: `https://mom-watch-foot-portions.trycloudflare.com`

### 헬스 체크

```bash
curl https://[Tunnel-URL]/health
```

응답 예시:
```json
{
  "status": "healthy",
  "collection_count": 7190,
  "embedding_dimension": 768
}
```

---

## 🔧 Cloudflare Tunnel URL 업데이트

Cloudflare Tunnel URL은 서버 재시작 시마다 변경됩니다. 새로운 URL로 업데이트하는 방법:

### 1. index.html 수정

```bash
cd D:\Github\chatbot-gyomu
```

`index.html` 파일의 795번째 줄 근처:
```javascript
const RAG_API_URL = 'https://새로운-URL.trycloudflare.com';
```

### 2. GitHub에 푸시

```bash
git add index.html
git commit -m "Update RAG URL to https://새로운-URL.trycloudflare.com"
git push origin main
```

### 3. GitHub Pages 배포 대기

- 약 1-2분 후 https://parkseihuan.github.io/chatbot-gyomu/ 에서 변경사항 반영

---

## ⚙️ 설정 및 구성

### Quality Checker 설정

`D:\RAG\working_rag_server.py` 32번째 줄:

```python
quality_checker = AnswerQualityChecker(
    min_documents=3,           # 최소 문서 수
    max_avg_distance=0.75,     # 최대 평균 거리 (낮을수록 엄격)
    min_keyword_match=0.3      # 최소 키워드 매칭 비율
)
```

**주의**: `max_avg_distance`가 너무 낮으면 (예: 0.65) 검색 결과가 반환되지 않을 수 있습니다.

### 검색 파라미터

- **Chunk Size**: 1000자
- **Chunk Overlap**: 200자
- **임베딩 모델**: Google Gemini Embedding (768차원)
- **검색 방식**: 하이브리드 (벡터 유사도 + BM25 키워드)

---

## 🔍 문제 해결

### 문제 1: RAG 검색 결과가 0개

**증상**:
```
[RESULT] Found 15 unique documents after merging
[QUALITY CHECK] Can answer: False
[QUALITY CHECK] Reason: 검색 결과의 관련성이 낮습니다 (평균 거리: 0.654)
```

**원인**: `max_avg_distance` 임계값이 너무 엄격

**해결**:
1. RAG 서버 중지
2. `D:\RAG\working_rag_server.py` 파일 32번째 줄 수정:
   ```python
   max_avg_distance=0.75  # 0.65에서 증가
   ```
3. 서버 재시작

### 문제 2: 브라우저에서 이전 URL 표시

**원인**: GitHub Pages 캐싱 또는 배포 대기 중

**해결**:
1. 하드 리프레시: `Ctrl + Shift + R` (Windows) / `Cmd + Shift + R` (Mac)
2. 1-2분 대기 후 재시도
3. 시크릿 모드에서 테스트

### 문제 3: "File has been unexpectedly modified"

**원인**: 서버 프로세스가 파일을 사용 중

**해결**:
1. RAG 서버 중지
2. 파일 수정
3. 서버 재시작

### 문제 4: Merge Conflict

**해결**:
```bash
git pull origin main
# 충돌 해결 (최신 URL 유지)
git add index.html
git commit -m "Resolve merge conflict: Keep updated RAG API URL"
git push origin main
```

---

## 📊 데이터 관리

### Google Sheets 연동

- **FAQ 시트**: 자주 묻는 질문과 답변
- **피드백 시트**: 사용자 피드백 저장
- **QA 히스토리**: 질문-답변 기록

### 벡터 DB 업데이트

새로운 문서 추가 시:
```bash
cd D:\RAG
python add_documents.py
```

---

## 🔐 보안 및 프라이버시

### GitHub 리포지토리 Private 설정

**질문**: GitHub 리포를 private으로 변경해도 되나요?

**답변**:
- ❌ **chatbot-gyomu**: Private으로 변경 시 GitHub Pages 작동 불가 (무료 플랜의 경우)
  - GitHub Free 플랜은 공개 리포지토리에서만 GitHub Pages 지원
  - GitHub Pro/Team 플랜 사용 시 private 리포에서도 GitHub Pages 가능
  - 대안: Netlify, Vercel, Cloudflare Pages 등 다른 호스팅 서비스 사용
- ✅ **RAG**: Private으로 변경 **가능** (로컬 서버이므로 영향 없음)

### API 키 보안

- `.env` 파일은 절대 Git에 커밋하지 말 것
- `.gitignore`에 `.env` 포함 확인

---

## 📝 주요 파일

| 파일 | 경로 | 설명 |
|------|------|------|
| `index.html` | `D:\Github\chatbot-gyomu\` | 프론트엔드 UI |
| `Code.gs` | Apps Script | Google Apps Script 백엔드 |
| `working_rag_server.py` | `D:\RAG\` | Flask RAG API 서버 |
| `config.py` | `D:\RAG\` | 설정 파일 |
| `start_rag_with_tunnel.bat` | `D:\RAG\` | 서버 시작 스크립트 |

---

## 🛠️ 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript
- **백엔드**:
  - Google Apps Script
  - Flask (Python)
- **데이터베이스**:
  - ChromaDB (벡터 DB)
  - Google Sheets (구조화된 데이터)
- **AI/ML**:
  - Google Gemini API (임베딩 + 생성)
  - ChromaDB (벡터 검색)
- **인프라**:
  - GitHub Pages (프론트엔드 호스팅)
  - Cloudflare Tunnel (로컬 서버 공개)

---

## 📈 시스템 통계

- **벡터 DB 문서 수**: 7,190개 청크
- **임베딩 차원**: 768
- **검색 알고리즘**: 하이브리드 (벡터 + BM25)
- **평균 응답 시간**: 2-5초

---

## 🆘 지원

문제가 발생하면:
1. 이 문서의 "문제 해결" 섹션 확인
2. RAG 서버 로그 확인
3. 브라우저 개발자 도구 콘솔 확인

---

## 📜 라이선스

이 프로젝트는 용인대학교 교무지원과를 위한 내부 시스템입니다.

---

**마지막 업데이트**: 2026-01-07
**현재 RAG URL**: https://mom-watch-foot-portions.trycloudflare.com
