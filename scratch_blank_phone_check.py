import pandas as pd, json
path = r'C:\Users\user\OneDrive\바탕 화면\컨설팅리스트_1787013323635.xlsx'
df = pd.read_excel(path, dtype=str).fillna('')
cols=list(df.columns)
cn, ctype, status, customer_reg, custno, name, phonecol, sido, sigungu, dong, source, owner, estno, project, registrant, created = cols[:16]
dt = pd.to_datetime(df[created], errors='coerce')
period = df[(dt.dt.strftime('%Y-%m-%d') >= '2026-08-14') & (dt.dt.strftime('%Y-%m-%d') <= '2026-08-18')].copy()
raw_phone = period[phonecol].astype(str)
phone_digits = raw_phone.str.replace(r'[^0-9]', '', regex=True)
blank = period[phone_digits == ''].copy()

def vc(s): return {str(k): int(v) for k,v in s.value_counts(dropna=False).items()}
preview_cols=[cn, ctype, status, customer_reg, custno, name, phonecol, source, created]
print(json.dumps({
 'phone_column_name': phonecol,
 'period_rows': int(len(period)),
 'blank_phone_rows': int(len(blank)),
 'blank_customer_reg_counts': vc(blank[customer_reg]),
 'blank_type_counts': vc(blank[ctype]),
 'blank_status_counts': vc(blank[status]),
 'blank_source_counts': vc(blank[source]),
 'blank_preview_first_15': blank[preview_cols].head(15).to_dict(orient='records')
}, ensure_ascii=False, indent=2))
