param(
  [string]$PythonExe = "d:\EY_PROJECTS\RECON_PROJECT\drms_AI\backend\.venv_test\Scripts\python.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PythonExe)) {
  Write-Error "Python executable not found at: $PythonExe"
}

$script = @'
import io
import time
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)

def login(u, p):
    r = c.post('/api/auth/login', json={'username': u, 'password': p})
    assert r.status_code == 200, (u, r.status_code, r.text)
    return r.json()['access_token']

def H(t):
    return {'Authorization': f'Bearer {t}'}

admin = login('admin', 'admin123')
prep = login('preparer', 'preparer123')
rev = login('reviewer', 'reviewer123')

pr = c.post('/api/projects', json={'name': 'Demo Check Project', 'description': 'automated demo health check'}, headers=H(admin))
assert pr.status_code == 201, pr.text
pid = pr.json()['id']

source = b"entity,account,reference,amount,date\nUS,1000,INV-900,100,2026-04-01\nUS,1000,INV-901,220,2026-04-02\n"
target = b"entity,account,reference,amount,date\nUS,1000,INV-900,100,2026-04-01\nUS,1000,INV-999,200,2026-04-03\n"

for dt, blob in [('source', source), ('target', target)]:
    up = c.post(
        f'/api/projects/{pid}/datasets',
        headers=H(admin),
        files={'file': (f'{dt}.csv', io.BytesIO(blob), 'text/csv')},
        data={'dataset_type': dt},
    )
    assert up.status_code == 201, (dt, up.status_code, up.text)
    dsid = up.json()['id']
    pv = c.get(f'/api/projects/{pid}/datasets/{dsid}/preview?limit=5', headers=H(admin))
    assert pv.status_code == 200, (dt, pv.status_code, pv.text)

mp = c.post(
    f'/api/projects/{pid}/mappings',
    headers=H(admin),
    json={
        'mappings': [
            {'source_column': 'reference', 'target_column': 'reference', 'is_key_field': True},
            {'source_column': 'entity', 'target_column': 'entity', 'is_key_field': False},
            {'source_column': 'account', 'target_column': 'account', 'is_key_field': False},
            {'source_column': 'amount', 'target_column': 'amount', 'is_key_field': False},
        ]
    },
)
assert mp.status_code == 200, mp.text

rule = c.post(
    f'/api/projects/{pid}/rules',
    headers=H(admin),
    json={'name': 'Amount Exact', 'rule_type': 'exact', 'config': {'source_column': 'amount'}, 'is_active': True},
)
assert rule.status_code in (200, 201), rule.text

ex = c.post(f'/api/projects/{pid}/executions', headers=H(admin))
assert ex.status_code == 202, ex.text
eid = ex.json()['id']

status = None
for _ in range(30):
    one = c.get(f'/api/projects/{pid}/executions/{eid}', headers=H(admin))
    assert one.status_code == 200, one.text
    status = one.json()['status']
    if status in ('completed', 'failed'):
        break
    time.sleep(0.2)

assert status == 'completed', status

res = c.get(f'/api/projects/{pid}/executions/{eid}/results?page=1&page_size=10', headers=H(admin))
assert res.status_code == 200, res.text
rj = res.json()
assert rj.get('total', 0) >= 1, rj

wf_prep = c.get(f'/api/workflow?reconciliation_id={eid}', headers=H(prep))
assert wf_prep.status_code == 200, wf_prep.text
assert len(wf_prep.json()) >= 1, wf_prep.json()

submit = c.post('/api/workflow/submit', headers=H(prep), json={'reconciliation_id': eid, 'comments': 'Prepared'})
assert submit.status_code == 200, submit.text

wf_rev = c.get(f'/api/workflow?reconciliation_id={eid}', headers=H(rev))
assert wf_rev.status_code == 200, wf_rev.text
assert len(wf_rev.json()) >= 1, wf_rev.json()

approve = c.post('/api/workflow/approve', headers=H(rev), json={'reconciliation_id': eid, 'comments': 'Approved'})
assert approve.status_code == 200, approve.text

for role, tok in [('admin', admin), ('preparer', prep), ('reviewer', rev)]:
    q = 'actionable_preparer' if role == 'preparer' else ('actionable_reviewer' if role == 'reviewer' else '')
    endpoint = f"/api/enterprise/exceptions{'?queue_type=' + q if q else ''}"
    eq = c.get(endpoint, headers=H(tok))
    assert eq.status_code == 200, (role, eq.status_code, eq.text)

print('DEMO_CHECK_OK')
print({'project_id': pid, 'execution_id': eid, 'results_total': rj.get('total'), 'status': status})
'@

Push-Location "d:\EY_PROJECTS\RECON_PROJECT\drms_AI\backend"
try {
  $script | & $PythonExe -
} finally {
  Pop-Location
}
