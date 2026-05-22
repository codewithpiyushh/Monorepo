def test_enterprise_surface_endpoints(client, auth_headers):
    admin_h = auth_headers["admin"]

    endpoints = [
        "/api/enterprise/profiles",
        "/api/enterprise/exceptions",
        "/api/enterprise/dashboard/executive",
        "/api/schedules",
        "/api/sequences",
    ]
    for endpoint in endpoints:
        resp = client.get(endpoint, headers=admin_h)
        assert resp.status_code == 200, f"{endpoint} -> {resp.status_code} :: {resp.text}"
