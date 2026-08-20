# Product Requirements Document (PRD): Configurable BRE & XAI Engine

This document serves as the absolute source of truth for implementing the Decision Engine (Layer 2) and the Explainability Engine (Layer 3/4) in Python. 

## 1. End-to-End Underwriting Pipeline (Flowchart)

Below is the architectural flow of the entire application, distinguishing strictly between deterministic systems (Gray) and AI-involved systems (Purple).

```mermaid
graph TD
    classDef gray fill:#f1f5f9,stroke:#64748b,color:#0f172a,stroke-width:2px;
    classDef purple fill:#faf5ff,stroke:#a855f7,color:#3b0764,stroke-width:2px;
    classDef container fill:transparent,stroke:#94a3b8,stroke-dasharray: 5 5,stroke-width:2px;
    classDef purpleContainer fill:transparent,stroke:#a855f7,stroke-width:2px;

    %% 1. INPUT ROUTING
    Start([Application Submitted]):::gray --> Type{Input Type?}:::gray
    Type -->|JSON / CSV| Map[Map fields directly]:::gray
    
    %% Convergence Node
    Map --> P[[Normalized Applicant Profile]]:::gray

    Type -->|PDF| S2
    
    %% 2. AGENTIC LOOP (PDF only)
    subgraph S2[2. AGENTIC LOOP]
        direction TB
        Extract[Extract: parse_document]:::purple --> Draft[Draft Profile]:::purple
        Draft --> PlanAct((Plan -> Act -> Observe -> Reflect)):::purple
        PlanAct -->|Loop until sufficient| PlanAct
        PlanAct -->|Success| Brief[Case Brief]:::purple
        PlanAct -.->|AI unavailable| Fallback[Fallback to raw fields]:::gray
    end
    class S2 purpleContainer
    
    Brief --> P
    Fallback -.-> P

    %% 3. RULE ENGINE
    subgraph S3[3. RULE ENGINE]
        P --> Derive[Derive Metrics]:::gray
        Derive --> Eval[Evaluate Active Rules]:::gray
        Eval --> Conflict[Conflict Resolution]:::gray
        Conflict --> Outcome{Outcome?}:::gray
        
        Outcome --> App[Straight-Through Approval]:::gray
        Outcome --> HR[Hard Reject]:::gray
        Outcome --> Ex1[Exception L1]:::gray
        Outcome --> Ex2[Exception L2]:::gray
        
        App --> Pricing[Eligibility & Pricing]:::gray
        Ex1 --> Pricing
        Ex2 --> Pricing
    end
    class S3 container

    %% 4. XAI LAYER
    subgraph S4[4. XAI LAYER]
        direction LR
        Outcome --> Breakdown[Rule Breakdown]:::gray
        Outcome --> Counter[Counterfactual]:::gray
        Outcome --> Trace[Agent Trace]:::purple
        Outcome --> Audit[Hash-Chained Audit Entry]:::gray
    end
    class S4 container

    Brief -.->|trace| Trace

    %% 5. HUMAN REVIEW
    subgraph S5[5. HUMAN REVIEW]
        Ex1 --> L1Q[L1 Approver Queue]:::gray
        L1Q -->|Over Limit| L2Q[L2 / Credit Head Queue]:::gray
        Ex2 --> L2Q
        L1Q --> Log[Decision + Comment Logged]:::gray
        L2Q --> Log
    end
    class S5 container

    %% 6. OUTPUT
    App --> Final[[Application Result Screen]]:::gray
    HR --> Final
    Log --> Final
    
    %% Output Sub-elements Note
    note1[Final decision banner<br/>Eligible amount/rate<br/>Risk grade<br/>Rule breakdown<br/>Counterfactual<br/>AI investigation panel<br/>Audit trail + verify-integrity]
    Final --- note1
```

---

## 2. Rule Categories (The Synthetic Policy)
This is the actual policy the BRE will execute, evaluated sequentially.

**1. Hard-Reject Gates (Checked first, overrides everything)**
- `Fraud/blacklist flag == true` → REJECT
- `writeOffFlag == true` OR `settlementFlag == true` → REJECT
- `DPD 90+ in last 6 months` → REJECT
- `bureauScore < 550` → REJECT (Absolute floor, no compensating factors)

