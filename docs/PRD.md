# Product Requirements Document — [PROJECT_NAME]

**Status:** Draft — frontend phase
**Basis:** PS-01, "Smart Credit Underwriting & Configurable BRE for NBFC"
(CODEISSANCE 2026 hackathon problem-statement packet)
**Companion docs:** `context.md` (decision history), `design-system.md`
(visual tokens), `login-signup-concept.md` (auth UX spec), `AGENTS.md`
(build instructions for the coding agent)

---

## 1. Problem Summary

An NBFC (Non-Banking Financial Company) needs a way to turn an applicant's
financial data into a transparent, explainable credit decision — without
hardcoding the underlying policy into application code. The system must
support three outcomes (Straight-through Approval, Hard Reject, Exception),
route exceptions through a two-tier human approval hierarchy (L1, then
L2/Credit Head), and make every decision traceable: which rules fired,
what the key numbers were, and why the outcome landed where it did.

This is an **internal operations tool** for the NBFC's credit team — not a
customer-facing loan application. The "user" is always an employee
(Analyst, Approver, or Admin), never the loan applicant themselves.

## 2. Goals

- Demonstrate a working rule-driven decision engine where policy changes
  (thresholds, conditions) take effect without a code deployment.
- Make every decision explainable: show which rules passed/failed and why.
- Support a real approval hierarchy (L1 → L2) with escalation.
- Enforce role-based access control at more than just the UI layer.
- Maintain a full audit trail of privileged actions.

## 3. Non-Goals (explicit)

- Not a production-ready lending platform.
- No real integrations with credit bureaus, banks, or CRMs — all data is
  synthetic/mock.
- No customer-facing / borrower-facing surface of any kind.
- No "RM" (Relationship Manager) role or CRM features — that belongs to a
  different, unrelated problem statement in the same hackathon packet.
- No agentic AI, and no AI/LLM usage of any kind unless a specific,
  justified case arises (e.g., parsing an uploaded PDF bank statement) —
  and even then, the deterministic rule engine remains the actual decision
  authority, not the AI. See context.md §7 for full reasoning.
- **Current phase excludes backend implementation.** See §9 and AGENTS.md.

## 4. Users & Roles

| Role | Core capability | Cannot do |
|---|---|---|
| **Analyst** | Submit/select applicant data; view decisions, rule breakdowns, and explainability detail. | Approve exceptions; edit rules; create users. |
| **L1 Approver** | Review and approve/reject cases flagged `EXCEPTION_L1`; escalate a case to L2 with notes. | Touch rule configuration; approve `EXCEPTION_L2` cases directly. |
| **L2 / Credit Head** | Review and approve/reject cases flagged `EXCEPTION_L2` and anything escalated from L1. Final human authority. | Touch rule configuration. |
| **Admin** | Create user accounts and assign roles; edit BRE rules/thresholds; view full audit log and system-wide reporting. | Approve/reject individual loan cases (not their function). |

Roles are fixed at 4 — see context.md §3 for why L1/L2 were kept separate
and why "RM" was excluded.

## 5. Account Provisioning Flow (Option A)

1. Admin logs into `/admin/users`, enters a new user's email, assigns a
   role.
2. System creates the user record (`status: PENDING_SETUP`) and generates
   a single-use, expiring setup token.
3. An email is sent to the new user containing an activation link
   (`/activate?token=...`) — no plaintext password is ever emailed.
4. New user opens the link, sets their own password, account becomes
   `ACTIVE`.
5. User logs in and is redirected by role (see login-signup-concept.md).
6. Account creation and role assignment are written to the audit log.

There is no public self-registration screen anywhere in the product.

## 6. Core Workflow

1. **Analyst submits an applicant** — selects from sample data (CSV/JSON
   in this phase; real file upload can come later) representing one
   applicant's financials.
2. **System normalizes the input** into a standard applicant profile and
   flags missing/inconsistent critical fields.
3. **System calculates derived metrics** — FOIR (Fixed Obligation to
   Income Ratio), income trend, average balance, bounce count, credit
   utilization, etc.
