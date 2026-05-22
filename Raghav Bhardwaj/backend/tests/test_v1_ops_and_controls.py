def test_v1_ops_health_and_scheduler(client, auth_headers):
    admin_h = auth_headers["admin"]
    r = client.get("/api/v1/ops/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["api_version"] == "v1"

    r2 = client.get("/api/v1/ops/scheduler/jobs", headers=admin_h)
    assert r2.status_code == 200


def test_enterprise_retention_settings_dependency_archive(client, auth_headers):
    admin_h = auth_headers["admin"]

    p = client.post(
        "/api/enterprise/profiles",
        json={"name": "RET-1", "reconciliation_type": "BANK", "frequency": "MONTHLY"},
        headers=admin_h,
    )
    assert p.status_code == 200, p.text
    profile_id = p.json()["id"]
    p2 = client.post(
        "/api/enterprise/profiles",
        json={"name": "RET-2", "reconciliation_type": "BANK", "frequency": "MONTHLY"},
        headers=admin_h,
    )
    assert p2.status_code == 200, p2.text
    profile_id_2 = p2.json()["id"]

    s = client.post(
        "/api/enterprise/settings",
        json={"category": "workflows", "key": "approval_matrix", "value": {"level": "L2"}},
        headers=admin_h,
    )
    assert s.status_code == 200, s.text

    rp = client.post(
        "/api/enterprise/retention/policies",
        json={"name": "std-policy", "retention_days": 1, "purge_after_days": 2, "preserve_for_compliance": True},
        headers=admin_h,
    )
    assert rp.status_code == 200, rp.text

    dep = client.post(
        "/api/enterprise/dependencies",
        json={"parent_profile_id": profile_id, "child_profile_id": profile_id_2, "dependency_type": "close_process", "is_blocking": True},
        headers=admin_h,
    )
    assert dep.status_code == 200, dep.text

    ar = client.post(
        "/api/enterprise/archive",
        json={"profile_id": profile_id, "period_key": "2026-05"},
        headers=admin_h,
    )
    assert ar.status_code == 200, ar.text
    archive_id = ar.json()["archive_id"]

    rr = client.post(f"/api/enterprise/archive/{archive_id}/restore", headers=admin_h)
    assert rr.status_code == 200, rr.text


def test_v1_enterprise_profiles_and_schedule(client, auth_headers):
    admin_h = auth_headers["admin"]

    p = client.post(
        "/api/v1/enterprise/profiles",
        json={"name": "V1-PROFILE", "reconciliation_type": "BANK", "frequency": "MONTHLY"},
        headers=admin_h,
    )
    assert p.status_code == 200, p.text

    l = client.get("/api/v1/enterprise/profiles", headers=admin_h)
    assert l.status_code == 200

    rs = client.post(
        "/api/v1/enterprise/reports/schedule",
        json={"report_type": "executive", "cron_expression": "*/30 * * * *", "recipients": ["admin@drms.com"]},
        headers=admin_h,
    )
    assert rs.status_code == 200, rs.text
