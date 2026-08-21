import pandas as pd, json, re
path = r'C:\Users\user\OneDrive\바탕 화면\컨설팅리스트_1787013323635.xlsx'
df = pd.read_excel(path, dtype=str).fillna('')
cols=list(df.columns)
cn, ctype, status, customer_reg, custno, name, phonecol, sido, sigungu, dong, source, owner, estno, project, registrant, created = cols[:16]
phone = df[phonecol].astype(str).str.replace(r'[^0-9]', '', regex=True)
dt = pd.to_datetime(df[created], errors='coerce')
period = df[(dt.dt.strftime('%Y-%m-%d') >= '2026-08-14') & (dt.dt.strftime('%Y-%m-%d') <= '2026-08-18')].copy()
period_phone = period[phonecol].astype(str).str.replace(r'[^0-9]', '', regex=True)
valid = period_phone.str.match(r'^01[0-9]{8,9}$', na=False)
test_patterns = {'01012341234','01000000000','01011111111','01099999999','1012341234','1112341234','1000000000','1011111111','01022222222','01033333333'}
test = period_phone.isin(test_patterns) | period_phone.str.match(r'^0100{6,}$', na=False)
base = period[valid & ~test].copy(); base['_phone']=period_phone[valid & ~test]; base['_date']=pd.to_datetime(base[created], errors='coerce').dt.strftime('%Y-%m-%d')
dupe_rows = base.duplicated('_phone', keep='last')
final = base[~dupe_rows].copy()

def stage(row):
    text = str(row[ctype]) + ' ' + str(row[status]) + ' ' + str(row[source])
    if '로켓견적확인' in text or '견적확인' in text: return '1차DB'
    if '로켓 요청' in text or '로켓요청' in text or '컨설팅 요청' in text: return '2차DB'
    return '미분류'
final['_stage']=final.apply(stage, axis=1)
base['_stage']=base.apply(stage, axis=1)

def vc(s): return {str(k): int(v) for k,v in s.value_counts().items()}
out={
 'period':'2026-08-14~2026-08-18',
 'raw_rows': int(len(period)),
 'blank_phone': int((period_phone=='').sum()),
 'invalid_phone_non_blank': int(((~valid) & (period_phone!='')).sum()),
 'test_phone': int(test.sum()),
 'valid_non_test_rows_before_duplicate': int(len(base)),
 'duplicate_rows_excluded_by_phone_keep_last': int(dupe_rows.sum()),
 'final_unique_valid_count': int(len(final)),
 'final_by_date': vc(final['_date']),
 'final_by_stage': vc(final['_stage']),
 'final_by_source': vc(final[source]),
 'base_by_date_before_duplicate': vc(base['_date']),
}
print(json.dumps(out, ensure_ascii=False, indent=2))
