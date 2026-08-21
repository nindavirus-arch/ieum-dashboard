import pandas as pd, json, re
path = r'C:\Users\user\OneDrive\바탕 화면\컨설팅리스트_1787013323635.xlsx'
df = pd.read_excel(path, dtype=str).fillna('')
cols = list(df.columns)
def c(i): return cols[i]
phone = df[c(6)].astype(str).str.replace(r'[^0-9]', '', regex=True)
valid = phone.str.match(r'^01[0-9]{8,9}$', na=False)
test_patterns = {'01012341234','01000000000','01011111111','01099999999','1012341234','1112341234','1000000000','1011111111','01022222222','01033333333'}
test = phone.isin(test_patterns) | phone.str.match(r'^0100{6,}$', na=False)
base = df[valid & ~test].copy()
base['_phone'] = phone[valid & ~test]
dates_all = pd.to_datetime(df[c(15)], errors='coerce')
dates = pd.to_datetime(base[c(15)], errors='coerce')
aug_mask = (dates.dt.date >= pd.Timestamp('2026-08-01').date()) & (dates.dt.date <= pd.Timestamp('2026-08-18').date())
aug = base[aug_mask].copy()

def vc(series, n=None):
    s = series.value_counts(dropna=False)
    if n: s = s.head(n)
    return {str(k): int(v) for k, v in s.items()}

# stage guess by consulting type/status text
first_words = ('로켓견적확인', '견적확인')
second_words = ('로켓요청', '로켓 요청', '상담신청', '컨설팅 요청')
def stage(row):
    text = ''.join(str(row[x]) for x in [c(1), c(2), c(10)])
    if any(w in text for w in first_words): return 'first'
    if any(w in text for w in second_words): return 'second'
    return 'unknown'
aug['_stage_guess'] = aug.apply(stage, axis=1)
base['_stage_guess'] = base.apply(stage, axis=1)

out = {
  'file': path,
  'rows_total': int(len(df)),
  'date_min': str(dates_all.min()),
  'date_max': str(dates_all.max()),
  'phone_valid': int(valid.sum()),
  'phone_invalid': int((~valid).sum()),
  'phone_blank': int((phone == '').sum()),
  'test_phone': int(test.sum()),
  'valid_non_test_rows': int(len(base)),
  'valid_non_test_unique_phone': int(base['_phone'].nunique()),
  'valid_non_test_duplicate_phone_rows_keep_last': int(base.duplicated('_phone', keep='last').sum()),
  'all_type_counts': vc(df[c(1)]),
  'all_status_counts': vc(df[c(2)]),
  'all_customer_reg_counts': vc(df[c(3)]),
  'all_source_top20': vc(df[c(10)], 20),
  'aug_valid_non_test_rows': int(len(aug)),
  'aug_unique_phone': int(aug['_phone'].nunique()),
  'aug_duplicate_phone_rows_keep_last': int(aug.duplicated('_phone', keep='last').sum()),
  'aug_type_counts': vc(aug[c(1)]),
  'aug_status_counts': vc(aug[c(2)]),
  'aug_source_counts': vc(aug[c(10)]),
  'aug_stage_guess_counts': vc(aug['_stage_guess']),
  'all_stage_guess_counts': vc(base['_stage_guess']),
}
print(json.dumps(out, ensure_ascii=False, indent=2))
