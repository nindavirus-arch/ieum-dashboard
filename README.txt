메인 대시보드 계약 forbidden 수정본

원인
- 계약 현황 탭이 PROJECTS 원본을 /dashboard 메뉴에서 직접 요청해 Apps Script 권한 검사에 차단되었습니다.

수정 내용
- /dashboard 전용 계약 요약 데이터 연결을 추가했습니다.
- 고객명, 연락처, 주소 등 프로젝트 원본 개인정보는 대시보드에 내려보내지 않습니다.
- 계약금입금일이 있는 고유 프로젝트를 집계하고 취소, 삭제, 테스트, 중복, 무효 건은 제외합니다.

적용 순서
1. APPS_SCRIPT_CODE.txt 전체를 Google Apps Script 코드에 교체합니다.
2. Apps Script에서 새 버전으로 웹 앱을 배포합니다. 기존 웹 앱 URL은 유지합니다.
3. dist 폴더를 Vercel에 재배포합니다.
4. 배포가 끝난 뒤 대시보드에서 새로고침합니다. 로그아웃은 필요 없습니다.

수정 소스만 필요한 경우
- src/pages/DashboardPage.tsx
- src/lib/dataService.ts
- APPS_SCRIPT_CODE.txt

주의
- Vercel만 재배포하면 최신 Apps Script 배포가 필요하다는 오류가 계속 표시됩니다.
- Apps Script만 먼저 배포해도 기존 화면은 여전히 projects 원본 요청을 사용하므로, 두 배포를 모두 완료해야 합니다.
