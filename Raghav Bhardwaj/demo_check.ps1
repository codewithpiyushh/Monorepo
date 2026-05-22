param(
  [string]$PythonExe = ".\backend\.venv\Scripts\python.exe"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$resolvedPython = Resolve-Path (Join-Path $repoRoot $PythonExe) -ErrorAction SilentlyContinue

if (-not $resolvedPython) {
  Write-Error "Python executable not found. Expected: $PythonExe"
}

$script = @'
import io
import time
from fastapi.testclient import TestClient
from app.main import app

def login(client, username, password):
    r = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert r.status_code == 200, (username, r.status_code, r.text)
    return r.json()['access_token']

def H(token):
    return {'Authorization': f'Bearer {token}'}

with TestClient(app) as c:
    admin = login(c, 'admin', 'admin123')
    preparer = login(c, 'preparer', 'preparer123')
    reviewer = login(c, 'reviewer', 'reviewer123')

    pr = c.post('/api/projects', json={'name': 'Demo Check Project', 'description': 'automated health check'}, headers=H(admin))
    assert pr.status_code == 201, pr.text
    pid = pr.json()['id']

    source = b"entity,account,reference,amount,date\nUS,1000,INV-900,100,2026-04-01\nUS,1000,INV-901,220,2026-04-02\n"
    target = b"entity,account,reference,amount,date\nUS,1000,INV-900,100,2026-04-01\nUS,1000,INV-999,200,2026-04-03\n"

    for dtype, blob in [('source', source), ('target', target)]:
        up = c.post(
            f'/api/projects/{pid}/datasets',
            headers=H(admin),
            files={'file': (f'{dtype}.csv', io.BytesIO(blob), 'text/csv')},
            data={'dataset_type': dtype},
        )
        assert up.status_code == 201, (dtype, up.status_code, up.text)

    mp = c.post(
        f'/api/projects/{pid}/mappings',
        headers=H(admin),
        json={'mappings': [{'source_column': 'reference', 'target_column': 'reference', 'is_key_field': True}]},
    )
    assert mp.status_code == 200, mp.text

    ex = c.post(f'/api/projects/{pid}/executions', headers=H(admin))
    assert ex.status_code == 202, ex.text
    eid = ex.json()['id']

    status = None
    for _ in range(50):
        one = c.get(f'/api/projects/{pid}/executions/{eid}', headers=H(admin))
        assert one.status_code == 200, one.text
        status = one.json()['status']
        if status in ('completed', 'failed'):
            break
        time.sleep(0.2)
    assert status == 'completed', status

    submit = c.post('/api/workflow/submit', headers=H(preparer), json={'reconciliation_id': eid, 'comments': 'Prepared; proof: DEMO-CHECK-001'})
    assert submit.status_code == 200, submit.text
    approve = c.post('/api/workflow/approve', headers=H(reviewer), json={'reconciliation_id': eid, 'comments': 'Approved'})
    assert approve.status_code == 200, approve.text

    ep = c.get('/api/enterprise/exceptions', headers=H(admin))
    assert ep.status_code == 200, ep.text

    print('DEMO_CHECK_OK')
    print({'project_id': pid, 'execution_id': eid, 'status': status})
'@

Push-Location $backendDir
try {
  $script | & $resolvedPython -
} finally {
  Pop-Location
}
