# Context — Prior Decisions Log

This file captures every decision made during scoping conversations before
build started. It exists so any agent (human or AI) picking up this project
has the full "why" behind each choice, without re-deriving it. Treat this as
the source of truth for intent; PRD.md is the source of truth for spec.

## 1. Problem Statement Basis

This project is being built for **PS-01: Smart Credit Underwriting &
Configurable BRE for NBFC**, from a 24-hour hackathon problem-statement
packet (CODEISSANCE 2026 / CODESTORM, sponsored problem statements).

Core ask, in plain terms: build a working MVP that takes applicant financial
data and produces a transparent, explainable, rule-driven credit decision —
Approve / Hard Reject / Exception — where the rules themselves are
**configurable at runtime**, not hardcoded in the codebase.

This is explicitly **not** about building a production-grade lending
platform, and **not** about real bureau/bank integrations. Synthetic/mock
data (CSV/JSON/Excel) is expected and sufficient.

## 2. Scope Decision: Frontend-First

**Decision:** Current build phase is frontend-only.

- No real backend, no real database wiring yet.
- Static/mock TypeScript data structures stand in for what will later be
  Postgres-backed tables (see schema in PRD.md — designed already, not yet
  implemented).
- Purpose of this phase: validate the full role-based workflow, screen
  flows, and information architecture visually before investing in backend
  wiring.

## 3. Roles — Final Decision

Considered merging L1 and L2 approvers into a single "Approver" role for
build speed. **Rejected** — PS-01 explicitly names L1 and L2 as separate
exception levels and includes a named demo scenario requiring them to
behave differently (Scenario 4: "Multiple deviations or high loan amount →
L2/Credit Head exception" vs Scenario 3: "Borderline bureau score but
strong cash flow/assets → L1 exception"). Merging them would visibly fail
to demonstrate a requirement explicitly called out in the source document.

**Final roles (4, no more, no less):**

| Role | Function |
|---|---|
| Analyst | Submits/selects applicant data, views decisions and rule breakdowns. Cannot approve exceptions or edit rules. |
| L1 Approver | Reviews and approves/rejects cases flagged `EXCEPTION_L1`. Can escalate a case to L2. |
| L2 / Credit Head | Reviews and approves/rejects cases flagged `EXCEPTION_L2`, plus anything escalated from L1. Final human authority — no further escalation. |
| Admin | Owns the rule configuration (BRE thresholds/conditions) and user provisioning. Does not approve individual loan cases. |

**Explicitly excluded:** "RM" (Relationship Manager) — this role belongs to
a *different* problem statement in the same packet (PS-02, an
event-driven CRM/sales problem), not PS-01. Including it would be scope
creep from an unrelated brief.

## 4. Account Provisioning — Final Decision

**Rejected approach:** open self-registration where a new user picks their
own role at signup. This defeats RBAC entirely — the source document's
mandatory security section requires backend-enforced, role-based access,
and explicitly states judges will attempt unauthorized role/data access as
a judging check. Self-selected roles would trivially fail that check.

**Chosen approach — "Option A": Admin-provisioned accounts, invite-only.**

- No public sign-up form exists in the product.
- Only an Admin can create a new user account: Admin enters an email and
  assigns a role (Analyst / L1 / L2) at creation time.
- System sends the new user their credentials via email (see Section 5).
- User logs in directly — no "pending approval" waiting state, since the
  account is already fully provisioned and role-assigned by the time it's
  created.
- Every account-creation action is written to the audit trail (actor,
  target, role assigned, timestamp) per the mandatory audit requirement.

## 5. Credential Delivery — Design Preference

Two options were discussed:

1. Email a temporary plaintext password directly.
2. Email a one-time "Set your password" link (a random token, expiring,
   single-use) — user sets their own password on first login.

**Preference: Option 2.** Slightly more work, meaningfully better security
posture, and a natural thing to point to when explaining the security
architecture (a requirement of the source document — teams must "explain
the production approach for... secrets management, token/session expiry").

Backend implication (for later phase): a `PasswordSetupToken` table with
`expires_at` and `used_at` fields (already reflected in the schema below).

## 6. Data Model — Finalized Entities

Designed collaboratively; captured in full in PRD.md → Data Model section.
Summary of entities and why each exists:

- **User** — all logins (Admin/Analyst/L1/L2); role assigned at creation,
  never self-selected.
- **PasswordSetupToken** — supports the invite-link credential flow.
- **Applicant** — the normalized profile produced by the "data ingestion &
  normalization" requirement. Stores both computed fields and the original
  raw input (`raw_input_json`) for traceability.
- **Rule** — the actual configurable BRE rule row Admin edits (field,
  operator, threshold, outcome, reason code, version). This table is what
  makes "configurable, not hardcoded" literally true rather than a claim.
- **Evaluation** — one row per time an applicant is run through the engine.
  Kept separate from Applicant specifically to support the required demo
  scenario where a threshold is changed live and the *same* applicant is
  re-run — you get full history instead of overwriting a single decision.
- **EvaluationRuleResult** — the rule-by-rule Pass/Fail/Triggered breakdown
  that powers the explainability requirement. Snapshots
  `threshold_at_evaluation` so historical decisions stay internally
  consistent even after Admin changes a rule later.
- **ExceptionCase** — the human approval workflow layer (assignment,
  escalation via self-referencing `escalated_from`, decision notes),
  intentionally kept separate from Evaluation since not every evaluation
  needs this (approvals/hard-rejects don't touch this table).
- **AuditLog** — catch-all for every privileged/traceable action: logins,
  rule changes, approvals, user creation. Generic `target_type`/`target_id`
  pattern so one table covers all entities.

ORM/DB choice was explicitly left open — Prisma was suggested as a
convenience default, but Drizzle, raw `pg`, or SQLite are all acceptable
substitutes depending on team familiarity. Not a hard requirement.

## 7. Explicit Non-Goals

- **Agentic AI** — the source document never mentions "agentic AI." The
  only AI-adjacent line in the entire document is "AI/ML/LLMs are
  optional... an API wrapper alone is not considered a strong solution,"
  plus one bonus line about "document extraction from sample PDFs." The
  core rule engine is intentionally deterministic, not AI-driven — that's
  the actual point of a BRE (predictable, auditable, explainable). AI use
  should not be forced into this project unless there's a genuine,
  justified fit (e.g., parsing an uploaded PDF bank statement into
  structured fields) — and even then, the rule engine still makes the
  actual decision, not the AI.
- **Real bureau/bank/CRM integrations** — explicitly not required per the
  source document; simulate with static/mock data throughout.
- **RM role / CRM features** — belongs to a different problem statement in
  the same packet, not this one.

## 8. Naming

Project name under consideration: candidates discussed included Verdict,
Bresight, Cibra, Excalate, Orizon, Foirion, Reasonix. No single name was
finalized as of this document — see PRD.md for placeholder usage. Replace
`[PROJECT_NAME]` throughout once decided.

## 9. Design Direction — Constraints Set During Scoping

- Explicitly avoid the "generic AI-generated" look: no default dark/shady
  themes, no overused terracotta-on-cream or near-black-with-neon-accent
  palettes.
- Theme should tie back to the actual subject matter (credit decisioning,
  rules, structured judgment) rather than generic fintech clichés.
- Login/signup should not be a plain stacked form — a more distinctive,
  "niche" interaction pattern was requested (not a full theme-switcher, but
  something structurally more interesting — see design-system.md and
  login-signup-concept.md for the resolved direction).

Full design tokens, rationale, and the login/signup interaction spec are in
`design-system.md` and `login-signup-concept.md` rather than duplicated
here.
