import time


def test_reconciliation_workflow_e2e(client, auth_headers, sample_csv_files):
    admin_h = auth_headers["admin"]
    preparer_h = auth_headers["preparer"]
    reviewer_h = auth_headers["reviewer"]

    create_project = client.post(
        "/api/projects",
        json={"name": "pytest flow project", "description": "integration test"},
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

    mapping = client.post(
        f"/api/projects/{project_id}/mappings",
        headers=admin_h,
        json={
            "mappings": [
                {"source_column": "reference", "target_column": "reference", "is_key_field": True},
                {"source_column": "amount", "target_column": "amount", "is_key_field": False},
            ]
        },
    )
    assert mapping.status_code == 200, mapping.text

    rule = client.post(
        f"/api/projects/{project_id}/rules",
        headers=admin_h,
        json={"name": "Amount Exact", "rule_type": "exact", "config": {"source_column": "amount"}, "is_active": True},
    )
    assert rule.status_code in (200, 201), rule.text

    start_execution = client.post(f"/api/projects/{project_id}/executions", headers=admin_h)
    assert start_execution.status_code == 202, start_execution.text
    execution_id = start_execution.json()["id"]

    status = None
    for _ in range(50):
        current = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=admin_h)
        assert current.status_code == 200, current.text
        status = current.json()["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(0.2)
    assert status == "completed"

    submit = client.post(
        "/api/workflow/submit",
        headers=preparer_h,
        json={"reconciliation_id": execution_id, "comments": "Prepared in pytest; proof: DOC-123"},
    )
    assert submit.status_code == 200, submit.text

    approve = client.post(
        "/api/workflow/approve",
        headers=reviewer_h,
        json={"reconciliation_id": execution_id, "comments": "Approved in pytest"},
    )
    assert approve.status_code == 200, approve.text


def test_reconciliation_delete_option(client, auth_headers, sample_csv_files):
    admin_h = auth_headers["admin"]

    create_project = client.post(
        "/api/projects",
        json={"name": "pytest delete recon project", "description": "delete flow"},
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

    delete_resp = client.post(
        "/api/workflow/delete",
        headers=admin_h,
        json={"reconciliation_id": execution_id, "comments": "cleanup"},
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["deleted"] is True

    get_execution = client.get(f"/api/projects/{project_id}/executions/{execution_id}", headers=admin_h)
    assert get_execution.status_code == 404
