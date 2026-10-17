"""READ-ONLY report of seed/demo data in the live Firestore. Deletes nothing."""
import json, os, subprocess, tempfile, urllib.request, urllib.parse
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
for c in ['products','reviews','users','orders','coupons','homepageSections','staff','carts','uploads','customizations','printJobs','media','categories','combos','banners','faqs','videos','invoices','refunds','notificationOutbox','counters','personalizationTemplates','collections']:  # otpSessions and auditLogs are deliberately never read
    R[c]=docs(c)
# The snapshot holds customer phone numbers: write it to a private directory, owner-only (0600).
snap_dir = tempfile.mkdtemp(prefix='karthys-snapshot-')  # mkdtemp creates the directory with mode 0700
snap = os.path.join(snap_dir, 'snapshot.json')
fd = os.open(snap, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump(R, f)
print('snapshot (owner-only):', snap, '— delete it when you are done')
print({k:len(v) for k,v in R.items()})
