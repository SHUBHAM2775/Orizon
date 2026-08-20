-- Migration script to add new agentic columns to evaluations table

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS xai_narrative TEXT,
  ADD COLUMN IF NOT EXISTS tool_results_json JSONB,
  ADD COLUMN IF NOT EXISTS api_budget_json JSONB,
  ADD COLUMN IF NOT EXISTS ml_risk_tier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ml_risk_score NUMERIC(10, 4);
