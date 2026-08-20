import json
import os
import urllib.request
import urllib.error

# Load keys from web/.env.local
env_path = os.path.join(os.path.dirname(__file__), '..', 'web', '.env.local')
supabase_url = None
supabase_key = None

with open(env_path, 'r') as f:
    for line in f:
        line = line.strip()
        if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
            supabase_url = line.split('=', 1)[1].strip()
        elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            supabase_key = line.split('=', 1)[1].strip()

if not supabase_url or not supabase_key:
    raise ValueError("Could not find Supabase URL or Key in web/.env.local")

HEADERS = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

OP_MAP = {
    "==": "EQ",
    "<": "LT",
    ">": "GT",
    "<=": "LTE",
    ">=": "GTE"
}

def seed_rules():
    policy_path = os.path.join(os.path.dirname(__file__), 'engine', 'default_policy.json')
    with open(policy_path, 'r') as f:
        policy = json.load(f)

    rows = []

    # 1. Hard Reject Gates
    priority = 100
    for rule in policy.get("hard_reject_gates", []):
        rows.append({
            "rule_code": rule["id"],
            "description": rule["reason"],
            "field_name": rule["field"],
            "operator": OP_MAP.get(rule["operator"], "EQ"),
            "threshold_value": 1.0 if rule["threshold"] is True else (0.0 if rule["threshold"] is False else rule["threshold"]),
            "outcome": "HARD_REJECT", 
            "reason_code": rule["severity"],
            "is_active": True,
            "category": "hard_reject",
            "deviation_weight": None,
            "priority": priority
        })
        priority += 10
        
    # 2. Eligibility Gates
    priority = 200
    for rule in policy.get("eligibility_gates", []):
        rows.append({
            "rule_code": rule["id"],
            "description": rule["reason"],
            "field_name": rule["field"],
            "operator": OP_MAP.get(rule["operator"], "LT"),
            "threshold_value": rule["threshold"],
            "outcome": "HARD_REJECT", 
            "reason_code": rule["severity"],
            "is_active": True,
            "category": "eligibility",
            "deviation_weight": None,
            "priority": priority
        })
        priority += 10

    # 3. Scoring Rules
    scoring = policy.get("scoring_rules", {})
    
    # FOIR Borderline (1 deviation)
    rows.append({
        "rule_code": "SC-FOIR-BORDERLINE",
        "description": "FOIR is above borderline threshold.",
        "field_name": "foir_calculated", 
        "operator": "GT",
        "threshold_value": scoring.get("foir_bands", {}).get("borderline_threshold", 0.55),
        "outcome": "EXCEPTION_L1",
        "reason_code": "FLAG",
        "is_active": True,
        "category": "scoring",
        "deviation_weight": 0,
        "priority": 300
    })
    
    # FOIR Pass (1 deviation)
    rows.append({
        "rule_code": "SC-FOIR-PASS",
        "description": "FOIR is above pass threshold.",
        "field_name": "foir_calculated",
        "operator": "GT",
        "threshold_value": scoring.get("foir_bands", {}).get("pass_threshold", 0.40),
        "outcome": "EXCEPTION_L1",
        "reason_code": "FLAG",
        "is_active": True,
        "category": "scoring",
        "deviation_weight": 1,
        "priority": 310
    })

    # Bureau Fair (2 deviations)
    rows.append({
        "rule_code": "SC-BUREAU-FAIR",
        "description": "Bureau score is below fair.",
        "field_name": "bureauScore",
        "operator": "LT",
        "threshold_value": scoring.get("bureau_bands", {}).get("fair", 650),
        "outcome": "EXCEPTION_L2",
        "reason_code": "FLAG",
        "is_active": True,
        "category": "scoring",
        "deviation_weight": 1,
        "priority": 320
    })

    # Bureau Good (1 deviation)
    rows.append({
        "rule_code": "SC-BUREAU-GOOD",
        "description": "Bureau score is below good.",
        "field_name": "bureauScore",
        "operator": "LT",
        "threshold_value": scoring.get("bureau_bands", {}).get("good", 700),
        "outcome": "EXCEPTION_L1",
        "reason_code": "FLAG",
        "is_active": True,
        "category": "scoring",
        "deviation_weight": 1,
        "priority": 330
    })

    # Insert into Supabase
    url = f"{supabase_url}/rest/v1/rules"
    
    # First, let's clear existing rules to prevent duplicates if run multiple times
    try:
        req = urllib.request.Request(f"{url}?id=not.is.null", headers=HEADERS, method="DELETE")
        urllib.request.urlopen(req)
        print("Delete existing rules: 200")
    except urllib.error.URLError as e:
        print(f"Delete existing rules failed (might be expected if restricted): {e}")

    try:
        data = json.dumps(rows).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=HEADERS, method="POST")
        with urllib.request.urlopen(req) as response:
            if response.status in [200, 201]:
                print("Successfully seeded rules into Supabase.")
    except urllib.error.HTTPError as e:
        print(f"Error seeding rules: {e.code}")
        print(e.read().decode('utf-8'))

if __name__ == "__main__":
    seed_rules()
