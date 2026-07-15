import requests
import sys

BASE = "http://localhost:8000/api"

def login(username, password):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    if r.status_code != 200:
        print(f"Failed to login as {username}: {r.text}")
        sys.exit(1)
    return r.json()["access_token"]

def main():
    print("Orchestrating workflows...")
    token_admin = login("admin", "admin123")
    headers_admin = {"Authorization": f"Bearer {token_admin}"}
    
    # Get all balances
    r = requests.get(f"{BASE}/v1/balances", headers=headers_admin)
    if r.status_code != 200:
        print("Failed to fetch balances.")
        sys.exit(1)
    
    balances = r.json().get("items", [])
    if not balances:
        print("No balances found. Seed script might have failed.")
        sys.exit(1)
        
    print(f"Found {len(balances)} balances to orchestrate.")
    
    # We expect ~5 balances from the seed script. We will process them sequentially.
    # 1. Bank Recon -> Leave DRAFT / OUT_OF_BALANCE
    # 2. AR -> Submit (UNDER_REVIEW)
    # 3. AP -> Approve (APPROVED)
    # 4. Intercompany -> Certify (CERTIFIED)
    # 5. Payroll -> Add Explanation, leave DRAFT
    
    # Sort by ID
    balances = sorted(balances, key=lambda x: x["id"])
    
    for i, b in enumerate(balances):
        bal_id = b["id"]
        status = b["status"]
        print(f"\nProcessing Balance ID {bal_id} (Current: {status}) - Target Phase {i % 5}")
        
        # We need the assigned users from the backend
        # To make it simple, we'll just login as preparer, approver, certifier
        h_prep = {"Authorization": f"Bearer {login('preparer', 'preparer123')}"}
        h_appr = {"Authorization": f"Bearer {login('approver', 'approver123')}"}
        h_cert = {"Authorization": f"Bearer {login('certifier', 'certifier123')}"}
        
        phase = i % 5
        
        # Helper to provide narrative if out of balance
        def provide_explanation():
            if b.get("status") == "OUT_OF_BALANCE":
                requests.patch(f"{BASE}/v1/balances/{bal_id}/explanation", headers=h_prep, json={
                    "root_cause_category": "TIMING_DIFFERENCE",
                    "variance_explanation": "Timing difference confirmed by banking partner."
                })
        
        try:
            if phase == 0:
                print("  -> Action: Leave as DRAFT/OUT_OF_BALANCE")
                pass # Do nothing
                
            elif phase == 1:
                print("  -> Action: Submit to UNDER_REVIEW")
                provide_explanation()
                r = requests.post(f"{BASE}/v1/balances/{bal_id}/submit", headers=h_prep, json={"comments": "Submitted for review"})
                if r.status_code != 200: print(f"Submit Failed: {r.text}")
                
            elif phase == 2:
                print("  -> Action: Submit & Approve to APPROVED")
                provide_explanation()
                requests.post(f"{BASE}/v1/balances/{bal_id}/submit", headers=h_prep, json={"comments": "Submitted for review"})
                r = requests.post(f"{BASE}/v1/balances/{bal_id}/approve", headers=h_appr, json={"comments": "Approved"})
                if r.status_code != 200: print(f"Approve Failed: {r.text}")
                
            elif phase == 3:
                print("  -> Action: Submit, Approve & Certify to CERTIFIED")
                provide_explanation()
                requests.post(f"{BASE}/v1/balances/{bal_id}/submit", headers=h_prep, json={"comments": "Submitted"})
                requests.post(f"{BASE}/v1/balances/{bal_id}/approve", headers=h_appr, json={"comments": "Approved"})
                r = requests.post(f"{BASE}/v1/balances/{bal_id}/certify", headers=h_cert, json={"comments": "Certified"})
                if r.status_code != 200: print(f"Certify Failed: {r.text}")
                
            elif phase == 4:
                print("  -> Action: Provide Explanation only")
                provide_explanation()
                
        except Exception as e:
            print(f"Error processing balance {bal_id}: {e}")

    print("\nOrchestration complete!")

if __name__ == "__main__":
    main()
