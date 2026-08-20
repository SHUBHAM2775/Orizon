import os
import json
import csv

BASE_DIR = os.path.join(os.path.dirname(__file__), "test_data")

# Persona 1: Perfect (JSON + PDF)
def create_perfect():
    folder = os.path.join(BASE_DIR, "Applicant_1_Perfect")
    os.makedirs(folder, exist_ok=True)
    
    # JSON Base
    with open(os.path.join(folder, "app_data.json"), "w") as f:
        json.dump({
            "applicantId": "PERFECT-01",
            "age": 35,
            "employmentType": "Salaried",
            "requestedLoanAmount": 500000.0,
            "requestedTenure": 36,
            "declaredIncome": 2500000.0,
            "existingObligations": 20000.0,
            "bureauScore": 810
        }, f, indent=2)
        
    # PDF ITR
    with open(os.path.join(folder, "tax_return.txt"), "w") as f:
        f.write("Name: Rajesh Kumar PAN: ABCD1234E\nGross Total Income: 2,500,000.00\n")

# Persona 2: Risky Bank (JSON + CSV)
def create_risky():
    folder = os.path.join(BASE_DIR, "Applicant_2_Risky_Bank")
    os.makedirs(folder, exist_ok=True)
    
    # JSON Base
    with open(os.path.join(folder, "application.json"), "w") as f:
        json.dump({
            "applicantId": "RISKY-02",
            "age": 28,
            "employmentType": "Salaried",
            "requestedLoanAmount": 1000000.0,
            "requestedTenure": 48,
            "declaredIncome": 800000.0,
            "existingObligations": 15000.0,
            "bureauScore": 650
        }, f, indent=2)
        
    # CSV Bank
    with open(os.path.join(folder, "hdfc_stmt.csv"), "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Date", "Narration", "Withdrawal", "Deposit", "Balance"])
        writer.writerow(["01-01", "Salary", "", "65000", "70000"])
        writer.writerow(["05-01", "EMI Debit", "15000", "", "55000"])
        writer.writerow(["10-01", "Chq Bounce", "5000", "", "55000"])
        writer.writerow(["15-01", "Insufficient Funds Rtn", "1000", "", "54000"])

# Persona 3: Ghost (CSV only)
def create_ghost():
    folder = os.path.join(BASE_DIR, "Applicant_3_Ghost")
    os.makedirs(folder, exist_ok=True)
    
    # CSV Base (Alien columns)
    with open(os.path.join(folder, "crm_dump.csv"), "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["cust_id", "cust_age", "job_type", "loan_req", "cibil"])
        writer.writerow(["GHOST-03", "45", "Self-Employed", "2000000", "520"]) # 520 is hard reject

# Persona 4: Mismatch (JSON + PDF + CSV)
def create_mismatch():
    folder = os.path.join(BASE_DIR, "Applicant_4_Mismatch")
    os.makedirs(folder, exist_ok=True)
    
    # JSON Base claims 15L income
    with open(os.path.join(folder, "app.json"), "w") as f:
        json.dump({
            "applicantId": "MISMATCH-04",
            "age": 30,
            "employmentType": "Salaried",
            "requestedLoanAmount": 800000.0,
            "requestedTenure": 24,
            "declaredIncome": 1500000.0,
            "existingObligations": 50000.0,
            "bureauScore": 720
        }, f, indent=2)
        
    # PDF ITR shows 5L income
    with open(os.path.join(folder, "itr_fake.txt"), "w") as f:
        f.write("Gross Total Income: 500,000.00\n")
        
    # CSV Bank shows only 30k deposits
    with open(os.path.join(folder, "bank.csv"), "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "narration", "withdrawal", "deposit", "balance"])
        writer.writerow(["01-01", "Salary", "", "30000", "30000"])

# Persona 5: Alien (JSON + CSV)
def create_alien():
    folder = os.path.join(BASE_DIR, "Applicant_5_Alien")
    os.makedirs(folder, exist_ok=True)
    
    # JSON Base
    with open(os.path.join(folder, "weird_app.json"), "w") as f:
        json.dump({
            "applicantId": "ALIEN-05",
            "age": 29,
            "employmentType": "Salaried",
            "requestedLoanAmount": 200000.0,
            "requestedTenure": 12,
            "declaredIncome": 600000.0,
            "existingObligations": 5000.0,
            "bureauScore": 750
        }, f, indent=2)
        
    # Alien Bank CSV
    with open(os.path.join(folder, "sbi_weird.csv"), "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Txn_Date", "Desc", "Dr", "Cr", "Bal"])
        writer.writerow(["01-01", "Opening", "", "50000", "50000"])
        writer.writerow(["15-01", "EMI Transfer", "5000", "", "45000"])

if __name__ == "__main__":
    os.makedirs(BASE_DIR, exist_ok=True)
    create_perfect()
    create_risky()
    create_ghost()
    create_mismatch()
    create_alien()
    print(f"Created 5 persona folders in {BASE_DIR}")