4. **Rule engine evaluates the profile** against every active `Rule` row,
   producing a Pass/Fail/Triggered result per rule.
5. **Final decision computed** from the combined rule results, respecting
   conflict-handling logic (e.g., a hard-reject rule always overrides a
   pricing rule; multiple triggered exceptions may force an L2-level
   escalation rather than L1).
6. **If Approved:** system also computes eligible loan amount, tenure
   assumptions, and an interest-rate band.
7. **If Exception:** case enters the relevant Approver's queue
   (`EXCEPTION_L1` or `EXCEPTION_L2`), where a human reviews the same
   explainability detail and makes the final call, or escalates further
   (L1 → L2 only).
8. **If Hard Reject:** no further human step — decision is final,
   still with full reasoning shown.
9. **Every step — submission, evaluation, decision, escalation, rule
   change — is written to the audit trail.**

## 7. Required Demo Scenarios (from source document — must all work)

1. Strong profile → Straight-through Approval, with loan amount and rate
   shown.
2. Serious delinquency/write-off → Hard Reject, even if income is strong.
3. Borderline bureau score but strong cash flow/assets → `EXCEPTION_L1`.
4. Multiple deviations or a high loan amount → `EXCEPTION_L2` / Credit
   Head.
5. **Live reconfiguration:** an Admin changes one threshold (e.g., minimum
   CIBIL score), and re-running the *same* applicant produces a different
   outcome — proving the engine is genuinely configurable, not hardcoded.

Mock data provided to the frontend must include applicants pre-built to
hit each of these five scenarios exactly, so they can be demoed without
manual data entry.

## 8. Data Model (design reference — not yet implemented this phase)

Full entity list and rationale live in `context.md` §6. Summary:

- `User`, `PasswordSetupToken` — auth & provisioning
- `Applicant` — normalized profile + raw input snapshot
- `Rule` — the configurable BRE rule table (field, operator, threshold,
  outcome, reason code, version)
- `Evaluation` — one row per run of an applicant through the engine
  (kept separate from `Applicant` specifically to support demo scenario 5
  — re-running the same applicant after a rule change)
- `EvaluationRuleResult` — rule-by-rule breakdown per evaluation, with a
  snapshotted threshold value so historical decisions stay explainable
  even after rules change later
- `ExceptionCase` — the human approval workflow layer, with a
  self-referencing `escalated_from` field for L1→L2 escalation
- `AuditLog` — generic, catch-all log of every privileged action

This phase uses static TypeScript objects shaped identically to this
model, so the transition to a real backend later is a data-source swap,
not a redesign.

## 9. Current Phase Scope: Frontend Only

This build phase produces **UI and interaction only**, backed by static
mock data in-memory (React state / static TS modules) — no real database,
no real email sending, no real password hashing. All of the flows above
must be fully clickable and demonstrable using mock data, including:

- Admin creating a "user" (appends to a mock in-memory list; no real
  email is sent — show a toast/confirmation with a mocked "email sent to
  x@y.com" message instead)
- Rule editing and live re-evaluation of mock applicants against updated
  thresholds (client-side recalculation)
- Full L1 → L2 escalation path on mock exception cases
- Full audit log view populated by mock actions taken during the session

See `AGENTS.md` for explicit build instructions and setup steps for the
coding agent.

## 10. Security Requirements Carried Into Frontend Phase

Even without a real backend yet, the frontend must be built as if RBAC
enforcement will move server-side later:

- Route access checked by role, not just conditionally hiding nav items.
- Attempting to reach a route your role can't access (e.g., L1 approver
  navigating directly to `/admin/rules`) shows an explicit "Unauthorized"
  state, not a broken/empty page.
- No plaintext-password patterns anywhere, even in mock data (mock
  "password_hash" fields should look like hashes, not real strings, to
  keep the data model honest for the eventual backend swap).

## 11. Open Items

- Final project name not yet chosen — replace `[PROJECT_NAME]` throughout
  once decided (see context.md §8 for shortlist).
- ORM/database choice deferred to backend phase (Prisma suggested as
  default, not mandatory — see context.md §6).
- Document-extraction-from-PDF bonus feature is optional and out of scope
  for this phase.
