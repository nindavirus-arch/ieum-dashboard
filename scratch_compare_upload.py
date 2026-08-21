import pandas as pd, json, re
from collections import Counter, defaultdict
xlsx = r'C:\Users\user\OneDrive\바탕 화면\컨설팅리스트_1787013323635.xlsx'
report_path = r'C:\Users\user\Documents\Codex\2026-06-25\github-https-github-com-nindavirus-arch-2\work\ieum-dashboard-main\scratch_report_20260801_0818.json'
df = pd.read_excel(xlsx, dtype=str).fillna('')
cols = list(df.columns)
cn, ctype, status, customer_reg, custno, name, phonecol, sido, sigungu, dong, source, owner, estno, project, registrant, created = cols[:16]
phone = df[phonecol].astype(str).str.replace(r'[^0-9]', '', regex=True)
valid = phone.str.match(r'^01[0-9]{8,9}$', na=False)
test_patterns = {'01012341234','01000000000','01011111111','01099999999','1012341234','1112341234','1000000000','1011111111','01022222222','01033333333'}
test = phone.isin(test_patterns) | phone.str.match(r'^0100{6,}$', na=False)
base = df[valid & ~test].copy(); base['_phone']=phone[valid & ~test]
base['_date'] = pd.to_datetime(base[created], errors='coerce').dt.strftime('%Y-%m-%d')
base = base[(base['_date'] >= '2026-08-01') & (base['_date'] <= '2026-08-18')]
# dashboard duplicate policy is final 원장, but here we approximate latest row per phone in selected range
unique = base.drop_duplicates('_phone', keep='last')

def normalize_channel(s):
    t=str(s).lower().replace(' ','')
    if '당근' in t: return 'danggeun'
    if '인스타' in t or '페이스북' in t or '메타' in t: return 'meta'
    if '네이버' in t: return 'naver'
    if '구글' in t: return 'google'
    if '홈페이지' in t or '온라인-기타' in t or '직접영업' in t: return 'direct'
    if 'tu' in t: return 'tu_albarich'
    if '휴그린본사' in t or '휴그린' in t: return 'hugreen_mail'
    if '인바운드' in t: return 'inbound_call'
    if '바이럴' in t or '블로그' in t or '레뷰' in t: return 'viral'
    if '카카오' in t and '모먼트' in t: return 'kakao_moment'
    if '카카오' in t: return 'kakao_search'
    return 'etc'

def stage(row):
    text = str(row[ctype]) + ' ' + str(row[status]) + ' ' + str(row[source])
    if '로켓견적확인' in text or '견적확인' in text: return 'first'
    if '로켓 요청' in text or '로켓요청' in text or '컨설팅 요청' in text: return 'second'
    return 'unknown'

unique['_channel'] = unique[source].map(normalize_channel)
unique['_stage'] = unique.apply(stage, axis=1)
raw_by_date = unique.groupby('_date').size().to_dict()
raw_by_channel = unique.groupby('_channel').size().to_dict()
raw_stage = unique['_stage'].value_counts().to_dict()
report=json.load(open(report_path, encoding='utf-8-sig'))
dash_by_date={r['date']:r['db'] for r in report['byDate']}
dash_by_channel={r['channel']:r['db'] for r in report['byChannel']}
print(json.dumps({
 'dashboard_updatedAt': report.get('updatedAt'),
 'dashboard_lastDbUploadedAt': report.get('lastDbUploadedAt'),
 'dashboard_aug_totals': report['totals'],
 'latest_file_aug_valid_non_test_rows': int(len(base)),
 'latest_file_aug_unique_phone_rows': int(len(unique)),
 'latest_file_aug_stage_guess': {k:int(v) for k,v in raw_stage.items()},
 'latest_file_aug_by_channel_unique': {k:int(v) for k,v in sorted(raw_by_channel.items(), key=lambda x:-x[1])},
 'latest_file_aug_by_date_unique': {k:int(v) for k,v in sorted(raw_by_date.items())},
 'dashboard_aug_by_channel': dash_by_channel,
 'dashboard_aug_by_date': dash_by_date,
 'diff_dashboard_minus_latest_file_by_date': {d:int(dash_by_date.get(d,0)-raw_by_date.get(d,0)) for d in sorted(set(dash_by_date)|set(raw_by_date))},
}, ensure_ascii=False, indent=2))