**2. Eligibility Gates**
- `age < 21 OR age > 60` (at maturity) → INELIGIBLE
- `businessVintage < 6` (salaried months) OR `< 24` (self-employed months) → INELIGIBLE (unless compensating factor)
- `declaredIncome < 15000` → INELIGIBLE

**3. Repayment Capacity — FOIR**
*(FOIR = (existingObligations + proposed EMI) / declaredIncome)*
- `FOIR <= 0.40` (40%) → PASS
- `FOIR > 0.40 AND <= 0.55` → BORDERLINE (Routes to Exception or needs Asset compensation)
- `FOIR > 0.55` → REJECT (Unless liquid assets cover loan multiple)

**4. Bureau/Credit Behavior**
- Score Bands: `≥750` (Excellent) | `700–749` (Good) | `650–699` (Fair / Exception Eligible) | `550–649` (Weak / L2 Exception Only)
- `enquiries > 4` (in 3 months) → FLAG (Over-leveraging)
- `overdueAmount > 10000` → FLAG

**5. Bank Statement Behavior**
- `bounceCount`: `0` (Clean) | `1-2` (Borderline) | `3+` (Reject/Exception)
- `cashFlowVolatility > 0.4` → FLAG
- `bankAvgBalance < (1x proposed EMI)` → FLAG

**6. Income Trend (ITR)**
- `incomeTrend` YoY decline `> 20%` → FLAG (pushes to exception)

**7. Assets (The Compensating Lever)**
- `declaredAssets >= (0.5 * requestedLoanAmount)` → Moves borderline FOIR/Bureau from Reject to Exception. (Does NOT override Hard-Reject gates).

**8. Loan Sizing & Pricing**
- `eligibleAmount` = `min(income_multiplier * annual_income, asset_cap, requestedLoanAmount)`
- `riskGrade` (A-E composite of bureau + FOIR + bounce) maps to interest rate band.

---

## 3. Engine Execution Flow (Chain of Thought)
How the engine processes a single applicant inside `engine.py`.

1. **Normalize**: Map inputs to `NormalizedApplicantProfile`. If missing critical field (e.g., no bureau score), short-circuit to `Insufficient Data`.
2. **Compute Derived Metrics**: Calculate FOIR, income trend, average balance, etc.
3. **Evaluate Hard-Reject Gates**: If any trigger -> `Hard Reject`. STOP execution. Eligibility/Pricing rules do not run.
4. **Evaluate Eligibility Gates**: If fail -> `Reject` or `Insufficient Data`.
5. **Evaluate Scoring Rules**: Run Bureau, FOIR, Bounce, Trend, Asset rules. **Log every single rule** (pass/fail/severity). Do not short circuit here.
6. **Aggregate Outcomes**: 
   - All rules safe -> `Straight-through Approval`.
   - Any borderline deviation -> `Exception Required`.
7. **Exception Assignment**: 
   - 1 deviation -> `Exception L1`.
   - 2+ deviations OR Loan Amount > Cap -> `Exception L2`.
8. **Loan Sizing & Pricing**: Computed based on Risk Grade (only for non-hard-rejects).
9. **Persist Trace**: Output an array of all evaluated rules (id, condition, threshold, value, pass/fail, reason code).

---

## 4. The Explainability Engine (XAI Layer)
**CRITICAL CONSTRAINT**: The AI Explanation Layer *never decides anything*. It is a pure function that reads the deterministic trace from Step 9 and narrates it.

- **Output 1 (Narrative)**: Generates human-readable text explaining the rejection or exception. (e.g., *"Rejected. Bureau score 640 is below the 650 minimum..."*)
- **Output 2 (Factor Ranking)**: Ranks rules by configured severity weights (not a black-box model).
- **Output 3 (Counterfactual)**: Re-runs the deterministic engine with small input perturbations. (e.g., *"Approved if income were ₹8,000 higher"*).
- **Output 4 (Exception Memo)**: For L1/L2 approvers. Synthesizes the trace into a 1-paragraph recommendation.
