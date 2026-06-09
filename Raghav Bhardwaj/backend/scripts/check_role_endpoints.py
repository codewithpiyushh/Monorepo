from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

USERS = [
    ("approver", "approver123"),
    ("certifier", "certifier123"),
    ("auditor", "auditor123"),
]

ENDPOINTS = [
    ("GET", "/api/enterprise/profiles"),
    ("GET", "/api/enterprise/dashboard/executive"),
    ("GET", "/api/enterprise/analytics/explorer"),
]


def login(username: str, password: str) -> str | None:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    if r.status_code != 200:
        print(f"[LOGIN FAILED] {username}: {r.status_code} {r.text}")
        return None
    data = r.json()
    token = data.get("access_token") or data.get("accessToken")
    if not token:
        print(f"[LOGIN NO TOKEN] {username}: {data}")
        return None
    return token


def test_user(username: str, password: str):
    print(f"\n=== Testing user: {username} ===")
    token = login(username, password)
    if not token:
        return
    headers = {"Authorization": f"Bearer {token}"}
    for method, path in ENDPOINTS:
        if method == "GET":
            r = client.get(path, headers=headers)
        else:
            r = client.request(method, path, headers=headers)
        try:
            body = r.json()
        except Exception:
            body = r.text
        print(f"{path} -> {r.status_code}")
        if r.status_code != 200:
            print("  Response:", body)


def main():
    for u, p in USERS:
        test_user(u, p)


if __name__ == "__main__":
    main()
