/**
 * mock-data.ts — Static TypeScript mock data for the frontend phase.
 *
 * Shapes match PRD.md §8 entities exactly so a backend swap later is
 * a data-source replacement, not a redesign.
 *
 * Five applicants pre-built to hit all 5 required demo scenarios (PRD §7):
 *   APP1001 → Scenario 1: Strong profile → APPROVED
 *   APP1002 → Scenario 2: Delinquency → HARD REJECT
 *   APP1003 → Scenario 3: Borderline CIBIL, strong cash flow → EXCEPTION_L1
 *   APP1004 → Scenario 4: Multiple deviations, high amount → EXCEPTION_L2
 *   APP1005 → Scenario 5: Same as APP1003, re-runs after threshold change
 *
 * Rule engine (evaluateApplicant) is a pure function — same input + same
 * rules always produces the same output. Admin changes rules in memory;
 * re-running produces a fresh Evaluation, keeping both in history.
 */

// ─── Enums / union types ───────────────────────────────────────────────────────

export type DecisionOutcome =
  | "APPROVED"
  | "HARD_REJECT"
  | "EXCEPTION_L1"
  | "EXCEPTION_L2";

export type RuleOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "neq";
export type RuleOutcome = "HARD_REJECT" | "EXCEPTION_L1" | "EXCEPTION_L2" | "APPROVE_FACTOR";

export type ExceptionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED_TO_L2";

export type AuditAction =
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "RULE_UPDATED"
  | "APPLICATION_SUBMITTED"
  | "EVALUATION_RUN"
  | "EXCEPTION_APPROVED"
  | "EXCEPTION_REJECTED"
  | "EXCEPTION_ESCALATED"
  | "ACCOUNT_ACTIVATED"
  | "LOGIN";

// ─── Entity types ──────────────────────────────────────────────────────────────

export interface Applicant {
  id: string;
  name: string;
  email: string;
  /** Requested loan amount in INR */
  loanAmount: number;
  /** Loan tenure in months */
  tenureMonths: number;
  /** CIBIL / bureau credit score */
  cibilScore: number;
  /** Fixed Obligation to Income Ratio (%) */
  foir: number;
  /** Average monthly bank balance in INR */
  avgMonthlyBalance: number;
  /** Number of EMI bounces in last 12 months */
  bounceCount: number;
  /** Annual gross income in INR */
  annualIncome: number;
  /** Any write-off or settled account in history */
  hasWriteOff: boolean;
  /** Submitted timestamp */
  submittedAt: string;
  /** Which analyst submitted this */
  submittedBy: string;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  /** Field on Applicant this rule evaluates */
  field: keyof Applicant;
  operator: RuleOperator;
  threshold: number;
  /** What this rule triggers if the condition is met (violated) */
  outcome: RuleOutcome;
  reasonCode: string;
  /** Human-readable explanation for the applicant file */
  explanation: string;
  isActive: boolean;
  /** Version counter — increments on each admin edit */
  version: number;
  lastEditedBy: string;
  lastEditedAt: string;
}

export interface EvaluationRuleResult {
  ruleId: string;
  ruleName: string;
  reasonCode: string;
  /** The applicant's actual value for this field */
  actualValue: number | boolean;
  /** Snapshot of threshold at evaluation time — stays correct even if admin changes it later */
  thresholdAtEvaluation: number;
  operator: RuleOperator;
  /** true = rule condition was violated (triggered) */
  triggered: boolean;
  outcome: RuleOutcome;
  explanation: string;
}

export interface Evaluation {
  id: string;
  applicantId: string;
  runAt: string;
  runBy: string;
  finalDecision: DecisionOutcome;
  /** Eligible loan amount (only set when APPROVED) */
  eligibleAmount?: number;
  /** Interest rate band (only set when APPROVED) */
  interestRateBand?: string;
  /** The email of the person who approved it, if applicable */
  approvedByEmail?: string;
  ruleResults: EvaluationRuleResult[];
  /** Which rule version snapshot was used */
  rulesVersion: number;
  derivedMetrics?: any;
}

export interface ExceptionCase {
  id: string;
  evaluationId: string;
  applicantId: string;
  level: "L1" | "L2";
  status: ExceptionStatus;
  assignedTo?: string;
  /** Decision notes from approver */
  notes?: string;
  decidedBy?: string;
  decidedAt?: string;
  /** Set when L1 escalates to L2 */
  escalatedFrom?: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorEmail: string;
  actorRole: string;
  targetType: string;
  targetId: string;
  description: string;
  timestamp: string;
  meta?: Record<string, string | number | boolean>;
}

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: "analyst" | "l1-approver" | "l2-approver" | "admin";
  status: "ACTIVE" | "PENDING_SETUP";
  createdAt: string;
  createdBy: string;
}

