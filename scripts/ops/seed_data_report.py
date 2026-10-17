"""READ-ONLY report of seed/demo data in the live Firestore. Deletes nothing."""
import json, subprocess, urllib.request, urllib.parse
TOKEN = subprocess.run(['gcloud','auth','print-access-token'],capture_output=True,text=True).stdout.strip()
B = "https://firestore.googleapis.com/v1/projects/bropics-app/databases/(default)/documents"
def dec(v):
    k,x=next(iter(v.items()))
    if k=='mapValue': return {a:dec(b) for a,b in x.get('fields',{}).items()}
    if k=='arrayValue': return [dec(i) for i in x.get('values',[])]
    if k=='integerValue': return int(x)
    if k=='doubleValue': return float(x)
    if k=='nullValue': return None
    if k=='timestampValue': return x[:19]
    return x
def get(path, **q):
    url = B + '/' + path + ('?' + urllib.parse.urlencode(q) if q else '')
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization':'Bearer '+TOKEN})))
def docs(path, size=300):
    out=[]; tok=None
    while True:
        q={'pageSize':size}; 
        if tok: q['pageToken']=tok
        try: d=get(path, **q)
        except Exception as e: return out
        out += [{'_id':x['name'].split('/')[-1], **{a:dec(b) for a,b in x.get('fields',{}).items()}} for x in d.get('documents',[])]
        tok=d.get('nextPageToken')
        if not tok: return out
R={}
for c in ['products','reviews','users','orders','coupons','homepageSections','staff','carts','uploads','customizations','printJobs','media','categories','combos','banners','faqs','videos','invoices','refunds','notificationOutbox','auditLogs','counters','personalizationTemplates','collections','otpSessions']:
    R[c]=docs(c)
json.dump(R, open('/tmp/karthys_live_snapshot.json','w'))
print({k:len(v) for k,v in R.items()})
