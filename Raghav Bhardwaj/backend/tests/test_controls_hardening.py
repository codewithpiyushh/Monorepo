def test_profile_row_level_visibility(client, auth_headers):
    admin_h = auth_headers["admin"]
    preparer_h = auth_headers["preparer"]
    reviewer_h = auth_headers["reviewer"]
    preparer_me = client.get("/api/auth/me", headers=preparer_h).json()
    reviewer_me = client.get("/api/auth/me", headers=reviewer_h).json()

    p = client.post(
        "/api/enterprise/profiles",
        json={
            "name": "ROW-LEVEL-PROFILE",
            "reconciliation_type": "BANK",
            "frequency": "MONTHLY",
            "assigned_preparer": preparer_me["id"],
            "assigned_reviewer": reviewer_me["id"],
        },
        headers=admin_h,
    )
    assert p.status_code == 200, p.text

    preparer_profiles = client.get("/api/enterprise/profiles", headers=preparer_h)
    assert preparer_profiles.status_code == 200
    preparer_ids = [row["id"] for row in preparer_profiles.json()]
    assert p.json()["id"] in preparer_ids

    reviewer_profiles = client.get("/api/enterprise/profiles", headers=reviewer_h)
    assert reviewer_profiles.status_code == 200
    reviewer_ids = [row["id"] for row in reviewer_profiles.json()]
    assert p.json()["id"] in reviewer_ids


def test_workflow_sod_submitter_cannot_approve(client, auth_headers, sample_csv_files):
    admin_h = auth_headers["admin"]

    create_project = client.post(
        "/api/projects",
        json={"name": "sod workflow project", "description": "sod"},
        headers=admin_h,
    )
    assert create_project.status_code == 201, create_project.text
    project_id = create_project.json()["id"]

    for dataset_type in ("source", "target"):
        upload = client.post(
            f"/api/projects/{project_id}/datasets",
            headers=admin_h,
            files={"file": (f"{dataset_type}.csv", sample_csv_files[dataset_type], "text/csv")},
            data={"dataset_type": dataset_type},
        )
        assert upload.status_code == 201, upload.text

    start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
    assert start_execution.status_code == 202, start_execution.text
    execution_id = start_execution.json()["id"]

    assign = client.post(
        "/api/workflow/assign",
        headers=admin_h,
        json={"reconciliation_id": execution_id, "assigned_to": None, "comments": "assign reviewer"},
    )
    assert assign.status_code == 200, assign.text

    submit = client.post(
        "/api/workflow/submit",
        headers=admin_h,
        json={"reconciliation_id": execution_id, "comments": "submit from admin; proof: TEST-DOC-001"},
    )
    assert submit.status_code == 200, submit.text

    approve = client.post(
        "/api/workflow/approve",
        headers=admin_h,
        json={"reconciliation_id": execution_id, "comments": "self approve"},
    )
    assert approve.status_code == 400
    assert "Segregation of duties violation" in approve.text


def test_import_host_allowlist_blocks_untrusted_api(client, auth_headers):
    admin_h = auth_headers["admin"]
    project = client.post("/api/projects", json={"name": "allowlist-proj", "description": "security"}, headers=admin_h)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    resp = client.post(
        "/api/enterprise/ingestion/import",
        json={
            "source_type": "api",
            "project_id": project_id,
            "dataset_type": "source",
            "payload": {"endpoint": "https://example.com/data", "method": "GET"},
        },
        headers=admin_h,
    )
    assert resp.status_code == 400
    assert "is not allowed" in resp.text
