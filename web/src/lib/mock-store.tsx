"use client";

/**
 * mock-store.tsx — Global in-memory application state for the mock phase.
 *
 * Wraps all mutable data (rules, evaluations, exception cases, audit log,
 * users) in a single React context so every dashboard can read and mutate
 * state without prop-drilling. This context is the "database" for the
 * frontend-only phase.
 *
 * Step 4: all dashboards read from this store.
 * Backend swap: replace each store slice with an API call / SWR hook —
 * the component layer stays unchanged because it reads the same shape.
 *
 * Exported:
 *   StoreProvider   — wrap the layout (already wrapped with AuthProvider)
 *   useStore        — hook to read and mutate store state
 */

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from "react";
import {
  APPLICANTS,
  INITIAL_RULES,
  INITIAL_USERS,
  INITIAL_AUDIT_LOG,
  type Applicant,
  type Rule,
  type Evaluation,
  type ExceptionCase,
  type AuditEntry,
  type MockUser,
  type AuditAction,
  type DecisionOutcome,
} from "./mock-data";
import { evaluateApplicant } from "./rule-engine";

// ─── State shape ──────────────────────────────────────────────────────────────

export interface StoreState {
  applicants: Applicant[];
  rules: Rule[];
  evaluations: Evaluation[];
  exceptionCases: ExceptionCase[];
  auditLog: AuditEntry[];
  users: MockUser[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "RUN_EVALUATION"; applicantId: string; runBy: string }
  | { type: "UPDATE_RULE"; rule: Rule; actorEmail: string; actorRole: string }
  | { type: "APPROVE_EXCEPTION"; caseId: string; notes: string; actorEmail: string; actorRole: string }
  | { type: "REJECT_EXCEPTION"; caseId: string; notes: string; actorEmail: string; actorRole: string }
  | { type: "ESCALATE_EXCEPTION"; caseId: string; notes: string; actorEmail: string }
  | { type: "CREATE_USER"; user: Omit<MockUser, "id" | "createdAt">; actorEmail: string }
  | { type: "APPEND_AUDIT"; entry: Omit<AuditEntry, "id" | "timestamp"> };

// ─── ID generators ────────────────────────────────────────────────────────────

let auditSeq = 100;
let exceptionSeq = 10;
let userSeq = 10;

function nextAuditId() { return `AUD${String(++auditSeq).padStart(3, "0")}`; }
function nextExceptionId() { return `EXC${String(++exceptionSeq).padStart(3, "0")}`; }
function nextUserId() { return `USR${String(++userSeq).padStart(3, "0")}`; }

function makeAudit(partial: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  return { ...partial, id: nextAuditId(), timestamp: new Date().toISOString() };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "RUN_EVALUATION": {
      const applicant = state.applicants.find((a) => a.id === action.applicantId);
      if (!applicant) return state;

      const evaluation = evaluateApplicant(applicant, state.rules, action.runBy);

      // Create ExceptionCase if needed
      const newExceptions = [...state.exceptionCases];
      if (evaluation.finalDecision === "EXCEPTION_L1" || evaluation.finalDecision === "EXCEPTION_L2") {
        // Check if an open case already exists for this applicant — don't duplicate
        const alreadyOpen = state.exceptionCases.some(
          (c) => c.applicantId === action.applicantId && c.status === "PENDING",
        );
        if (!alreadyOpen) {
          newExceptions.push({
            id: nextExceptionId(),
            evaluationId: evaluation.id,
            applicantId: action.applicantId,
            level: evaluation.finalDecision === "EXCEPTION_L2" ? "L2" : "L1",
            status: "PENDING",
            createdAt: evaluation.runAt,
          });
        }
      }

      const auditEntry = makeAudit({
        action: "EVALUATION_RUN",
        actorEmail: action.runBy,
        actorRole: "analyst",
        targetType: "Evaluation",
        targetId: evaluation.id,
        description: `Evaluation run for ${action.applicantId} → ${evaluation.finalDecision}`,
      });

      return {
        ...state,
        evaluations: [...state.evaluations, evaluation],
        exceptionCases: newExceptions,
        auditLog: [...state.auditLog, auditEntry],
      };
    }

    case "UPDATE_RULE": {
      const updatedRules = state.rules.map((r) =>
        r.id === action.rule.id
          ? { ...action.rule, version: r.version + 1, lastEditedBy: action.actorEmail, lastEditedAt: new Date().toISOString() }
          : r,
      );

      const auditEntry = makeAudit({
        action: "RULE_UPDATED",
        actorEmail: action.actorEmail,
        actorRole: action.actorRole,
        targetType: "Rule",
        targetId: action.rule.id,
        description: `Rule "${action.rule.name}" updated — threshold now ${action.rule.threshold}`,
        meta: { ruleId: action.rule.id, newThreshold: action.rule.threshold, version: action.rule.version + 1 },
      });

      return { ...state, rules: updatedRules, auditLog: [...state.auditLog, auditEntry] };
    }

    case "APPROVE_EXCEPTION": {
      const updatedCases = state.exceptionCases.map((c) =>
        c.id === action.caseId
          ? { ...c, status: "APPROVED" as const, notes: action.notes, decidedBy: action.actorEmail, decidedAt: new Date().toISOString() }
          : c,
      );
      const exceptionCase = state.exceptionCases.find((c) => c.id === action.caseId);
      const auditEntry = makeAudit({
        action: "EXCEPTION_APPROVED",
        actorEmail: action.actorEmail,
        actorRole: action.actorRole,
        targetType: "ExceptionCase",
        targetId: action.caseId,
        description: `Exception case ${action.caseId} approved for ${exceptionCase?.applicantId ?? ""}`,
      });
      return { ...state, exceptionCases: updatedCases, auditLog: [...state.auditLog, auditEntry] };
    }

    case "REJECT_EXCEPTION": {
      const updatedCases = state.exceptionCases.map((c) =>
        c.id === action.caseId
          ? { ...c, status: "REJECTED" as const, notes: action.notes, decidedBy: action.actorEmail, decidedAt: new Date().toISOString() }
          : c,
      );
      const exceptionCase = state.exceptionCases.find((c) => c.id === action.caseId);
      const auditEntry = makeAudit({
        action: "EXCEPTION_REJECTED",
        actorEmail: action.actorEmail,
        actorRole: action.actorRole,
        targetType: "ExceptionCase",
        targetId: action.caseId,
        description: `Exception case ${action.caseId} rejected for ${exceptionCase?.applicantId ?? ""}`,
      });
      return { ...state, exceptionCases: updatedCases, auditLog: [...state.auditLog, auditEntry] };
    }

    case "ESCALATE_EXCEPTION": {
      const sourceCase = state.exceptionCases.find((c) => c.id === action.caseId);
      if (!sourceCase) return state;

      const updatedCases = state.exceptionCases.map((c) =>
        c.id === action.caseId ? { ...c, status: "ESCALATED_TO_L2" as const } : c,
      );

      // Create a new L2 case
      const l2Case: ExceptionCase = {
        id: nextExceptionId(),
        evaluationId: sourceCase.evaluationId,
        applicantId: sourceCase.applicantId,
        level: "L2",
        status: "PENDING",
        escalatedFrom: action.caseId,
        notes: action.notes,
        createdAt: new Date().toISOString(),
      };

      const auditEntry = makeAudit({
        action: "EXCEPTION_ESCALATED",
        actorEmail: action.actorEmail,
        actorRole: "l1-approver",
        targetType: "ExceptionCase",
        targetId: action.caseId,
        description: `Exception case ${action.caseId} escalated to L2`,
      });

      return {
        ...state,
        exceptionCases: [...updatedCases, l2Case],
        auditLog: [...state.auditLog, auditEntry],
      };
    }

    case "CREATE_USER": {
      const newUser: MockUser = {
        ...action.user,
        id: nextUserId(),
        createdAt: new Date().toISOString(),
      };
      const auditEntry = makeAudit({
        action: "USER_CREATED",
        actorEmail: action.actorEmail,
        actorRole: "admin",
        targetType: "User",
        targetId: newUser.id,
        description: `Created ${newUser.role} account for ${newUser.email}`,
      });
      return {
        ...state,
        users: [...state.users, newUser],
        auditLog: [...state.auditLog, auditEntry],
      };
    }

    case "APPEND_AUDIT": {
      return { ...state, auditLog: [...state.auditLog, makeAudit(action.entry)] };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface StoreContext extends StoreState {
  runEvaluation: (applicantId: string, runBy: string) => void;
  updateRule: (rule: Rule, actorEmail: string, actorRole: string) => void;
  approveException: (caseId: string, notes: string, actorEmail: string, actorRole: string) => void;
  rejectException: (caseId: string, notes: string, actorEmail: string, actorRole: string) => void;
  escalateException: (caseId: string, notes: string, actorEmail: string) => void;
  createUser: (user: Omit<MockUser, "id" | "createdAt">, actorEmail: string) => void;
  appendAudit: (entry: Omit<AuditEntry, "id" | "timestamp">) => void;
  /** Returns the latest evaluation for an applicant, or undefined. */
  latestEvaluation: (applicantId: string) => Evaluation | undefined;
  /** Returns the active exception case for an applicant, or undefined. */
  activeException: (applicantId: string) => ExceptionCase | undefined;
}

const Ctx = createContext<StoreContext | null>(null);

const INITIAL_STATE: StoreState = {
  applicants: APPLICANTS,
  rules: INITIAL_RULES,
  evaluations: [],
  exceptionCases: [],
  auditLog: INITIAL_AUDIT_LOG,
  users: INITIAL_USERS,
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const runEvaluation = useCallback((applicantId: string, runBy: string) => {
    dispatch({ type: "RUN_EVALUATION", applicantId, runBy });
  }, []);

  const updateRule = useCallback((rule: Rule, actorEmail: string, actorRole: string) => {
    dispatch({ type: "UPDATE_RULE", rule, actorEmail, actorRole });
  }, []);

  const approveException = useCallback((caseId: string, notes: string, actorEmail: string, actorRole: string) => {
    dispatch({ type: "APPROVE_EXCEPTION", caseId, notes, actorEmail, actorRole });
  }, []);

  const rejectException = useCallback((caseId: string, notes: string, actorEmail: string, actorRole: string) => {
    dispatch({ type: "REJECT_EXCEPTION", caseId, notes, actorEmail, actorRole });
  }, []);

  const escalateException = useCallback((caseId: string, notes: string, actorEmail: string) => {
    dispatch({ type: "ESCALATE_EXCEPTION", caseId, notes, actorEmail });
  }, []);

  const createUser = useCallback((user: Omit<MockUser, "id" | "createdAt">, actorEmail: string) => {
    dispatch({ type: "CREATE_USER", user, actorEmail });
  }, []);

  const appendAudit = useCallback((entry: Omit<AuditEntry, "id" | "timestamp">) => {
    dispatch({ type: "APPEND_AUDIT", entry });
  }, []);

  const latestEvaluation = useCallback((applicantId: string) => {
    const evals = state.evaluations.filter((e) => e.applicantId === applicantId);
    return evals.length > 0 ? evals[evals.length - 1] : undefined;
  }, [state.evaluations]);

  const activeException = useCallback((applicantId: string) => {
    return state.exceptionCases.find(
      (c) => c.applicantId === applicantId && c.status === "PENDING",
    );
  }, [state.exceptionCases]);

  return (
    <Ctx.Provider
      value={{
        ...state,
        runEvaluation,
        updateRule,
        approveException,
        rejectException,
        escalateException,
        createUser,
        appendAudit,
        latestEvaluation,
        activeException,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStore(): StoreContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
