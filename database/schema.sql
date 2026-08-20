-- ============================================================
-- UUID SUPPORT
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM('ADMIN', 'ANALYST', 'L1_APPROVER', 'L2_APPROVER');

CREATE TYPE user_status AS ENUM('ACTIVE', 'PENDING_SETUP', 'DISABLED');

CREATE TYPE income_trend AS ENUM('UP', 'DOWN', 'FLAT');

CREATE TYPE rule_operator AS ENUM('LT', 'LTE', 'GT', 'GTE', 'EQ');

CREATE TYPE rule_outcome AS ENUM(
  'HARD_REJECT',
  'EXCEPTION_L1',
  'EXCEPTION_L2',
  'PASS'
);

CREATE TYPE final_decision AS ENUM(
  'APPROVED',
  'HARD_REJECT',
  'EXCEPTION_L1',
  'EXCEPTION_L2',
  'INSUFFICIENT_DATA'
);

CREATE TYPE rule_result AS ENUM('PASS', 'FAIL', 'TRIGGERED');

CREATE TYPE exception_level AS ENUM('L1', 'L2');

CREATE TYPE exception_status AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');

-- ============================================================
-- 1. USER
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'PENDING_SETUP',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- ============================================================
-- 2. PASSWORD SETUP TOKEN
-- ============================================================
CREATE TABLE password_setup_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CONSTRAINT fk_password_setup_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ============================================================
-- 3. APPLICANT
-- ============================================================
CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_ref VARCHAR(100) NOT NULL UNIQUE,
  age INTEGER,
  employment_type VARCHAR(100),
  requested_amount NUMERIC(15, 2),
  tenure_months INTEGER,
  monthly_income NUMERIC(15, 2),
  cibil_score INTEGER,
  existing_emi NUMERIC(15, 2),
  avg_bank_balance NUMERIC(15, 2),
  bounce_count INTEGER,
  last_default BOOLEAN,
  income_trend income_trend,
  assets_value NUMERIC(15, 2),
  raw_input_json JSONB,
  submitted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_applicant_submitted_by FOREIGN KEY (submitted_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_applicant_age CHECK (
    age IS NULL
    OR age >= 0
  ),
  CONSTRAINT chk_applicant_requested_amount CHECK (
    requested_amount IS NULL
    OR requested_amount >= 0
  ),
  CONSTRAINT chk_applicant_tenure CHECK (
    tenure_months IS NULL
    OR tenure_months >= 0
  ),
  CONSTRAINT chk_applicant_monthly_income CHECK (
    monthly_income IS NULL
    OR monthly_income >= 0
  ),
  CONSTRAINT chk_applicant_cibil CHECK (
    cibil_score IS NULL
    OR cibil_score BETWEEN 0 AND 900
  ),
  CONSTRAINT chk_applicant_existing_emi CHECK (
    existing_emi IS NULL
    OR existing_emi >= 0
  ),
  CONSTRAINT chk_applicant_avg_bank_balance CHECK (
    avg_bank_balance IS NULL
    OR avg_bank_balance >= 0
  ),
  CONSTRAINT chk_applicant_bounce_count CHECK (
    bounce_count IS NULL
    OR bounce_count >= 0
  ),
  CONSTRAINT chk_applicant_assets_value CHECK (
    assets_value IS NULL
    OR assets_value >= 0
  )
);

-- ============================================================
-- 4. RULE
-- ============================================================
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  operator rule_operator NOT NULL,
  threshold_value NUMERIC(15, 2) NOT NULL,
  outcome rule_outcome NOT NULL,
  reason_code VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_rules_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_rule_version CHECK (version >= 1)
);

-- ============================================================
-- 5. EVALUATION
-- ============================================================
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL,
  final_decision final_decision NOT NULL,
  eligible_amount NUMERIC(15, 2),
  interest_rate NUMERIC(10, 4),
  risk_grade VARCHAR(50),
  derived_metrics_json JSONB,
  xai_narrative TEXT,
  tool_results_json JSONB,
  api_budget_json JSONB,
  ml_risk_tier VARCHAR(50),
  ml_risk_score NUMERIC(10, 4),
  rule_version_snapshot JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_evaluation_applicant FOREIGN KEY (applicant_id) REFERENCES applicants (id) ON DELETE RESTRICT,
  CONSTRAINT chk_evaluation_eligible_amount CHECK (
    eligible_amount IS NULL
    OR eligible_amount >= 0
  ),
  CONSTRAINT chk_evaluation_interest_rate CHECK (
    interest_rate IS NULL
    OR interest_rate >= 0
  )
);

-- ============================================================
-- 6. EVALUATION RULE RESULT
-- ============================================================
CREATE TABLE evaluation_rule_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL,
  rule_id UUID NOT NULL,
  result rule_result NOT NULL,
  actual_value NUMERIC(15, 2),
  threshold_at_evaluation NUMERIC(15, 2) NOT NULL,
  CONSTRAINT fk_rule_result_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE,
  CONSTRAINT fk_rule_result_rule FOREIGN KEY (rule_id) REFERENCES rules (id) ON DELETE RESTRICT
);

-- ============================================================
-- 7. EXCEPTION CASE
-- ============================================================
CREATE TABLE exception_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL,
  level exception_level NOT NULL,
  status exception_status NOT NULL DEFAULT 'PENDING',
  assigned_to UUID,
  decided_by UUID,
  decision_notes TEXT,
  escalated_from UUID,
  decided_at TIMESTAMPTZ,
  CONSTRAINT fk_exception_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_exception_assigned_to FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_exception_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_exception_escalated_from FOREIGN KEY (escalated_from) REFERENCES exception_cases (id) ON DELETE SET NULL
);

-- ============================================================
-- 8. AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action VARCHAR(255) NOT NULL,
  target_type VARCHAR(100) NOT NULL,
  target_id UUID,
  before_value JSONB,
  after_value JSONB,
  ip_address VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_users_role ON users (role);

CREATE INDEX idx_users_status ON users (status);

CREATE INDEX idx_users_created_by ON users (created_by);

CREATE INDEX idx_password_setup_tokens_user_id ON password_setup_tokens (user_id);

CREATE INDEX idx_password_setup_tokens_expires_at ON password_setup_tokens (expires_at);

CREATE INDEX idx_applicants_submitted_by ON applicants (submitted_by);

CREATE INDEX idx_applicants_cibil_score ON applicants (cibil_score);

CREATE INDEX idx_applicants_created_at ON applicants (created_at);

CREATE INDEX idx_rules_rule_code ON rules (rule_code);

CREATE INDEX idx_rules_field_name ON rules (field_name);

CREATE INDEX idx_rules_is_active ON rules (is_active);

CREATE INDEX idx_rules_updated_by ON rules (updated_by);

CREATE INDEX idx_evaluations_applicant_id ON evaluations (applicant_id);

CREATE INDEX idx_evaluations_final_decision ON evaluations (final_decision);

CREATE INDEX idx_evaluations_evaluated_at ON evaluations (evaluated_at);

CREATE INDEX idx_evaluation_rule_results_evaluation_id ON evaluation_rule_results (evaluation_id);

CREATE INDEX idx_evaluation_rule_results_rule_id ON evaluation_rule_results (rule_id);

CREATE INDEX idx_exception_cases_evaluation_id ON exception_cases (evaluation_id);

CREATE INDEX idx_exception_cases_status ON exception_cases (status);

CREATE INDEX idx_exception_cases_assigned_to ON exception_cases (assigned_to);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs (actor_id);

CREATE INDEX idx_audit_logs_action ON audit_logs (action);

CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
