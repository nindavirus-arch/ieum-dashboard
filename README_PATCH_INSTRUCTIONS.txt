# 이음 대시보드 Google Sheets RAW 저장형 패치

## 핵심 변경
- 컨설팅UTM 파일 업로드 → FIRST_DB_RAW + DASHBOARD_LEADS 저장
- 컨설팅리스트 파일 업로드 → SECOND_DB_RAW + DASHBOARD_LEADS 저장
- 2차DB가 direct/홈페이지인 경우 같은 연락처의 1차DB 매체를 승계

## 구글시트 필수 탭
- FIRST_DB_RAW
- SECOND_DB_RAW
- DASHBOARD_LEADS
- AD_SPEND
- CHANNEL_MAPPING

## DASHBOARD_LEADS 1행
붙여넣기:
date	phone	name	stage	dbTier	channel	region	district	utm_source	source_file	status	uploadedAt

## AD_SPEND 1행
붙여넣기:
date	channel	campaign	amount

## FIRST_DB_RAW / SECOND_DB_RAW
원본 컬럼을 유지해도 됩니다. 단, Apps Script는 1행 헤더와 동일한 key만 저장하므로,
원본 헤더가 없거나 다르면 _parsed_date, _parsed_phone 같은 보조 컬럼만 저장될 수 있습니다.
가장 안정적으로 쓰려면 원본 파일의 첫 행 헤더를 그대로 각 RAW 시트 1행에 붙여넣으세요.

## Apps Script
APPS_SCRIPT_CODE.txt 내용을 Apps Script에 붙여넣고 새 버전으로 재배포하세요.

## dataService.ts
SHEET_API_URL에 웹앱 URL을 붙여넣으세요.