// ─── Initial Rules (configurable via Admin) ───────────────────────────────────

export const INITIAL_RULES: Rule[] = [
  {
    id: "RULE-CIBIL-001",
    name: "Minimum CIBIL Score",
    description: "Applicants below the minimum bureau score are hard-rejected.",
    field: "cibilScore",
    operator: "lt",
    threshold: 700,
    outcome: "HARD_REJECT",
    reasonCode: "RULE-CIBIL-001",
    explanation: "CIBIL score below minimum threshold of 700.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "RULE-FOIR-002",
    name: "FOIR Ceiling",
    description: "Applicants whose fixed obligations exceed 55% of income are rejected.",
    field: "foir",
    operator: "gt",
    threshold: 55,
    outcome: "HARD_REJECT",
    reasonCode: "RULE-FOIR-002",
    explanation: "FOIR exceeds maximum threshold of 55%.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "RULE-BOUNCE-003",
    name: "EMI Bounce Limit",
    description: "More than 2 bounces in 12 months triggers L1 exception review.",
    field: "bounceCount",
    operator: "gt",
    threshold: 2,
    outcome: "EXCEPTION_L1",
    reasonCode: "RULE-BOUNCE-003",
    explanation: "EMI bounce count exceeds 2 in the last 12 months.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "RULE-AMT-004",
    name: "High Loan Amount — L2 Review",
    description: "Loan requests above ₹10,00,000 require Credit Head sign-off.",
    field: "loanAmount",
    operator: "gt",
    threshold: 1000000,
    outcome: "EXCEPTION_L2",
    reasonCode: "RULE-AMT-004",
    explanation: "Loan amount exceeds ₹10,00,000 — requires L2 / Credit Head review.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "RULE-WRITEOFF-005",
    name: "Write-off / Settlement History",
    description: "Any prior write-off or settled account is an automatic hard reject.",
    field: "hasWriteOff",
    operator: "eq",
    threshold: 1, // 1 = true
    outcome: "HARD_REJECT",
    reasonCode: "RULE-WRITEOFF-005",
    explanation: "Applicant has a prior write-off or settled account on record.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
  {
    id: "RULE-CIBIL-006",
    name: "Borderline CIBIL — L1 Exception",
    description: "Scores between 700–720 with strong cash flow are referred to L1 for judgment.",
    field: "cibilScore",
    operator: "lt",
    threshold: 720,
    outcome: "EXCEPTION_L1",
    reasonCode: "RULE-CIBIL-006",
    explanation: "CIBIL score is in the borderline range (700–720); referred for L1 review.",
    isActive: true,
    version: 1,
    lastEditedBy: "admin@orizon.in",
    lastEditedAt: "2026-08-01T09:00:00Z",
  },
];

// ─── Five applicants — one per demo scenario ───────────────────────────────────

export const APPLICANTS: Applicant[] = [
  {
    // Scenario 1: Strong profile → APPROVED
    id: "APP1001",
    name: "Priya Shankar",
    email: "priya.shankar@example.com",
    loanAmount: 500000,
    tenureMonths: 36,
    cibilScore: 782,
    foir: 32,
    avgMonthlyBalance: 85000,
    bounceCount: 0,
    annualIncome: 1800000,
    hasWriteOff: false,
    submittedAt: "2026-08-18T10:15:00Z",
    submittedBy: "analyst@orizon.in",
  },
  {
    // Scenario 2: Serious delinquency/write-off → HARD REJECT (even though income is strong)
    id: "APP1002",
    name: "Rohan Kulkarni",
    email: "rohan.k@example.com",
    loanAmount: 750000,
    tenureMonths: 48,
    cibilScore: 710,
    foir: 41,
    avgMonthlyBalance: 120000,
    bounceCount: 1,
    annualIncome: 2400000,
    hasWriteOff: true, // ← triggers RULE-WRITEOFF-005 hard reject
    submittedAt: "2026-08-18T11:30:00Z",
    submittedBy: "analyst@orizon.in",
  },
  {
    // Scenario 3: Borderline CIBIL, strong cash flow → EXCEPTION_L1
    id: "APP1003",
    name: "Meera Joshi",
    email: "meera.j@example.com",
    loanAmount: 400000,
    tenureMonths: 24,
    cibilScore: 712, // ← between 700–720: RULE-CIBIL-006 fires (EXCEPTION_L1)
    foir: 38,
    avgMonthlyBalance: 95000, // strong cash flow
    bounceCount: 0,
    annualIncome: 1600000,
    hasWriteOff: false,
    submittedAt: "2026-08-18T13:45:00Z",
    submittedBy: "analyst@orizon.in",
  },
  {
    // Scenario 4: Multiple deviations + high loan amount → EXCEPTION_L2
    id: "APP1004",
    name: "Arjun Verma",
    email: "arjun.v@example.com",
    loanAmount: 1500000, // ← RULE-AMT-004 fires (>10L → EXCEPTION_L2)
    tenureMonths: 60,
    cibilScore: 714, // ← RULE-CIBIL-006 also fires → multiple deviations
    foir: 48,
    avgMonthlyBalance: 60000,
    bounceCount: 3, // ← RULE-BOUNCE-003 fires too
    annualIncome: 1200000,
    hasWriteOff: false,
    submittedAt: "2026-08-19T09:00:00Z",
    submittedBy: "analyst@orizon.in",
  },
  {
    // Scenario 5: Same profile as APP1003 — re-run after admin lowers CIBIL threshold to 715
    // At default threshold (720), cibilScore=712 → EXCEPTION_L1
    // After admin raises threshold to 715, re-run → outcome changes
    id: "APP1005",
    name: "Sunita Patel",
    email: "sunita.p@example.com",
    loanAmount: 350000,
    tenureMonths: 24,
    cibilScore: 716, // ← At threshold=720: EXCEPTION_L1. At threshold=715: passes RULE-CIBIL-006 → APPROVED
    foir: 34,
    avgMonthlyBalance: 78000,
    bounceCount: 0,
    annualIncome: 1400000,
    hasWriteOff: false,
    submittedAt: "2026-08-19T10:30:00Z",
    submittedBy: "analyst@orizon.in",
  },
];

// ─── Mock users list (managed by Admin) ──────────────────────────────────────

export const INITIAL_USERS: MockUser[] = [
  {
    id: "USR001",
    email: "analyst@orizon.in",
    name: "Priya Shankar",
    role: "analyst",
    status: "ACTIVE",
    createdAt: "2026-08-01T08:00:00Z",
    createdBy: "admin@orizon.in",
  },
  {
    id: "USR002",
    email: "l1@orizon.in",
    name: "Ravi Kulkarni",
    role: "l1-approver",
    status: "ACTIVE",
    createdAt: "2026-08-01T08:05:00Z",
    createdBy: "admin@orizon.in",
  },
  {
    id: "USR003",
    email: "l2@orizon.in",
    name: "Sunita Menon",
    role: "l2-approver",
    status: "ACTIVE",
    createdAt: "2026-08-01T08:10:00Z",
    createdBy: "admin@orizon.in",
  },
  {
    id: "USR004",
    email: "admin@orizon.in",
    name: "Arjun Verma",
    role: "admin",
    status: "ACTIVE",
    createdAt: "2026-08-01T07:55:00Z",
    createdBy: "admin@orizon.in",
  },
];

// ─── Seed audit log ────────────────────────────────────────────────────────────

export const INITIAL_AUDIT_LOG: AuditEntry[] = [
  {
    id: "AUD001",
    action: "USER_CREATED",
    actorEmail: "admin@orizon.in",
    actorRole: "admin",
    targetType: "User",
    targetId: "USR001",
    description: "Created analyst account for analyst@orizon.in",
    timestamp: "2026-08-01T08:00:00Z",
  },
  {
    id: "AUD002",
    action: "USER_CREATED",
    actorEmail: "admin@orizon.in",
    actorRole: "admin",
    targetType: "User",
    targetId: "USR002",
    description: "Created L1 approver account for l1@orizon.in",
    timestamp: "2026-08-01T08:05:00Z",
  },
  {
    id: "AUD003",
    action: "USER_CREATED",
    actorEmail: "admin@orizon.in",
    actorRole: "admin",
    targetType: "User",
    targetId: "USR003",
    description: "Created L2 approver account for l2@orizon.in",
    timestamp: "2026-08-01T08:10:00Z",
  },
  {
    id: "AUD004",
    action: "APPLICATION_SUBMITTED",
    actorEmail: "analyst@orizon.in",
    actorRole: "analyst",
    targetType: "Applicant",
    targetId: "APP1001",
    description: "Submitted application for Priya Shankar — ₹5,00,000",
    timestamp: "2026-08-18T10:15:00Z",
  },
  {
    id: "AUD005",
    action: "EVALUATION_RUN",
    actorEmail: "analyst@orizon.in",
    actorRole: "analyst",
    targetType: "Evaluation",
    targetId: "EVAL001",
    description: "Evaluation run for APP1001 → APPROVED",
    timestamp: "2026-08-18T10:15:01Z",
  },
];
